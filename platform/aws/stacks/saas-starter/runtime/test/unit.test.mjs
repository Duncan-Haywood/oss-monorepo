// Unit tests: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyPaddle, signPaddle, toEntitlementMessage } from "../src/paddle.mjs";
import { toPgPlaceholders } from "../src/d1.mjs";
import { toRequest, fromResponse, lambdaHandler } from "../src/adapter.mjs";
import { makeWebhookHandler } from "../src/webhook.mjs";
import { R2Shim } from "../src/r2.mjs";

const fixture = readFileSync(new URL("./fixtures/subscription.created.json", import.meta.url), "utf8");
const SECRET = "pdl_ntfset_test_not_a_real_secret";
const NOW = 1_795_000_000;

test("paddle: valid signature verifies; tampered body, wrong secret, stale ts and junk header fail", () => {
  const h = signPaddle(SECRET, fixture, NOW);
  assert.deepEqual(verifyPaddle({ header: h, body: fixture, secret: SECRET, nowSec: NOW }), { ok: true });
  assert.equal(verifyPaddle({ header: h, body: fixture + " ", secret: SECRET, nowSec: NOW }).reason, "signature mismatch");
  assert.equal(verifyPaddle({ header: h, body: fixture, secret: "other", nowSec: NOW }).reason, "signature mismatch");
  assert.equal(verifyPaddle({ header: h, body: fixture, secret: SECRET, nowSec: NOW + 301 }).reason, "timestamp outside tolerance");
  assert.equal(verifyPaddle({ header: "ts=abc;h1=00", body: fixture, secret: SECRET, nowSec: NOW }).reason, "missing paddle-signature");
  assert.equal(verifyPaddle({ header: h, body: fixture, secret: "", nowSec: NOW }).ok, false);
});

test("paddle: rotation sends two h1 values; either one passes", () => {
  const good = signPaddle(SECRET, fixture, NOW).split(";")[1];
  assert.equal(verifyPaddle({ header: `ts=${NOW};h1=${"0".repeat(64)};${good}`, body: fixture, secret: SECRET, nowSec: NOW }).ok, true);
});

test("paddle: subscription event becomes an entitlement; others are logged only", () => {
  const m = toEntitlementMessage(JSON.parse(fixture));
  assert.deepEqual(m.entitlement, {
    product: "hello_e2e", user_sub: "11111111-2222-3333-4444-555555555555", status: "active",
    plan: "pri_01hv8x2a0000000000000000p1", subscription_id: "sub_01hv8x2a0000000000000000s1",
    customer_id: "ctm_01hv8x2a0000000000000000c1", current_period_end: "2026-12-24T10:00:00.000000Z",
  });
  assert.equal(toEntitlementMessage({ event_id: "e", event_type: "transaction.completed", occurred_at: "x", data: {} }).entitlement, null);
  const noUser = JSON.parse(fixture); delete noUser.data.custom_data;
  assert.equal(toEntitlementMessage(noUser).entitlement, null);
  assert.throws(() => toEntitlementMessage({}));
});

test("d1 shim: ? placeholders become $n, quoted ? and comments untouched", () => {
  assert.equal(toPgPlaceholders("SELECT * FROM t WHERE a = ? AND b = ?"), "SELECT * FROM t WHERE a = $1 AND b = $2");
  assert.equal(toPgPlaceholders("SELECT '?', \"q?\" FROM t WHERE a = ? -- why?\n AND b = ?"), "SELECT '?', \"q?\" FROM t WHERE a = $1 -- why?\n AND b = $2");
  assert.equal(toPgPlaceholders("SELECT 'it''s ?' , ?2, ?1 /* ? */"), "SELECT 'it''s ?' , $2, $1 /* ? */");
});

