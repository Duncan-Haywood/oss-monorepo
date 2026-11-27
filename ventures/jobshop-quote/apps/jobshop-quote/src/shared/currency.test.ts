import { describe, expect, it } from "vitest";
import { coverNoteContext, coverNoteProblem } from "./cover-note";
import {
  CURRENCY_NAMES,
  currencyPrefix,
  formatMoney,
  headerCurrencyMark,
  isShopCurrency,
  markFits,
  SHOP_CURRENCIES,
  shopCurrency,
  splitCurrencyMark,
  stripCurrencyMarks,
} from "./currency";
import { customerChangeSummary } from "./quote-change-summary";
import type { QuoteChanges } from "./quote-diff";

describe("formatMoney", () => {
  it("prints USD exactly as the app always has (null and unknown codes read as USD)", () => {
    expect(formatMoney(123456, null)).toBe("$1,234.56");
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(123456, "XYZ")).toBe("$1,234.56");
    expect(formatMoney(0, null)).toBe("$0.00");
    expect(formatMoney(5, null)).toBe("$0.05");
    expect(formatMoney(-500, null)).toBe("-$5.00");
    expect(formatMoney(100000000, null)).toBe("$1,000,000.00");
    // The engine's basis lines: no grouping, as before.
    expect(formatMoney(123456, null, { grouping: false })).toBe("$1234.56");
    expect(formatMoney(120000, null, { dropZeroCents: true })).toBe("$1,200");
    expect(formatMoney(120050, null, { dropZeroCents: true })).toBe("$1,200.50");
  });

  it("prints each shop currency with its own mark", () => {
    expect(formatMoney(123456, "CAD")).toBe("CA$1,234.56");
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
    expect(formatMoney(123456, "GBP")).toBe("£1,234.56");
    expect(formatMoney(123456, "AUD")).toBe("A$1,234.56");
    expect(formatMoney(123456, "MXN")).toBe("MX$1,234.56");
    expect(formatMoney(123456, "CHF")).toBe("CHF 1,234.56");
    expect(formatMoney(-500, "EUR")).toBe("-€5.00");
    expect(formatMoney(123456, "cad")).toBe("CA$1,234.56");
  });

  it("offers only two-decimal currencies, each named", () => {
    for (const c of SHOP_CURRENCIES) {
      expect(
        new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions()
          .maximumFractionDigits,
      ).toBe(2);
      expect(CURRENCY_NAMES[c]).toBeTruthy();
      expect(currencyPrefix(c)).toBeTruthy();
    }
    expect(isShopCurrency("JPY")).toBe(false);
    expect(shopCurrency(" eur ")).toBe("EUR");
    expect(shopCurrency(undefined)).toBe("USD");
  });
});

describe("stripCurrencyMarks", () => {
  it("leaves the number a person or a sheet wrote", () => {
    for (const s of [
      "$12.50",
      "CA$12.50",
      "€12.50",
      "£ 12.50",
      "CHF 12.50",
      "12.50 EUR",
      "12.50€",
    ]) {
      expect(stripCurrencyMarks(s)).toBe("12.50");
    }
    expect(stripCurrencyMarks("1,234.00")).toBe("1,234.00");
    expect(stripCurrencyMarks("abc")).toBe("abc");
  });
});

describe("currency in customer text", () => {
  it("the cover note facts carry the shop's currency", () => {
    const context = coverNoteContext({
      shopName: "Acme",
      customerName: "Dana",
      quoteNumber: "Q-1",
      validUntil: null,
      leadTimeText: null,
      notes: null,
      currency: "EUR",
      lines: [
        {
          partNumber: "P-1",
          description: null,
          breaks: [{ quantity: 10, unitPriceCents: 4500, totalCents: 45000 }],
          includes: [],
        },
      ],
    });
    expect(context).toContain("Qty 10: €45.00 each, €450.00 total");
  });

  it("a model note stating a price in any shop currency is refused", () => {
    const context = "Part P-1\n  Qty 10: €45.00 each, €450.00 total";
    for (const note of [
      "Parts are €45 each.",
      "Parts are 45€ each.",
      "Total £450.",
      "Total EUR 450.",
      "Total 450 EUR.",
      "Total CHF 450.",
      "Total 450 euros.",
      "Total CA$450.",
      "Total 450 kronor.",
      "Total 450 zloty.",
    ]) {
      expect(coverNoteProblem(note, context), note).toBe("states a price or percentage");
    }
    expect(coverNoteProblem("Thanks for the RFQ for P-1 at 10 pieces.", context)).toBeNull();
  });

  it("the revision's change lines print the shop's currency", () => {
    const changes = {
      header: [],
      lines: [
        {
          kind: "changed",
          partNumber: "P-1",
          revision: null,
          fields: [],
          prices: [{ kind: "changed", quantity: 10, fromUnitCents: 4500, toUnitCents: 4200 }],
        },
      ],
    } as unknown as QuoteChanges;
    expect(customerChangeSummary(changes, "GBP")).toEqual(["P-1, qty 10: £45.00 to £42.00 each"]);
    expect(customerChangeSummary(changes)).toEqual(["P-1, qty 10: $45.00 to $42.00 each"]);
  });
});

describe("currency marks in sheets", () => {
  it("finds the mark a cell carries and the number left", () => {
    expect(splitCurrencyMark("€85")).toEqual({ mark: { mark: "€", codes: ["EUR"] }, rest: "85" });
    expect(splitCurrencyMark("12,50 eur").mark?.codes).toEqual(["EUR"]);
    expect(splitCurrencyMark("CA$95").mark?.codes).toEqual(["CAD"]);
    expect(splitCurrencyMark("$95").mark?.codes).toContain("CAD");
    expect(splitCurrencyMark("85")).toEqual({ mark: null, rest: "85" });
    expect(splitCurrencyMark("85 abc")).toEqual({ mark: null, rest: "85 abc" });
  });
  it("finds the currency a header names, and not a word that only looks like a code", () => {
    expect(headerCurrencyMark("Rate (€/hr)")?.codes).toEqual(["EUR"]);
    expect(headerCurrencyMark("Rate (USD/hr)")?.codes).toEqual(["USD"]);
    expect(headerCurrencyMark("Price in GBP")?.codes).toEqual(["GBP"]);
    expect(headerCurrencyMark("Hourly CA$")?.codes).toEqual(["CAD"]);
    for (const h of [
      "Hourly rate",
      "CAD time",
      "Drill feed (in/min)",
      "Cut speed (ipm)",
      "Lot charge",
    ])
      expect(headerCurrencyMark(h), h).toBeNull();
  });
  it("lets no mark and the shop's own mark fit", () => {
    expect(markFits(null, "EUR")).toBe(true);
    expect(markFits({ mark: "$", codes: ["USD", "CAD"] }, "CAD")).toBe(true);
    expect(markFits({ mark: "€", codes: ["EUR"] }, null)).toBe(false);
  });
});
