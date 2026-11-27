import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findSov,
  importSovFile,
  type OpeningTargetLine,
  openingFromImport,
  overScheduled,
  parseCsv,
  placeUnmatched,
  readDate,
} from ".";
import { lineRetainage } from "./opening";
import { readRateBps } from "./schedule";

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};
const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));

// The job as PayApps holds it after the SOV import and CO-1 entered as a change order adding a line.
const job: OpeningTargetLine[] = [
  { id: "l1", itemNumber: "1", description: "Mobilization", currentCents: 1_250_000 },
  { id: "l2", itemNumber: "2", description: "Underground conduit", currentCents: 4_825_075 },
  { id: "l3", itemNumber: "3", description: "Switchgear", currentCents: 9_600_000 },
  { id: "l4", itemNumber: "4", description: "Branch wiring", currentCents: 7_340_000 },
  { id: "l5", itemNumber: "CO-1", description: "Added EV chargers", currentCents: 1_890_000 },
];

describe("opening balance from the last continuation sheet", () => {
  it("LibreOffice-saved G703: D + E per line, the change-order row too, line 6 from G less retainage", async () => {
    const sheet = ok(await importSovFile("Pay App 7.xlsx", fixture("libreoffice-g703.xlsx")));
    expect(sheet.applicationNumber).toBe(7);
    expect(sheet.billingColumns).toEqual(["D", "E", "F", "G", "retainage"]);
    const f = ok(openingFromImport(sheet, job));
    expect(f.completed).toEqual({
      l1: 1_250_000,
      l2: 3_912_525,
      l3: 0, // $41,000 is stored, not completed
      l4: 3_670_000, // G $40,200 less $3,500 stored
      l5: 630_000,
    });
    expect(f.matched.map((m) => m.by)).toEqual(["item", "item", "item", "item", "item"]);
    expect(f.unmatched).toEqual([]);
    expect(f.missing).toEqual([]);
    expect(f.sheetCompletedCents).toBe(9_462_525);
    expect(f.storedCents).toBe(4_450_000);
    expect(f.line6Cents).toBe(13_912_525 - 1_391_253); // the sheet's G total less its retainage total
    expect(f.line5aCents).toBeNull(); // the retainage column includes stored materials
    expect(f.checks).toEqual([]);
    expect(f.notes.join(" ")).toMatch(/\$44,500.00 of materials presently stored .* not carried/);
    expect(f.notes.join(" ")).toMatch(/period end was not found/);
  });

  it("CSV with only G and F: work completed is G less F; title block gives number and period", () => {
    const csv = [
      "Application No: 3",
      "Period to,,10/31/2026",
      "Item,Description,Scheduled value,Materials stored,Total completed and stored to date,Retainage",
      "01,Rough-in,10000,0,6000,600",
      "02,Fixtures,5000,1000,1000,100",
      "Total,,15000,1000,7000,700",
    ].join("\n");
    const sheet = ok(findSov(parseCsv(csv)));
    expect(sheet.applicationNumber).toBe(3);
    expect(sheet.periodTo).toBe("2026-10-31");
    const f = ok(
      openingFromImport(sheet, [
        { id: "a", itemNumber: "1", description: "Rough in", currentCents: 1_000_000 },
        { id: "b", itemNumber: "2", description: "Fixtures", currentCents: 500_000 },
      ]),
    );
    expect(f.completed).toEqual({ a: 600_000, b: 0 });
    expect(f.line6Cents).toBe(630_000);
    expect(f.line5aCents).toBeNull();
  });

  it("nothing stored: line 5a is the retainage column", () => {
    const csv = [
      "Item,Description,Scheduled value,Previous,This period,Retainage",
      "1,Site work,20000,5000,5000,1000",
      "2,Paving,30000,0,10000,1000",
    ].join("\n");
    const f = ok(
      openingFromImport(ok(findSov(parseCsv(csv))), [
        { id: "a", itemNumber: "1", description: "Site work", currentCents: 2_000_000 },
        { id: "b", itemNumber: "2", description: "Paving", currentCents: 3_000_000 },
      ]),
    );
    expect(f.completed).toEqual({ a: 1_000_000, b: 1_000_000 });
    expect(f.line5aCents).toBe(200_000);
    expect(f.line6Cents).toBe(1_800_000);
  });

  it("matches by description when item numbers differ; lists what it cannot place, never guesses", () => {
    const csv = [
      "Item,Description,Scheduled value,Previous,This period",
      "A,Framing,10000,2000,1000",
      "B,Drywall,8000,0,500",
      "C,Paint,4000,0,0",
      "D,Trim,3000,300,0",
      "E,Trim,3000,0,200",
    ].join("\n");
    const f = ok(
      openingFromImport(ok(findSov(parseCsv(csv))), [
        { id: "f", itemNumber: "10", description: "framing", currentCents: 1_000_000 },
        { id: "d", itemNumber: "20", description: "Drywall", currentCents: 700_000 },
        { id: "t", itemNumber: "30", description: "Trim", currentCents: 600_000 },
        { id: "x", itemNumber: "40", description: "Cleanup", currentCents: 100_000 },
      ]),
    );
    expect(f.matched.map((m) => [m.sovLineId, m.by, m.completedCents])).toEqual([
      ["f", "description", 300_000],
      ["d", "description", 50_000],
    ]);
    // Two "Trim" rows and one Trim line: neither is picked. Paint has no work, so nothing is lost.
    expect(f.unmatched.map((u) => [u.label, u.reason])).toEqual([
      ["D Trim", "ambiguous"],
      ["E Trim", "ambiguous"],
    ]);
    expect(f.completed).toEqual({ f: 300_000, d: 50_000, t: 0, x: 0 });
    expect(f.missing.map((m) => m.sovLineId)).toEqual(["t", "x"]);
    const text = f.checks.map((c) => c.message).join(" ");
    expect(text).toMatch(/2 rows with work on them did not match/);
    expect(text).toMatch(/Drywall: \$8,000.00 on the sheet, \$7,000.00 here/);
    expect(f.notes.join(" ")).toMatch(/no retainage column/);
  });

  it("the contractor places an unmatched row on a line: added on top, moved or taken off again, never below zero", () => {
    const job: OpeningTargetLine[] = [
      { id: "t", itemNumber: "30", description: "Trim", currentCents: 60_000 },
      { id: "x", itemNumber: "40", description: "Cleanup", currentCents: 10_000 },
    ];
    // The two ambiguous "Trim" rows above ($300 and $200): both belong on the one Trim line.
    let c = placeUnmatched({ t: 0, x: 0 }, 30_000, null, "t");
    c = placeUnmatched(c, 20_000, null, "t");
    expect(c).toEqual({ t: 50_000, x: 0 });
    expect(overScheduled(c, job)).toEqual([]);
    // Moved to the wrong line, the amount leaves Trim and lands on Cleanup, which is now over its value.
    c = placeUnmatched(c, 20_000, "t", "x");
    expect(c).toEqual({ t: 30_000, x: 20_000 });
    expect(overScheduled(c, job)).toEqual(["40 Cleanup: $200.00 completed of $100.00"]);
    // Taken off after the contractor typed Cleanup down by hand: clamped at $0.00, Trim untouched.
    c = placeUnmatched({ ...c, x: 5_000 }, 20_000, "x", null);
    expect(c).toEqual({ t: 30_000, x: 0 });
    // Same line, zero or no amount, or a line not on this job: nothing changes.
    expect(placeUnmatched(c, 20_000, "t", "t")).toEqual(c);
    expect(placeUnmatched(c, 0, null, "t")).toEqual(c);
    expect(placeUnmatched(c, 1_000, null, "nope")).toEqual(c);
  });

  it("flags work above a line's value, a renamed item, D + E + F not equal to G, and unreadable cells", () => {
    const csv = [
      "Item,Description,Scheduled value,Previous,This period,Stored,Total completed and stored to date",
      "1,Excavation,5000,4000,2000,0,6000",
      "2,Footings,6000,1000,1000,0,2500",
      "3,Walls,9000,abc,0,0,0",
    ].join("\n");
    const f = ok(
      openingFromImport(ok(findSov(parseCsv(csv))), [
        { id: "a", itemNumber: "1", description: "Excavation", currentCents: 500_000 },
        { id: "b", itemNumber: "2", description: "Foundations", currentCents: 600_000 },
        { id: "c", itemNumber: "3", description: "Walls", currentCents: 900_000 },
      ]),
    );
    expect(f.completed).toEqual({ a: 600_000, b: 200_000, c: 0 });
    expect(f.unmatched).toEqual([
      { source: "line 4", label: "3 Walls", completedCents: null, reason: "no_match" },
    ]);
    const text = f.checks.map((c) => `${c.severity}: ${c.message}`).join("\n");
    expect(text).toMatch(
      /high: 1 billing cell was not read, so work completed on its line is left for you to enter: line 4 is not a dollar amount/,
    );
    expect(text).toMatch(
      /high: More work completed than .*1 Excavation: \$6,000.00 completed of \$5,000.00/,
    );
    expect(text).toMatch(/medium: .*item 2 is "Footings" on the sheet and "Foundations" here/);
    expect(text).toMatch(/2 Footings \(line 3\): D \+ E \+ F = \$2,000.00, G = \$2,500.00/);
  });

  it("refuses a sheet with no billing columns and a job with no lines", () => {
    const bid = ok(findSov(parseCsv("Item,Description,Amount\n1,Framing,1000")));
    const r = openingFromImport(bid, job);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/no billing columns/);
    const sheet = ok(findSov(parseCsv("Item,Description,Scheduled value,Previous\n1,X,10,5")));
    expect(openingFromImport(sheet, []).ok).toBe(false);
  });

  it("reads period dates in the forms spreadsheets hold them", () => {
    expect(readDate("2026-10-31")).toBe("2026-10-31");
    expect(readDate("2026-10-31T00:00:00")).toBe("2026-10-31");
    expect(readDate("10/31/2026")).toBe("2026-10-31");
    expect(readDate("46326")).toBe("2026-10-31"); // Excel serial day
    expect(readDate("2/30/2026")).toBeNull();
    expect(readDate("7")).toBeNull();
    expect(readDate("October")).toBeNull();
  });
});

