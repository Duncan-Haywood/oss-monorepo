import { describe, expect, it } from "vitest";
import { importSovFile, openingFromImport } from "../../../shared/sov-import";
import { readXlsx, unzip } from "../../../shared/sov-import/xlsx";
import type { ApplicationDocumentData } from "./model";
import { CONTINUATION_SHEET, payApplicationXlsx, SUMMARY_SHEET } from "./xlsx";

// A second application on a two-line job with stored materials, a change order and 10% retainage.
const line = (
  id: string,
  itemNumber: string,
  description: string,
  c: number,
  d: number,
  e: number,
  f: number,
) => {
  const g = d + e + f;
  return {
    sovLineId: id,
    itemNumber,
    description,
    scheduledValueCents: c,
    fromPreviousCents: d,
    thisPeriodCents: e,
    storedMaterialsCents: f,
    completedAndStoredCents: g,
    percentCompleteBps: c === 0 ? null : Math.round((g * 10_000) / c),
    balanceToFinishCents: c - g,
    retainageCents: Math.round(g / 10),
    retainageReleasedThisPeriodCents: 0,
    retainageRateBps: null,
  };
};

function sample(
  overrides: Partial<ApplicationDocumentData["project"]> = {},
): ApplicationDocumentData {
  const lines = [
    line("l1", "01", "Rough-in & conduit <level 1>", 4_000_000, 1_000_000, 1_500_000, 250_000),
    line("l2", "CO-1", "=Added EV chargers", 1_000_000, 0, 400_000, 0),
  ];
  const sumOf = (k: keyof (typeof lines)[number]) =>
    lines.reduce((s, l) => s + (l[k] as number), 0);
  const g = sumOf("completedAndStoredCents");
  const ret = sumOf("retainageCents");
  return {
    contractor: { name: "Volt & Sons Electric" },
    project: {
      name: "Clinic fit-out",
      number: "P-101",
      location: null,
      gcName: "Builder Co",
      gcAddress: null,
      ownerName: null,
      architectName: null,
      contractDate: null,
      ...overrides,
    },
    payApp: {
      number: 2,
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      applicationDate: "2026-10-25",
      status: "draft",
    },
    computed: {
      periodId: "p2",
      number: 2,
      lines,
      totals: {
        scheduledValueCents: sumOf("scheduledValueCents"),
        fromPreviousCents: sumOf("fromPreviousCents"),
        thisPeriodCents: sumOf("thisPeriodCents"),
        storedMaterialsCents: sumOf("storedMaterialsCents"),
        completedAndStoredCents: g,
        balanceToFinishCents: sumOf("balanceToFinishCents"),
        retainageCents: ret,
      },
      summary: {
        originalContractSumCents: 4_000_000,
        netChangeByChangeOrdersCents: 1_000_000,
        contractSumToDateCents: 5_000_000,
        totalCompletedAndStoredCents: g,
        retainageOnCompletedWorkCents: ret - 25_000,
        retainageOnStoredMaterialsCents: 25_000,
        totalRetainageCents: ret,
        totalEarnedLessRetainageCents: g - ret,
        lessPreviousCertificatesCents: 900_000,
        currentPaymentDueCents: g - ret - 900_000,
        balanceToFinishIncludingRetainageCents: 5_000_000 - (g - ret),
        retainagePctBps: 1000,
        storedRetainagePctBps: 1000,
        lineRates: [],
        changeOrders: {
          previousAdditionsCents: 0,
          previousDeductionsCents: 0,
          thisPeriodAdditionsCents: 1_000_000,
          thisPeriodDeductionsCents: 0,
          netChangeCents: 1_000_000,
        },
      },
      warnings: [],
    },
  };
}

const xmlOf = async (book: Uint8Array, name: string) => {
  const f = unzip(book).get(name);
  if (!f) throw new Error(`missing ${name}`);
  return new TextDecoder().decode(await f());
};

