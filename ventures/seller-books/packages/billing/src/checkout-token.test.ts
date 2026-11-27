import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKOUT_TOKEN_TTL_MS,
  isCheckoutId,
  newCheckoutId,
  type PendingCheckoutRow,
  parseCheckoutToken,
  resolveCheckoutToken,
  signCheckoutToken,
  verifyCheckoutToken,
} from "./checkout-token.ts";

const SECRET = "test-secret-test-secret";
const ID = "pco_0123456789abcdefghjk";

describe("checkout tokens", () => {
  it("binds the checkout id to its org without revealing the org", async () => {
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    assert.ok(token.startsWith(`${ID}.`));
    assert.ok(!token.includes("org_a"));
    assert.equal(await verifyCheckoutToken(SECRET, token, "org_a"), true);
    // Same checkout, another org (or another secret): rejected.
    assert.equal(await verifyCheckoutToken(SECRET, token, "org_b"), false);
    assert.equal(await verifyCheckoutToken("other-secret", token, "org_a"), false);
  });

  it("rejects tampered and malformed tokens without throwing", async () => {
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    const other = await signCheckoutToken(SECRET, "pco_zzzzzzzzzzzzzzzzzzzz", "org_a");
    const swapped = `pco_zzzzzzzzzzzzzzzzzzzz.${token.split(".")[1]}`;
    assert.equal(await verifyCheckoutToken(SECRET, swapped, "org_a"), false);
    assert.equal(await verifyCheckoutToken(SECRET, other, "org_a"), true);
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
      assert.equal(parseCheckoutToken(bad), null);
    }
    assert.equal(await verifyCheckoutToken(SECRET, `${ID}.${"0".repeat(64)}`, "org_a"), false);
    // verifyCheckoutToken is exported on its own: malformed input must fail it too, not only parse
    // (red team 2026-11-27: `if (!parsed) return true` passed every earlier test).
    for (const bad of ["", "org_a", `${ID}.`, `${token}.x`, "x".repeat(500), 42, null]) {
      assert.equal(await verifyCheckoutToken(SECRET, bad as string, "org_a"), false, String(bad));
    }
  });

  it("accepts checkout tokens for 24 hours", () => {
    assert.equal(CHECKOUT_TOKEN_TTL_MS, 24 * 60 * 60 * 1000);
  });

  it("generates well-formed random checkout ids and refuses to sign malformed ones", async () => {
    const ids = new Set(Array.from({ length: 200 }, newCheckoutId));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.ok(isCheckoutId(id), id);
    await assert.rejects(signCheckoutToken(SECRET, "org_a", "org_a"), /checkout id/);
  });

  it("rejects random bytes >= 252 so every id character is uniform", (t) => {
    // 252 = 7 x 36; byte 252 would map to "0" and bias it. Feed 252 first, then 1s.
    t.mock.method(crypto, "getRandomValues", (a: Uint8Array) => {
      a.fill(1);
      a[0] = 252;
      a[1] = 255;
      return a;
    });
    assert.equal(newCheckoutId(), `pco_${"1".repeat(20)}`);
  });
});

describe("resolveCheckoutToken (pending-checkout rules)", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  const row = (over: Partial<PendingCheckoutRow> = {}): PendingCheckoutRow => ({
    id: ID,
    orgId: "org_a",
    expiresAt: new Date(now.getTime() + CHECKOUT_TOKEN_TTL_MS),
    consumedAt: null,
    providerSubscriptionId: null,
    ...over,
  });

  it("accepts a valid unconsumed token and binds its row's org", async () => {
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    assert.deepEqual(await resolveCheckoutToken(SECRET, token, row(), "sub_1", now), {
      ok: true,
      orgId: "org_a",
      checkoutId: ID,
    });
  });

  it("rejects a token signed for another org, a missing row, and a mismatched row", async () => {
    const forB = await signCheckoutToken(SECRET, ID, "org_b");
    assert.deepEqual(await resolveCheckoutToken(SECRET, forB, row(), "sub_1", now), {
      ok: false,
      reason: "invalid checkout token",
    });
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    assert.equal((await resolveCheckoutToken(SECRET, token, null, "sub_1", now)).ok, false);
    const otherRow = row({ id: "pco_zzzzzzzzzzzzzzzzzzzz" });
    assert.equal((await resolveCheckoutToken(SECRET, token, otherRow, "sub_1", now)).ok, false);
  });

  it("rejects expired tokens and replays by another subscription; allows a same-sub retry", async () => {
    const token = await signCheckoutToken(SECRET, ID, "org_a");
    const expired = row({ expiresAt: now });
    assert.deepEqual(await resolveCheckoutToken(SECRET, token, expired, "sub_1", now), {
      ok: false,
      reason: "expired checkout token",
    });
    const consumed = row({ consumedAt: now, providerSubscriptionId: "sub_1", expiresAt: now });
    assert.equal((await resolveCheckoutToken(SECRET, token, consumed, "sub_1", now)).ok, true);
    assert.deepEqual(await resolveCheckoutToken(SECRET, token, consumed, "sub_2", now), {
      ok: false,
      reason: "checkout token replay",
    });
  });
});
