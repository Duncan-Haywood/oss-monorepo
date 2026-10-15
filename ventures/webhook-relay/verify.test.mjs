import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verify } from "./verify.mjs";

const NOW = 1_700_000_000;
const body = Buffer.from('{"id":"evt_1","type":"x"}');
const h = (secret, data, enc = "hex") => createHmac("sha256", secret).update(data).digest(enc);

test("stripe: valid, wrong secret, tampered body, stale timestamp, any-of-several v1", () => {
  const sig = (s, t = NOW) => `t=${t},v1=${h(s, `${t}.${body}`)}`;
  assert.equal(verify("stripe", { headers: { "stripe-signature": sig("k") }, body, secret: "k", nowSec: NOW }).ok, true);
  assert.equal(verify("stripe", { headers: { "stripe-signature": sig("bad") }, body, secret: "k", nowSec: NOW }).ok, false);
  assert.equal(verify("stripe", { headers: { "stripe-signature": sig("k") }, body: Buffer.from("{}"), secret: "k", nowSec: NOW }).ok, false);
  assert.match(verify("stripe", { headers: { "stripe-signature": sig("k", NOW - 1000) }, body, secret: "k", nowSec: NOW }).reason, /tolerance/);
  assert.equal(verify("stripe", { headers: { "stripe-signature": `${sig("old")},v1=${sig("k").split("v1=")[1]}` }, body, secret: "k", nowSec: NOW }).ok, true);
  assert.equal(verify("stripe", { headers: {}, body, secret: "k", nowSec: NOW }).ok, false);
});

test("github and generic hmac-sha256 (with and without prefix, custom header)", () => {
  assert.equal(verify("github", { headers: { "x-hub-signature-256": `sha256=${h("k", body)}` }, body, secret: "k" }).ok, true);
  assert.equal(verify("github", { headers: { "x-hub-signature-256": `sha256=${h("z", body)}` }, body, secret: "k" }).ok, false);
  assert.equal(verify("github", { headers: {}, body, secret: "k" }).ok, false);
  assert.equal(verify("hmac-sha256", { headers: { "x-signature": h("k", body) }, body, secret: "k" }).ok, true);
  assert.equal(verify("hmac-sha256", { headers: { "x-sig": `sha256=${h("k", body)}` }, body, secret: "k", header: "X-Sig" }).ok, true);
});

test("shopify uses base64", () => {
  assert.equal(verify("shopify", { headers: { "x-shopify-hmac-sha256": h("k", body, "base64") }, body, secret: "k" }).ok, true);
  assert.equal(verify("shopify", { headers: { "x-shopify-hmac-sha256": h("k", body) }, body, secret: "k" }).ok, false);
});

test("slack signs v0:ts:body and checks the timestamp", () => {
  const ts = String(NOW);
  const headers = { "x-slack-request-timestamp": ts, "x-slack-signature": `v0=${h("k", `v0:${ts}:${body}`)}` };
  assert.equal(verify("slack", { headers, body, secret: "k", nowSec: NOW }).ok, true);
  assert.equal(verify("slack", { headers, body, secret: "k", nowSec: NOW + 9999 }).ok, false);
});

test("paddle: ts;h1 over ts:body, rotation list, stale and tampered rejected", () => {
  const ts = String(NOW);
  const good = h("k", `${ts}:${body}`);
  const hd = (v) => ({ "paddle-signature": v });
  assert.equal(verify("paddle", { headers: hd(`ts=${ts};h1=${good}`), body, secret: "k", nowSec: NOW }).ok, true);
  assert.equal(verify("paddle", { headers: hd(`ts=${ts};h1=${h("old", `${ts}:${body}`)};h1=${good}`), body, secret: "k", nowSec: NOW }).ok, true);
  assert.equal(verify("paddle", { headers: hd(`ts=${ts};h1=${good}`), body: Buffer.from("{}"), secret: "k", nowSec: NOW }).ok, false);
  assert.match(verify("paddle", { headers: hd(`ts=${ts};h1=${good}`), body, secret: "k", nowSec: NOW + 1000 }).reason, /tolerance/);
  assert.equal(verify("paddle", { headers: {}, body, secret: "k", nowSec: NOW }).ok, false);
});

test("typeform: sha256= prefix on a base64 digest", () => {
  assert.equal(verify("typeform", { headers: { "typeform-signature": `sha256=${h("k", body, "base64")}` }, body, secret: "k" }).ok, true);
  assert.equal(verify("typeform", { headers: { "typeform-signature": `sha256=${h("z", body, "base64")}` }, body, secret: "k" }).ok, false);
  assert.equal(verify("typeform", { headers: {}, body, secret: "k" }).ok, false);
});

test("standard webhooks: whsec_ base64 key, space-separated signature list", () => {
  const raw = Buffer.from("super secret key bytes");
  const secret = `whsec_${raw.toString("base64")}`;
  const ts = String(NOW);
  const good = h(raw, `msg_1.${ts}.${body}`, "base64");
  const headers = { "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": `v1,AAAA v1,${good}` };
  assert.equal(verify("standard", { headers, body, secret, nowSec: NOW }).ok, true);
  assert.equal(verify("standard", { headers: { ...headers, "webhook-id": "msg_2" }, body, secret, nowSec: NOW }).ok, false);
});

test("none passes, a missing secret or unknown scheme fails closed", () => {
  assert.equal(verify("none", { headers: {}, body }).ok, true);
  assert.equal(verify("github", { headers: {}, body, secret: "" }).ok, false);
  assert.equal(verify("wat", { headers: {}, body, secret: "k" }).ok, false);
});