describe("pay application workbook", () => {
  it("has the summary and the continuation sheet, read back with PayApps' figures", async () => {
    const book = payApplicationXlsx(sample());
    const sheets = await readXlsx(book);
    expect(sheets.map((s) => s.name)).toEqual([SUMMARY_SHEET, CONTINUATION_SHEET]);
    const summary = sheets[0]?.grid ?? [];
    const value = (label: string) => summary.find((r) => r[0]?.startsWith(label))?.[1];
    expect(value("4. Total completed")).toBe("31500");
    expect(value("5. Total retainage")).toBe("3150");
    expect(value("6. Total earned")).toBe("28350");
    expect(value("8. Current payment due")).toBe("19350");
    expect(value("9. Balance to finish")).toBe("21650");
    const cont = sheets[1]?.grid ?? [];
    const row1 = cont.find((r) => r[0] === "01");
    // G, % (a percent format reads back as a percentage), H.
    expect(row1?.slice(2, 9)).toEqual([
      "40000",
      "10000",
      "15000",
      "2500",
      "27500",
      "68.75%",
      "12500",
    ]);
    // Text that looks like a formula stays text, and markup stays literal.
    expect(cont.find((r) => r[0] === "CO-1")?.[1]).toBe("=Added EV chargers");
    expect(row1?.[1]).toBe("Rough-in & conduit <level 1>");
    expect(cont.find((r) => r[1] === "TOTALS")?.slice(2, 7)).toEqual([
      "50000",
      "10000",
      "19000",
      "2500",
      "31500",
    ]);
  });

  it("writes the sums as live formulas and line 4 points at the continuation sheet's total", async () => {
    const book = payApplicationXlsx(sample());
    const cont = await xmlOf(book, "xl/worksheets/sheet2.xml");
    expect(cont).toMatch(/<c r="G9"[^>]*><f>D9\+E9\+F9<\/f><v>27500<\/v><\/c>/);
    expect(cont).toMatch(/<c r="I9"[^>]*><f>C9-G9<\/f><v>12500<\/v><\/c>/);
    expect(cont).toMatch(/<c r="G11"[^>]*><f>SUM\(G9:G10\)<\/f><v>31500<\/v><\/c>/);
    const sum = await xmlOf(book, "xl/worksheets/sheet1.xml");
    expect(sum).toContain("<f>'Continuation sheet'!G11</f><v>31500</v>");
    expect(await xmlOf(book, "xl/workbook.xml")).toContain('fullCalcOnLoad="1"');
  });

  it("writes PayApps' figure, not a formula, where the two would disagree", async () => {
    const data = sample();
    const l = data.computed.lines[0];
    if (!l) throw new Error("no line");
    l.completedAndStoredCents += 1; // as if the stored figure were off by a cent
    const cont = await xmlOf(payApplicationXlsx(data), "xl/worksheets/sheet2.xml");
    expect(cont).toMatch(/<c r="G9"[^>]*><v>27500.01<\/v><\/c>/);
    expect(cont).not.toContain("D9+E9+F9");
  });

  it("is read back by the app's own last-continuation-sheet import (a job moved to another account)", async () => {
    const sheet = await importSovFile("p-101-payapp-2.xlsx", payApplicationXlsx(sample()));
    if (!sheet.ok) throw new Error(JSON.stringify(sheet));
    expect(sheet.applicationNumber).toBe(2);
    expect(sheet.periodTo).toBe("2026-10-31");
    const fill = openingFromImport(sheet, [
      {
        id: "a",
        itemNumber: "01",
        description: "Rough-in & conduit <level 1>",
        currentCents: 4_000_000,
      },
      { id: "b", itemNumber: "CO-1", description: "=Added EV chargers", currentCents: 1_000_000 },
    ]);
    if (!fill.ok) throw new Error(JSON.stringify(fill));
    expect(fill.completed).toEqual({ a: 2_500_000, b: 400_000 });
  });

  it("marks the sample job on both sheets", async () => {
    const sheets = await readXlsx(payApplicationXlsx(sample({ sample: true })));
    for (const s of sheets) expect(s.grid[0]?.[0]).toBe("SAMPLE DATA - NOT A REAL APPLICATION");
  });
});
