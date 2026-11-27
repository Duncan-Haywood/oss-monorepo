// Material price lists, part 2b: the import preview's price moves and the quotes they touch, the
// supplier line on a history row, and per-foot moves in "quotes this changes".
import { describe, expect, it } from "vitest";
import { priceChangeText, priceListText } from "./material-price";
import {
  type ImpactLine,
  type ImpactMaterial,
  type ImpactQuote,
  importPriceMoves,
  materialPriceImpact,
  proposedPriceImpact,
} from "./material-price-impact";

const al: ImpactMaterial = {
  id: "al",
  name: "Aluminum 6061",
  pricingBasis: "per_lb",
  pricePerLbCents: 425,
  stockPriceCents: null,
};
const bar: ImpactMaterial = {
  id: "bar",
  name: "12L14 hex bar",
  pricingBasis: "per_ft",
  pricePerLbCents: null,
  stockPriceCents: null,
  pricePerFootCents: 420,
};
const q = (id: string, n: number, status: "draft" | "sent" = "draft"): ImpactQuote => ({
  id,
  quoteNumber: n,
  revNumber: 1,
  status,
  customerCompany: `Customer ${n}`,
});
const line = (quoteId: string, m: ImpactMaterial): ImpactLine => ({
  quoteId,
  inputs: { material: { materialId: m.id } },
  snapshot: { materials: [{ ...m }] },
});

describe("importPriceMoves", () => {
  const rows = [
    { row: 2, action: "update" as const, id: "al", values: { ...al, pricePerLbCents: 450 } },
    // Same price, other fields: not a move.
    { row: 3, action: "update" as const, id: "bar", values: { ...bar, barLengthIn: 144 } },
    { row: 4, action: "create" as const, values: { ...al, name: "New" } },
    // An id that is not on the card is ignored.
    { row: 5, action: "update" as const, id: "gone", values: { ...al, pricePerLbCents: 1 } },
  ];
  it("lists only card rows whose price or basis the import changes", () => {
    const moves = importPriceMoves(rows, [al, bar]);
    expect(moves).toEqual([
      {
        row: 2,
        materialId: "al",
        before: {
          pricingBasis: "per_lb",
          pricePerLbCents: 425,
          stockPriceCents: null,
          pricePerFootCents: null,
          pricePerCwtCents: null,
          pricePerMetreCents: null,
        },
        after: {
          pricingBasis: "per_lb",
          pricePerLbCents: 450,
          stockPriceCents: null,
          pricePerFootCents: null,
          pricePerCwtCents: null,
          pricePerMetreCents: null,
        },
      },
    ]);
  });
  it("counts a change of basis and a per-foot price", () => {
    const moves = importPriceMoves(
      [
        { row: 2, action: "update", id: "al", values: { ...bar, id: "al" } },
        { row: 3, action: "update", id: "bar", values: { ...bar, pricePerFootCents: 455 } },
      ],
      [al, bar],
    );
    expect(moves.map((m) => m.row)).toEqual([2, 3]);
    const [basis, foot] = moves;
    if (!basis || !foot) throw new Error("two moves expected");
    expect(priceChangeText(foot.after, foot.before, "USD")).toBe("$4.55/ft, up 8.3% from $4.20/ft");
    expect(priceChangeText(basis.after, basis.before, "USD")).toBe("$4.20/ft, was $4.25/lb");
  });
});

describe("proposedPriceImpact", () => {
  const quotes = [q("q1", 1001), q("q2", 1002, "sent")];
  const lines = [line("q1", al), line("q2", al), line("q2", bar)];
  it("names the open quotes priced at another price than the one the import sets", () => {
    const out = proposedPriceImpact(
      quotes,
      lines,
      [al, bar],
      [{ materialId: "al", ...al, pricePerLbCents: 459 }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.materialId).toBe("al");
    expect(out[0]?.current.pricePerLbCents).toBe(459);
    expect(out[0]?.quotes.map((x) => x.id)).toEqual(["q1", "q2"]);
    expect(out[0]?.quotes[0]?.movePct).toBeCloseTo(8);
  });
  it("leaves out a price equal to the card's and ids that are not this shop's", () => {
    expect(
      proposedPriceImpact(
        quotes,
        lines,
        [al, bar],
        [
          { materialId: "al", ...al },
          { materialId: "other-shop", ...al, pricePerLbCents: 1 },
        ],
      ),
    ).toEqual([]);
  });
  it("sees a per-foot move (the price lives in pricePerFootCents)", () => {
    const out = proposedPriceImpact(
      quotes,
      lines,
      [al, bar],
      [{ materialId: "bar", ...bar, pricePerFootCents: 462 }],
    );
    expect(out[0]?.quotes.map((x) => x.id)).toEqual(["q2"]);
    expect(out[0]?.quotes[0]?.priced.pricePerFootCents).toBe(420);
    expect(out[0]?.quotes[0]?.movePct).toBeCloseTo(10);
  });
});

describe("materialPriceImpact with per-foot rows", () => {
  it("lists a quote priced before a per-foot price moved", () => {
    const out = materialPriceImpact(
      [q("q1", 1001)],
      [line("q1", bar)],
      [{ ...bar, pricePerFootCents: 441 }],
    );
    expect(out[0]?.current.pricePerFootCents).toBe(441);
    expect(out[0]?.quotes[0]?.movePct).toBeCloseTo(5);
  });
});

describe("priceListText", () => {
  it("says where an imported price came from, or nothing", () => {
    expect(priceListText("Ryerson", "2026-11-20")).toBe(
      ", from Ryerson's price list dated 2026-11-20",
    );
    expect(priceListText("  Ryerson ", null)).toBe(", from Ryerson's price list");
    expect(priceListText(null, "2026-11-20")).toBe(", price list dated 2026-11-20");
    expect(priceListText("  ", null)).toBe("");
    expect(priceListText(null, null)).toBe("");
  });
});
