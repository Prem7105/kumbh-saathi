"""Operator unlock for the booth. No secret is embedded in the public page."""
import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict
from urllib.parse import parse_qs, urlsplit

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

COOKIE = "booth_session"
TTL = 8 * 60 * 60
LOGIN = """<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kumbh Saathi booth unlock</title><body style="font-family:system-ui;background:#fff7ed;padding:10vh 24px">
<main style="max-width:420px;margin:auto"><h1>Unlock Saathi Didi</h1>
<p>A staff member must unlock this booth before pilgrims can use it.</p>
<form action="/booth-login" method="post"><label>Booth access code
<input name="token" type="password" required autocomplete="current-password" style="display:block;padding:12px;margin:16px 0;width:90%"></label>
<button style="padding:12px 24px">Unlock booth</button></form></main></body></html>"""


def secret():
    value = os.environ.get("BOOTH_ACCESS_TOKEN", "")
    if len(value) < 24:
        raise RuntimeError("BOOTH_ACCESS_TOKEN must contain at least 24 characters")
    return value


def issue_session():
    payload = f"{int(time.time()) + TTL}.{secrets.token_hex(16)}"
    signature = hmac.new(secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def valid_session(cookie):
    try:
        expiry, nonce, signature = cookie.split(".")
        expected = hmac.new(secret().encode(), f"{expiry}.{nonce}".encode(), hashlib.sha256).hexdigest()
        return int(time.time()) < int(expiry) <= int(time.time()) + TTL and hmac.compare_digest(expected, signature)
    except (ValueError, AttributeError):
        return False


def same_origin(origin, host):
    return bool(origin) and urlsplit(origin).netloc == host


def install_auth(app):
    secret()  # Fail closed on misconfiguration.
    attempts = defaultdict(list)

    @app.middleware("http")
    async def protect(request: Request, call_next):
        if request.url.path == "/booth-login" and request.method == "POST":
            now = time.monotonic()
            for ip in list(attempts):
                attempts[ip] = [stamp for stamp in attempts[ip] if now - stamp < 60]
                if not attempts[ip]:
                    del attempts[ip]
            ip = request.client.host if request.client else "unknown"
            if len(attempts) >= 5000 or len(attempts[ip]) >= 5:
                return JSONResponse({"error": "Please wait before trying again."}, status_code=429)
            attempts[ip].append(now)
            if not same_origin(request.headers.get("origin"), request.headers.get("host")):
                return JSONResponse({"error": "Invalid origin"}, status_code=403)
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 2048:
                    return JSONResponse({"error": "Request too large"}, status_code=413)
            token = parse_qs(body.decode(errors="replace")).get("token", [""])[0]
            if not hmac.compare_digest(token.encode(), secret().encode()):
                return HTMLResponse(LOGIN.replace("<form", "<p>Incorrect access code.</p><form"), status_code=401)
            response = RedirectResponse("/", status_code=303)
            response.set_cookie(COOKIE, issue_session(), max_age=TTL, httponly=True,
                                secure=request.url.scheme == "https", samesite="strict")
        elif not valid_session(request.cookies.get(COOKIE)):
            response = HTMLResponse(LOGIN, status_code=401) if request.url.path == "/" else JSONResponse({"error": "Unlock the booth first."}, status_code=401)
        elif request.method not in ("GET", "HEAD") and not same_origin(request.headers.get("origin"), request.headers.get("host")):
            response = JSONResponse({"error": "Invalid origin"}, status_code=403)
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Frame-Options"] = "DENY"
        return response
