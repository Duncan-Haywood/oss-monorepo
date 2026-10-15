import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApp, loadConfig } from "./server.mjs";

async function start(env = {}) {
  const server = createApp(loadConfig(env));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) };
}
const ex = (f) => readFile(new URL(`./examples/${f}`, import.meta.url));

test("valid JSON invoice passes", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/v1/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: await ex("valid-invoice.json") });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.status, "pass");
  assert.match(j.disclaimer, /Preflight/);
  await s.close();
});

test("defective UBL reports rules", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/v1/validate`, { method: "POST", headers: { "content-type": "application/xml" }, body: await ex("ubl-invoice-with-defects.xml") });
  const j = await r.json();
  assert.equal(j.exit_code, 1);
  assert.ok(j.errors.length >= 6);
  await s.close();
});

test("Factur-X PDF via octet-stream with ?name", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/v1/validate?name=x.pdf`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await ex("factur-x-invoice.pdf") });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.read_errors.length, 0);
  await s.close();
});

test("batch with base64 pdf and duplicate detection", async () => {
  const s = await start();
  const json = (await ex("valid-invoice.json")).toString();
  const body = { documents: [
    { name: "a.json", content: json },
    { name: "b.json", content: json },
    { name: "c.pdf", encoding: "base64", content: (await ex("factur-x-invoice.pdf")).toString("base64") },
  ] };
  const r = await fetch(`${s.base}/v1/validate/batch`, { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  assert.equal(j.files_checked, 3);
  assert.ok(j.rules["INV-019"] >= 1);
  await s.close();
});

test("API key, bad input, size and rate limits", async () => {
  const s = await start({ EINVOICE_API_KEY: "k3y", EINVOICE_MAX_BYTES: "100", EINVOICE_RATE_LIMIT_PER_MIN: "3" });
  assert.equal((await fetch(`${s.base}/v1/validate`, { method: "POST", body: "{}" })).status, 401);
  const h = { authorization: "Bearer k3y" };
  assert.equal((await fetch(`${s.base}/v1/validate`, { method: "POST", headers: h, body: "x".repeat(500) })).status, 413);
  const empty = await fetch(`${s.base}/v1/validate`, { method: "POST", headers: h });
  assert.equal(empty.status, 400);
  assert.equal((await fetch(`${s.base}/v1/validate`, { headers: h })).status, 405);
  assert.equal((await fetch(`${s.base}/v1/validate`, { method: "POST", headers: h, body: "{}" })).status, 429);
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
  await s.close();
});

test("malformed JSON is a read error, not a crash", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/v1/validate`, { method: "POST", body: "{not json" });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.exit_code, 2);
  await s.close();
});

test("POST /v1/generate writes UBL that passes its own preflight", async () => {
  const s = await start();
  const draft = JSON.parse((await ex("draft-invoice.json")).toString());
  const r = await fetch(`${s.base}/v1/generate`, { method: "POST", body: JSON.stringify({ draft, format: "ubl" }) });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.ok, true);
  assert.match(j.xml, /<Invoice /);
  assert.equal(j.preflight.status, "pass");
  assert.deepEqual(j.totals, { net: 350, tax: 48.5, gross: 398.5, prepaid: 0, due: 398.5 });
  await s.close();
});

test("POST /v1/generate returns 422 with errors for an incomplete draft", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/v1/generate`, { method: "POST", body: JSON.stringify({ draft: { lines: [] } }) });
  const j = await r.json();
  assert.equal(r.status, 422);
  assert.equal(j.ok, false);
  assert.ok(j.errors.length > 3);
  assert.equal(j.xml, undefined);
  await s.close();
});

test("POST /v1/generate honours the API key and rejects a body without a draft", async () => {
  const s = await start({ EINVOICE_API_KEY: "k" });
  assert.equal((await fetch(`${s.base}/v1/generate`, { method: "POST", body: "{}" })).status, 401);
  const r = await fetch(`${s.base}/v1/generate`, { method: "POST", headers: { authorization: "Bearer k" }, body: "{}" });
  assert.equal(r.status, 400);
  await s.close();
});

test("GET /create.html serves the creator page", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/create.html`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /invoice creator/i);
  await s.close();
});
