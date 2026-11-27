import { test } from "node:test";
import assert from "node:assert/strict";
import { PADDLE } from "./checkout.mjs";
import { checkoutSource } from "../../../../platform/billing/sync.mjs";

// checkout.mjs is generated from platform/billing/catalogue.mjs; a hand edit (a pasted API
// key, a typo'd price id) would drift from what the billing Worker maps prices to.
test("checkout.mjs is the catalogue's generated copy and holds only public values", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("./checkout.mjs", import.meta.url), "utf8");
  assert.equal(src, checkoutSource("residential-takeoff"), "edit platform/billing/catalogue.mjs, then run node platform/billing/sync.mjs");
  assert.doesNotMatch(src, /pdl_(sk|apikey|ntfset)_|apikey_|-----BEGIN/i);
  assert.deepEqual(Object.keys(PADDLE).sort(), ["clientToken", "edge", "environment", "priceId", "product", "publicKey"]);
});
