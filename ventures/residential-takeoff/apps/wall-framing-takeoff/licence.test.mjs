import { test } from "node:test";
import assert from "node:assert/strict";
import * as licence from "./licence.mjs";
import { PADDLE } from "./checkout.mjs";
import { assertPackLicence } from "../../../../platform/billing/testkit.mjs";
import { signLicence } from "../../../../platform/billing/server.mjs";

test("the Job report licence follows the shared contract", async () => {
  await assertPackLicence(licence, PADDLE, "residential-takeoff");
});

test("a key for the free edition's bid package does not unlock the Job report", async () => {
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const k = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "subscription", s: "sub_x", iat: 1, exp: 4_000_000_000 }, priv);
  const v = await licence.checkLicence(k, { cfg: { publicKey } });
  assert.equal(v.valid, false);
  assert.match(v.reason, /another tool/);
});

test("checkLicence hands the verified claims to a caller that asks, and only on a valid key", async () => {
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const k = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_1", iat: 1 }, priv);
  let seen = null;
  assert.deepEqual(await licence.checkLicence(k, { cfg: { publicKey }, claims: (c) => { seen = c; } }), { valid: true, reason: "" });
  assert.equal(seen.p, "residential-takeoff");
  assert.equal(seen.t, "one-off");
  seen = null;
  await licence.checkLicence(k.slice(0, -2) + (k.endsWith("AA") ? "BA" : "AA"), { cfg: { publicKey }, claims: (c) => { seen = c; } });
  assert.equal(seen, null);
});
