import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findSov, importSovFile, parseCsv, pickSov, readMoney, readXlsx } from ".";
import { colIndex, colName, unzip, xmlText } from "./xlsx";

// ---- a minimal .xlsx writer for fixtures: real deflate, real ZIP directory, CRC-32 filled in ----
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = (CRC[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
async function deflate(bytes: Uint8Array) {
  const s = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zip(entries: Record<string, string>, store = false) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = enc.encode(text);
    const data = store ? raw : await deflate(raw);
    const nm = enc.encode(name);
    const crc = crc32(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, store ? 0 : 8, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, raw.length, true);
    h.setUint16(26, nm.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, store ? 0 : 8, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nm.length, true);
    c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, x) => a + x.length, 0);
  const n = Object.keys(entries).length;
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, n, true);
  e.setUint16(10, n, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)] as BlobPart[];
  return new Uint8Array(await new Blob(all).arrayBuffer());
}
type Cell =
  | string
  | number
  | null
  | { f: string; v?: number }
  | { err: string }
  | { inline: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function workbook(sheets: Record<string, Record<number, Cell[]>>, store = false) {
  const shared: string[] = [];
  const si = (s: string) => {
    let i = shared.indexOf(s);
    if (i < 0) {
      i = shared.length;
      shared.push(s);
    }
    return i;
  };
  const files: Record<string, string> = {};
  const names = Object.keys(sheets);
  names.forEach((name, n) => {
    const rows = Object.entries(sheets[name] ?? {})
      .map(
        ([r, cells]) =>
          `<row r="${r}">${cells
            .map((v, c) => {
              const ref = `${colName(c)}${r}`;
              if (v === null || v === "") return "";
              if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
              if (typeof v === "string") return `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
              if ("f" in v)
                return `<c r="${ref}"><f>${esc(v.f)}</f>${v.v === undefined ? "" : `<v>${v.v}</v>`}</c>`;
              if ("err" in v) return `<c r="${ref}" t="e"><v>${esc(v.err)}</v></c>`;
              return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    files[`xl/worksheets/sheet${n + 1}.xml`] =
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files["xl/workbook.xml"] =
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((nm, n) => `<sheet name="${esc(nm)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] =
    `<?xml version="1.0"?><Relationships>${names.map((_nm, n) => `<Relationship Id="rId${n + 1}" Target="worksheets/sheet${n + 1}.xml"/>`).join("")}</Relationships>`;
  files["xl/sharedStrings.xml"] =
    `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  return zip(files, store);
}
const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("xlsx reader", () => {
  it("column letters round-trip and XML entities decode", () => {
    expect(colIndex("AB12")).toBe(27);
    expect(colName(27)).toBe("AB");
    expect(xmlText("a &amp; b &#65;&#x42; _x0043_")).toBe("a & b AB C");
  });
  it("rejects a non-workbook and an old .xls with what to do", () => {
    expect(() => unzip(new TextEncoder().encode("hello world, this is not a zip"))).toThrow(
      /not an .xlsx/,
    );
    const xls = new Uint8Array(64);
    xls.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => unzip(xls)).toThrow(/old .xls/);
  });
  it("reads stored (uncompressed) entries and inline strings", async () => {
    const wb = await workbook(
      {
        SOV: {
          1: [{ inline: "Item" }, { inline: "Description" }, { inline: "Amount" }],
          2: [1, { inline: "Rough-in" }, 1200],
        },
      },
      true,
    );
    const sheets = await readXlsx(wb);
    expect(sheets[0]?.grid[1]).toEqual(["1", "Rough-in", "1200"]);
  });
});

describe("finding the schedule of values", () => {
  it("reads a plain bid breakdown CSV", () => {
    const r = ok(
      findSov(
        parseCsv(
          [
            "Item,Description,Amount",
            '1,Mobilization,"$5,000.00"',
            "2,Underground conduit,48250.75",
            ",Switchgear,96000",
            'Total,,"$149,250.75"',
          ].join("\r\n"),
        ),
      ),
    );
    expect(r.lines).toEqual([
      { itemNumber: "1", description: "Mobilization", originalCents: 500_000, source: "line 2" },
      {
        itemNumber: "2",
        description: "Underground conduit",
        originalCents: 4_825_075,
        source: "line 3",
      },
      { itemNumber: "3", description: "Switchgear", originalCents: 9_600_000, source: "line 4" },
    ]);
    expect(r.totalCents).toBe(14_925_075);
    expect(r.sheetTotalCents).toBe(14_925_075);
    expect(r.checks).toEqual([]);
    expect(r.billedToDateCents).toBeNull();
    expect(r.notes.some((n) => /1 line had no item number/.test(n))).toBe(true);
  });

  it("reads a semicolon CSV with decimal commas, as European Excel saves it", () => {
    const r = ok(
      findSov(
        parseCsv("Pos.;Beschreibung;Description;Value\n1;x;Drywall;1.234,50\n2;y;Tape;99,99"),
      ),
    );
    expect(r.lines.map((l) => l.originalCents)).toEqual([123_450, 9_999]);
  });

  it("reads a contractor's continuation sheet: skips the title block, divisions, subtotals, change orders", async () => {
    const wb = await workbook({
      Cover: { 1: ["APPLICATION FOR PAYMENT"] },
      "G703 Continuation": {
        1: ["CONTINUATION SHEET"],
        2: ["Application No:", null, 4],
        5: [
          "ITEM",
          "DESCRIPTION OF WORK",
          "SCHEDULED",
          "WORK COMPLETED",
          null,
          "MATERIALS PRESENTLY STORED",
          "TOTAL COMPLETED AND STORED TO DATE",
        ],
        6: [
          "NO.",
          null,
          "VALUE",
          "FROM PREVIOUS APPLICATION (D + E)",
          "THIS PERIOD",
          "(NOT IN D OR E)",
          "(D+E+F)",
        ],
        7: ["A", "B", "C", "D", "E", "F", "G"],
        8: [null, "DIVISION 01 - GENERAL"],
        9: [1, "General conditions", 48000, 24000, 6000, 0, { f: "SUM(D9:F9)", v: 30000 }],
        10: [2, "Demolition", 22000, 22000, 0, 0, { f: "SUM(D10:F10)", v: 22000 }],
        11: [null, "Subtotal Division 01", 70000, 46000, 6000, 0, 52000],
        12: [null, "DIVISION 06 - WOOD"],
        13: [3, "Framing", { f: "86000*1.0000000001", v: 86000.0000086 }, 60000, 20000, 0, 80000],
        15: [null, "CHANGE ORDERS"],
        16: ["1", "Added egress window", 7800, 0, 7800, 0, 7800],
        19: [null, "GRAND TOTALS", { f: "SUM(C9:C17)", v: 163800 }, 106000, 33800, 0, 139800],
      },
    });
    const r = ok(pickSov(await readXlsx(wb)));
    expect(r.header).toBe('sheet "G703 Continuation", row 5-6');
    expect(r.lines.map((l) => [l.itemNumber, l.description, l.originalCents, l.source])).toEqual([
      ["1", "General conditions", 4_800_000, "cell C9"],
      ["2", "Demolition", 2_200_000, "cell C10"],
      ["3", "Framing", 8_600_000, "cell C13"],
    ]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["subtotal", "change_order"]);
    expect(r.checks).toEqual([]); // the sheet total includes the change order; lines + CO agree with it
    expect(r.billedToDateCents).toBe(13_200_000);
    expect(r.notes.join(" ")).toMatch(/1 change-order line was left out/);
    expect(r.notes.join(" ")).toMatch(/rounded to the cent/);
  });

  it("flags a totals row whose SUM misses a line", () => {
    const r = ok(
      findSov(
        parseCsv(
          [
            "Item,Description,Scheduled value",
            "1,A,1000",
            "2,B,2000",
            "3,C,3000",
            "TOTAL,,3000",
          ].join("\n"),
        ),
      ),
    );
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0]?.message).toMatch(
      /\$3,000\.00, but the 3 lines above it add up to \$6,000\.00/,
    );
  });

  it("stops on an Excel error, a negative original line, or text in the value column, naming the cell", async () => {
    const wb = await workbook({
      SOV: { 1: ["Item", "Description", "Scheduled value"], 2: [1, "Framing", { err: "#REF!" }] },
    });
    const bad = await importSovFile("sov.xlsx", wb);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Framing \(cell C2\) shows the Excel error #REF!/);
    const neg = findSov(parseCsv("Item,Description,Amount\n1,Deduct,(500.00)"));
    expect(!neg.ok && neg.error).toMatch(/negative.*change order/);
    const txt = findSov(parseCsv("Item,Description,Amount\n1,Framing,TBD"));
    expect(!txt.ok && txt.error).toMatch(/Framing \(line 2\) is not a dollar amount \("TBD"\)/);
  });

  it("says what it looked for when there is no header, and refuses a blank template", () => {
    const none = findSov(parseCsv("foo,bar\n1,2"));
    expect(!none.ok && none.error).toMatch(/Could not find the table header/);
    const blank = findSov(parseCsv("Item,Description,Scheduled value\n,,\nTotal,,0"));
    expect(!blank.ok && blank.error).toMatch(/blank template/);
  });

  it("shortens over-long fields to what the API accepts and notes duplicates", () => {
    const long = "x".repeat(400);
    const r = ok(findSov(parseCsv(`Item,Description,Amount\n1,${long},10\n1,B,20`)));
    expect(r.lines[0]?.description.length).toBe(300);
    expect(r.notes.join(" ")).toMatch(/shortened/);
    expect(r.checks[0]?.message).toMatch(/Item number 1 appears more than once/);
  });

  it("reads money the way spreadsheets show it", () => {
    expect(readMoney("$ -")).toEqual({ cents: 0 });
    expect(readMoney("(1,234.50)")).toMatchObject({ cents: -123_450 });
    expect(readMoney("1.234,5")).toMatchObject({ cents: 123_450 });
    expect(readMoney("12,34,5")).toHaveProperty("error");
  });
});

describe("real workbooks from other programs (test/fixtures/README.md)", () => {
  it("LibreOffice-saved continuation sheet: four contract lines, the change order left out", async () => {
    const r = ok(await importSovFile("Pay App 7.xlsx", fixture("libreoffice-g703.xlsx")));
    expect(r.header).toBe('sheet "Continuation Sheet", row 4-5');
    expect(r.lines.map((l) => l.description)).toEqual([
      "Mobilization",
      "Underground conduit",
      "Switchgear",
      "Branch wiring",
    ]);
    expect(r.totalCents).toBe(23_015_075);
    expect(r.sheetTotalCents).toBe(24_905_075); // includes CO-1, $18,900
    expect(r.checks).toEqual([]);
    expect(r.billedToDateCents).toBe(13_282_525);
  });
  it("a workbook written without calculation still imports; the total is said to be unchecked", async () => {
    const r = ok(await importSovFile("export.xlsx", fixture("openpyxl-uncalculated.xlsx")));
    expect(r.lines).toHaveLength(4);
    expect(r.sheetTotalCents).toBeNull();
    expect(r.notes.join(" ")).toMatch(/no saved result/);
  });
  it("tells a user with a .xls or a PDF what to save instead", async () => {
    const r = await importSovFile("bid.pdf", new TextEncoder().encode("%PDF-1.4"));
    expect(!r.ok && r.error).toMatch(/Save the schedule of values from Excel/);
  });
});

// The free schedule of values template the public site gives away (ventures/pay-app-guides, written by its
// template.mjs, so formulas carry no saved results). A contractor who starts there must be able to bring the job in.
describe("the public pay-app-guides template", () => {
  it("reads the filled example: item numbers kept, CO-1 left for a change order", async () => {
    const r = ok(await importSovFile("sov.xlsx", fixture("schedule-of-values-example.xlsx")));
    expect(r.header).toBe('sheet "Continuation sheet", row 8');
    expect(r.lines.map((l) => [l.itemNumber, l.originalCents, l.source])).toEqual([
      ["1", 1_200_000, "cell C10"],
      ["2", 4_000_000, "cell C11"],
      ["3", 6_000_000, "cell C12"],
      ["4", 3_800_000, "cell C13"],
    ]);
    expect(r.skipped.filter((x) => x.reason === "change_order").map((x) => x.label)).toEqual([
      expect.stringMatching(/EV charger|CO-1/),
    ]);
  });
  it("says the blank template has no lines", async () => {
    const r = await importSovFile("sov.xlsx", fixture("schedule-of-values-template.xlsx"));
    expect(r.ok).toBe(false);
  });
});
