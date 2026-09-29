import asyncio
import json
import os

import httpx
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from uuid import UUID
from booth_auth import COOKIE, install_auth, same_origin, valid_session

import azure.cognitiveservices.speech as speechsdk

load_dotenv()

SPEECH_KEY = os.environ["SPEECH_KEY"]
SPEECH_REGION = os.getenv("SPEECH_REGION", "eastus2")
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BOOTH_ID = os.getenv("BOOTH_ID", "Ramkund Booth 1")
BOOTH_SOURCE = os.getenv("BOOTH_SOURCE", "saathi_didi_booth")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

SYSTEM_PROMPT = """You are Saathi Didi, the voice/avatar intake agent for a Kumbh Mela help booth.

You speak to Indian pilgrims — many elderly, rural, stressed, low-literacy, multilingual, or speaking in broken phrases.

Your job: understand one spoken transcript and return a structured JSON intake result.

Reply in the SAME language/script/style as the user (Hindi Devanagari, Hinglish Roman, Marathi, Gujarati, English, etc.).

Classify and create a case if the message involves:
- Someone missing, found, separated, injured, unconscious, drowning, dead, confused, abandoned
- An elderly or disabled person alone
- A lost child

Priority rules:
- child (0-12, 13-17) or drowning/dead/injured/unconscious/accident: priority = "critical"
- elderly (61+): priority = "high"
- missing without immediate danger: priority = "medium"
- found person, safe with volunteer: priority = "medium"
- generic unclear help without danger: do NOT create a case

Risk flags to include as applicable:
- "child" — if age 0-17
- "elderly" — if age 61+
- "possible_death_or_medical_emergency" — if drowning, dead, injured, unconscious, accident
- "no_name" — if missing person name unknown
- "no_mobile" — if no contact mobile
- "avatar_booth_intake" — ALWAYS include this

If last seen location is missing AND it is NOT an emergency: set should_create_case=false and ask one short question in the reply.
If it is an emergency with no location: create case anyway with last_seen_location="Booth location not specified".

Do NOT ask for state or district — this is Nashik Kumbh Mela only.
Do NOT mention database details, case IDs, or internal system text in spoken_reply.
Do NOT claim face recognition, CCTV analysis, or UPI/payment detection.

Return ONLY valid JSON with this exact shape:
{
  "intent": "missing_person|found_person|help|trust_check|nearest_police|unclear",
  "confidence": 0.0,
  "should_create_case": true,
  "reply_language": "English or Hindi Devanagari or Hinglish Roman etc.",
  "spoken_reply": "short user-facing reply in same language as user",
  "case": {
    "case_type": "missing|found",
    "priority": "low|medium|high|critical",
    "missing_person_name": null,
    "gender": "Male|Female|Unknown",
    "age_band": "0-12|13-17|18-40|41-60|61-70|71-80|80+|null",
    "language": null,
    "last_seen_location": null,
    "physical_description": null,
    "risk_flags": [],
    "missing_fields": []
  }
}"""

app = FastAPI()
install_auth(app)
openai_client = OpenAI(api_key=OPENAI_API_KEY)


@app.get("/")
async def root():
    return FileResponse("index.html")


@app.get("/ice-token")
async def ice_token():
    """Exchange the server key for a short-lived Speech token and relay details."""
    relay_url = f"https://{SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1"
    token_url = f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            relay, token = await asyncio.gather(
                hc.get(relay_url, headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY}),
                hc.post(token_url, headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY}),
            )
        relay.raise_for_status()
        token.raise_for_status()
        data = relay.json()
        data["speech_token"] = token.text
        data["speech_region"] = SPEECH_REGION
        return JSONResponse(data, headers={"Cache-Control": "no-store"})
    except (httpx.HTTPError, ValueError):
        return JSONResponse({"error": "Speech service unavailable. Please retry."}, status_code=502)


