import { describe, expect, it } from "vitest";
import {
  currencyMismatch,
  type InvoiceableLine,
  invoiceLineDescription,
  invoiceMemo,
  planQuoteInvoice,
  qboDocNumber,
} from "./qbo-invoice";

const br = (quantity: number, unitPriceCents: number) => ({
  quantity,
  unitPriceCents,
  totalCents: quantity * unitPriceCents,
});
const lines: InvoiceableLine[] = [
  { id: "a", partNumber: "BRK-1", revision: "C", description: "Bracket ", breaks: [br(50, 1200)] },
  {
    id: "b",
    partNumber: "SPC-2",
    revision: null,
    description: null,
    breaks: [br(10, 900), br(100, 400)],
  },
];

describe("planQuoteInvoice", () => {
  it("takes the only break, a picked break, and refuses an unpicked multi-break line", () => {
    const missing = planQuoteInvoice(lines, [], null);
    expect(missing).toEqual({
      ok: false,
      error: "Pick the quantity ordered for SPC-2: quoted at more than one quantity",
      missing: ["SPC-2"],
    });
    const plan = planQuoteInvoice(lines, [{ lineId: "b", quantity: 100 }], null);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.lines.map((l) => [l.partNumber, l.quantity, l.totalCents, l.source])).toEqual([
      ["BRK-1", 50, 60_000, "only-break"],
      ["SPC-2", 100, 40_000, "picked"],
    ]);
    expect(plan.totalCents).toBe(100_000);
  });

  it("never prices a quantity that was not quoted", () => {
    const plan = planQuoteInvoice(lines, [{ lineId: "b", quantity: 50 }], null);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toContain("not quoted at a quantity of 50");
  });

  it("follows the online acceptance, leaves off what was not ordered, and lets a pick override", () => {
    const accepted = [{ lineId: "b", quantity: 10 }];
    const plan = planQuoteInvoice(lines, [], accepted);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.lines.map((l) => [l.partNumber, l.quantity, l.source])).toEqual([
      ["SPC-2", 10, "accepted"],
    ]);
    expect(plan.leftOff).toEqual(["BRK-1"]);
    const both = planQuoteInvoice(lines, [{ lineId: "a", quantity: 50 }], accepted);
    expect(both.ok && both.lines.length).toBe(2);
  });

  it("refuses an empty invoice, an unknown or doubled line, an unpriced line and a total that does not add up", () => {
    expect(
      planQuoteInvoice(
        lines,
        [
          { lineId: "a", quantity: 0 },
          { lineId: "b", quantity: 0 },
        ],
        null,
      ).ok,
    ).toBe(false);
    expect(planQuoteInvoice(lines, [{ lineId: "zz", quantity: 1 }], null).ok).toBe(false);
    expect(
      planQuoteInvoice(
        lines,
        [
          { lineId: "a", quantity: 50 },
          { lineId: "a", quantity: 50 },
        ],
        null,
      ).ok,
    ).toBe(false);
    const unpriced: InvoiceableLine[] = [
      { ...(lines[0] as InvoiceableLine), id: "u", breaks: null },
    ];
    expect(planQuoteInvoice(unpriced, [], null)).toMatchObject({
      ok: false,
      error: expect.stringContaining("has no price"),
    });
    const odd: InvoiceableLine[] = [
      {
        ...(lines[0] as InvoiceableLine),
        id: "o",
        breaks: [{ quantity: 3, unitPriceCents: 100, totalCents: 301 }],
      },
    ];
    expect(planQuoteInvoice(odd, [], null).ok).toBe(false);
  });
});

describe("what the invoice says", () => {
  it("numbers, describes and notes the quote the way the PDF does", () => {
    expect(qboDocNumber(1001)).toBe("Q1001");
    expect(qboDocNumber(1001, 2)).toBe("Q1001-R2");
    expect(qboDocNumber(123456789012345, 99).length).toBeLessThanOrEqual(21);
    expect(invoiceLineDescription(lines[0] as InvoiceableLine)).toBe("BRK-1 Rev C, Bracket");
    expect(invoiceLineDescription(lines[1] as InvoiceableLine)).toBe("SPC-2");
    expect(invoiceMemo({ quoteNumber: 1001, revNumber: 2, poNumber: " 4500 123 " })).toBe(
      "Your PO 4500 123. Per our quote Q-1001 Rev 2.",
    );
    expect(invoiceMemo({ quoteNumber: 1001, revNumber: 1, poNumber: null })).toBe(
      "Per our quote Q-1001.",
    );
  });

  it("sends only into books kept in the shop's currency", () => {
    expect(currencyMismatch("USD", "USD")).toBeNull();
    expect(currencyMismatch("USD", undefined)).toBeNull();
    expect(currencyMismatch("EUR", undefined)).toContain("did not say its home currency");
    expect(currencyMismatch("EUR", "USD")).toContain("keeps its books in USD");
  });
});
