import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signLicense, verifyLicense, parseLicense, b64u, unb64u } from "./token.mjs";

const claims = { id: "lic_1", product: "myapp", email: "a@b.co", plan: "pro", features: ["export"], machines: 2, exp: null, iat: 1 };

test("a signed license verifies offline with the public key", async () => {
  const kp = await generateKeyPair();
  const t = await signLicense(kp.privateKey, claims);
  assert.match(t, /^LK1\.[\w-]+\.[\w-]+$/);
  const v = await verifyLicense(kp.publicKey, t);
  assert.equal(v.valid, true);
  assert.deepEqual(v.claims.features, ["export"]);
});

test("a tampered payload, another key, or garbage is rejected", async () => {
  const kp = await generateKeyPair(), other = await generateKeyPair();
  const t = await signLicense(kp.privateKey, claims);
  const [h, body, sig] = t.split(".");
  const forged = `${h}.${b64u(new TextEncoder().encode(JSON.stringify({ ...claims, plan: "enterprise", v: 1 })))}.${sig}`;
  assert.equal((await verifyLicense(kp.publicKey, forged)).reason, "bad-signature");
  assert.equal((await verifyLicense(other.publicKey, t)).reason, "bad-signature");
  for (const bad of ["", "LK1.x", "nope", null, "LK1.!!.!!"]) assert.equal((await verifyLicense(kp.publicKey, bad)).reason, "malformed");
  assert.equal(parseLicense(`${h}.${body}`), null);
});

test("expiry, not-before and product are enforced", async () => {
  const kp = await generateKeyPair();
  const t = await signLicense(kp.privateKey, { ...claims, exp: 1000, nbf: 500 });
  assert.equal((await verifyLicense(kp.publicKey, t, { now: 400_000 })).reason, "not-yet-valid");
  assert.equal((await verifyLicense(kp.publicKey, t, { now: 600_000 })).valid, true);
  assert.equal((await verifyLicense(kp.publicKey, t, { now: 1_000_000 })).reason, "expired");
  assert.equal((await verifyLicense(kp.publicKey, t, { now: 600_000, product: "other" })).reason, "wrong-product");
});

test("signing needs an id and a product; base64url rejects junk", async () => {
  const kp = await generateKeyPair();
  await assert.rejects(signLicense(kp.privateKey, { id: "x" }));
  assert.throws(() => unb64u("a+b"));
  assert.deepEqual([...unb64u(b64u(new Uint8Array([251, 255, 0])))], [251, 255, 0]);
});
