const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { getExpectedTwilioSignature } = require("twilio");
const { createApp, normalizeInbound } = require("../src/whatsapp/server");

async function serve(t, options) {
  const server = createApp(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test("unsigned webhooks and disabled simulator cannot invoke intake", async t => {
  let calls = 0;
  const url = await serve(t, { env: { TWILIO_AUTH_TOKEN: "test", TWILIO_WEBHOOK_URL: "https://example.invalid/webhook" }, handler: async () => { calls++; } });
  const response = await fetch(`${url}/webhooks/twilio/whatsapp`, { method: "POST", body: new URLSearchParams({ From: "whatsapp:+919876543210" }) });
  assert.equal(response.status, 403);
  assert.equal((await fetch(`${url}/api/whatsapp/simulate`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${url}/whatsapp-simulator.html`)).status, 404);
  assert.equal(calls, 0);
});
test("signed delivery retries call intake once and escape TwiML", async t => {
  let calls = 0;
  const env = { TWILIO_AUTH_TOKEN: "test", TWILIO_WEBHOOK_URL: "https://example.invalid/webhook" };
  const url = await serve(t, { env, handler: async () => { calls++; return { reply: "Saved <case> & ready" }; } });
  const payload = { MessageSid: "SM" + "a".repeat(32), From: "whatsapp:+919876543210", Body: "child missing" };
  const signature = getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_WEBHOOK_URL, payload);
  const send = () => fetch(`${url}/webhooks/twilio/whatsapp`, { method: "POST", headers: { "x-twilio-signature": signature }, body: new URLSearchParams(payload) });
  const responses = await Promise.all([send(), send()]);
  assert.equal(responses[0].status, 200);
  assert.match(await responses[0].text(), /Saved &lt;case&gt; &amp; ready/);
  assert.equal(calls, 1);
  const tampered = await fetch(`${url}/webhooks/twilio/whatsapp`, { method: "POST", headers: { "x-twilio-signature": signature }, body: new URLSearchParams({ ...payload, Body: "tampered" }) });
  assert.equal(tampered.status, 403);
});
test("simulator requires its token and failed saves never return success", async t => {
  const url = await serve(t, { env: { ENABLE_SIMULATOR: "true", SIMULATOR_TOKEN: "secret" }, handler: async () => { throw new Error("sensitive database connection details"); } });
  const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: "whatsapp:+919876543210", body: "help" }) };
  assert.equal((await fetch(`${url}/api/whatsapp/simulate`, options)).status, 401);
  options.headers.Authorization = "Bearer secret";
  const response = await fetch(`${url}/api/whatsapp/simulate`, options);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sensitive database/);
});
test("zero coordinates survive normalization", () => {
  assert.equal(normalizeInbound({ Latitude: 0, Longitude: 0 }).latitude, 0);
});