// The free template the public site gives away (pay-app-guides), as its generator writes it: D, E and F typed in,
// G and the retainage column formulas with no saved result, retainage rates in the title block.
describe("the public template's filled example (test/fixtures/README.md)", () => {
  const templateJob: OpeningTargetLine[] = [
    {
      id: "t1",
      itemNumber: "1",
      description: "Mobilization and general conditions",
      currentCents: 1_200_000,
    },
    { id: "t2", itemNumber: "2", description: "Underground conduit", currentCents: 4_000_000 },
    {
      id: "t3",
      itemNumber: "3",
      description: "Switchgear (stored on site)",
      currentCents: 6_000_000,
    },
    {
      id: "t4",
      itemNumber: "4",
      description: "Branch wiring and devices",
      currentCents: 3_800_000,
    },
    { id: "t5", itemNumber: "5", description: "Added EV charger circuits", currentCents: 850_000 },
  ];
  it("fills every line, and line 6 from the title block's rates; uncalculated formulas are one note, not a warning", async () => {
    const sheet = ok(await importSovFile("sov.xlsx", fixture("schedule-of-values-example.xlsx")));
    expect([sheet.retainageWorkBps, sheet.retainageStoredBps]).toEqual([1000, 1000]);
    const f = ok(openingFromImport(sheet, templateJob));
    expect(f.completed).toEqual({
      t1: 800_000,
      t2: 3_000_000,
      t3: 1_500_000,
      t4: 760_000,
      t5: 425_000,
    });
    expect(f.checks).toEqual([]);
    // Line 4 = D + E + F = $79,850; retainage 10% per line: 800 + 3,000 + (1,500 + 1,500) + 760 + 425 = $7,985.
    expect(f.line6Cents).toBe(7_186_500);
    expect(f.line5aCents).toBeNull(); // $15,000 stored: 5a and 5b not split
    expect([f.applicationNumber, f.periodTo]).toEqual([3, "2026-10-31"]);
    const notes = f.notes.join("\n");
    expect(notes).toMatch(
      /10 formula cells have no saved result \(cell G10; cell J10; cell G11; cell J11; and 6 more\)/,
    );
    expect(notes).toMatch(
      /Retainage \(line 5, \$7,985.00\) was worked out from the rates .*10% on work, 10% on stored materials/,
    );
    expect(notes).not.toMatch(/no retainage column/);
  });
  it("a saved retainage column wins over the title block's rates", () => {
    const csv = [
      "Retainage on work %,5",
      "Application no.,2",
      "Item,Description,Scheduled value,Previous,This period,Retainage",
      "1,Excavation,5000,1000,1000,150",
    ].join("\n");
    const f = ok(
      openingFromImport(ok(findSov(parseCsv(csv))), [
        { id: "a", itemNumber: "1", description: "Excavation", currentCents: 500_000 },
      ]),
    );
    expect(f.line6Cents).toBe(200_000 - 15_000);
    expect(f.line5aCents).toBe(15_000);
    expect(f.notes.join(" ")).not.toMatch(/worked out from the rates/);
  });
  it("text in G is a medium check when D and E gave the work; rates fill line 6 with nothing stored", () => {
    const csv = [
      "Retainage on work (%),10%",
      "Item,Description,Scheduled value,Previous,This period,Total completed to date",
      "1,Excavation,5000,1000,1000,see note",
    ].join("\n");
    const f = ok(
      openingFromImport(ok(findSov(parseCsv(csv))), [
        { id: "a", itemNumber: "1", description: "Excavation", currentCents: 500_000 },
      ]),
    );
    expect(f.completed).toEqual({ a: 200_000 });
    expect(f.checks.map((c) => c.severity)).toEqual(["medium"]);
    expect(f.checks[0]?.message).toMatch(
      /line 3 is not a dollar amount.*Work completed still came from columns D and E/,
    );
    expect(f.line6Cents).toBe(180_000);
    expect(f.line5aCents).toBe(20_000);
  });
  it("rates and rounding read the way the template's formula does", () => {
    expect(["10", "10%", "0.1", "7.5", "0.075", "100", "120", "ten"].map(readRateBps)).toEqual([
      1000,
      1000,
      1000,
      750,
      750,
      10_000,
      null,
      null,
    ]);
    expect(lineRetainage(12_345, 0, 1000, 1000)).toBe(1_235); // $12.345 rounds half up to $12.35
    expect(lineRetainage(-12_345, 0, 1000, 1000)).toBe(-1_235); // deductive change order
    expect(lineRetainage(100_000, 50_000, 500, 1000)).toBe(10_000);
  });
});
