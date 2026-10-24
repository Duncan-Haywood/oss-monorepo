import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, csvOf } from "./server.mjs";

const env = { ADMIN_KEY: "adm", PAYMENT_LINK_URL: "https://pay.example.com/abc" };
let clock = Date.UTC(2026, 9, 19);
async function boot(e = env) {
  const state = emptyState();
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, e, () => clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, base: `http://127.0.0.1:${srv.address().port}`, saves: () => saves, close: () => { srv.closeAllConnections(); srv.close(); } };
}
const post = (url, body, headers = {}) => fetch(url, { method: "POST", body: new URLSearchParams(body), redirect: "manual", headers });
const proposal = { companyName: "Ace Roofing", clientName: "Pat Doe", jobTitle: "Re-roof", scope: "Tear off\nNew shingles", price: "12000", depositPercent: "25", validDays: "30" };
const linkOf = async (s) => { const html = await (await fetch(s.base + "/admin?key=adm")).text(); return html.match(/value="\/p\/([0-9a-f]{32})"/)[1]; };

test("refuses to run without ADMIN_KEY; health check always answers", async () => {
  const s = await boot({});
  assert.equal((await fetch(s.base + "/healthz")).status, 200);
  assert.equal((await fetch(s.base + "/admin?key=x")).status, 503);
  s.close();
});

test("admin needs the key; a wrong key or customer link is not enough", async () => {
  const s = await boot();
  assert.equal((await fetch(s.base + "/admin")).status, 401);
  assert.equal((await fetch(s.base + "/admin?key=nope")).status, 401);
  assert.equal((await post(s.base + "/admin/new", proposal)).status, 401);
  assert.equal((await fetch(s.base + "/admin?key=adm")).status, 200);
  s.close();
});

test("the key sets a cookie that works without the key in the URL", async () => {
  const s = await boot();
  const r = await fetch(s.base + "/admin?key=adm");
  const c = r.headers.get("set-cookie");
  assert.match(c, /HttpOnly; SameSite=Strict/);
  assert.equal((await fetch(s.base + "/admin", { headers: { cookie: c.split(";")[0] } })).status, 200);
  assert.equal((await fetch(s.base + "/admin", { headers: { cookie: "hub_admin=bad" } })).status, 401);
  s.close();
});

test("create, view, accept: the customer link needs no key and records the answer", async () => {
  const s = await boot();
  const r = await post(s.base + "/admin/new?key=adm", proposal);
  assert.equal(r.status, 303);
  const id = await linkOf(s);
  const html = await (await fetch(`${s.base}/p/${id}`)).text();
  assert.match(html, /Ace Roofing/); assert.match(html, /\$12,000/); assert.match(html, /Tear off/);
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /Pay the/);
  assert.ok(s.state.proposals[0].viewedAt);
  const bad = await post(`${s.base}/p/${id}/accept`, { name: "P", agree: "1" });
  assert.equal(bad.status, 400);
  assert.equal((await post(`${s.base}/p/${id}/accept`, { name: "Pat Doe" })).status, 400);
  assert.equal((await post(`${s.base}/p/${id}/accept`, { name: "Pat Doe", agree: "1" })).status, 303);
  const after = await (await fetch(`${s.base}/p/${id}`)).text();
  assert.match(after, /Accepted by Pat Doe/);
  assert.match(after, /Pay the \$3,000\.00 deposit/);
  assert.match(after, /href="https:\/\/pay\.example\.com\/abc"/);
  assert.match(await (await fetch(s.base + "/admin?key=adm")).text(), /accepted/);
  s.close();
});

test("an answer is final: a second click cannot flip accepted to declined", async () => {
  const s = await boot();
  await post(s.base + "/admin/new?key=adm", proposal);
  const id = await linkOf(s);
  await post(`${s.base}/p/${id}/accept`, { name: "Pat Doe", agree: "1" });
  await post(`${s.base}/p/${id}/decline`, { note: "changed mind" });
  assert.equal(s.state.proposals[0].status, "accepted");
  s.close();
});

test("decline stores a short note", async () => {
  const s = await boot();
  await post(s.base + "/admin/new?key=adm", proposal);
  const id = await linkOf(s);
  await post(`${s.base}/p/${id}/decline`, { note: "Too high\nand more" });
  assert.equal(s.state.proposals[0].status, "declined");
  assert.equal(s.state.proposals[0].declineNote, "Too high and more");
  s.close();
});

test("an expired proposal cannot be accepted", async () => {
  const s = await boot();
  await post(s.base + "/admin/new?key=adm", { ...proposal, validDays: "10" });
  const id = await linkOf(s);
  clock = Date.UTC(2026, 10, 30);
  const html = await (await fetch(`${s.base}/p/${id}`)).text();
  assert.match(html, /can no longer be accepted/);
  assert.equal((await post(`${s.base}/p/${id}/accept`, { name: "Pat Doe", agree: "1" })).status, 400);
  assert.equal(s.state.proposals[0].status, "sent");
  clock = Date.UTC(2026, 9, 19);
  s.close();
});

test("unknown or malformed ids give 404 and a bad form gives a message, not a record", async () => {
  const s = await boot();
  assert.equal((await fetch(s.base + "/p/" + "0".repeat(32))).status, 404);
  assert.equal((await fetch(s.base + "/p/zz")).status, 404);
  const r = await post(s.base + "/admin/new?key=adm", { ...proposal, price: "0" });
  assert.equal(r.status, 400);
  assert.equal(s.state.proposals.length, 0);
  s.close();
});

test("customer text is escaped and the saved business block is applied", async () => {
  const s = await boot({ ...env, PAYMENT_LINK_URL: "javascript:alert(1)" });
  await post(s.base + "/admin/company?key=adm", { companyName: "Ace <b>Roofing</b>", companyPhone: "555" });
  await post(s.base + "/admin/new?key=adm", { clientName: "<script>x</script>", price: "500", scope: "a" });
  const id = await linkOf(s);
  const html = await (await fetch(`${s.base}/p/${id}`)).text();
  assert.doesNotMatch(html, /<script>x/); assert.doesNotMatch(html, /Ace <b>/);
  assert.match(html, /Ace &lt;b&gt;Roofing/);
  await post(`${s.base}/p/${id}/accept`, { name: "Pat", agree: "1" });
  assert.doesNotMatch(await (await fetch(`${s.base}/p/${id}`)).text(), /javascript:/);
  s.close();
});

test("delete kills the link; CSV neutralises spreadsheet formulas", async () => {
  const s = await boot();
  await post(s.base + "/admin/new?key=adm", { ...proposal, clientName: "=HYPERLINK(1)" });
  assert.match(csvOf(s.state), /"'=HYPERLINK\(1\)"/);
  const csv = await fetch(s.base + "/admin/export.csv?key=adm");
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  const id = await linkOf(s);
  await post(s.base + "/admin/delete?key=adm", { id });
  assert.equal((await fetch(`${s.base}/p/${id}`)).status, 404);
  s.close();
});

test("oversized bodies are refused", async () => {
  const s = await boot();
  const r = await post(s.base + "/admin/new?key=adm", { ...proposal, scope: "x".repeat(70000) });
  assert.equal(r.status, 413);
  s.close();
});
