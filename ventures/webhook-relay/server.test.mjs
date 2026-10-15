import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { handler, tick, parseRoutes } from "./server.mjs";
import { newState } from "./relay.mjs";

const NOW = 1_700_000_000_000;
const sign = (secret, body) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

async function boot(routes, extra = {}) {
  const state = newState();
  let clock = NOW, saves = 0;
  const cfg = { state, save: () => { saves += 1; }, routes, adminKey: "adm", now: () => clock };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { state, base, close: () => server.close(), setClock: (t) => { clock = t; }, saves: () => saves, ...extra };
}
const route = { name: "gh", scheme: "github", secret: "s3", target: "http://receiver.invalid/hook" };

test("parseRoutes validates names, schemes, secrets and targets", () => {
  assert.equal(parseRoutes(JSON.stringify([route]))[0].name, "gh");
  assert.throws(() => parseRoutes("[]"), /non-empty/);
  assert.throws(() => parseRoutes(JSON.stringify([{ ...route, name: "Bad Name" }])), /bad route name/);
  assert.throws(() => parseRoutes(JSON.stringify([route, route])), /duplicate/);
  assert.throws(() => parseRoutes(JSON.stringify([{ ...route, scheme: "nope" }])), /unknown scheme/);
  assert.throws(() => parseRoutes(JSON.stringify([{ ...route, secret: "" }])), /needs a secret/);
  assert.throws(() => parseRoutes(JSON.stringify([{ ...route, target: "ftp://x" }])), /http/);
});

test("rejects bad signatures and unknown routes; accepts and persists good ones before answering", async () => {
  const t = await boot([route]);
  try {
    const body = '{"hello":1}';
    let r = await fetch(`${t.base}/in/gh`, { method: "POST", body, headers: { "x-hub-signature-256": sign("wrong", body) } });
    assert.equal(r.status, 401);
    r = await fetch(`${t.base}/in/nope`, { method: "POST", body });
    assert.equal(r.status, 404);
    assert.equal(Object.keys(t.state.events).length, 0);
    r = await fetch(`${t.base}/in/gh`, { method: "POST", body, headers: { "x-hub-signature-256": sign("s3", body), "x-github-delivery": "d1", authorization: "Bearer leak" } });
    assert.equal(r.status, 200);
    const { id, duplicate } = await r.json();
    assert.equal(duplicate, false);
    assert.equal(t.saves(), 1, "saved before the 200");
    assert.equal(t.state.events[id].headers.authorization, undefined, "credentials are not stored or forwarded");
    r = await fetch(`${t.base}/in/gh`, { method: "POST", body, headers: { "x-hub-signature-256": sign("s3", body), "x-github-delivery": "d1" } });
    assert.equal((await r.json()).duplicate, true);
    assert.equal(t.saves(), 1);
  } finally { t.close(); }
});

test("admin API needs the key; list, view, replay, delete work", async () => {
  const t = await boot([{ ...route, scheme: "none", secret: undefined }]);
  try {
    const auth = { authorization: "Bearer adm" };
    assert.equal((await fetch(`${t.base}/v1/summary`)).status, 401);
    assert.equal((await fetch(`${t.base}/v1/summary`, { headers: { authorization: "Bearer no" } })).status, 401);
    const { id } = await (await fetch(`${t.base}/in/gh`, { method: "POST", body: "hi" })).json();
    assert.equal((await (await fetch(`${t.base}/v1/summary`, { headers: auth })).json()).pending, 1);
    const list = await (await fetch(`${t.base}/v1/events?status=pending`, { headers: auth })).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].bodyB64, undefined, "list omits bodies");
    const one = await (await fetch(`${t.base}/v1/events/${id}`, { headers: auth })).json();
    assert.equal(Buffer.from(one.bodyB64, "base64").toString(), "hi");
    t.state.events[id].status = "dead";
    const rep = await (await fetch(`${t.base}/v1/events/${id}/replay`, { method: "POST", headers: auth })).json();
    assert.equal(rep.status, "pending");
    assert.equal((await fetch(`${t.base}/v1/events/zzz`, { headers: auth })).status, 404);
    assert.deepEqual(await (await fetch(`${t.base}/v1/events/${id}`, { method: "DELETE", headers: auth })).json(), { deleted: id });
    const page = await fetch(`${t.base}/admin`);
    assert.match(await page.text(), /webhook-relay/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  } finally { t.close(); }
});

