import { test } from "node:test";
import assert from "node:assert/strict";
import { PADDLE } from "./checkout.mjs";

// checkout.mjs is generated from platform/billing/catalogue.mjs and holds only public
// values. Pin their shapes so a pasted secret or a typo fails here, not in a buyer's browser.
test("PADDLE holds only public values of the expected shapes (empty while dark)", () => {
  assert.equal(PADDLE.product, "wall-framing-takeoff");
  assert.ok(PADDLE.priceId === "" || /^pri_[a-z0-9]+$/.test(PADDLE.priceId));
  assert.ok(PADDLE.clientToken === "" || /^(live|test)_[A-Za-z0-9]+$/.test(PADDLE.clientToken), "a client-side token, never an API key");
  assert.ok(PADDLE.publicKey === "" || /^[A-Za-z0-9_-]{43}$/.test(PADDLE.publicKey));
  const u = new URL(PADDLE.edge);
  assert.equal(u.protocol, "https:");
  assert.equal(u.username + u.password + u.search, "");
  assert.ok(["sandbox", "production"].includes(PADDLE.environment));
});
