import { describe, it } from "node:test";
import assert from "node:assert/strict";
import AddToCartButton from "../src/components/AddToCartButton.tsx";
import StorefrontCartBadge from "../src/components/StorefrontCartBadge.tsx";

describe("Storefront components unit tests", () => {
  it("renders AddToCartButton element structure", () => {
    const element = AddToCartButton({ slug: "midnight-coast", label: "Buy Print" });
    assert.ok(element);
  });

  it("renders StorefrontCartBadge element structure", () => {
    const element = StorefrontCartBadge();
    assert.ok(element);
    assert.equal(element.type, "a");
  });
});
