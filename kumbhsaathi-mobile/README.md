# Kumbh Saathi volunteer app

Expo / React Native field app for approved volunteers and organisers.

## Features

- Live intake from WhatsApp and the voice booth.
- Assigned or unassigned volunteer tasks and task status updates.
- Missing-person and critical SOS reports with optional GPS.
- Official-record search and reporter calling when a number is available.
- Atomic found-person updates with timeline and audit entries.
- A visible demo-mode banner when no backend is configured.

## Setup

Apply the [database migration](../SETUP_AND_CHANGES.md) and provision a staff account with the `volunteer` or `organiser` role. Then, from this directory:

```bash
npm ci
# Copy .env.example to .env using your shell or editor.
npm start
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never use a database password or service-role key in Expo. Staff identity comes from sign-in; environment-based volunteer names are no longer used. Assignments use the user's Supabase UUID.

Use an Android/iOS device or simulator supported by this Expo project. The native map dependency means web support should not be assumed from the presence of an Expo web command.

## Verify the bundle

```bash
npx expo export --platform android --output-dir dist-check
```

API failure regressions are included in `../kumbhsaathi-whatsapp` under `npm test`. A bundle export is not a device test: verify location permission, calls, connectivity recovery, staff sign-in and map behavior on the intended device.

Pending case identifiers currently survive failed saves only within the running app. Durable offline storage and verified reunification are planned improvements.
