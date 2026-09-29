# Kumbh Saathi WhatsApp

Twilio-compatible WhatsApp bot plus local browser simulator.

## Responsibilities

- citizen missing-person report intake
- found-person report intake
- Trust Check message triage
- writes live reports to Supabase
- creates `live_cases`, `case_updates`, `trust_check_reports`, and `audit_logs`

## Run

CLI test without starting a server:

```bash
npm run cli -- "Meri dadi Ramkund Ghat ke paas kho gayi hai. 75 saal ki hain, green saree pehni hai, Maithili bolti hain."
```

Interactive CLI:

```bash
npm run cli
```

Server (apply [secure setup](../SETUP_AND_CHANGES.md) first):

```bash
npm install
copy .env.example .env
npm run dev
```

For the browser simulator, set `ENABLE_SIMULATOR=true` and a random `SIMULATOR_TOKEN`, then enter that token in the page. It is disabled by default.

Open:

```text
http://localhost:8787
```

Twilio webhook route:

```text
POST /webhooks/twilio/whatsapp
```

Simulator route:

```text
POST /api/whatsapp/simulate
```

## Configuration and verification

Use `.env.example`. Configure the OpenAI key, Supabase URL and **server-only** service-role key, plus Twilio credentials and the exact public webhook URL. Requests without a valid Twilio signature are rejected. REST-only mode avoids a separate database connection.

Run `npm test` for webhook validation, database permission/rollback tests, and mobile save-error regressions. Tests use a local in-memory PostgreSQL engine and mocked providers; they do not contact a live database or send WhatsApp messages.

See [setup and remaining improvements](../SETUP_AND_CHANGES.md).
