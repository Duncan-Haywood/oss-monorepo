import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState, createForm } from "./forms.mjs";

async function boot(over = {}) {
  const state = newState(); const form = createForm(state, { name: "Contact", origins: "https://shop.example", ...over.form });
  let t = 1_000_000; const sent = [], pings = [];
  const cfg = { state, save() {}, adminKey: "k".repeat(16), company: "Acme <b>", sponsor: true, now: () => t, notify: (m) => pings.push(m), dryRun: false, sendEmail: async (m) => { sent.push(m); }, ...over.cfg };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, state, form, sent, pings, tick: (ms) => { t += ms; }, close: () => server.close() };
}
const auth = { authorization: `Bearer ${"k".repeat(16)}` };
const post = (url, body, headers = {}) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body).toString() });

test("a real submission is stored, shown thanks, and pinged", async () => {
  const s = await boot({ form: { notifyEmail: "me@shop.example" } });
  const r = await post(`${s.base}/f/${s.form.id}`, { name: "Ann", email: "ann@x.com", message: "hello" }, { origin: "https://shop.example" });
  assert.equal(r.status, 200); assert.equal(r.headers.get("access-control-allow-origin"), "https://shop.example");
  assert.match(await r.text(), /Thanks/);
  assert.equal(s.state.subs.length, 1); assert.equal(s.pings.length, 1); assert.equal(s.sent[0].to, "me@shop.example");
  s.close();
});

test("JSON clients get JSON; configured redirect is used for browsers", async () => {
  const s = await boot({ form: { redirect: "https://shop.example/thanks" } });
  const j = await fetch(`${s.base}/f/${s.form.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.co", m: "x" }) });
  assert.deepEqual(await j.json(), { ok: true });
  const r = await post(`${s.base}/f/${s.form.id}`, { m: "y" });
  assert.equal(r.status, 303); assert.equal(r.headers.get("location"), "https://shop.example/thanks");
  s.close();
});

test("spam looks successful to the sender but is not notified", async () => {
  const s = await boot({ form: { notifyEmail: "me@shop.example" } });
  const r = await post(`${s.base}/f/${s.form.id}`, { message: "hi", _gotcha: "x" });
  assert.equal(r.status, 200);
  assert.equal(s.state.subs[0].spam, true); assert.equal(s.pings.length, 0); assert.equal(s.sent.length, 0);
  s.close();
});

test("a post from a site that is not allowed is refused and stores nothing", async () => {
  const s = await boot();
  const r = await post(`${s.base}/f/${s.form.id}`, { message: "hi" }, { origin: "https://evil.example" });
  assert.equal(r.status, 403); assert.equal(s.state.subs.length, 0);
  const pre = await fetch(`${s.base}/f/${s.form.id}`, { method: "OPTIONS", headers: { origin: "https://shop.example" } });
  assert.equal(pre.status, 204);
  s.close();
});

test("unknown forms 404 and submissions are rate limited per address", async () => {
  const s = await boot();
  assert.equal((await post(`${s.base}/f/nope`, { a: "b" })).status, 404);
  let last; for (let i = 0; i < 11; i++) last = await post(`${s.base}/f/${s.form.id}`, { m: `msg ${i} text` });
  assert.equal(last.status, 429);
  s.tick(61_000);
  assert.equal((await post(`${s.base}/f/${s.form.id}`, { m: "later one" })).status, 200);
  s.close();
});

test("DRY_RUN sends no email", async () => {
  const s = await boot({ form: { notifyEmail: "me@shop.example" }, cfg: { dryRun: true } });
  await post(`${s.base}/f/${s.form.id}`, { m: "hello there" });
  assert.equal(s.sent.length, 0); s.close();
});

test("admin needs the key, escapes content, exports CSV, and refuses cross-site posts", async () => {
  const s = await boot();
  await post(`${s.base}/f/${s.form.id}`, { message: "<script>alert(1)</script>" });
  assert.equal((await fetch(`${s.base}/admin`)).status, 401);
  assert.equal((await fetch(`${s.base}/admin/f/${s.form.id}.csv`)).status, 401);
  const page = await (await fetch(`${s.base}/admin/f/${s.form.id}`, { headers: auth })).text();
  assert.ok(!page.includes("<script>alert(1)") && page.includes("&lt;script&gt;"));
  assert.match(await (await fetch(`${s.base}/admin`, { headers: auth })).text(), /Acme &lt;b&gt;/);
  const csv = await fetch(`${s.base}/admin/f/${s.form.id}.csv`, { headers: auth });
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  const basic = { authorization: `Basic ${Buffer.from("u:" + "k".repeat(16)).toString("base64")}` };
  const cross = await post(`${s.base}/admin/forms`, { name: "X" }, { ...basic, origin: "https://evil.example" });
  assert.equal(cross.status, 403);
  s.close();
});

test("admin can create a form, mark spam and delete", async () => {
  const s = await boot();
  const c = await post(`${s.base}/admin/forms`, { name: "Quotes" }, auth);
  assert.equal(c.status, 303); assert.equal(Object.keys(s.state.forms).length, 2);
  await post(`${s.base}/f/${s.form.id}`, { m: "hello there" });
  const id = s.state.subs[0].id;
  await post(`${s.base}/admin/s/${id}/spam`, {}, auth); assert.equal(s.state.subs[0].spam, true);
  await post(`${s.base}/admin/s/${id}/delete`, {}, auth); assert.equal(s.state.subs.length, 0);
  assert.equal((await post(`${s.base}/admin/s/s999/delete`, {}, auth)).status, 404);
  s.close();
});

test("oversized bodies are rejected", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/f/${s.form.id}`, { method: "POST", headers: { "content-type": "text/plain" }, body: "a=".padEnd(200_000, "x") }).catch(() => ({ status: 413 }));
  assert.equal(r.status, 413); s.close();
});

test("auto-reply sends only the admin's text, once a day, never for spam", async () => {
  const s = await boot({ form: { notifyEmail: "me@shop.example", autoReply: "Thanks, we reply within 2 days." } });
  const go = (body) => post(`${s.base}/f/${s.form.id}`, body);
  await go({ email: "ann@x.com", message: "<b>buy my stuff http://evil</b>" });
  const ar = s.sent.find((m) => m.to === "ann@x.com");
  assert.ok(ar); assert.match(ar.text, /within 2 days/); assert.ok(!ar.text.includes("evil")); assert.equal(ar.replyTo, "me@shop.example");
  await go({ email: "ann@x.com", message: "second one here" });
  assert.equal(s.sent.filter((m) => m.to === "ann@x.com").length, 1);
  await go({ email: "bot@x.com", message: "hi", _gotcha: "x" });
  await go({ email: "a@x.com\nbcc:v@y.com", message: "inject" });
  assert.equal(s.sent.filter((m) => m.to !== "me@shop.example" && m.to !== "ann@x.com").length, 0);
  s.tick(86_400_001);
  await go({ email: "ann@x.com", message: "third one here" });
  assert.equal(s.sent.filter((m) => m.to === "ann@x.com").length, 2);
  s.close();
});