test("adapter: API Gateway v2 event round-trips through Request/Response", async () => {
  const ev = {
    rawPath: "/api/x", rawQueryString: "a=1", headers: { host: "app.example", "content-type": "application/json" },
    cookies: ["s=1", "t=2"], body: Buffer.from('{"k":1}').toString("base64"), isBase64Encoded: true,
    requestContext: { http: { method: "POST" } },
  };
  const req = toRequest(ev);
  assert.equal(req.url, "https://app.example/api/x?a=1");
  assert.equal(req.headers.get("cookie"), "s=1; t=2");
  assert.deepEqual(await req.json(), { k: 1 });
  const h = new Headers({ "content-type": "image/png" }); h.append("set-cookie", "a=1"); h.append("set-cookie", "b=2");
  const out = await fromResponse(new Response(new Uint8Array([137, 80]), { status: 201, headers: h }));
  assert.equal(out.statusCode, 201); assert.equal(out.isBase64Encoded, true); assert.deepEqual(out.cookies, ["a=1", "b=2"]);
  assert.equal(out.body, Buffer.from([137, 80]).toString("base64"));
});

test("adapter: a throwing app gives a 500 without leaking the error; waitUntil is awaited", async () => {
  let waited = false;
  const h = lambdaHandler({ async fetch(_r, _e, ctx) { ctx.waitUntil(new Promise((r) => setTimeout(() => { waited = true; r(); }, 10))); throw new Error("secret detail"); } }, () => ({}));
  const out = await h({ rawPath: "/", headers: {}, requestContext: { http: { method: "GET" } } });
  assert.equal(out.statusCode, 500); assert.ok(!out.body.includes("secret detail")); assert.ok(waited);
});

test("webhook: forwards only verified POSTs", async () => {
  const sent = [];
  const h = makeWebhookHandler({ getSecret: async () => SECRET, sendMessage: async (m) => sent.push(m), now: () => NOW });
  const ev = (headers, method = "POST", body = fixture) => ({ body, headers, requestContext: { http: { method } } });
  assert.equal((await h(ev({ "paddle-signature": signPaddle(SECRET, fixture, NOW) }))).statusCode, 200);
  assert.equal((await h(ev({ "paddle-signature": signPaddle("wrong", fixture, NOW) }))).statusCode, 401);
  assert.equal((await h(ev({}))).statusCode, 401);
  assert.equal((await h(ev({}, "GET"))).statusCode, 405);
  const junk = "not json";
  assert.equal((await h(ev({ "paddle-signature": signPaddle(SECRET, junk, NOW) }, "POST", junk))).statusCode, 400);
  assert.equal(sent.length, 1); assert.equal(sent[0].entitlement.product, "hello_e2e");
});

test("r2 shim: put/get/list/delete map to S3 commands under the prefix; missing key is null", async () => {
  const store = new Map();
  const s3 = { async send(cmd) {
    const n = cmd.constructor.name, i = cmd.input;
    if (n === "PutObjectCommand") { store.set(i.Key, { body: Buffer.from(i.Body), ct: i.ContentType }); return {}; }
    if (n === "GetObjectCommand") { const o = store.get(i.Key); if (!o) throw Object.assign(new Error("x"), { name: "NoSuchKey" }); return { Body: { transformToByteArray: async () => new Uint8Array(o.body) }, ContentType: o.ct }; }
    if (n === "DeleteObjectCommand") { store.delete(i.Key); return {}; }
    if (n === "ListObjectsV2Command") return { Contents: [...store.keys()].filter((k) => k.startsWith(i.Prefix)).map((k) => ({ Key: k, Size: store.get(k).body.length })) };
    throw new Error(n);
  } };
  const b = new R2Shim(s3, "bucket", "tenant/");
  await b.put("a.txt", "hi", { httpMetadata: { contentType: "text/plain" } });
  assert.ok(store.has("tenant/a.txt"));
  assert.equal(await (await b.get("a.txt")).text(), "hi");
  assert.deepEqual((await b.list()).objects, [{ key: "a.txt", size: 2 }]);
  await b.delete("a.txt");
  assert.equal(await b.get("a.txt"), null);
});
