import { describe, expect, it } from "vitest";
import {
  fillTextura,
  readTexturaGrid,
  readTexturaTemplate,
  suggestTexturaMatches,
  type TexturaLine,
} from "./textura-billing";

const line = (
  id: string,
  item: string,
  description: string,
  c: number,
  e: number,
  stored: number | null = 0,
): TexturaLine => ({
  sovLineId: id,
  itemNumber: item,
  description,
  scheduledValueCents: c,
  workThisPeriodCents: e,
  newStoredCents: stored,
});

const TEMPLATE = [
  "Project,Riverside Clinic",
  "",
  "Phase Code,Description,Budget Amount,Retention % This Period,Work This Period,Material Stored This Period",
  "01-100,Mobilization,5000.00,10,0.00,0.00",
  '16-100,Rough-in,"40,000.00",10,0.00,0.00',
  "16-200,Fixtures,25000.00,10,0.00,0.00",
  "Total,,70000.00,,0.00,0.00",
].join("\r\n");

const lines = [
  line("a", "1", "Mobilization", 500_000, 500_000),
  line("b", "2", "Rough-in", 4_000_000, 1_200_000, 300_000),
  line("c", "3", "Fixtures", 2_500_000, 0, null),
];

describe("readTexturaTemplate", () => {
  it("finds the header under a preamble and the columns by Textura's field names", () => {
    const r = readTexturaTemplate(TEMPLATE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.template.preamble).toHaveLength(2);
    expect(r.template.col).toEqual({ phase: 0, description: 1, budget: 2, work: 4, material: 5 });
    expect(r.template.rows.map((x) => x.phase)).toEqual(["01-100", "16-100", "16-200"]);
    expect(r.template.rows[1]?.budgetCents).toBe(4_000_000);
    expect(r.template.looksToDate).toBe(false);
  });

  it("keeps a semicolon delimiter and flags a To Date template", () => {
    const r = readTexturaTemplate(
      "Cost Code;Description;Scheduled Value;Completed To Date\n1;Mobilization;5000,00;0\n",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.template.delimiter).toBe(";");
    expect(r.template.col.work).toBeNull();
    expect(r.template.looksToDate).toBe(true);
    expect(r.template.rows[0]?.budgetCents).toBe(500_000);
  });

  it("refuses a file that is not a billing template, and an empty one", () => {
    expect(readTexturaTemplate("")).toEqual({ ok: false, error: "The file is empty." });
    const r = readTexturaTemplate("a,b\n1,2\n");
    expect(r.ok).toBe(false);
    const none = readTexturaGrid([["Phase Code", "Description", "Work This Period"]]);
    expect(none.ok).toBe(false);
  });

  it("does not take retention, previous or net columns for the work column", () => {
    const r = readTexturaGrid([
      [
        "Description",
        "Retention This Period",
        "Net This Period",
        "Previous Work This Period",
        "This Period Billing",
      ],
      ["Mobilization", "", "", "", ""],
    ]);
    expect(r.ok && r.template.col.work).toBe(4);
  });
});

describe("suggestTexturaMatches", () => {
  it("matches by phase code = item number, then description, then a unique budget", () => {
    const t = {
      rows: [
        { index: 0, phase: "1", description: "Something else", budgetCents: null },
        { index: 1, phase: "", description: "2 Rough-in", budgetCents: null },
        { index: 2, phase: "X", description: "Plumbing fixtures", budgetCents: 2_500_000 },
      ],
    };
    expect(suggestTexturaMatches(t, lines)).toEqual({ 0: "a", 1: "b", 2: "c" });
  });

  it("leaves a row out when two lines, or two rows, would fit", () => {
    const twins = [line("a", "", "Labor", 100_000, 0), line("b", "", "Labor", 100_000, 0)];
    const t = { rows: [{ index: 0, phase: "", description: "Labor", budgetCents: 100_000 }] };
    expect(suggestTexturaMatches(t, twins)).toEqual({});
    const rows = {
      rows: [
        { index: 0, phase: "", description: "", budgetCents: 500_000 },
        { index: 1, phase: "", description: "", budgetCents: 500_000 },
      ],
    };
    expect(suggestTexturaMatches(rows, [line("a", "", "Mob", 500_000, 0)])).toEqual({});
  });
});

describe("fillTextura", () => {
  const read = () => {
    const r = readTexturaTemplate(TEMPLATE);
    if (!r.ok) throw new Error(r.error);
    return r.template;
  };

  it("writes work and new stored materials as plain numbers and keeps every other cell", () => {
    const t = read();
    const match = suggestTexturaMatches(t, lines);
    const f = fillTextura(t, t.col, lines, match);
    expect(f.blocking).toEqual([]);
    expect(f.csv).toBe(
      [
        "Project,Riverside Clinic",
        "",
        "Phase Code,Description,Budget Amount,Retention % This Period,Work This Period,Material Stored This Period",
        "01-100,Mobilization,5000.00,10,5000.00,0.00",
        '16-100,Rough-in,"40,000.00",10,12000.00,3000.00',
        "16-200,Fixtures,25000.00,10,0.00,0.00",
        "Total,,70000.00,,0.00,0.00",
        "",
      ].join("\r\n"),
    );
    expect(f.totals).toEqual({ workCents: 1_700_000, materialCents: 300_000 });
    // Fixtures' stored materials cannot be told: its cell is left as the template had it.
    expect(f.materialUnknown.map((l) => l.sovLineId)).toEqual(["c"]);
    expect(f.missingLines).toEqual([]);
    expect(f.budgetMismatches).toEqual([]);
  });

  it("names unmatched rows, lines billed but on no row, and budgets that differ", () => {
    const t = read();
    const f = fillTextura(
      t,
      t.col,
      [line("a", "1", "Mobilization", 600_000, 100), line("b", "9", "Extra", 1, 200)],
      { 0: "a" },
    );
    expect(f.unmatchedRows.map((r) => r.phase)).toEqual(["16-100", "16-200"]);
    expect(f.missingLines.map((l) => l.sovLineId)).toEqual(["b"]);
    expect(f.budgetMismatches.map((m) => m.line.sovLineId)).toEqual(["a"]);
  });

  it("blocks the file without a work column, or with a line on two rows", () => {
    const t = read();
    const noWork = fillTextura(t, { ...t.col, work: null }, lines, {});
    expect(noWork.csv).toBeNull();
    expect(noWork.blocking[0]).toMatch(/Work This Period/);
    const twice = fillTextura(t, t.col, lines, { 0: "a", 1: "a" });
    expect(twice.csv).toBeNull();
    expect(twice.blocking[0]).toMatch(/2 rows/);
  });

  it("uses a column the person chose, and totals stored materials with no column for them", () => {
    const t = read();
    const f = fillTextura(t, { ...t.col, work: 5, material: null }, lines, { 1: "b" });
    expect(f.csv?.split("\r\n")[4]).toBe('16-100,Rough-in,"40,000.00",10,0.00,12000.00');
    expect(f.materialWithoutColumnCents).toBe(300_000);
  });

  it("writes a credit as a negative number and quotes cells holding the delimiter", () => {
    const r = readTexturaTemplate('Phase Code;Description;Work This Period\n1;"Mob; sub";0\n');
    if (!r.ok) throw new Error(r.error);
    const f = fillTextura(r.template, r.template.col, [line("a", "1", "Mob; sub", 1, -2_550)], {
      0: "a",
    });
    expect(f.csv).toBe('Phase Code;Description;Work This Period\r\n1;"Mob; sub";-25.50\r\n');
  });
});
