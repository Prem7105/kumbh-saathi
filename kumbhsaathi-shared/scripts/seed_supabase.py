import csv
import os
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2.extras import execute_values


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCHEMA = ROOT / "supabase-schema.sql"


def clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value if value else None


def num(value: str | None) -> float | None:
    value = clean(value)
    if value is None:
        return None
    return float(value)


def integer(value: str | None) -> int | None:
    value = clean(value)
    if value is None:
        return None
    return int(value)


def boolean(value: str | None) -> bool:
    return (value or "").strip().lower() == "true"


def rows_from_csv(name: str) -> list[dict[str, str]]:
    with (DATA / name).open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def insert_many(cur: Any, table: str, columns: list[str], rows: list[tuple[Any, ...]]) -> None:
    if not rows:
        return
    template = "(" + ",".join(["%s"] * len(columns)) + ")"
    execute_values(
        cur,
        f"insert into {table} ({', '.join(columns)}) values %s on conflict do nothing",
        rows,
        template=template,
        page_size=500,
    )


def seed_official_missing(cur: Any) -> None:
    records = rows_from_csv("Synthetic_Missing_Persons_2500.csv")
    columns = [
        "case_id",
        "reported_at",
        "missing_person_name",
        "gender",
        "age_band",
        "state",
        "district",
        "language",
        "last_seen_location",
        "reporting_center",
        "reporter_mobile",
        "physical_description",
        "status",
        "resolution_hours",
        "is_duplicate_report",
        "remarks",
    ]
    rows = []
    for r in records:
        rows.append(
            (
                clean(r["case_id"]),
                clean(r["reported_at"]),
                clean(r["missing_person_name"]),
                clean(r["gender"]),
                clean(r["age_band"]),
                clean(r["state"]),
                clean(r["district"]),
                clean(r["language"]),
                clean(r["last_seen_location"]),
                clean(r["reporting_center"]),
                clean(r["reporter_mobile"]),
                clean(r["physical_description"]),
                clean(r["status"]),
                num(r["resolution_hours"]),
                boolean(r["is_duplicate_report"]),
                clean(r["remarks"]),
            )
        )
    insert_many(cur, "official_missing_persons", columns, rows)


def seed_cctv(cur: Any) -> None:
    records = rows_from_csv("CCTV_Locations.csv")
    rows = [(clean(r["camera_id"]), num(r["longitude"]), num(r["latitude"])) for r in records]
    insert_many(cur, "cctv_locations", ["camera_id", "longitude", "latitude"], rows)


def seed_zones(cur: Any) -> None:
    records = rows_from_csv("Zone_Boundaries.csv")
    rows = [
        (
            clean(r["zone_name"]),
            num(r["centroid_lat"]),
            num(r["centroid_lng"]),
            integer(r["approx_boundary_points"]),
        )
        for r in records
    ]
    insert_many(cur, "zone_boundaries", ["zone_name", "centroid_lat", "centroid_lng", "approx_boundary_points"], rows)


def seed_police(cur: Any) -> None:
    records = rows_from_csv("Police_Stations.csv")
    rows = [(clean(r["station_name"]), num(r["longitude"]), num(r["latitude"])) for r in records]
    insert_many(cur, "police_stations", ["station_name", "longitude", "latitude"], rows)


def seed_chokepoints(cur: Any) -> None:
    records = rows_from_csv("Chokepoints_Parking.csv")
    rows = [(clean(r["location_name"]), clean(r["category"]), num(r["longitude"]), num(r["latitude"])) for r in records]
    insert_many(cur, "chokepoints_parking", ["location_name", "category", "longitude", "latitude"], rows)


def seed_verified_entities(cur: Any) -> None:
    rows = [
        ("accommodation", "Official Nashik Kumbh Helpdesk", "HELP-NASHIK-001", "+91 0000000001", None, "https://kumbhathon.com/", "Zone Area 1", "verified"),
        ("accommodation", "Trimbakeshwar Pilgrim Camp", "ACC-TRI-001", "+91 0000000002", "trimbakcamp@upi", None, "Zone Area 2", "verified"),
        ("transport", "Official Shuttle Desk", "TRANS-SHUTTLE-001", "+91 0000000003", None, None, "Zone Area 3", "verified"),
    ]
    insert_many(
        cur,
        "verified_entities",
        ["entity_type", "display_name", "official_id", "phone", "upi_vpa", "website", "zone_name", "verification_status"],
        rows,
    )


