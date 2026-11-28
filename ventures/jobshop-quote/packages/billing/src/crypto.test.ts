import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmacSha256Hex, timingSafeEqual } from "./crypto.ts";

describe("timingSafeEqual", () => {
  it("is true only for identical strings", () => {
    assert.equal(timingSafeEqual("", ""), true);
    assert.equal(timingSafeEqual("abc123", "abc123"), true);
  });

  it("is false when the lengths differ, whichever side is shorter", () => {
    // Webhook and checkout-token verification compare an attacker's signature to the real MAC:
    // an empty or truncated signature must never count as a match.
    for (const [a, b] of [
      ["", "a"],
      ["a", ""],
      ["abc", "abcd"],
      ["abcd", "abc"],
      ["ab", "abc"],
    ]) {
      assert.equal(timingSafeEqual(a as string, b as string), false, `${a} vs ${b}`);
    }
  });

  it("is false when any single character differs, first and last included", () => {
    const s = "0123456789abcdef";
    for (let i = 0; i < s.length; i++) {
      const t = `${s.slice(0, i)}x${s.slice(i + 1)}`;
      assert.equal(timingSafeEqual(t, s), false, `differs at ${i}`);
      assert.equal(timingSafeEqual(s, t), false, `differs at ${i} (swapped)`);
    }
  });
});

describe("hmacSha256Hex", () => {
  it("matches the RFC 4231 test case 2 vector", async () => {
    assert.equal(
      await hmacSha256Hex("Jefe", "what do ya want for nothing?"),
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});
