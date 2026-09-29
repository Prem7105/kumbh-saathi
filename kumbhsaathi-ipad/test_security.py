import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

# Tests use only synthetic configuration and mocked external services.
os.environ.update({"SPEECH_KEY": "private-test-speech-key", "OPENAI_API_KEY": "test-key",
                   "SUPABASE_URL": "https://example.invalid", "SUPABASE_SERVICE_ROLE_KEY": "private-test-db-key",
                   "BOOTH_ACCESS_TOKEN": "test-booth-unlock-code-at-least-24-characters"})
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import httpx
import requests
import main
from booth_auth import COOKIE, issue_session, valid_session


class BoothSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)
        response = cls.client.post("/booth-login", data={"token": os.environ["BOOTH_ACCESS_TOKEN"]},
                                   headers={"origin": "http://testserver"}, follow_redirects=False)
        assert response.status_code == 303
        assert "httponly" in response.headers["set-cookie"].lower()

    def test_public_endpoints_and_websocket_are_locked(self):
        with TestClient(main.app) as client:
            self.assertEqual(client.get("/ice-token").status_code, 401)
            self.assertEqual(client.post("/booth-intake", json={"transcript": "help"}).status_code, 401)
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect("/stt-ws", headers={"origin": "http://testserver"}):
                    pass

    def test_cookies_cannot_be_forged_or_reused_after_expiry(self):
        cookie = issue_session()
        self.assertTrue(valid_session(cookie))
        self.assertFalse(valid_session(cookie + "tampered"))
        with patch("booth_auth.time.time", return_value=9999999999):
            self.assertFalse(valid_session(cookie))

    def test_speech_endpoint_returns_token_without_subscription_key(self):
        class AzureClient:
            def __init__(self, **_kwargs): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *_args): pass
            async def get(self, url, **kwargs):
                return httpx.Response(200, json={"Uris": ["turn:example.invalid"]}, request=httpx.Request("GET", url))
            async def post(self, url, **kwargs):
                return httpx.Response(200, text="short-lived-test-token", request=httpx.Request("POST", url))
        with patch("main.httpx.AsyncClient", AzureClient):
            response = self.client.get("/ice-token")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["speech_token"], "short-lived-test-token")
        self.assertNotIn("speech_key", response.json())
        self.assertNotIn(os.environ["SPEECH_KEY"], response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_cross_origin_intake_is_denied(self):
        response = self.client.post("/booth-intake", json={"transcript": "help"}, headers={"origin": "https://attacker.invalid"})
        self.assertEqual(response.status_code, 403)

    def test_failed_save_does_not_claim_case_created(self):
        completion = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"should_create_case":true,"case":{"case_type":"missing"},"spoken_reply":"Saved"}'))])
        with patch.object(main.openai_client.chat.completions, "create", return_value=completion), patch("main.requests.post", side_effect=requests.ConnectionError("private connection details")):
            response = self.client.post("/booth-intake", json={"transcript": "child missing near gate", "request_id": "10000000-0000-0000-0000-000000000001"}, headers={"origin": "http://testserver"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("case_created", response.json())
        self.assertNotIn("private connection details", response.text)


if __name__ == "__main__":
    unittest.main()