def seed_duplicate_reviews(cur: Any) -> None:
    cur.execute(
        """
        select case_id, missing_person_name, age_band, gender, language, state, district, last_seen_location, reporting_center
        from official_missing_persons
        where is_duplicate_report = true
        order by reported_at
        limit 80
        """
    )
    records = cur.fetchall()
    rows = []
    for idx, left in enumerate(records):
        best = None
        best_score = 0
        best_reasons: list[str] = []
        for right in records[idx + 1 :]:
            if left[0] == right[0] or left[8] == right[8]:
                continue
            score = 0
            reasons = []
            if left[1] and right[1] and left[1].lower() == right[1].lower():
                score += 25
                reasons.append("same_name")
            if left[2] == right[2]:
                score += 18
                reasons.append("same_age_band")
            if left[3] == right[3]:
                score += 12
                reasons.append("same_gender")
            if left[4] == right[4]:
                score += 15
                reasons.append("same_language")
            if left[5] == right[5]:
                score += 10
                reasons.append("same_state")
            if left[6] == right[6]:
                score += 8
                reasons.append("same_district")
            if left[7] == right[7]:
                score += 12
                reasons.append("same_last_seen_location")
            if score > best_score:
                best_score = score
                best = right
                best_reasons = reasons
        if best and best_score >= 35:
            rows.append((left[0], best[0], "official", "official", min(best_score, 100), best_reasons, "needs_review"))
        if len(rows) >= 30:
            break

    insert_many(
        cur,
        "duplicate_reviews",
        ["primary_case_id", "candidate_case_id", "primary_source", "candidate_source", "score", "reasons", "review_status"],
        rows,
    )


def seed_demo_live_case(cur: Any) -> None:
    cur.execute(
        """
        insert into live_cases (
          source, source_detail, case_type, status, priority, missing_person_name, gender, age_band,
          state, district, language, last_seen_location, zone_name, reporter_mobile,
          physical_description, raw_report, risk_flags, structured_data, private_verification_clues
        )
        values (
          'saathi_didi_booth', 'Ramkund Booth 2', 'missing', 'open', 'critical', null, 'Female', '71-80',
          'Bihar', 'Nalanda', 'Maithili', 'Ramkund Ghat', 'Zone Area 1', '+91 9000000000',
          'Elderly woman in green saree, tilak, speaks Maithili, confused and separated near ghat',
          'Meri dadi Ramkund ke paas kho gayi. Unka naam ya phone yaad nahi, green saree hai, Maithili bolti hain.',
          array['elderly', 'no_name', 'needs_private_verification'],
          '{"intake_language":"Hindi","created_by":"Saathi Didi","needs_followup":["name","exact last seen time"]}'::jsonb,
          '["Ask family what language she speaks at home", "Ask about saree color and tilak", "Ask origin district"]'::jsonb
        )
        on conflict do nothing
        returning id
        """
    )
    row = cur.fetchone()
    if not row:
        return
    case_id = row[0]
    cur.execute(
        """
        insert into volunteer_tasks(case_id, title, description, assigned_to, status, priority, zone_name)
        values (%s, 'Escort elderly missing case to Ramkund help desk', 'Find booth staff and verify family claimant before handover.', 'Volunteer A', 'new', 'critical', 'Zone Area 1')
        """,
        (case_id,),
    )
    cur.execute(
        """
        insert into audit_logs(actor, action, entity_type, entity_id, pii_accessed, metadata)
        values ('seed_script', 'created_demo_case', 'live_case', %s, false, '{"source":"saathi_didi_booth"}'::jsonb)
        """,
        (str(case_id),),
    )


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    with psycopg2.connect(database_url) as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(SCHEMA.read_text(encoding="utf-8"))
            cur.execute(
                """
                truncate
                  audit_logs,
                  cctv_review_requests,
                  case_updates,
                  volunteer_tasks,
                  trust_check_reports,
                  verified_entities,
                  duplicate_reviews,
                  live_cases,
                  official_missing_persons,
                  cctv_locations,
                  zone_boundaries,
                  police_stations,
                  chokepoints_parking
                restart identity cascade
                """
            )
            seed_zones(cur)
            seed_cctv(cur)
            seed_police(cur)
            seed_chokepoints(cur)
            seed_official_missing(cur)
            seed_verified_entities(cur)
            seed_duplicate_reviews(cur)
            seed_demo_live_case(cur)
            cur.execute("select command_center_stats()")
            stats = cur.fetchone()[0]
        conn.commit()

    print("Supabase schema created and seeded.")
    print(stats)


if __name__ == "__main__":
    main()
