import { describe, expect, it } from "vitest";
import { applyPencil, parsePastedColumn, pencilDiff, pencilNote } from "./pencil-review";

const lines = [
  {
    sovLineId: "a",
    itemNumber: "1",
    description: "Rough-in",
    workThisPeriodCents: 1_000_000,
    storedMaterialsCents: 0,
  },
  {
    sovLineId: "b",
    itemNumber: "2",
    description: "Switchgear",
    workThisPeriodCents: 0,
    storedMaterialsCents: 2_500_000,
  },
  {
    sovLineId: "c",
    itemNumber: "3",
    description: "Trim",
    workThisPeriodCents: 200_000,
    storedMaterialsCents: 0,
  },
];

describe("pencilDiff", () => {
  it("lists what the GC cut, line by line and in total", () => {
    const d = pencilDiff(lines, {
      a: { workThisPeriodCents: 800_000 },
      b: { storedMaterialsCents: 0 },
      c: { workThisPeriodCents: 200_000 },
    });
    expect(d.changedCount).toBe(2);
    expect(d.lines.map((l) => [l.sovLineId, l.changed, l.changeCents])).toEqual([
      ["a", true, -200_000],
      ["b", true, -2_500_000],
      ["c", false, 0],
    ]);
    expect(d.oursTotalCents).toBe(3_700_000);
    expect(d.gcTotalCents).toBe(1_000_000);
    expect(d.changeCents).toBe(-2_700_000);
  });

  it("leaves a line as billed when the GC marked nothing", () => {
    const d = pencilDiff(lines, {});
    expect(d.changedCount).toBe(0);
    expect(d.changeCents).toBe(0);
  });

  it("counts a GC raising a line too", () => {
    const d = pencilDiff(lines, { c: { workThisPeriodCents: 250_000 } });
    expect(d.changeCents).toBe(50_000);
  });
});

describe("applyPencil", () => {
  const entries = {
    a: {
      workThisPeriodCents: 1_000_000,
      storedMaterialsCents: 0,
      retainageReleasedCents: 5_000,
      quantityThisPeriodMilli: 400_000,
    },
    b: {
      workThisPeriodCents: 0,
      storedMaterialsCents: 2_500_000,
      retainageReleasedCents: 0,
      quantityThisPeriodMilli: null,
    },
  };

  it("writes the GC's figures, keeps retainage released, and clears a changed quantity", () => {
    const out = applyPencil(entries, {
      a: { workThisPeriodCents: 800_000 },
      b: { storedMaterialsCents: 1_000_000 },
    });
    expect(out.a).toEqual({
      workThisPeriodCents: 800_000,
      storedMaterialsCents: 0,
      retainageReleasedCents: 5_000,
      quantityThisPeriodMilli: null,
    });
    expect(out.b?.storedMaterialsCents).toBe(1_000_000);
  });

  it("keeps a unit-price quantity when the GC only changed stored materials", () => {
    const out = applyPencil(entries, { a: { storedMaterialsCents: 10_000 } });
    expect(out.a?.quantityThisPeriodMilli).toBe(400_000);
  });

  it("leaves unchanged lines as the same object and adds a line with no entry yet", () => {
    const out = applyPencil(entries, {
      a: { workThisPeriodCents: 1_000_000 },
      z: { workThisPeriodCents: 100 },
    });
    expect(out.a).toBe(entries.a);
    expect(out.z).toEqual({
      workThisPeriodCents: 100,
      storedMaterialsCents: 0,
      retainageReleasedCents: 0,
      quantityThisPeriodMilli: null,
    });
  });
});

describe("parsePastedColumn", () => {
  it("reads amounts, blanks and dashes as billed, and flags text", () => {
    expect(parsePastedColumn("$8,000.00\n\n-\nabc\n1\t2\t(250)\n")).toEqual({
      amounts: [800_000, null, null, null, -25_000],
      badRows: [4],
    });
  });

  it("reads Windows line ends", () => {
    expect(parsePastedColumn("1\r\n2\r\n").amounts).toEqual([100, 200]);
  });
});

describe("pencilNote", () => {
  it("lists each revised line with the figures the contractor entered", () => {
    const diff = pencilDiff(lines, {
      a: { workThisPeriodCents: 800_000 },
      b: { storedMaterialsCents: 0 },
    });
    const text = pencilNote({
      gcContactName: "Dana",
      jobName: "Elm St Clinic",
      applicationNumber: 4,
      periodTo: "2026-11-30",
      reviewedOn: "2026-11-24",
      diff,
      contractorName: "Volt Electric",
    });
    expect(text).toContain("Hi Dana,");
    expect(text).toContain("revised per your pencil review of 2026-11-24:");
    expect(text).toContain("- Item 1 Rough-in: work this period $10,000.00 to $8,000.00");
    expect(text).toContain("- Item 2 Switchgear: stored materials $25,000.00 to $0.00");
    expect(text).not.toContain("Item 3");
    expect(text).toContain("total $10,000.00 (pencil draft: $37,000.00)");
    expect(text.endsWith("Volt Electric")).toBe(true);
  });

  it("says nothing changed when the GC took the pencil as billed", () => {
    const text = pencilNote({
      jobName: "Job",
      applicationNumber: 1,
      periodTo: "2026-11-30",
      diff: pencilDiff(lines, {}),
      contractorName: "Co",
    });
    expect(text.startsWith("Hello,")).toBe(true);
    expect(text).toContain("matches the pencil draft as reviewed; no lines were changed.");
  });
});
