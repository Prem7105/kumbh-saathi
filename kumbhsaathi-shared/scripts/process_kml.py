import html
import json
import os
import re
import csv
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import psycopg2


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MAPS = ROOT / "public" / "maps"

KML_FILES = {
    "cctv": DATA / "CCTV Dataset.kml",
    "police": DATA / "Police Stations.kml",
    "chokepoints": DATA / "nashik_kumbh_chokepoints_parking_map.kml",
}


def direct_child_text(el: ET.Element, name: str) -> str | None:
    for child in list(el):
        if child.tag.split("}")[-1] == name and child.text:
            return html.unescape(child.text.strip())
    return None


def first_descendant_text(el: ET.Element, name: str) -> str | None:
    for child in el.iter():
        if child.tag.split("}")[-1] == name and child.text:
            return html.unescape(child.text.strip())
    return None


def parse_coord_triplet(raw: str) -> list[float] | None:
    parts = raw.strip().split(",")
    if len(parts) < 2:
        return None
    return [float(parts[0]), float(parts[1])]


def parse_coord_list(raw: str) -> list[list[float]]:
    coords = []
    for item in re.split(r"\s+", raw.strip()):
        parsed = parse_coord_triplet(item)
        if parsed:
            coords.append(parsed)
    return coords


def parse_description(description: str | None) -> dict[str, str]:
    if not description:
        return {}
    parts = [part.strip() for part in description.split("|")]
    parsed: dict[str, str] = {}
    for part in parts:
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        parsed[key.strip().lower().replace(" ", "_")] = value.strip()
    return parsed


def placemark_geometry(placemark: ET.Element) -> dict[str, Any] | None:
    for point in placemark.iter():
        if point.tag.split("}")[-1] != "Point":
            continue
        coords_text = first_descendant_text(point, "coordinates")
        if coords_text:
            coord = parse_coord_triplet(coords_text)
            if coord:
                return {"type": "Point", "coordinates": coord}

    for polygon in placemark.iter():
        if polygon.tag.split("}")[-1] != "Polygon":
            continue
        coords_text = first_descendant_text(polygon, "coordinates")
        if coords_text:
            ring = parse_coord_list(coords_text)
            if len(ring) >= 4:
                return {"type": "Polygon", "coordinates": [ring]}

    for line in placemark.iter():
        if line.tag.split("}")[-1] != "LineString":
            continue
        coords_text = first_descendant_text(line, "coordinates")
        if coords_text:
            coords = parse_coord_list(coords_text)
            if len(coords) >= 2:
                return {"type": "LineString", "coordinates": coords}

    return None


def kml_to_geojson(kml_path: Path, layer_name: str) -> dict[str, Any]:
    tree = ET.parse(kml_path)
    root = tree.getroot()
    features = []

    for placemark in root.iter():
        if placemark.tag.split("}")[-1] != "Placemark":
            continue
        name = direct_child_text(placemark, "name")
        description = direct_child_text(placemark, "description")
        geometry = placemark_geometry(placemark)
        if not name or not geometry:
            continue

        parsed_description = parse_description(description)
        properties: dict[str, Any] = {
            "name": name,
            "layer": layer_name,
        }
        if description:
            properties["description"] = description
        properties.update(parsed_description)

        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": geometry,
            }
        )

    return {"type": "FeatureCollection", "features": features}


def write_geojson() -> dict[str, int]:
    MAPS.mkdir(parents=True, exist_ok=True)
    counts = {}
    for layer, path in KML_FILES.items():
        geojson = kml_to_geojson(path, layer)
        output = MAPS / f"{layer}.geojson"
        output.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
        counts[layer] = len(geojson["features"])
    counts.update(write_csv_geojson())
    return counts


def csv_rows(name: str) -> list[dict[str, str]]:
    with (DATA / name).open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_point_geojson(output_name: str, rows: list[dict[str, str]], name_key: str, layer: str) -> int:
    features = []
    for row in rows:
        lng = float(row["longitude"])
        lat = float(row["latitude"])
        props = {"name": row[name_key], "layer": layer}
        props.update(row)
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
            }
        )
    geojson = {"type": "FeatureCollection", "features": features}
    (MAPS / output_name).write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(features)


def write_csv_geojson() -> dict[str, int]:
    return {
        "cctv_csv": write_point_geojson("cctv-official.geojson", csv_rows("CCTV_Locations.csv"), "camera_id", "cctv_csv"),
        "police_csv": write_point_geojson("police-official.geojson", csv_rows("Police_Stations.csv"), "station_name", "police_csv"),
        "chokepoints_csv": write_point_geojson("chokepoints-official.geojson", csv_rows("Chokepoints_Parking.csv"), "location_name", "chokepoints_csv"),
    }


def migrate_and_enrich_chokepoints() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return 0

    chokepoints = kml_to_geojson(KML_FILES["chokepoints"], "chokepoints")["features"]
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                alter table chokepoints_parking
                  add column if not exists risk_level text,
                  add column if not exists project_status text,
                  add column if not exists source_url text,
                  add column if not exists note text,
                  add column if not exists kml_description text
                """
            )
            cur.execute(
                """
                drop function if exists nearest_chokepoints(double precision, double precision, integer);

                create or replace function nearest_chokepoints(lat double precision, lng double precision, max_rows integer default 5)
                returns table (
                  location_name text,
                  category text,
                  risk_level text,
                  project_status text,
                  source_url text,
                  note text,
                  latitude double precision,
                  longitude double precision,
                  distance_km double precision
                )
                language sql
                stable
                as $$
                  select
                    cp.location_name,
                    cp.category,
                    cp.risk_level,
                    cp.project_status,
                    cp.source_url,
                    cp.note,
                    cp.latitude,
                    cp.longitude,
                    haversine_km(lat, lng, cp.latitude, cp.longitude) as distance_km
                  from chokepoints_parking cp
                  order by distance_km
                  limit greatest(1, least(coalesce(max_rows, 5), 50));
                $$;
                """
            )
            updated = 0
            for feature in chokepoints:
                props = feature["properties"]
                cur.execute(
                    """
                    update chokepoints_parking
                    set
                      category = coalesce(%s, category),
                      risk_level = %s,
                      project_status = %s,
                      source_url = %s,
                      note = %s,
                      kml_description = %s
                    where location_name = %s
                    """,
                    (
                        props.get("category"),
                        props.get("risk"),
                        props.get("status"),
                        props.get("source"),
                        props.get("note"),
                        props.get("description"),
                        props.get("name"),
                    ),
                )
                updated += cur.rowcount
        conn.commit()
    return updated


def main() -> None:
    counts = write_geojson()
    updated = migrate_and_enrich_chokepoints()
    print("GeoJSON written:", counts)
    if os.environ.get("DATABASE_URL"):
        print("Supabase chokepoints enriched:", updated)
    else:
        print("DATABASE_URL not set; skipped Supabase enrichment.")


if __name__ == "__main__":
    main()
