import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { emptyDesk, normalizeDesk } from "./engine.mjs";
import { runAutomations, twilioSignature, unsubToken, unsubscribeUrl } from "./automations-server.mjs";
import { isOptedOut } from "./automations.mjs";

const NOW = Date.parse("2026-11-04T16:30:00Z");
const ENV = { TZ: "UTC", ADMIN_KEY: "admin-test-key", RESEND_API_KEY: "re_test", FROM_EMAIL: "Grace <grace@example.com>", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "tw-test-token", TWILIO_FROM: "+15550000000", PUBLIC_URL: "https://sitter.example" };

// Invented: Ana has an email and a mobile, David a mobile only. Ana's sit is tomorrow.
function state() {
  const d = emptyDesk();
  d.profile = { ...d.profile, name: "Grace Example", automations: { confirm: true, reminder: true } };
  d.families = [
    { id: "fam_a", name: "Rivera family", contactName: "Ana Rivera", contact: "ana@example.com, 555-201-0111", kids: [{ name: "Leo" }] },
    { id: "fam_b", name: "Chen family", contactName: "David Chen", contact: "555-201-0122" },
  ];
  d.bookings = [
    { id: "bk_1", familyId: "fam_a", date: "2026-11-05", start: "15:30", end: "18:30", kids: 1, status: "scheduled" },
    { id: "bk_2", familyId: "fam_b", date: "2026-11-20", start: "18:00", end: "21:00", kids: 1, status: "scheduled" },
  ];
  return { desk: d };
}
function fakeFetch(ok = true) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return ok ? { ok: true } : { ok: false, status: 500, text: async () => "boom" }; };
  f.calls = calls;
  return f;
}

