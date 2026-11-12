import { describe, expect, it } from "vitest";
import { clearPick } from "@/lib/clearPick";

type C = { key: string; rating: number; rd: number };
const c = (key: string, rating: number, rd: number): C => ({ key, rating, rd });
const indep = (a: C, b: C) => Math.hypot(a.rd, b.rd);

describe("clearPick", () => {
  it("makes no claim with fewer than two items", () => {
    expect(clearPick([], indep)).toBeUndefined();
    expect(clearPick([c("a", 1600, 50)], indep)).toBeUndefined();
  });

  it("calls the leader clear only when it beats every item by 1.645 sd of the difference", () => {
    const sd = Math.hypot(50, 50); // 70.7
    expect(clearPick([c("a", 1500 + 1.7 * sd, 50), c("b", 1500, 50)], indep)).toMatchObject({ leader: { key: "a" }, clear: true });
    expect(clearPick([c("a", 1500 + 1.6 * sd, 50), c("b", 1500, 50)], indep)).toMatchObject({ leader: { key: "a" }, clear: false });
  });

  it("checks every item, not just the runner-up: a far but uncertain third item blocks the claim", () => {
    const items = [c("a", 1800, 40), c("b", 1600, 40), c("c", 1550, 300)];
    expect(clearPick(items, indep)!.clear).toBe(false);
    expect(clearPick(items.slice(0, 2), indep)!.clear).toBe(true);
  });

  it("does not claim what the rule before 2026-11-12 claimed: ahead by half the leader's rd", () => {
    // Old rule: 1600 - 1520 = 80 > 0.5 * 100, so "clear". Two items with rd 100
    // have a difference sd of 141, so 80 points is 0.57 sd: a coin flip's worth.
    const items = [c("a", 1600, 100), c("b", 1520, 100)];
    expect(items[0].rating - items[1].rating > 0.5 * items[0].rd).toBe(true);
    expect(clearPick(items, indep)!.clear).toBe(false);
  });

  it("finds the bottom pick with bottom: true", () => {
    const items = [c("a", 1800, 30), c("b", 1700, 30), c("c", 1300, 30)];
    expect(clearPick(items, indep, { bottom: true })).toMatchObject({ leader: { key: "c" }, clear: true });
  });

  it("uses the caller's difference sd, so a correlated pair can be clear when independent rds say not", () => {
    const items = [c("a", 1650, 80), c("b", 1500, 80)];
    expect(clearPick(items, indep)!.clear).toBe(false); // 150 < 1.645 * 113
    expect(clearPick(items, () => 60)!.clear).toBe(true); // 150 > 1.645 * 60
  });
});
