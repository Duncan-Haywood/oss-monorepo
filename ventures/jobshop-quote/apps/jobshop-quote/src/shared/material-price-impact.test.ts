import { describe, expect, it } from "vitest";
import {
  type ImpactLine,
  type ImpactMaterial,
  type ImpactQuote,
  materialPriceImpact,
  moveCounts,
  moveText,
  priceMovePct,
} from "./material-price-impact";

const al: ImpactMaterial = {
  id: "al",
  name: "Aluminum 6061",
  pricingBasis: "per_lb",
  pricePerLbCents: 425,
  stockPriceCents: null,
};
const ss: ImpactMaterial = {
  id: "ss",
  name: "303 Stainless bar",
  pricingBasis: "per_stock",
  pricePerLbCents: null,
  stockPriceCents: 12_000,
};
const q = (id: string, n: number, status: "draft" | "sent" = "draft"): ImpactQuote => ({
  id,
  quoteNumber: n,
  revNumber: 1,
  status,
  customerCompany: `Customer ${n}`,
});
const perLb = (cents: number) => ({
  pricingBasis: "per_lb" as const,
  pricePerLbCents: cents,
  stockPriceCents: null,
});
const line = (quoteId: string, materialId: string | null, priced: object | null): ImpactLine => ({
  quoteId,
  inputs: { material: materialId ? { materialId } : null },
  snapshot: priced ? { materials: [{ id: materialId ?? "x", ...perLb(0), ...priced }] } : null,
});

describe("priceMovePct", () => {
  it("is the move from the priced price to the card's", () => {
    expect(priceMovePct(perLb(400), perLb(425))).toBeCloseTo(6.25);
    expect(priceMovePct(perLb(500), perLb(450))).toBeCloseTo(-10);
  });
  it("is null across a basis change or from a zero price", () => {
    expect(priceMovePct(perLb(400), ss)).toBeNull();
    expect(priceMovePct(perLb(0), perLb(425))).toBeNull();
  });
});

describe("moveCounts", () => {
  it("counts a move at or past the threshold either way, and an unmeasurable one always", () => {
    expect(moveCounts(5, 5)).toBe(true);
    expect(moveCounts(4.99999999, 5)).toBe(true); // float noise rounds to 5.0%
    expect(moveCounts(-4.9, 5)).toBe(false);
    expect(moveCounts(-5.1, 5)).toBe(true);
    expect(moveCounts(null, 10)).toBe(true);
    expect(moveCounts(0.1, 0)).toBe(true);
  });
});

describe("materialPriceImpact", () => {
  it("lists open quotes priced at another price, per material, most moved first", () => {
    const quotes = [q("a", 1001), q("b", 1002, "sent"), q("c", 1003)];
    const lines = [
      line("a", "al", perLb(400)), // +6.25%
      line("b", "al", perLb(300)), // +41.7%
      line("c", "al", perLb(425)), // same price: not listed
      line("c", "ss", {
        pricingBasis: "per_stock",
        pricePerLbCents: null,
        stockPriceCents: 10_000,
      }),
    ];
    const out = materialPriceImpact(quotes, lines, [al, ss]);
    expect(out.map((m) => m.name)).toEqual(["303 Stainless bar", "Aluminum 6061"]);
    const alu = out[1];
    expect(alu?.quotes.map((x) => x.id)).toEqual(["b", "a"]);
    expect(alu?.quotes[0]).toMatchObject({
      status: "sent",
      lines: 1,
      customerCompany: "Customer 1002",
    });
    expect(alu?.quotes[0]?.priced.pricePerLbCents).toBe(300);
    expect(alu?.current.pricePerLbCents).toBe(425);
    expect(out[0]?.quotes[0]?.movePct).toBeCloseTo(20);
  });

  it("drops moves under the threshold but keeps a basis change", () => {
    const quotes = [q("a", 1001), q("b", 1002)];
    const lines = [
      line("a", "al", perLb(410)), // +3.7%
      line("b", "al", { pricingBasis: "per_stock", pricePerLbCents: null, stockPriceCents: 900 }),
    ];
    const out = materialPriceImpact(quotes, lines, [al], 5);
    expect(out[0]?.quotes.map((x) => x.id)).toEqual(["b"]);
    expect(out[0]?.quotes[0]?.movePct).toBeNull();
    expect(materialPriceImpact(quotes, lines, [al], 0)[0]?.quotes).toHaveLength(2);
  });

  it("counts several lines on one quote once, showing the most moved", () => {
    const lines = [line("a", "al", perLb(410)), line("a", "al", perLb(350))];
    const [m] = materialPriceImpact([q("a", 1001)], lines, [al]);
    expect(m?.quotes).toHaveLength(1);
    expect(m?.quotes[0]).toMatchObject({ lines: 2 });
    expect(m?.quotes[0]?.priced.pricePerLbCents).toBe(350);
  });

  it("ignores customer-supplied lines, unpriced lines, unknown quotes and materials", () => {
    const lines = [
      line("a", null, null),
      line("a", "al", null), // blocked: no snapshot
      line("zz", "al", perLb(100)), // not an open quote
      line("a", "gone", perLb(100)), // not on the card
    ];
    expect(materialPriceImpact([q("a", 1001)], lines, [al])).toEqual([]);
  });
});

describe("moveText", () => {
  it("says the direction and size, or that it cannot compare", () => {
    expect(moveText(6.25)).toBe("up 6.3%");
    expect(moveText(-2)).toBe("down 2.0%");
    expect(moveText(null)).toMatch(/not comparable/);
  });
});