@app.websocket("/stt-ws")
async def stt_ws(websocket: WebSocket):
    """Stream mic audio from browser → Azure STT → return partial + final transcripts."""
    if not valid_session(websocket.cookies.get(COOKIE)) or not same_origin(websocket.headers.get("origin"), websocket.headers.get("host")):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    loop = asyncio.get_running_loop()
    msg_queue: asyncio.Queue = asyncio.Queue()

    push_stream = speechsdk.audio.PushAudioInputStream()
    audio_config = speechsdk.audio.AudioConfig(stream=push_stream)
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.set_property(
        speechsdk.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous"
    )
    # Support common Indian languages + English for pilgrim diversity
    auto_detect = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
        languages=["hi-IN", "en-IN", "mr-IN", "gu-IN"]
    )
    recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config,
        auto_detect_source_language_config=auto_detect,
        audio_config=audio_config,
    )

    finals: list[str] = []

    def on_recognizing(evt):
        asyncio.run_coroutine_threadsafe(
            msg_queue.put({"type": "partial", "text": evt.result.text}), loop
        )

    def on_recognized(evt):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech and evt.result.text:
            finals.append(evt.result.text)
            asyncio.run_coroutine_threadsafe(
                msg_queue.put({"type": "partial", "text": evt.result.text}), loop
            )

    def on_stopped(evt):
        asyncio.run_coroutine_threadsafe(msg_queue.put({"type": "__done__"}), loop)

    recognizer.recognizing.connect(on_recognizing)
    recognizer.recognized.connect(on_recognized)
    recognizer.session_stopped.connect(on_stopped)
    recognizer.canceled.connect(on_stopped)
    recognizer.start_continuous_recognition_async()

    # Receive audio chunks from the browser
    async def receive_audio():
        try:
            while True:
                msg = await websocket.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                raw = msg.get("bytes")
                text = msg.get("text")
                if raw:
                    push_stream.write(raw)
                elif text == "__END__":
                    break
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            push_stream.close()

    audio_task = asyncio.create_task(receive_audio())

    # Forward partials to browser until Azure signals done
    while True:
        item = await msg_queue.get()
        if item["type"] == "__done__":
            break
        try:
            await websocket.send_json(item)
        except Exception:
            break

    await audio_task
    recognizer.stop_continuous_recognition_async()

    full_text = " ".join(finals).strip()
    try:
        await websocket.send_json({"type": "final", "text": full_text})
    except Exception:
        pass


class BoothIntakeRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=8000)
    request_id: UUID


@app.post("/booth-intake")
def booth_intake(body: BoothIntakeRequest):
    """Extract intent with OpenAI, create live_case in Supabase if needed."""
    transcript = body.transcript.strip()
    if not transcript:
        return JSONResponse({"error": "Empty transcript"}, status_code=400)

    # ── OpenAI extraction ────────────────────────────────────────────────────
    try:
        completion = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": transcript},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        extracted = json.loads(completion.choices[0].message.content)
    except Exception as e:
        return JSONResponse({"error": "Intake service unavailable. Please ask booth staff for help."}, status_code=502)

    case_info = extracted.get("case", {}) or {}
    should_create = extracted.get("should_create_case", False)
    spoken_reply = extracted.get("spoken_reply", "Samajh gaya, ek moment.")
    intent = extracted.get("intent", "unclear")
    reply_language = extracted.get("reply_language", "Hinglish Roman")

    risk_flags = case_info.get("risk_flags") or []
    if "avatar_booth_intake" not in risk_flags:
        risk_flags.append("avatar_booth_intake")

    live_case_id = None

    if should_create:
        payload = {
            "source": BOOTH_SOURCE,
            "source_detail": BOOTH_ID,
            "case_type": case_info.get("case_type") or "missing",
            "status": "open",
            "priority": case_info.get("priority") or "medium",
            "missing_person_name": case_info.get("missing_person_name"),
            "gender": case_info.get("gender") or "Unknown",
            "age_band": case_info.get("age_band"),
            "state": None,
            "district": None,
            "language": case_info.get("language") or reply_language,
            "last_seen_location": case_info.get("last_seen_location"),
            "zone_name": None,
            "reporter_mobile": None,
            "physical_description": case_info.get("physical_description") or transcript,
            "raw_report": transcript,
            "structured_data": {
                "openai_extracted": True,
                "intake_channel": "avatar_booth",
                "reply_language": reply_language,
                "missing_fields": case_info.get("missing_fields") or [],
                "booth_id": BOOTH_ID,
                "intent": intent,
                "confidence": extracted.get("confidence", 0),
            },
            "private_verification_clues": [],
            "risk_flags": risk_flags,
        }

        try:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/rpc/create_intake_case",
                headers=SUPABASE_HEADERS,
                json={"p_report": payload, "p_request_id": str(body.request_id)},
                timeout=15,
            )
            resp.raise_for_status()
            row = resp.json()
            live_case_id = row.get("id") if isinstance(row, dict) else None
            if not live_case_id:
                raise ValueError("No saved case returned")
        except (requests.RequestException, ValueError):
            return JSONResponse({"error": "Report could not be confirmed saved. Retry this report or ask booth staff for help."}, status_code=502)

    return {
        "reply": spoken_reply,
        "intent": intent,
        "case_created": bool(live_case_id),
        "live_case_id": live_case_id,
        "extracted": {
            "case_type": case_info.get("case_type"),
            "priority": case_info.get("priority"),
            "missing_person_name": case_info.get("missing_person_name"),
            "last_seen_location": case_info.get("last_seen_location"),
            "risk_flags": risk_flags,
            "missing_fields": case_info.get("missing_fields") or [],
        },
    }