test("delivery: receiver down then up. Original bytes and headers arrive, with attempt counters", async () => {
  const t = await boot([{ ...route, scheme: "none", secret: undefined }]);
  const seen = [];
  const receiver = http.createServer((req, res) => {
    const c = []; req.on("data", (d) => c.push(d));
    req.on("end", () => { seen.push({ body: Buffer.concat(c), h: req.headers }); res.writeHead(seen.length < 3 ? 503 : 200); res.end(); });
  });
  await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
  const target = `http://127.0.0.1:${receiver.address().port}/h`;
  try {
    const payload = Buffer.from([123, 0, 255, 125]);
    const { id } = await (await fetch(`${t.base}/in/gh`, { method: "POST", body: payload, headers: { "content-type": "application/octet-stream", "x-custom": "yes" } })).json();
    t.state.events[id].target = target;
    const alerts = [];
    const deps = { alert: async (m) => alerts.push(m) };
    await tick(t.state, NOW, deps);
    assert.equal(t.state.events[id].status, "pending");
    await tick(t.state, NOW + 5_000, deps);
    assert.equal(seen.length, 1, "not due yet at +5s");
    await tick(t.state, NOW + 11_000, deps);
    assert.equal(t.state.events[id].status, "pending");
    await tick(t.state, NOW + 11_000 + 61_000, deps);
    assert.equal(t.state.events[id].status, "delivered");
    assert.equal(seen.length, 3);
    assert.deepEqual(seen[2].body, payload);
    assert.equal(seen[2].h["x-custom"], "yes");
    assert.equal(seen[2].h["x-relay-event-id"], id);
    assert.deepEqual(seen.map((s) => s.h["x-relay-attempt"]), ["1", "2", "3"]);
    assert.equal(alerts.length, 0);
  } finally { t.close(); receiver.close(); }
});

test("a refusing receiver (410) parks the event dead and raises one alert; network errors retry", async () => {
  const t = await boot([{ ...route, scheme: "none", secret: undefined }]);
  try {
    const { id } = await (await fetch(`${t.base}/in/gh`, { method: "POST", body: "x" })).json();
    const alerts = [];
    await tick(t.state, NOW, { alert: async (m) => alerts.push(m), fetch: async () => ({ status: 410, headers: new Headers() }) });
    assert.equal(t.state.events[id].status, "dead");
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], new RegExp(id));
    const { id: id2 } = await (await fetch(`${t.base}/in/gh`, { method: "POST", body: "y" })).json();
    await tick(t.state, NOW, { alert: async () => {}, fetch: async () => { throw new Error("ECONNREFUSED"); } });
    assert.equal(t.state.events[id2].status, "pending");
    assert.equal(t.state.events[id2].attempts[0].error, "ECONNREFUSED");
  } finally { t.close(); }
});

test("parseRoutes accepts targets for fan-out and rejects bad lists", async () => {
  const { parseRoutes } = await import("./server.mjs");
  const ok = parseRoutes(JSON.stringify([{ name: "a", targets: ["http://x", "https://y"] }]));
  assert.equal(ok[0].target, "http://x");
  assert.equal(ok[0].targets.length, 2);
  assert.throws(() => parseRoutes(JSON.stringify([{ name: "a", targets: [] }])));
  assert.throws(() => parseRoutes(JSON.stringify([{ name: "a", targets: ["ftp://x"] }])));
  assert.equal(parseRoutes(JSON.stringify([{ name: "a", target: "http://x" }]))[0].targets[0], "http://x");
});
