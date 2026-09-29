# Secure setup and changes

The local fixes are implemented. **An existing Supabase deployment is not protected until its database migration is applied.** This source copy contains no live credentials; no remote database or hosting configuration was changed.

## Activate the changes

1. Back up the project database. In its Supabase SQL editor, run `kumbhsaathi-shared/security-hardening.sql` for an existing installation. For a fresh project, run `kumbhsaathi-shared/supabase-schema.sql`, which includes the same migration. The migration is transactional and repeatable. If the unique external-case index fails because legacy duplicate IDs exist, review those rows before retrying; the migration does not delete records automatically.
2. Create staff accounts in Supabase Authentication. Disable public signup if only invited staff should have accounts. Give each approved user an administrator-controlled `app_metadata.staff_role` of `organiser` or `volunteer`. Do not put this role in user-editable `user_metadata`.
3. Assign roles using an administrator operation. For example, in the SQL editor, substitute an actual account UUID:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || '{"staff_role":"organiser"}'::jsonb
   where id = 'REPLACE-WITH-USER-UUID'::uuid;
   ```

   Use `volunteer` for field users. Sign out and back in after changing a role so the new JWT includes it. Role changes take effect for database access when the user's token refreshes; for urgent revocation, also revoke sessions and review JWT expiry settings.
4. Configure each app using its updated `.env.example`. The command center and mobile app keep the public Supabase key and authenticate individual users. **Only the WhatsApp server and booth use `SUPABASE_SERVICE_ROLE_KEY`.** Never put that key in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables. Restart/rebuild clients after changing public configuration.
5. For WhatsApp, set `TWILIO_WEBHOOK_URL` to the exact externally visible HTTPS URL registered in Twilio and set `TWILIO_AUTH_TOKEN`. Signature validation does not guess a proxy URL. The simulator is off by default; enabling it also requires a separate random `SIMULATOR_TOKEN`, entered in the simulator page. It now shares the protected case-writing code.
6. Set a random `BOOTH_ACCESS_TOKEN` of at least 24 characters. A staff member unlocks the booth with it. The session lasts eight hours. Serve remote/iPad access over HTTPS; configure the reverse proxy and Uvicorn's trusted forwarded headers so the application sees the external HTTPS scheme. Rotate any Azure subscription key that was exposed through a previously deployed `/ice-token` endpoint.
7. Task assignments now use the volunteer's Supabase user UUID. Leave assignments blank for anyone to claim. Reassign existing name-based task assignments to account UUIDs. The mobile screen shows the signed-in UUID for reference.
8. Redeploy the updated code together with the migration. Old anonymous clients will stop working once the database is secured. The command center's `private-assets` directory must be included in deployment; Next.js tracing is configured for its map route. Do not separately publish these assets or the shared raw datasets as static hosting content. If an earlier deployment cached public map files, purge those paths from its CDN.

## Implemented

- Staff sign-in and role checks for command center/mobile, backed by database row-level security.
- Removal of the anonymous demo read/write policies; no staff edits to existing audit records or timeline entries.
- Organiser-only access to CCTV, administrative tables and authenticated map downloads. Map source files were moved out of the web public directory.
- Twilio signature verification, per-sender rate limiting, disabled-by-default authenticated simulator, bounded delivery-response caching and generic error responses.
- Atomic case creation, timeline and audit writes. Provider message/request IDs deduplicate case creation after delivery retries or an uncertain response. Mobile reports also create their volunteer task in that transaction.
- Atomic volunteer status and found-person updates with assignment checks. A failed audit write rolls the entire operation back. “Found” does not automatically mean “reunited.”
- Removal of WhatsApp's fabricated `local-*` success result after failed saves.
- Staff unlock and protected WebSocket for the booth, expiring Speech tokens instead of subscription keys in browser responses, token refresh, request validation and atomic booth intake.
- A reachable live volunteer task monitor, actual connection status, load-error messages, and refreshing statistics/open-case queues after field updates.
- Escaped map-popup text to prevent intake content from being interpreted as HTML.
- A persistent mobile demo-mode banner and corrected handling of absent GPS coordinates.
- Updated configuration examples and repeatable regression tests.

## Verify locally

```powershell
cd kumbhsaathi-whatsapp
npm ci
npm test

cd ../kumbhsaathi-command-center
npm ci
npm run build

cd ../kumbhsaathi-mobile
npm ci
npx expo export --platform android --output-dir dist-check

cd ../kumbhsaathi-ipad
.venv/Scripts/python.exe -m unittest test_security -v
```

Create the booth virtual environment and install `requirements.txt` first, as described in its README. The Node database tests run actual SQL in a local PGlite PostgreSQL instance with simulated Supabase authentication claims. They check anonymous/ordinary-user denial, staff permissions, retries, assignment protection, and rollback after deliberately failed audit writes. Webhook and booth tests mock external providers and do not send messages or incur API charges.

Before using real cases, test on a configured staging project: WhatsApp report → command-center queue → assigned volunteer task → found-person update → updated dashboard and audit trail. Also verify an unauthorised account sees no records. Test microphone, location permission, avatar and Speech token refresh on the intended iPad/phone. An Android export verifies bundling, not native installation or GPS behavior.

## Verification result for this local change

- Seven Node tests passed, including actual SQL permission and rollback assertions plus webhook/mobile failure handling.
- Five FastAPI/booth security tests passed with external providers mocked.
- Command-center production build and TypeScript validation passed.
- Android production JavaScript/Hermes export passed.
- Running command-center HTTP checks returned 200 for the app, 404 for the former public CCTV/KML paths, and 401 for the map API without a session. All six private GeoJSON files are included in Next.js deployment tracing.
- Live provider delivery, deployed Supabase permissions, authenticated browser/device flows and iOS/device behavior have not been verified without environment credentials and target devices.

## Next improvements, in priority order

1. **Verified reunification:** record who verified the claimant, the private verification process and an authorised handover before marking a person reunited. Keep “found,” “identity verified,” and “reunited” distinct.
2. **Durable intake sessions and delivery queue:** WhatsApp follow-up state and cached delivery replies are still process-local. Store them durably before using multiple workers or requiring recovery across restarts. Case-creation deduplication is already database-backed; this does not make the entire conversation or outbound notification exactly-once.
3. **Offline field workflow:** persist pending reports with stable request IDs across app restarts, clearly show unsent reports, and retry after connectivity returns. Current failed mobile-save identifiers survive only within the running app and match identical payloads.
4. **Operational monitoring:** alert on failed intake, stalled critical cases and disconnected clients; add load tests and provider timeout/retry policies. Run a dependency/security review before deployment. Current rate limits are per process, so use shared storage or a gateway for multiple server instances.
5. **Privacy and retention:** define record retention, approved exports, who may access full reporter numbers, and deletion procedures with the operating organisation. Approved volunteers currently have broad field-case access; use zone/team assignment restrictions if your operating model requires them.
6. **Booth conversation continuity:** retain the current report across follow-up turns so a location-only reply can complete an earlier report. The existing extraction still processes each submitted transcript independently.

## Official implementation references

- [Supabase row-level security and app metadata](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Twilio webhook signature validation](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Azure Speech token exchange](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)
