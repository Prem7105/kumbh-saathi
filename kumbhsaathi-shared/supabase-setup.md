# Supabase Setup

Date: 2026-06-27

## Status

The following counts describe the original demo seed, not a verified live deployment. Apply the current [security migration](../SETUP_AND_CHANGES.md) before using the updated apps.

Seeded records:

- `official_missing_persons`: 2,500
- `cctv_locations`: 1,280
- `zone_boundaries`: 32
- `police_stations`: 14
- `chokepoints_parking`: 85
- `live_cases`: 1 demo Saathi Didi case
- `volunteer_tasks`: 1 demo task
- `duplicate_reviews`: 30 seeded review candidates

## Files

- `supabase-schema.sql`: tables, indexes, triggers, staff role policies, realtime publication, RPC functions.
- `scripts/seed_supabase.py`: creates schema and seeds CSV data into Supabase.
- `scripts/process_kml.py`: converts KML files to GeoJSON and enriches chokepoint metadata in Supabase.
- `data/*.csv`: official organizer dataset copied locally.
- `data/*.kml`: official map layers copied locally.
- `public/maps/*.geojson`: generated web/mobile map layers.

## Main Tables

- `official_missing_persons`
- `cctv_locations`
- `zone_boundaries`
- `police_stations`
- `chokepoints_parking`
- `live_cases`
- `case_updates`
- `volunteer_tasks`
- `duplicate_reviews`
- `cctv_review_requests`
- `verified_entities`
- `trust_check_reports`
- `audit_logs`

## Useful RPC Functions

- `command_center_stats()`
- `search_official_cases(q, max_rows)`
- `vulnerable_official_cases(max_rows)`
- `nearest_police(lat, lng, max_rows)`
- `nearest_cctv(lat, lng, max_rows)`
- `nearest_chokepoints(lat, lng, max_rows)`
- `zone_spatial_summary()`
- `create_audit_log(actor, action, entity_type, entity_id, pii_accessed, metadata)`
- `request_manual_cctv_review(camera_id, requested_by, case_id, official_case_id, note)`
- `mask_phone(phone)`

## Generated Map Assets

KML-derived layers:

- `public/maps/cctv.geojson`
- `public/maps/police.geojson`
- `public/maps/chokepoints.geojson`

CSV-backed exact-count layers:

- `public/maps/cctv-official.geojson` with 1,280 camera points
- `public/maps/police-official.geojson` with 14 police stations
- `public/maps/chokepoints-official.geojson` with 85 points

Use CSV-backed layers when the UI needs to match official README counts exactly. Use KML-derived layers when richer map overlay detail is useful.

## KML Enrichment

`chokepoints_parking` was enriched from `nashik_kumbh_chokepoints_parking_map.kml` with:

- `risk_level`
- `project_status`
- `source_url`
- `note`
- `kml_description`

`nearest_chokepoints(...)` now returns these enriched fields.

## Realtime Tables

Realtime publication was enabled for:

- `live_cases`
- `volunteer_tasks`
- `case_updates`
- `trust_check_reports`
- `audit_logs`

These are the tables the command center/mobile/WhatsApp/avatar surfaces should subscribe to.

## Frontend Environment Variables

Do not commit real secrets.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Server/Seed Environment Variables

Use only in local scripts or backend code.

```env
DATABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Important Boundaries

- `official_missing_persons` is synthetic organizer data, not real PII.
- CCTV data is location-only. Do not claim footage or face recognition.
- Trust Check is message/registry/report triage, not bank or UPI transaction verification.
- Demo RLS policies are permissive for speed. Tighten them before any real deployment.
