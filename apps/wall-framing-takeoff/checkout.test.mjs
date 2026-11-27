import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_URL, CHECKOUT_URLS, VALIDATE_URL, VARIANT_PLANS } from "./checkout.mjs";

// The checkout link is a public link the owner sets by hand (never a key). A typo or a
// plain-http link would send a buyer to a broken or unsafe page, so pin its shape.
test("CHECKOUT_URL is empty (no Buy button) or a plain https link with no credentials", () => {
  assert.equal(typeof CHECKOUT_URL, "string");
  if (CHECKOUT_URL === "") return;
  const u = new URL(CHECKOUT_URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.username + u.password, "");
  assert.equal(CHECKOUT_URL, CHECKOUT_URL.trim());
  assert.ok(!/[?&](key|token|secret|api_key)=/i.test(CHECKOUT_URL), "no secret in the link");
});

test("VALIDATE_URL is an https endpoint with no credentials or query secrets", () => {
  const u = new URL(VALIDATE_URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.username + u.password, "");
  assert.equal(u.search, "");
});

test("every plan's checkout link is empty or a plain https link with no credentials; variants map to sold plans", () => {
  assert.deepEqual(Object.keys(CHECKOUT_URLS).sort(), ["pro", "report"]);
  assert.equal(CHECKOUT_URL, CHECKOUT_URLS.report);
  for (const v of Object.values(CHECKOUT_URLS)) {
    assert.equal(typeof v, "string");
    if (v === "") continue;
    const u = new URL(v);
    assert.equal(u.protocol, "https:");
    assert.equal(u.username + u.password, "");
    assert.ok(!/[?&](key|token|secret|api_key)=/i.test(v), "no secret in the link");
  }
  for (const [k, p] of Object.entries(VARIANT_PLANS)) {
    assert.match(k, /^\d+$/);
    assert.ok(p === "report" || p === "pro");
  }
});
