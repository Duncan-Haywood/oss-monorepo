import { describe, expect, it } from "vitest";
import { parseCheckoutToken, signCheckoutToken, verifyCheckoutToken } from "./checkout-token";

const SECRET = "test-secret-test-secret";
const ID = "pco_0123456789abcdefghjk";

describe("checkout tokens", () => {
  it("binds the checkout id to its org without revealing the org", async () => {
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    expect(token.startsWith(`${ID}.`)).toBe(true);
    expect(token).not.toContain("org_a");
    expect(await verifyCheckoutToken(SECRET, token, "org_a")).toBe(true);
    // Same checkout, another org (or another secret): rejected.
    expect(await verifyCheckoutToken(SECRET, token, "org_b")).toBe(false);
    expect(await verifyCheckoutToken("other-secret", token, "org_a")).toBe(false);
  });

  it("rejects tampered and malformed tokens without throwing", async () => {
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    const other = await signCheckoutToken(SECRET, "pco_zzzzzzzzzzzzzzzzzzzz", "org_a");
    const swapped = `pco_zzzzzzzzzzzzzzzzzzzz.${token.split(".")[1]}`;
    expect(await verifyCheckoutToken(SECRET, swapped, "org_a")).toBe(false);
    expect(await verifyCheckoutToken(SECRET, other, "org_a")).toBe(true);
    for (const bad of [
      "",
      "org_a",
      `${ID}.`,
      `${ID}.zz`,
      `${token}.x`,
      "x".repeat(500),
      42,
      null,
    ]) {
      expect(parseCheckoutToken(bad)).toBeNull();
    }
    expect(await verifyCheckoutToken(SECRET, `${ID}.${"0".repeat(64)}`, "org_a")).toBe(false);
  });
});
