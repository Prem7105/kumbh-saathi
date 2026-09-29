# Kumbh Saathi command center

Next.js 16 / React 19 organiser dashboard with live cases, vulnerable-person search, operational map layers, volunteer tasks and audit views.

## Setup

1. Apply the [database setup and security migration](../SETUP_AND_CHANGES.md).
2. Create a Supabase staff account with `app_metadata.staff_role = "organiser"`.
3. In this directory, run `npm ci` and copy `.env.example` to `.env.local`.
4. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the project's public client configuration. Never put a service-role key in a `NEXT_PUBLIC_*` variable.
5. Run `npm run dev` and open http://localhost:3000.

Without configuration, the app displays setup guidance. With configuration, sign in using your approved staff account. Optional `NEXT_PUBLIC_WHATSAPP_URL` must be an `https://wa.me/` contact link.

## Verification

```bash
npm run typecheck
npm run build
npm start
```

Map files are in `private-assets/`, served through an authenticated organiser-only API. The Next.js configuration includes those assets in deployment tracing. Do not publish them separately under `public/` or a CDN. Staff assignments use Supabase account UUIDs.

Administrative scripts in `scripts/` require server-side credentials where they access protected datasets. Run them locally with `SUPABASE_SERVICE_ROLE_KEY`; do not add that secret to public configuration.