test("due messages go out once, by email (with one-click unsubscribe) and by text", async () => {
  const s = state();
  let saves = 0;
  const f = fakeFetch();
  const r = await runAutomations(s, () => saves++, ENV, NOW, f);
  assert.deepEqual({ sent: r.sent, failed: r.failed }, { sent: 3, failed: 0 });
  assert.equal(saves, 1);
  const email = f.calls.filter((c) => c.url === "https://api.resend.com/emails").map((c) => JSON.parse(c.init.body));
  assert.equal(email.length, 2, "Ana: a confirmation and a reminder");
  assert.deepEqual(email[0].to, ["ana@example.com"]);
  assert.match(email[0].headers["List-Unsubscribe"], /^<https:\/\/sitter\.example\/unsubscribe\?e=ana%40example\.com&t=[0-9a-f]{32}>$/);
  assert.equal(email[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(email[0].text, /Don't want these emails\? Unsubscribe: https:\/\/sitter\.example\/unsubscribe/);
  const sms = f.calls.filter((c) => c.url.startsWith("https://api.twilio.com/"));
  assert.equal(sms.length, 1);
  assert.equal(sms[0].url, "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
  assert.equal(sms[0].init.headers.authorization, `Basic ${Buffer.from("ACtest:tw-test-token").toString("base64")}`);
  const form = new URLSearchParams(sms[0].init.body);
  assert.equal(form.get("To"), "+15552010122");
  assert.equal(form.get("From"), "+15550000000");
  assert.match(form.get("Body"), /confirming babysitting on Fri 2026-11-20, 18:00-21:00\. Each sit is about \$60 at my rates\. If anything changes, just reply here\. Reply STOP to opt out\.$/);
  assert.equal(s.desk.automations.log.length, 3);

  // a second tick, and a restart from the saved JSON, send nothing more
  assert.equal((await runAutomations(s, () => saves++, ENV, NOW + 5 * 6e4, f)).sent, 0);
  const restarted = { desk: normalizeDesk(JSON.parse(JSON.stringify(s.desk))) };
  assert.equal((await runAutomations(restarted, () => {}, ENV, NOW + 10 * 6e4, f)).sent, 0);
  assert.equal(f.calls.length, 3);
});

test("nothing is sent in quiet hours, with rules off, or without keys", async () => {
  const f = fakeFetch();
  const q = await runAutomations(state(), () => {}, ENV, Date.parse("2026-11-04T20:30:00Z"), f);
  assert.equal(q.quiet, true);
  assert.equal(q.due > 0, true);
  const off = state();
  off.desk.profile.automations = {};
  assert.equal((await runAutomations(off, () => {}, ENV, NOW, f)).sent, 0);
  assert.equal((await runAutomations(state(), () => {}, { TZ: "UTC" }, NOW, f)).sent, 0);
  assert.equal(f.calls.length, 0);
  const emailOnly = await runAutomations(state(), () => {}, { ...ENV, TWILIO_AUTH_TOKEN: "" }, NOW, f);
  assert.equal(emailOnly.sent, 2, "without Twilio, the family with only a phone waits");
});

test("a failing send is logged, retried, and given up after three tries", async () => {
  const s = state();
  const f = fakeFetch(false);
  for (let i = 0; i < 5; i++) await runAutomations(s, () => {}, ENV, NOW + i * 6e4, f);
  assert.equal(f.calls.length, 9, "3 messages x 3 tries");
  assert.match(s.desk.automations.log[0].error, /HTTP 500 boom/);
  assert.equal(Object.keys(s.desk.automations.sent).length, 0);
});

async function serve(s, env = ENV, f = fakeFetch()) {
  let saves = 0;
  const srv = http.createServer(handler(s, () => saves++, env, () => NOW, f));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)), saves: () => saves, f };
}

test("GET /api/automations/preview shows what would be sent, behind the admin key", async () => {
  const s = state();
  const srv = await serve(s);
  try {
    assert.equal((await fetch(`${srv.base}/api/automations/preview`)).status, 401);
    const r = await fetch(`${srv.base}/api/automations/preview`, { headers: { authorization: "Bearer admin-test-key" } });
    assert.equal(r.status, 200);
    const p = await r.json();
    assert.equal(p.date, "2026-11-04");
    assert.equal(p.quiet, false);
    assert.deepEqual(p.messages.map((m) => `${m.rule}/${m.channel}/${m.family}`), ["confirm/email/Rivera family", "confirm/sms/Chen family", "reminder/email/Rivera family"]);
    assert.deepEqual(p.channels, { email: true, sms: true });
    const night = await (await fetch(`${srv.base}/api/automations/preview?at=2026-11-04T23:00:00Z`, { headers: { authorization: "Bearer admin-test-key" } })).json();
    assert.equal(night.quiet, true);
    assert.equal(srv.f.calls.length, 0, "a preview sends nothing");
  } finally { await srv.close(); }
});

test("the unsubscribe link asks, then opts the address out; a forged link does nothing", async () => {
  const s = state();
  const srv = await serve(s);
  try {
    const link = unsubscribeUrl(ENV, "ana@example.com").replace("https://sitter.example", srv.base);
    const page = await (await fetch(link)).text();
    assert.match(page, /Stop automated emails to <strong>ana@example\.com<\/strong>/);
    assert.equal(isOptedOut(s.desk, "email", "ana@example.com"), false, "opening the link (or a mail scanner) does not unsubscribe");
    assert.equal((await fetch(`${srv.base}/unsubscribe?e=ana%40example.com&t=${"0".repeat(32)}`, { method: "POST" })).status, 400);
    const r = await fetch(link, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    assert.equal(r.status, 200);
    assert.equal(isOptedOut(s.desk, "email", "ana@example.com"), true);
    assert.equal(unsubToken(ENV, "ANA@example.com"), unsubToken(ENV, "ana@example.com"));
  } finally { await srv.close(); }
});

test("a STOP text through the Twilio webhook opts the number out; a bad signature is refused", async () => {
  const s = state();
  const srv = await serve(s);
  const params = { From: "+15552010122", To: "+15550000000", Body: "Stop", MessageSid: "SMtest" };
  const post = (sig, p = params) => fetch(`${srv.base}/twilio/inbound`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(p) });
  try {
    assert.equal((await post("forged")).status, 403);
    assert.equal(isOptedOut(s.desk, "sms", "+15552010122"), false);
    const r = await post(twilioSignature("tw-test-token", "https://sitter.example/twilio/inbound", params));
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<Response><\/Response>/);
    assert.equal(isOptedOut(s.desk, "sms", "5552010122"), true);
    const sent = await runAutomations(s, () => {}, ENV, NOW, fakeFetch());
    assert.equal(sent.sent, 2, "only Ana's emails; David's text is held");
    const start = { ...params, Body: "START" };
    await post(twilioSignature("tw-test-token", "https://sitter.example/twilio/inbound", start), start);
    assert.equal(isOptedOut(s.desk, "sms", "+15552010122"), false);
  } finally { await srv.close(); }
});

test("Twilio's documented signature example verifies", () => {
  // From twilio.com/docs/usage/security (the example with auth token 12345).
  const params = { To: "+18005551212", From: "+14158675310", Digits: "1234", Caller: "+14158675310", CallSid: "CA1234567890ABCDE" };
  assert.equal(twilioSignature("12345", "https://example.com/myapp.php?foo=1&bar=2", params), "L/OH5YylLD5NRKLltdqwSvS0BnU=");
});

test("a sync from the app keeps the server's sent log and opt-outs", async () => {
  const s = state();
  await runAutomations(s, () => {}, ENV, NOW, fakeFetch());
  s.desk.automations.optOuts["sms:+15552010122"] = { out: true, at: "2026-11-04T16:31:00.000Z", via: "text STOP" };
  const app = JSON.parse(JSON.stringify(s.desk));
  delete app.automations; // the app had not synced since
  const srv = await serve(s);
  try {
    const r = await fetch(`${srv.base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer admin-test-key", "content-type": "application/json" }, body: JSON.stringify(app) });
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(Object.keys(out.desk.automations.sent).length, 3);
    assert.equal(out.desk.automations.optOuts["sms:+15552010122"].out, true);
    assert.equal((await runAutomations(s, () => {}, ENV, NOW + 6e4, fakeFetch())).sent, 0);
  } finally { await srv.close(); }
});
