import { parseCsv, toCsv } from "@shared/csv";
import {
  buildScheduleC,
  DE_MINIMIS_ELECTION_TITLE,
  DE_MINIMIS_LIMIT_CENTS,
  expenseLine,
  FORM_4562_LINE,
  type ScInput,
} from "@worker/services/books/schedule-c";
import { expenseList } from "@worker/services/books/year-end";
import { describe, expect, it } from "vitest";

// One sale, no inventory, so every expense moves line 28 by exactly its amount.
const base: ScInput = {
  year: 2026,
  sales: [
    {
      kind: "order",
      date: "2026-01-05",
      itemCents: 1_000_000,
      shippingChargedCents: 0,
      refundCents: 0,
      shippingLabelCents: 0,
      fees: [],
    },
  ],
  charges: [],
  expenses: [],
  items: [],
  unallocatedLots: [],
  businessMiles: 0,
  mileageRateCents: null,
};
const line = (ws: ReturnType<typeof buildScheduleC>, l: string) =>
  ws.lines.find((x) => x.line === l);

describe("equipment and the de minimis safe harbor", () => {
  it("puts the limit itself on line 27a and one cent over it on Form 4562", () => {
    expect(DE_MINIMIS_LIMIT_CENTS).toBe(250_000);
    expect(expenseLine("equipment", 250_000)).toBe("27a:equipment");
    expect(expenseLine("equipment", 250_001)).toBe(FORM_4562_LINE);
    // Only equipment splits: a large supplies row stays on its line.
    expect(expenseLine("supplies", 900_000)).toBe("22");
  });

  it("expenses small equipment on its own 27a row and asks for the election", () => {
    const ws = buildScheduleC({
      ...base,
      expenses: [
        { date: "2026-02-01", category: "equipment", amountCents: 12_999 }, // label printer
        { date: "2026-03-01", category: "equipment", amountCents: 250_000 }, // camera at the limit
        { date: "2025-12-31", category: "equipment", amountCents: 50_000 }, // last year: ignored
      ],
    });
    const row = ws.otherExpenses.find((l) => /de minimis/.test(l.label));
    expect(row?.amountCents).toBe(262_999);
    expect(line(ws, "27a")?.amountCents).toBe(262_999);
    expect(line(ws, "28")?.amountCents).toBe(262_999);
    expect(line(ws, "29")?.amountCents).toBe(1_000_000 - 262_999);
    expect(line(ws, "13")).toBeUndefined();
    expect(ws.equipment).toMatchObject({
      deMinimisCount: 2,
      deMinimisCents: 262_999,
      form4562Count: 0,
    });
    const w = ws.warnings.find((x) => x.includes(DE_MINIMIS_ELECTION_TITLE));
    expect(w).toMatch(
      /^2 equipment purchases of \$2500\.00 or less \(\$2629\.99 in all\) are on line 27a/,
    );
    expect(w).toMatch(/taxpayer identification number/);
  });

  it("leaves equipment over the limit for Form 4562, out of lines 28 to 31", () => {
    const ws = buildScheduleC({
      ...base,
      expenses: [
        { date: "2026-02-01", category: "equipment", amountCents: 289_900 }, // laptop
        { date: "2026-02-02", category: "supplies", amountCents: 4_000 },
      ],
    });
    const l13 = line(ws, "13");
    expect(l13?.amountCents).toBeNull();
    expect(l13?.note).toMatch(
      /1 equipment purchase over \$2500\.00, \$2899\.00 of cost, go on Form 4562/,
    );
    // Line 13 sits after line 10 and before line 15, as on the form.
    const order = ws.lines.map((x) => x.line);
    expect(order.indexOf("13")).toBe(order.indexOf("10") + 1);
    expect(line(ws, "28")?.amountCents).toBe(4_000);
    expect(line(ws, "31")?.amountCents).toBe(1_000_000 - 4_000);
    expect(ws.otherExpenses.find((l) => /de minimis/.test(l.label))).toBeUndefined();
    expect(
      ws.warnings.some((w) =>
        /^1 equipment purchase over \$2500\.00 \(\$2899\.00 in all\) is not on this worksheet/.test(
          w,
        ),
      ),
    ).toBe(true);
    expect(ws.warnings.some((w) => w.includes(DE_MINIMIS_ELECTION_TITLE))).toBe(false);
  });

  it("flags a large office, supplies or other row that may be equipment, without moving it", () => {
    const ws = buildScheduleC({
      ...base,
      expenses: [
        { date: "2026-02-01", category: "office", amountCents: 310_000 },
        { date: "2026-02-02", category: "repairs", amountCents: 400_000 }, // repairs are not flagged
        { date: "2026-02-03", category: "supplies", amountCents: 250_000 }, // at the limit: not flagged
      ],
    });
    expect(line(ws, "18")?.amountCents).toBe(310_000);
    expect(ws.equipment).toMatchObject({ largeOtherCount: 1, largeOtherCents: 310_000 });
    expect(
      ws.warnings.some((w) =>
        /^1 expense over \$2500\.00 \(\$3100\.00 in all\) is filed as office/.test(w),
      ),
    ).toBe(true);
  });

  it("reports no equipment when there is none", () => {
    const ws = buildScheduleC({
      ...base,
      expenses: [{ date: "2026-02-01", category: "supplies", amountCents: 4_000 }],
    });
    expect(ws.equipment).toBeNull();
    expect(ws.warnings).toEqual([]);
  });

  it("names line 13 (Form 4562) in the expense list and notes the election", () => {
    const row = (category: "equipment", amountCents: number, vendor: string) => ({
      date: "2026-02-01",
      category,
      amountCents,
      vendor,
      memo: null,
      platform: null,
    });
    const list = expenseList(
      2026,
      [row("equipment", 289_900, "Laptop"), row("equipment", 12_999, "Printer")],
      {
        category: (c) => c,
        platform: (p) => p,
      },
    );
    const rows = parseCsv(toCsv(list.rows));
    const header = rows.findIndex((r) => r[0] === "Date");
    const lines = Object.fromEntries(rows.slice(header + 1, header + 3).map((r) => [r[1], r[3]]));
    expect(lines).toEqual({ Laptop: "13 (Form 4562)", Printer: "27a" });
    const note = rows.find((r) => String(r[0]).startsWith("Equipment of $2500.00"));
    expect(note?.[0]).toContain(DE_MINIMIS_ELECTION_TITLE);
    expect(note?.[0]).toContain("1 over that ($2899.00) is for Form 4562");
  });
});
