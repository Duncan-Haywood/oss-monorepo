// Shared assertions for a venture's paid-pack licence module (ventures/<slug>/licence.mjs),
// so each venture's own test checks the same contract in one line.
import assert from "node:assert/strict";
import { signLicence } from "./server.mjs";
import { onSale } from "./client.mjs";

/**
 * @param {any} licence  the venture's licence.mjs module
 * @param {any} paddle   its checkout.mjs PADDLE config
 * @param {string} product its slug
 */
export async function assertPackLicence(licence, paddle, product) {
  assert.equal(paddle.product, product, "checkout.mjs names this venture");
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
  assert.equal((await licence.checkLicence(key, { cfg: { publicKey: "" } })).reason, "licence check unavailable");
  for (const junk of ["", "ABCD-1234-EFGH", null, "ms1.x.y", "<script>"]) {
    assert.equal((await licence.checkLicence(junk, { cfg })).valid, false, String(junk));
  }
  assert.equal(licence.cleanKey(" " + key + "\n"), key);
}
