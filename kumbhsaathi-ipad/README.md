# Kumbh Saathi ? Saathi Didi booth

Apply the [database migration and staff setup](../SETUP_AND_CHANGES.md) first.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Fill the server-only credentials and a random BOOTH_ACCESS_TOKEN.
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open http://localhost:8000 and have staff unlock the booth. For an iPad, serve the app over HTTPS through your deployment/reverse proxy; microphone access requires a secure browser context outside localhost. The unlock cookie expires after eight hours. Rotating BOOTH_ACCESS_TOKEN invalidates existing sessions.

The browser receives short-lived Azure Speech tokens, never the subscription key. Protected HTTP and speech WebSocket endpoints require the booth session. The backend uses a server-only Supabase service-role key and saves a case, timeline and audit in one transaction.

```powershell
.venv\Scripts\python.exe -m unittest test_security -v
```

Tests mock paid services. A real device test with Azure credentials is still required for microphone, speech, WebRTC and avatar compatibility.
