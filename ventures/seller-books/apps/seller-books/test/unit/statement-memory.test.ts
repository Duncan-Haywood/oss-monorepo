import { readFileSync } from "node:fs";
import { parseStatement } from "@worker/services/importers/statement";
import {
  applyLearned,
  applyLeftOut,
  learnFromBooks,
  leftOutFromLines,
  merchantKey,
  recall,
  recallLeftOut,
} from "@worker/services/importers/statement-memory";
import { suggest } from "@worker/services/importers/statement-rules";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("merchant memory for statement imports", () => {
  it("keys a merchant by its first two words, without processor prefixes or numbered words", () => {
    expect(merchantKey("SQ *CORNER CAFE 0412 AUSTIN TX")).toBe("CORNER CAFE");
    expect(merchantKey("ULINE  *S1234567")).toBe("ULINE");
    expect(merchantKey("Uline")).toBe("ULINE");
    expect(merchantKey("PAYPAL *VENDOO")).toBe("VENDOO");
    expect(merchantKey("TST* Joe's Diner 55")).toBe("JOES DINER");
    expect(merchantKey("USPS PO 0123456789")).toBe("USPS PO");
    expect(merchantKey("AMZN Mktp US*2K4")).toBe("AMZN MKTP");
    expect(merchantKey("UBER *TRIP")).not.toBe(merchantKey("UBER *EATS"));
    expect(merchantKey("0412 5555")).toBeNull();
    expect(merchantKey("PAYPAL *")).toBeNull();
  });

  it("keeps the latest choice per merchant and counts how often it was used", () => {
    const m = learnFromBooks([
      { vendor: "CORNER CAFE", category: "meals", date: "2026-01-02" },
      { vendor: "SQ *CORNER CAFE 0412", category: "office", date: "2026-02-10" },
      { vendor: "SQ *CORNER CAFE 0413", category: "office", date: "2026-03-01" },
      { vendor: "CORNER CAFE", category: "meals", date: "2026-01-20" },
      { vendor: null, category: "supplies", date: "2026-03-05" },
      { vendor: "1234", category: "supplies", date: "2026-03-05" },
    ]);
    expect([...m.keys()]).toEqual(["CORNER CAFE"]);
    expect(m.get("CORNER CAFE")).toEqual({
      merchant: "CORNER CAFE",
      category: "office",
      count: 2,
      lastDate: "2026-03-01",
    });
    // Same date: the later row in the list (the one entered later) wins.
    const tie = learnFromBooks([
      { vendor: "Uline", category: "supplies", date: "2026-03-01" },
      { vendor: "ULINE *S1", category: "office", date: "2026-03-01" },
    ]);
    expect(tie.get("ULINE")?.category).toBe("office");
  });

  it("recalls a one-word merchant typed by hand for a longer statement description", () => {
    const m = learnFromBooks([{ vendor: "USPS", category: "office", date: "2026-01-01" }]);
    expect(recall(m, "USPS PO 0123456789")?.category).toBe("office");
    expect(recall(m, "UPS STORE 123")).toBeNull();
    const two = learnFromBooks([{ vendor: "Corner Cafe", category: "meals", date: "2026-01-01" }]);
    expect(recall(two, "CORNER STORE")).toBeNull();
  });

  it("ticks a learned merchant, but leaves stores that sell everything and transfers unticked", () => {
    const learned = {
      merchant: "X",
      category: "supplies" as const,
      count: 3,
      lastDate: "2026-01-09",
    };
    const goodwill = applyLearned(suggest("GOODWILL #112"), { ...learned, merchant: "GOODWILL" });
    expect(goodwill).toMatchObject({ kind: "inventory", category: "supplies", include: true });
    expect(goodwill.reason).toBe(
      "You filed 3 earlier charges from GOODWILL as supplies (latest 2026-01-09).",
    );
    const cafe = applyLearned(suggest("CORNER CAFE"), {
      ...learned,
      merchant: "CORNER CAFE",
      category: "meals",
      count: 1,
    });
    expect(cafe).toMatchObject({ kind: "unknown", category: "meals", include: true });
    expect(cafe.reason).toContain("an earlier charge from CORNER CAFE as meals");

    const amazon = applyLearned(suggest("AMZN Mktp US*2K4"), { ...learned, merchant: "AMZN MKTP" });
    expect(amazon).toMatchObject({ kind: "ambiguous", category: "supplies", include: false });
    expect(amazon.reason).toMatch(/^You filed 3 earlier charges .* This store sells everything/);
    const zelle = applyLearned(suggest("ZELLE TO SAM"), { ...learned, merchant: "ZELLE" });
    expect(zelle).toMatchObject({ kind: "transfer", include: false });

    const plain = suggest("USPS PO 1");
    expect(applyLearned(plain, null)).toBe(plain);
  });

  it("changes nothing on a statement when the books are empty", () => {
    const r = parseStatement(fixture("statement-chase-card.csv"));
    const empty = learnFromBooks([]);
    for (const row of r.rows) {
      expect(applyLearned(row.suggestion, recall(empty, row.description))).toBe(row.suggestion);
    }
  });

  it("counts the left-out lines per merchant with the latest date", () => {
    expect(
      leftOutFromLines([
        { description: "NETFLIX.COM 866-579", date: "2026-01-05" },
        { description: "SQ *CORNER CAFE 0412", date: "2026-01-20" },
        { description: "NETFLIX.COM 866-580", date: "2026-02-05" },
        { description: "SQ *CORNER CAFE 0413", date: "2026-01-02" },
        { description: "0412 5555", date: "2026-01-02" },
      ]),
    ).toEqual([
      { merchant: "NETFLIX COM", count: 2, lastDate: "2026-02-05" },
      { merchant: "CORNER CAFE", count: 2, lastDate: "2026-01-20" },
    ]);
  });

  it("starts a left-out merchant unticked unless the seller filed one since", () => {
    const left = { merchant: "VENDOO", count: 2, lastDate: "2026-02-01" };
    const memory = new Map([["VENDOO", left]]);
    expect(recallLeftOut(memory, "PAYPAL *VENDOO")).toBe(left);
    expect(recallLeftOut(memory, "USPS PO 1")).toBeNull();

    const rule = suggest("PAYPAL *VENDOO");
    expect(rule.include).toBe(true);
    const out = applyLeftOut(rule, left);
    expect(out).toMatchObject({ include: false, category: rule.category, leftOut: left });
    expect(out.reason).toBe(
      "You left out 2 earlier charges from VENDOO (latest 2026-02-01). Tick it if this one was for the business.",
    );
    expect(applyLeftOut(rule, null)).toBe(rule);

    const learned = {
      merchant: "VENDOO",
      category: "software_subscriptions" as const,
      count: 1,
      lastDate: "2026-01-01",
    };
    // Filed before it was left out: left out wins.
    expect(applyLeftOut(applyLearned(rule, learned), left).include).toBe(false);
    // Filed on or after the latest left-out line: the filing wins.
    for (const lastDate of ["2026-02-01", "2026-03-01"]) {
      const filed = applyLearned(rule, { ...learned, lastDate });
      expect(applyLeftOut(filed, left)).toBe(filed);
    }
    // A line the rules already leave out keeps its own reason.
    const goodwill = suggest("GOODWILL #112");
    expect(applyLeftOut(goodwill, { ...left, merchant: "GOODWILL" })).toBe(goodwill);
  });
});
