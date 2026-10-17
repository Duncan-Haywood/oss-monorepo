import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, parseForm, adminOk } from "./server.mjs";
import { newState, saveSurvey } from "./survey.mjs";

const KEY = "k".repeat(16);
const QS = "nps*: Recommend us?\ntext: Why?\nmulti: Features | Search | Export\nsingle: Plan | Free | Pro";
async function boot(over = {}) {
  const state = newState(); let t = Date.UTC(2026, 9, 1), saves = 0; const alerts = [];
  saveSurvey(state, { title: "Pulse <b>check</b>", slug: "pulse-check", intro: "Short & sweet", questions: QS }, t);
  const cfg = { state, save() { saves++; }, adminKey: KEY, sponsor: true, now: () => t, alert: (b) => alerts.push(b), ...over };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  return { base: `http://127.0.0.1:${server.address().port}`, state, cfg, alerts, saves: () => saves, tick: (ms) => { t += ms; }, close: () => server.close() };
}
const auth = { authorization: `Bearer ${KEY}` };
const post = (url, body, headers = {}) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: typeof body === "string" ? body : new URLSearchParams(body).toString() });

test("the public survey renders escaped, with no scripts, and unknown slugs are 404", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/s/pulse-check`); const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Pulse &lt;b&gt;check&lt;\/b&gt;/); assert.doesNotMatch(html, /<script/);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(html, /name="q1" value="10"/); assert.match(html, /type="checkbox" name="q3"/);
  assert.equal((await fetch(`${s.base}/s/nope`)).status, 404);
  s.close();
});

test("a valid submission is stored, a detractor triggers the alert, a promoter does not", async () => {
  const s = await boot();
  const ok = await post(`${s.base}/s/pulse-check`, "q1=3&q2=billing+is+confusing&q3=Search&q3=Export&q4=Pro&ref=Email");
  assert.equal(ok.status, 200); assert.match(await ok.text(), /Thank you/);
  assert.deepEqual(s.state.responses[0].a, { q1: 3, q2: "billing is confusing", q3: ["Search", "Export"], q4: "Pro" });
  assert.equal(s.state.responses[0].ref, "email");
  assert.equal(s.alerts.length, 1); assert.match(s.alerts[0].text, /3\/10.*via email.*billing is confusing/);
  await post(`${s.base}/s/pulse-check`, "q1=10");
  assert.equal(s.alerts.length, 1); assert.equal(s.state.responses.length, 2);
  s.close();
});

test("invalid answers re-render with errors and store nothing; the honeypot fakes success", async () => {
  const s = await boot();
  const bad = await post(`${s.base}/s/pulse-check`, "q1=11&q2=kept+text");
  assert.equal(bad.status, 400); const html = await bad.text();
  assert.match(html, /Choose a number from 0 to 10/); assert.match(html, /kept text/);
  assert.equal((await post(`${s.base}/s/pulse-check`, "q2=only+text")).status, 400, "required NPS missing");
  const bot = await post(`${s.base}/s/pulse-check`, "q1=9&website=http%3A%2F%2Fspam");
  assert.equal(bot.status, 200); assert.equal(s.state.responses.length, 0);
  s.close();
});

test("closed surveys accept nothing; submissions are rate limited", async () => {
  const s = await boot({ limits: { submit: ((n = 0) => () => ++n <= 3)() } });
  for (let i = 0; i < 3; i++) assert.equal((await post(`${s.base}/s/pulse-check`, "q1=9")).status, 200);
  assert.equal((await post(`${s.base}/s/pulse-check`, "q1=9")).status, 429);
  Object.values(s.state.surveys)[0].status = "closed";
  assert.match(await (await fetch(`${s.base}/s/pulse-check`)).text(), /closed/);
  assert.equal(s.state.responses.length, 3);
  s.close();
});

test("embedding is off unless the origin is allowed", async () => {
  const s = await boot({ embedOrigins: ["https://acme.test"] });
  assert.match((await fetch(`${s.base}/s/pulse-check`)).headers.get("content-security-policy"), /frame-ancestors https:\/\/acme\.test/);
  assert.match((await fetch(`${s.base}/admin`, { headers: auth })).headers.get("content-security-policy"), /frame-ancestors 'none'/);
  s.close();
});

test("the admin needs the key, and results, CSV and export work", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/admin`)).status, 401);
  assert.equal((await fetch(`${s.base}/admin`, { headers: { authorization: "Bearer wrong" } })).status, 401);
  for (const [a, b] of [[10, "love it"], [9, "fast search"], [2, "slow export"], [8, ""]]) await post(`${s.base}/s/pulse-check`, `q1=${a}&q2=${encodeURIComponent(b)}`);
  const res = await (await fetch(`${s.base}/admin/s/s1/results`, { headers: auth })).text();
  assert.match(res, /4 responses/); assert.match(res, /NPS/); assert.match(res, /slow export/);
  const csv = await fetch(`${s.base}/admin/s/s1/responses.csv`, { headers: auth });
  assert.match(csv.headers.get("content-type"), /text\/csv/); assert.equal((await csv.text()).trim().split("\r\n").length, 5);
  const json = await (await fetch(`${s.base}/admin/export.json`, { headers: auth })).json();
  assert.equal(json.responses.length, 4);
  assert.match(await (await fetch(`${s.base}/admin`, { headers: auth })).text(), /Pulse &lt;b&gt;check/);
  s.close();
});

test("admin writes: create, lock after responses, refuse cross-site, delete", async () => {
  const s = await boot();
  const cross = await post(`${s.base}/admin/save`, { title: "x", questions: "nps: y" }, { authorization: `Basic ${Buffer.from(`a:${KEY}`).toString("base64")}`, origin: "https://evil.test" });
  assert.equal(cross.status, 403);
  const made = await post(`${s.base}/admin/save`, { title: "Second", questions: "rating*: How was it?" }, auth);
  assert.equal(made.status, 303); assert.equal(made.headers.get("location"), "/admin/s/s2/results");
  const bad = await post(`${s.base}/admin/save`, { title: "Third", questions: "nonsense" }, auth);
  assert.equal(bad.status, 400); assert.match(await bad.text(), /start with one of/);
  await post(`${s.base}/s/pulse-check`, "q1=9");
  const edit = await post(`${s.base}/admin/save`, { id: "s1", title: "Pulse", questions: "nps*: Only this" }, auth);
  assert.equal(edit.status, 400); assert.match(await edit.text(), /locked/);
  assert.equal((await post(`${s.base}/admin/s/s1/delete`, "", auth)).status, 303);
  assert.equal(s.state.responses.length, 0); assert.equal((await fetch(`${s.base}/s/pulse-check`)).status, 404);
  s.close();
});

test("parseForm collects repeated keys and adminOk takes Bearer or Basic", () => {
  assert.deepEqual(parseForm("a=1&a=2&b=3"), { a: ["1", "2"], b: "3" });
  assert.ok(adminOk({ headers: { authorization: `Basic ${Buffer.from(`u:${KEY}`).toString("base64")}` } }, KEY));
  assert.ok(!adminOk({ headers: {} }, KEY)); assert.ok(!adminOk({ headers: auth }, ""));
});
