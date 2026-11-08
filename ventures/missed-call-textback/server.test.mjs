import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp, configFromEnv } from "./server.mjs";
import { twilioSignature, validSignature, twiml, sendSms } from "./twilio.mjs";

const TUE_9AM = Date.UTC(2026, 10, 3, 15, 0), TUE_11PM = Date.UTC(2026, 10, 4, 5, 0);
const env = { BUSINESS_NAME: "Acme Plumbing", TIMEZONE: "America/Chicago", TWILIO_ACCOUNT_SID: "ACx", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15125550100", PUBLIC_URL: "https://h.example", OWNER_NUMBER: "+15125550199" };

function harness(over = {}) {
  const sent = []; let t = TUE_9AM, saved = null;
  const app = createApp({ config: configFromEnv(env), env: { ...env, ...over }, now: () => t, send: async (m) => { sent.push(m); return {}; }, load: () => ({}), save: (s) => { saved = s; }, log: () => {} });
  return { app, sent, setNow: (x) => { t = x; }, saved: () => saved };
}
async function post(app, path, params, sig) {
  const srv = createServer((q, s) => app.handler(q, s)); await new Promise((r) => srv.listen(0, r));
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`http://127.0.0.1:${srv.address().port}${path}`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sig ? { "X-Twilio-Signature": sig } : {}) } });
  const text = await res.text(); srv.close(); return { status: res.status, text };
}
const signed = (path, p) => twilioSignature("tok", "https://h.example" + path, p);

test("signature: matches the documented algorithm and rejects tampering", () => {
  const p = { From: "+1", CallSid: "CA1" }, url = "https://h.example/voice";
  // Computed independently here: HMAC-SHA1(url + "CallSidCA1From+1"), base64. Not checked against a Twilio-published vector.
  const sig = twilioSignature("tok", url, p);
  assert.ok(validSignature("tok", url, p, sig));
  assert.ok(!validSignature("tok", url, { ...p, From: "+2" }, sig));
  assert.ok(!validSignature("other", url, p, sig));
  assert.ok(!validSignature("tok", url, p, ""));
});

test("twiml escapes the message", () => { assert.equal(twiml("a<b&"), '<?xml version="1.0" encoding="UTF-8"?><Response><Message>a&lt;b&amp;</Message></Response>'); assert.match(twiml(null), /<Response><\/Response>/); });

test("a signed missed-call webhook sends one text; the same caller again is not texted", async () => {
  const h = harness(); const p = { From: "+15125550142", CallStatus: "no-answer" };
  assert.equal((await post(h.app, "/voice", p, signed("/voice", p))).status, 204);
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].to, "+15125550142"); assert.match(h.sent[0].body, /Acme Plumbing/);
  await post(h.app, "/voice", p, signed("/voice", p));
  assert.equal(h.sent.length, 1);
  assert.ok(h.saved().lastText["+15125550142"]);
});

test("an unsigned or wrongly signed webhook is refused and sends nothing", async () => {
  const h = harness(); const p = { From: "+15125550142", CallStatus: "no-answer" };
  assert.equal((await post(h.app, "/voice", p)).status, 403);
  assert.equal((await post(h.app, "/voice", p, "bad")).status, 403);
  assert.equal(h.sent.length, 0);
});

test("night call is queued, then sent by flush in the morning, unless the person said STOP in between", async () => {
  const h = harness(); h.setNow(TUE_11PM);
  const p = { From: "+15125550142", CallStatus: "busy" };
  await post(h.app, "/voice", p, signed("/voice", p));
  assert.equal(h.sent.length, 0); assert.equal(h.app.queue.length, 1);
  assert.equal(await h.app.flush(), 0); // still night
  h.setNow(Date.UTC(2026, 10, 4, 14, 0));
  assert.equal(await h.app.flush(), 1); assert.equal(h.sent.length, 1); assert.equal(h.app.queue.length, 0);

  const g = harness(); g.setNow(TUE_11PM);
  await post(g.app, "/voice", p, signed("/voice", p));
  const s = { From: "+15125550142", Body: "STOP" };
  await post(g.app, "/sms", s, signed("/sms", s));
  g.setNow(Date.UTC(2026, 10, 4, 14, 0)); await g.app.flush();
  assert.equal(g.sent.length, 0);
});

test("STOP reply returns TwiML and blocks later texts; other replies are forwarded to the owner", async () => {
  const h = harness();
  const s = { From: "+15125550142", Body: "stop" };
  const r = await post(h.app, "/sms", s, signed("/sms", s));
  assert.match(r.text, /opted out/);
  const p = { From: "+15125550142", CallStatus: "no-answer" };
  await post(h.app, "/voice", p, signed("/voice", p));
  assert.equal(h.sent.length, 0);
  const m = { From: "+15125550777", Body: "my sink is leaking" };
  const r2 = await post(h.app, "/sms", m, signed("/sms", m));
  assert.match(r2.text, /<Response><\/Response>/);
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].to, "+15125550199"); assert.match(h.sent[0].body, /my sink is leaking/);
});

test("without keys it is a dry run: nothing is sent, state still updates", async () => {
  const h = harness({ TWILIO_AUTH_TOKEN: "" });
  assert.equal(h.app.live, false);
  await post(h.app, "/voice", { From: "+15125550142", CallStatus: "no-answer" });
  assert.equal(h.sent.length, 0); assert.ok(h.saved().lastText["+15125550142"]);
});

test("sendSms posts form data with basic auth and surfaces errors", async () => {
  let seen;
  await sendSms({ accountSid: "ACx", authToken: "tok", from: "+1", to: "+2", body: "hi" }, async (u, o) => { seen = { u, o }; return { ok: true, text: async () => "{}" }; });
  assert.match(seen.u, /Accounts\/ACx\/Messages\.json$/);
  assert.equal(seen.o.headers.Authorization, "Basic " + Buffer.from("ACx:tok").toString("base64"));
  assert.match(seen.o.body, /Body=hi/);
  await assert.rejects(sendSms({ accountSid: "a", authToken: "b", from: "1", to: "2", body: "x" }, async () => ({ ok: false, status: 400, text: async () => "bad" })), /Twilio 400/);
});

test("unknown routes 404", async () => {
  const h = harness();
  assert.equal((await post(h.app, "/nope", {})).status, 404);
});
