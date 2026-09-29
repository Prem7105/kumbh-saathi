function hasTwilioConfig() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_NUMBER
  );
}

async function sendWhatsAppLocation({ to, latitude, longitude, label, body }) {
  if (!hasTwilioConfig()) {
    return { ok: false, skipped: true, error: "Twilio credentials are not configured" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const locationLabel = sanitizeLocationLabel(label || "Location");
  const params = new URLSearchParams();
  params.set("From", from);
  params.set("To", to);
  params.set("Body", body || locationLabel);
  params.set("PersistentAction", `geo:${latitude},${longitude}|${locationLabel}`);

  if (String(process.env.TWILIO_LOCATION_DRY_RUN || "").toLowerCase() === "true") {
    return {
      ok: true,
      dryRun: true,
      request: Object.fromEntries(params.entries()),
    };
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = typeof data === "string" ? data : data?.message || response.statusText;
    return { ok: false, status: response.status, error: message, data };
  }

  return { ok: true, sid: data?.sid, data };
}

function sanitizeLocationLabel(label) {
  return String(label)
    .replace(/[|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

module.exports = {
  sendWhatsAppLocation,
};
