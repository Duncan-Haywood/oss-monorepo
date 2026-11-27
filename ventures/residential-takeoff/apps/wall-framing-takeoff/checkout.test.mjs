import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PADDLE } from "./checkout.mjs";
import { onSale } from "./paddle.mjs";
import { checkoutSource } from "../../../../platform/billing/sync.mjs";

// checkout.mjs is generated from platform/billing/catalogue.mjs; a hand edit here would
// sell at a price the catalogue (and so the billing Worker) does not know.
test("checkout.mjs is the sync's output for the residential-takeoff row", () => {
  assert.equal(readFileSync(new URL("./checkout.mjs", import.meta.url), "utf8"), checkoutSource("residential-takeoff"));
  assert.equal(PADDLE.product, "residential-takeoff");
});

test("every value is public: empty, or a Paddle price id, client-side token, public key and https origin", () => {
  assert.deepEqual(Object.keys(PADDLE).sort(), ["clientToken", "edge", "environment", "priceId", "product", "publicKey"]);
  assert.ok(PADDLE.priceId === "" || /^pri_[a-z0-9]{10,40}$/.test(PADDLE.priceId));
  assert.ok(PADDLE.clientToken === "" || /^(live|test)_/.test(PADDLE.clientToken));
  assert.ok(PADDLE.publicKey === "" || /^[A-Za-z0-9_-]{43}$/.test(PADDLE.publicKey));
  assert.ok(PADDLE.edge === "" || new URL(PADDLE.edge).protocol === "https:");
  assert.doesNotMatch(JSON.stringify(PADDLE), /pdl_(sk|apikey|ntfset)_|sk_live|apikey_/i, "never an API key");
  assert.ok(["sandbox", "production"].includes(PADDLE.environment));
});

test("the build ships dark: no Buy button until the owner fills the catalogue", () => {
  assert.equal(onSale(PADDLE), false);
});
