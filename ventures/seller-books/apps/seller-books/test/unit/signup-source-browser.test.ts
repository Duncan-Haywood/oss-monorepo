import {
  clearSignupSource,
  pendingSignupSource,
  rememberSignupSource,
  SIGNUP_SOURCE_KEY,
} from "@client/lib/signup-source";
import { describe, expect, it } from "vitest";

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const DAY = 86_400_000;

describe("signup source in the browser", () => {
  it("keeps the first page's from until signed in, decoded and normalized", () => {
    const s = memory();
    rememberSignupSource(
      "?from=ebay-fee-calculator%2FCost-Of-Goods-Sold-For-Resellers.html",
      s,
      1000,
    );
    expect(pendingSignupSource(s, 2000)).toBe(
      "ebay-fee-calculator/cost-of-goods-sold-for-resellers",
    );
    rememberSignupSource("?from=mercari-fee-calculator", s, 3000);
    expect(pendingSignupSource(s, 4000)).toBe(
      "ebay-fee-calculator/cost-of-goods-sold-for-resellers",
    );
    clearSignupSource(s);
    expect(pendingSignupSource(s, 5000)).toBeNull();
  });

  it("ignores links without a from, or one that is not a page name", () => {
    const s = memory();
    rememberSignupSource("?next=%2Forgs", s);
    rememberSignupSource("?from=https://evil.example/x", s);
    rememberSignupSource("?from=../../etc", s);
    expect(s.m.size).toBe(0);
  });

  it("drops an entry older than the window, or one it cannot read", () => {
    const s = memory();
    rememberSignupSource("?from=depop-fee-calculator", s, 0);
    expect(pendingSignupSource(s, 15 * DAY)).toBeNull();
    expect(s.m.has(SIGNUP_SOURCE_KEY)).toBe(false);
    s.setItem(SIGNUP_SOURCE_KEY, "{not json");
    expect(pendingSignupSource(s)).toBeNull();
    expect(s.m.has(SIGNUP_SOURCE_KEY)).toBe(false);
  });

  it("keeps nothing under Do Not Track or Global Privacy Control", () => {
    const s = memory();
    rememberSignupSource("?from=mercari-fee-calculator", s, 1, { doNotTrack: "1" });
    rememberSignupSource("?from=mercari-fee-calculator", s, 1, { globalPrivacyControl: true });
    expect(s.m.size).toBe(0);
    rememberSignupSource("?from=mercari-fee-calculator", s, 1, { doNotTrack: "0" });
    expect(pendingSignupSource(s, 2)).toBe("mercari-fee-calculator");
  });

  it("does nothing when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberSignupSource("?from=x", blocked)).not.toThrow();
    expect(pendingSignupSource(blocked)).toBeNull();
    expect(pendingSignupSource(null)).toBeNull();
  });
});
