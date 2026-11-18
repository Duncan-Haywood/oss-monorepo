import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_URL, VALIDATE_URL } from "./checkout.mjs";

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
