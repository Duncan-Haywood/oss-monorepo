// Shared assertions for a venture's paid-pack licence module (ventures/<slug>/licence.mjs),
// so each venture's own test checks the same contract in one line.
import assert from "node:assert/strict";
import { signLicence } from "./server.mjs";
import { onSale } from "./client.mjs";
import fs from "node:fs";

/**
 * @param {any} licence  the venture's licence.mjs module
 * @param {any} paddle   its checkout.mjs PADDLE config
 * @param {string} product its slug
 */
export async function assertPackLicence(licence, paddle, product) {
  assert.equal(paddle.product, product, "checkout.mjs names this venture");
  // The venture's paddle.mjs is a byte-for-byte copy of client.mjs, whose
  // behaviour billing.test.mjs checks; an edit to the copy alone is untested
  // code on a paid path (red-team 2026-11-25: 7 of 8 seeded faults in a copy
  // passed the venture's own suite). Fix: edit client.mjs, run sync.mjs.
  const copy = new URL(`../../ventures/${product}/paddle.mjs`, import.meta.url);
  assert.equal(fs.readFileSync(copy, "utf8"), fs.readFileSync(new URL("./client.mjs", import.meta.url), "utf8"),
    `ventures/${product}/paddle.mjs differs from platform/billing/client.mjs: edit client.mjs, then run node platform/billing/sync.mjs`);
  // The Buy button is live exactly when every public value is set.
  let wired = false;
  const el = { hidden: true, tagName: "A", getAttribute: () => null, setAttribute() {}, addEventListener: () => { wired = true; } };
  assert.equal(licence.wireBuyButton(el, { onKey() {} }), onSale(paddle));
  assert.equal(wired, onSale(paddle));
  assert.equal(licence.onSaleNow(), onSale(paddle));
  assert.equal(licence.wireBuyButton(null, { onKey() {} }), false);

  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const now = 1_800_000_000;
  const key = await signLicence({ v: 1, p: product, t: "one-off", s: "txn_test", iat: now }, priv);
  const cfg = { publicKey };
  assert.deepEqual(await licence.checkLicence(key, { cfg }), { valid: true, reason: "" });
  const other = await signLicence({ v: 1, p: product + "-other", t: "one-off", s: "txn_test", iat: now }, priv);
  assert.match((await licence.checkLicence(other, { cfg })).reason, /another tool/);
  const [pre, body, sig] = key.split(".");
  assert.equal((await licence.checkLicence([pre, body, sig.slice(0, -2) + (sig.endsWith("AA") ? "BA" : "AA")].join("."), { cfg })).valid, false);
  // With no public key the check must refuse, not just say why: a mutant that returned
  // valid: true here (any key unlocks a pack that is not on sale) passed (red-team 2026-11-25).
  assert.deepEqual(await licence.checkLicence(key, { cfg: { publicKey: "" } }), { valid: false, reason: "licence check unavailable" });
  for (const junk of ["", "ABCD-1234-EFGH", null, "ms1.x.y", "<script>"]) {
    assert.equal((await licence.checkLicence(junk, { cfg })).valid, false, String(junk));
  }
  assert.equal(licence.cleanKey(" " + key + "\n"), key);

  // A lapsed subscription key that renews must hand the page the new key, or the
  // buyer keeps an expired one that unlocks only while the billing Worker answers
  // (red-team 2026-11-26: every licence.mjs dropped it). Product-agnostic, so a
  // pack that moves to a subscription in catalogue.mjs is covered already.
  const lapsed = await signLicence({ v: 1, p: product, t: "subscription", s: "sub_testkit0000", iat: now, exp: now + 10 }, priv);
  const fresh = await signLicence({ v: 1, p: product, t: "subscription", s: "sub_testkit0000", iat: now, exp: now + 1000 }, priv);
  const renewFetch = async () => new Response(JSON.stringify({ key: fresh }), { status: 200 });
  const sub = { publicKey, edge: "https://billing.example" };
  assert.deepEqual(await licence.checkLicence(lapsed, { cfg: sub, now: now + 20, fetch: renewFetch }), { valid: true, reason: "", renewed: fresh });
  assert.deepEqual(await licence.checkLicence(lapsed, { cfg: sub, now }), { valid: true, reason: "" }, "no renewal, no renewed field");
}
