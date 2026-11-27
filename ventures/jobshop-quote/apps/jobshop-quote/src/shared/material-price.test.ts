import { describe, expect, it } from "vitest";
import {
  ageText,
  effectivePrice,
  isPriceStale,
  linePriceNotes,
  type PriceFields,
  priceAgeDays,
  priceChanged,
  priceChangeText,
  stalePriceWarning,
} from "./material-price";

const perLb = { pricingBasis: "per_lb" as const, pricePerLbCents: 400, stockPriceCents: null };
const perStock = {
  pricingBasis: "per_stock" as const,
  pricePerLbCents: null,
  stockPriceCents: 9500,
};
const now = new Date("2031-06-30T12:00:00Z");

describe("priceChanged", () => {
  it("counts a new $/lb or stock price, and any change of basis", () => {
    expect(priceChanged(perLb, { pricePerLbCents: 425 })).toBe(true);
    expect(priceChanged(perStock, { stockPriceCents: 9000 })).toBe(true);
    expect(priceChanged(perLb, { pricingBasis: "per_stock", stockPriceCents: 400 })).toBe(true);
  });
  it("ignores fields the basis does not charge by and edits that keep the price", () => {
    expect(priceChanged(perLb, { pricePerLbCents: 400 })).toBe(false);
    expect(priceChanged(perLb, {})).toBe(false);
    // A stale stock price left on a per-lb row is not what the row charges.
    expect(priceChanged(perLb, { stockPriceCents: 1234 })).toBe(false);
    expect(priceChanged(perLb, { pricePerLbCents: undefined })).toBe(false);
  });
  it("reads the effective price from the basis", () => {
    expect(effectivePrice(perLb)).toBe(400);
    expect(effectivePrice(perStock)).toBe(9500);
  });
});

describe("price age", () => {
  it("counts whole days and never goes negative", () => {
    expect(priceAgeDays("2031-06-30T00:00:00Z", now)).toBe(0);
    expect(priceAgeDays("2031-06-29T11:00:00Z", now)).toBe(1);
    expect(priceAgeDays(new Date("2031-04-01T12:00:00Z"), now)).toBe(90);
    expect(priceAgeDays("2031-07-02T00:00:00Z", now)).toBe(0);
    expect(priceAgeDays("not a date", now)).toBe(0);
  });
  it("is stale only past the limit, and never when the limit is off", () => {
    expect(isPriceStale("2031-04-01T12:00:00Z", 90, now)).toBe(false);
    expect(isPriceStale("2031-04-01T11:00:00Z", 90, now)).toBe(false);
    expect(isPriceStale("2031-03-31T12:00:00Z", 90, now)).toBe(true);
    expect(isPriceStale("2020-01-01T00:00:00Z", null, now)).toBe(false);
    expect(isPriceStale("2020-01-01T00:00:00Z", 0, now)).toBe(false);
  });
  it("words the age", () => {
    expect(ageText(0)).toBe("today");
    expect(ageText(1)).toBe("1 day ago");
    expect(ageText(120)).toBe("120 days ago");
  });
});

describe("stalePriceWarning", () => {
  const mat = { id: "mat_1", name: "6061-T6 bar", priceSetAt: "2031-01-15T09:00:00.000Z" };
  it("states the shop's own date and limit, never a market price", () => {
    const w = stalePriceWarning(mat, 90, now);
    expect(w).toBe(
      "The 6061-T6 bar price on the rate card was last set 166 days ago (2031-01-15), past the shop's 90-day limit. Check it with your supplier, update the rate card, then Re-price.",
    );
    expect(w).not.toMatch(/\$/);
  });
  it("is null for a fresh price, a missing material or the limit off", () => {
    expect(stalePriceWarning({ ...mat, priceSetAt: "2031-06-01T00:00:00Z" }, 90, now)).toBeNull();
    expect(stalePriceWarning(undefined, 90, now)).toBeNull();
    expect(stalePriceWarning(mat, null, now)).toBeNull();
  });
});

describe("priceChangeText", () => {
  const at = "2031-06-01T00:00:00Z";
  it("gives the change in percent against the row before", () => {
    expect(
      priceChangeText(
        { ...perLb, pricePerLbCents: 425, createdAt: at },
        { ...perLb, createdAt: at },
        null,
      ),
    ).toBe("$4.25/lb, up 6.3% from $4.00/lb");
    expect(
      priceChangeText(
        { ...perStock, stockPriceCents: 9000, createdAt: at },
        { ...perStock, createdAt: at },
        "EUR",
      ),
    ).toMatch(/down 5\.3% from/);
    expect(priceChangeText({ ...perLb, createdAt: at }, { ...perLb, createdAt: at }, null)).toBe(
      "$4.00/lb, unchanged",
    );
  });
  it("has no percentage for the first price or a change of basis", () => {
    expect(priceChangeText({ ...perLb, createdAt: at }, null, null)).toBe("$4.00/lb");
    expect(priceChangeText({ ...perStock, createdAt: at }, { ...perLb, createdAt: at }, null)).toBe(
      "$95.00 per stock piece, was $4.00/lb",
    );
  });
});

describe("linePriceNotes", () => {
  type Row = PriceFields & { id: string; name: string; priceSetAt: string };
  const al: Row = {
    id: "mat_al",
    name: "6061-T6 bar",
    priceSetAt: "2031-06-20T00:00:00Z",
    pricingBasis: "per_lb",
    pricePerLbCents: 450,
    stockPriceCents: null,
  };
  const ss: Row = {
    id: "mat_ss",
    name: "303 bar",
    priceSetAt: "2031-01-01T00:00:00Z",
    ...perStock,
  };
  const card = [al, ss];
  const line = (materialId: string | null, priced: Row | null) => ({
    inputs: { material: materialId ? { materialId } : null },
    snapshot: priced ? { materials: [priced] } : null,
  });
  it("says when the card's price moved since the line was priced", () => {
    const notes = linePriceNotes(
      line("mat_al", { ...al, pricePerLbCents: 400 }),
      card,
      90,
      now,
      null,
    );
    expect(notes).toEqual([
      "This line was priced with 6061-T6 bar at $4.00/lb; the rate card now has $4.50/lb. Re-price to use it.",
    ]);
  });
  it("adds the stale-price warning from the card's date", () => {
    const notes = linePriceNotes(line("mat_ss", ss), card, 90, now, null);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^The 303 bar price on the rate card was last set 180 days ago/);
  });
  it("is empty for a fresh, unchanged price, no material, or a material not on the card", () => {
    expect(linePriceNotes(line("mat_al", al), card, 90, now, null)).toEqual([]);
    expect(linePriceNotes(line(null, null), card, 90, now, null)).toEqual([]);
    expect(linePriceNotes(line("mat_gone", null), card, 90, now, null)).toEqual([]);
    expect(linePriceNotes(line("mat_ss", ss), card, null, now, null)).toEqual([]);
  });
});
