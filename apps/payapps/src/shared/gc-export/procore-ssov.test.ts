import { describe, expect, it } from "vitest";
import { parseCsv } from "../sov-import/csv";
import { fillSsov, readSsovTemplate, type SsovLine, suggestPositions } from "./procore-ssov";

// Column names as Procore's help page lists them; the GC's own export may add others, which we keep.
const HEADER =
  "SOV Position Number,Budget Code,SOV Description,SOV Amount,Subcontractor SOV Description,Subcontractor SOV Amount";

function template(text: string) {
  const r = readSsovTemplate(text);
  if (!r.ok) throw new Error(r.error);
  return r.template;
}

const lines: SsovLine[] = [
  { id: "a", description: "Rough-in, level 1", cents: 4_000_000 },
  { id: "b", description: "Rough-in, level 2", cents: 3_500_000 },
  { id: "c", description: "Trim and devices", cents: 2_500_000 },
];

describe("readSsovTemplate", () => {
  it("reads positions, GC amounts and descriptions", () => {
    const t = template(
      `${HEADER}\r\n1,26-100 - Electrical,Electrical rough,75000,,0.00\r\n2,26-500 - Lighting,Fixtures and trim,"25,000.00",,0.00\r\n`,
    );
    expect(t.delimiter).toBe(",");
    expect(t.positions.map((p) => [p.position, p.description, p.amountCents])).toEqual([
      ["1", "Electrical rough", 7_500_000],
      ["2", "Fixtures and trim", 2_500_000],
    ]);
    expect(t.col).toEqual({ position: 0, subDescription: 4, subAmount: 5 });
  });

  it("keeps a semicolon delimiter and a BOM-led header", () => {
    const t = template(`\ufeff${HEADER.replaceAll(",", ";")}\n1;;Work;100;;0.00\n`);
    expect(t.delimiter).toBe(";");
    expect(t.positions).toHaveLength(1);
  });

  it("collapses detail rows already in the template to one per position", () => {
    const t = template(`${HEADER}\n1,,Work,100,Old A,60\n1,,Work,100,Old B,40\n2,,Other,50,,0\n`);
    expect(t.positions.map((p) => p.position)).toEqual(["1", "2"]);
  });

  it("refuses a file that is not the SSOV template", () => {
    const r = readSsovTemplate("Item,Description,Scheduled Value\n1,Rough-in,1000\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Download CSV Template/);
  });

  it("refuses an empty file and a template with no positions", () => {
    expect(readSsovTemplate("").ok).toBe(false);
    expect(readSsovTemplate(`${HEADER}\n`).ok).toBe(false);
  });
});

describe("suggestPositions", () => {
  it("puts every line under the only position", () => {
    const t = template(`${HEADER}\n1,,Electrical,100000,,0.00\n`);
    expect(suggestPositions(t, lines)).toEqual({ a: "1", b: "1", c: "1" });
  });

  it("matches on a unique amount, then on shared words, and leaves the rest", () => {
    const t = template(
      `${HEADER}\n1,,Electrical rough-in,75000,,0\n2,,Devices and trim,25000,,0\n3,,Fire alarm,10000,,0\n`,
    );
    const s = suggestPositions(t, [
      ...lines,
      { id: "d", description: "Temporary power", cents: 123 },
    ]);
    expect(s).toEqual({ a: "1", b: "1", c: "2" });
  });
});

describe("fillSsov", () => {
  it("writes one row per line under its position, keeping every GC cell and the column order", () => {
    const text = `${HEADER}\r\n1,26-100 - Electrical,Electrical rough,75000,,0.00\r\n2,26-500 - Lighting,"Fixtures, trim",25000,,0.00\r\n3,26-900 - Alarm,Fire alarm,10000,,0.00\r\n`;
    const t = template(text);
    const f = fillSsov(t, lines, { a: "1", b: "1", c: "2" });
    const out = parseCsv(f.csv).filter((r) => r.length);
    expect(out[0]).toEqual(HEADER.split(","));
    expect(out.slice(1)).toEqual([
      ["1", "26-100 - Electrical", "Electrical rough", "75000", "Rough-in, level 1", "40000.00"],
      ["1", "26-100 - Electrical", "Electrical rough", "75000", "Rough-in, level 2", "35000.00"],
      ["2", "26-500 - Lighting", "Fixtures, trim", "25000", "Trim and devices", "25000.00"],
      ["3", "26-900 - Alarm", "Fire alarm", "10000", "", "0.00"],
    ]);
    expect(f.csv).toContain('"Rough-in, level 1",40000.00\r\n');
    expect(f.checks).toEqual([
      {
        position: "1",
        description: "Electrical rough",
        gcCents: 7_500_000,
        subCents: 7_500_000,
        lines: 2,
      },
      {
        position: "2",
        description: "Fixtures, trim",
        gcCents: 2_500_000,
        subCents: 2_500_000,
        lines: 1,
      },
      { position: "3", description: "Fire alarm", gcCents: 1_000_000, subCents: 0, lines: 0 },
    ]);
    expect(f.unplaced).toEqual([]);
  });

  it("never writes commas, dollar signs or blanks in the amount, and uses the template's delimiter", () => {
    const t = template(`${HEADER.replaceAll(",", ";")}\n1;;Work;1.234.567,89;;\n`);
    expect(t.positions[0]?.amountCents).toBe(123_456_789);
    const f = fillSsov(t, [{ id: "x", description: "Big; line", cents: 123_456_789 }], { x: "1" });
    expect(f.csv.split("\r\n")[1]).toBe('1;;Work;1.234.567,89;"Big; line";1234567.89');
  });

  it("reports lines placed nowhere or under a position the template does not have", () => {
    const t = template(`${HEADER}\n1,,Work,100,,0\n`);
    const f = fillSsov(t, lines, { a: "1", b: "9" });
    expect(f.unplaced.map((l) => l.id)).toEqual(["b", "c"]);
  });

  it("keeps rows above the header and columns Procore's page does not list", () => {
    const t = template(
      `Commitment SC-004\nSOV Position Number,Cost Type,SOV Description,SOV Amount,Subcontractor SOV Amount,Notes\n1,L,Work,100,0.00,keep me\n`,
    );
    expect(t.col.subDescription).toBeNull();
    const f = fillSsov(t, [{ id: "x", description: "Labor", cents: 10_000 }], { x: "1" });
    expect(f.csv).toBe(
      "Commitment SC-004\r\nSOV Position Number,Cost Type,SOV Description,SOV Amount,Subcontractor SOV Amount,Notes\r\n1,L,Work,100,100.00,keep me\r\n",
    );
  });
});
