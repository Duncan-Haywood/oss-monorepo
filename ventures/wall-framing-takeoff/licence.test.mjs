import { test } from "node:test";
import assert from "node:assert/strict";
import * as licence from "./licence.mjs";
import { PADDLE } from "./checkout.mjs";
import { assertPackLicence } from "../../platform/billing/testkit.mjs";
import { signLicence } from "../../platform/billing/server.mjs";

test("the bid package licence follows the shared contract", async () => {
  await assertPackLicence(licence, PADDLE, "wall-framing-takeoff");
});

test("a lapsed subscription key renews once from the edge Worker, and a failed renewal stays locked", async () => {
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const now = 1_800_000_000;
  const old = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "subscription", s: "sub_a", iat: now, exp: now + 10 }, priv);
  const fresh = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "subscription", s: "sub_a", iat: now, exp: now + 1000 }, priv);
  const cfg = { publicKey };
  assert.deepEqual(await licence.checkLicence(old, { cfg, now }), { valid: true, reason: "" });
  let calls = 0;
  const ok = async () => { calls++; return new Response(JSON.stringify({ key: fresh }), { status: 200 }); };
  assert.equal((await licence.checkLicence(old, { cfg, now: now + 20, fetch: ok })).valid, true);
  assert.equal(calls, 1);
  const none = async () => new Response("{}", { status: 404 });
  assert.match((await licence.checkLicence(old, { cfg, now: now + 20, fetch: none })).reason, /expired/);
  const down = async () => { throw new Error("offline"); };
  assert.match((await licence.checkLicence(old, { cfg, now: now + 20, fetch: down })).reason, /expired/);
});
