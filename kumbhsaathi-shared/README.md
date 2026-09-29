# Kumbh Saathi Shared Assets

Shared backend/data assets.

## Contents

- `data`: official CSV and KML files.
- `public/maps`: generated GeoJSON map layers.
- `scripts/seed_supabase.py`: creates and seeds Supabase schema.
- `scripts/process_kml.py`: converts KML to GeoJSON and enriches chokepoints in Supabase.
- `supabase-schema.sql`: full database schema and RPC definitions.
- `supabase-setup.md`: setup notes and table/RPC reference.

## Scripts

Install the script dependency with `python -m pip install -r requirements.txt`.

Run from this folder:

```bash
python scripts/process_kml.py
python scripts/seed_supabase.py
```

Both scripts use `DATABASE_URL` when they need to write to Supabase.
