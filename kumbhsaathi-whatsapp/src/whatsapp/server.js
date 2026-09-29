require("dotenv").config();
const express = require("express");
const path = require("path");
const { timingSafeEqual } = require("node:crypto");
const { validateRequest } = require("twilio");
const { rateLimit } = require("express-rate-limit");
const { handleMessage } = require("./service");

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function twiml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`;
}
function normalizeInbound(input) {
  return {
    from: input.From || input.from,
    body: input.Body || input.body || "",
    messageSid: input.MessageSid || null,
    mediaUrl: input.MediaUrl0 || input.mediaUrl || null,
    latitude: input.Latitude ?? input.latitude ?? input.lat ?? null,
    longitude: input.Longitude ?? input.longitude ?? input.lng ?? input.lon ?? null,
    locationLabel: input.Label || input.label || input.Address || input.address || null,
  };
}
function equalSecret(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createApp({ handler = handleMessage, env = process.env } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  const simulatorEnabled = env.ENABLE_SIMULATOR === "true" && Boolean(env.SIMULATOR_TOKEN);
  const completed = new Map();
  const inFlight = new Map();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const simulatorAuth = (req, res, next) => {
    if (!simulatorEnabled) return res.sendStatus(404);
    if (!equalSecret(req.get("authorization"), `Bearer ${env.SIMULATOR_TOKEN}`)) return res.sendStatus(401);
    next();
  };
  app.get("/", (_req, res) => {
    if (!simulatorEnabled) return res.sendStatus(404);
    res.sendFile(path.join(__dirname, "../../public/whatsapp-simulator.html"));
  });
  app.post("/api/whatsapp/simulate", simulatorAuth,
    rateLimit({ windowMs: 60000, limit: 30 }), async (req, res) => {
      if (typeof req.body.from !== "string" || !req.body.from) return res.status(400).json({ error: "Sender required" });
      try { res.json(await handler(normalizeInbound(req.body))); }
      catch { res.status(503).json({ error: "Report not saved. Please retry or contact a help desk." }); }
    });
  function verifyTwilio(req, res, next) {
    if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_WEBHOOK_URL) return res.sendStatus(503);
    if (!req.is("application/x-www-form-urlencoded")) return res.sendStatus(415);
    if (!validateRequest(env.TWILIO_AUTH_TOKEN, req.get("x-twilio-signature") || "", env.TWILIO_WEBHOOK_URL, req.body)) return res.sendStatus(403);
    if (!/^SM[a-fA-F0-9]{32}$/.test(req.body.MessageSid || "") || !/^whatsapp:\+\d{8,15}$/.test(req.body.From || "")) return res.sendStatus(400);
    next();
  }
  app.post("/webhooks/twilio/whatsapp", verifyTwilio,
    rateLimit({ windowMs: 60000, limit: 30, keyGenerator: (req) => req.body.From }),
    async (req, res) => {
      const sid = req.body.MessageSid;
      const now = Date.now();
      for (const [key, entry] of completed) if (entry.expires <= now) completed.delete(key);
      try {
        let reply = completed.get(sid)?.reply;
        if (reply === undefined) {
          let pending = inFlight.get(sid);
          if (!pending) { pending = handler(normalizeInbound(req.body)); inFlight.set(sid, pending); }
          try {
            reply = (await pending).reply;
            if (completed.size >= 10000) completed.delete(completed.keys().next().value);
            completed.set(sid, { reply, expires: now + 86400000 });
          } finally { inFlight.delete(sid); }
        }
        res.type("text/xml").send(twiml(reply));
      } catch {
        res.status(503).type("text/xml").send(twiml("Your report could not be saved. Please retry or contact the nearest help desk."));
      }
    });
  return app;
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createApp().listen(port, () => console.log(`Kumbh Saathi WhatsApp bot listening on port ${port}`));
}
module.exports = { createApp, normalizeInbound };
