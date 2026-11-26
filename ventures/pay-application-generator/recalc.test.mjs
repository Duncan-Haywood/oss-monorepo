// The workbook carries a cached value for every formula, so a file can look right when opened and still have
// wrong formulas behind it. This test deletes every cached value, has LibreOffice recalculate the workbook from
// the formulas alone, and compares the answer with compute(). workbook.test.mjs checks the formulas' text; this
// checks what they evaluate to. Skipped where soffice is not installed (most CI runners): run it locally after
// touching workbook.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compute, sampleList, SAMPLE_SETTINGS, parseCsv } from "./calc.mjs";
import { workbookXlsx, zipStore, crc32, FIRST_LINE_ROW } from "./workbook.mjs";

const soffice = ["/usr/bin/soffice", "/usr/bin/libreoffice", "/usr/local/bin/soffice"].find((p) => existsSync(p));
const dec = new TextDecoder(), enc = new TextEncoder();

// Read back a stored (uncompressed) zip, which is what zipStore writes.
function unzipStored(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  const out = [];
  for (let i = 0, p = v.getUint32(e + 16, true); i < v.getUint16(e + 10, true); i++) {
    const nameLen = v.getUint16(p + 28, true), size = v.getUint32(p + 20, true), local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    assert.equal(crc32(data), v.getUint32(p + 16, true), `CRC of ${name}`);
    out.push({ name, data: dec.decode(data) });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

function recalc(bytes) {
  const files = unzipStored(bytes).map((f) => (f.name.startsWith("xl/worksheets/") ? { ...f, data: f.data.replace(/(<\/f>)<v>[^<]*<\/v>/g, "$1") } : f));
  assert.ok(files.some((f) => /<f>/.test(f.data)), "the workbook has formulas");
  assert.ok(!files.some((f) => /<\/f><v>/.test(f.data)), "every cached value is stripped");
  const dir = mkdtempSync(join(tmpdir(), "payapp-recalc-"));
  try {
    writeFileSync(join(dir, "a.xlsx"), zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.data) }))));
    execFileSync(soffice, ["--headless", `-env:UserInstallation=file://${dir}/profile`, "--convert-to",
      "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,false,false,false,false,-1", "--outdir", dir, join(dir, "a.xlsx")], { stdio: "ignore", timeout: 120000 });
    return { app: parseCsv(readFileSync(join(dir, "a-Application.csv"), "utf8")), cont: parseCsv(readFileSync(join(dir, "a-Continuation sheet.csv"), "utf8")) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// Raw values, not as displayed (the export's "as shown" flag is off), so a formula that is off by a fraction of a
// cent fails here instead of being rounded away by the cell format.
const cents = (s) => {
  const x = Number(String(s).replace(/[$,]/g, "")) * 100;
  assert.ok(Math.abs(x - Math.round(x)) < 1e-6, `${s} is not a whole number of cents`);
  return Math.round(x);
};
const line = (app, no) => cents(app.find((r) => r[0] === no)[2]);

const cases = [
  ["the page's worked example", sampleList(), SAMPLE_SETTINGS],
  ["past a retainage reduction point (work at 2.5%), stored materials at their own 5%",
    sampleList().replace("7,Drywall,41000,0,0,0", "7,Drywall,41000,41000,0,0").replace("8,Finishes,120000,0,0,0", "8,Finishes,120000,90000,0,0"),
    { retainagePct: "10", storedRetainagePct: "5", reduceAtPct: "50", reducedPct: "2.5", previousCertificates: "300000" }],
  ["retainage reduced only on work completed past 50% (10% to 5%), stored at 5%",
    sampleList().replace("7,Drywall,41000,0,0,0", "7,Drywall,41000,30000,11000,0").replace("8,Finishes,120000,0,0,0", "8,Finishes,120000,70000,12345.67,0"),
    { retainagePct: "10", storedRetainagePct: "5", reduceAtPct: "50", reducedPct: "5", reduceMode: "remaining", previousCertificates: "300000" }],
  ["no further retainage past 50% (reduced to 0), stored materials, a line with its own rate",
    "Item,Description,Scheduled value,Previous,This period,Stored,Retainage\n1,Steel,10000.33,6000,1111.11,555.55,\n2,Paint,2000,0,333.33,0,7.5\nCO-1,Extra,500,0,500,0,",
    { retainagePct: "10", reduceAtPct: "50", reducedPct: "0", reduceMode: "remaining" }],
  ["a line with its own 7.5% rate, odd cents and a change order",
    "Item,Description,Scheduled value,Previous,This period,Stored,Retainage\n1,Steel,10000.33,3333.33,1111.11,555.55,7.5\n2,Paint,2000,0,333.33,0,\nCO-1,Extra,500,0,500,0,",
    { retainagePct: "10" }],
  // A deductive change order whose retainage lands on a half cent: Excel and LibreOffice ROUND half away from zero,
  // so the page must too, or a credit of 123.455 shows as 123.45 on the page and 123.46 in the workbook.
  ["a deductive change order with retainage on a half cent",
    "Item,Description,Scheduled value,Previous,This period,Stored\n1,Base,100000,0,1234.55,0\nCO-1,Deduct,-1234.55,0,-1234.55,0",
    { retainagePct: "10" }],
];
for (const [name, csv, settings] of cases) {
  test(`LibreOffice, recalculating from the formulas alone, gets the page's numbers: ${name}`, { skip: !soffice && "soffice not installed" }, () => {
    const r = compute(csv, settings);
    assert.deepEqual(r.errors, []);
    const { app, cont } = recalc(workbookXlsx(r, settings));
    const m = r.summary;
    assert.equal(line(app, "1."), m.original);
    assert.equal(line(app, "2."), m.changes);
    assert.equal(line(app, "3."), m.contractToDate);
    assert.equal(line(app, "4."), m.completed);
    assert.equal(line(app, "5."), m.retainage);
    assert.equal(line(app, "6."), m.earnedLess);
    assert.equal(line(app, "8."), m.due);
    assert.equal(line(app, "9."), m.balanceToFinish);
    r.lines.forEach((l, i) => {
      const row = cont[FIRST_LINE_ROW - 1 + i];
      assert.equal(cents(row[7]), l.g, `line ${i + 1} completed and stored`);
      assert.equal(cents(row[11]), l.ret, `line ${i + 1} retainage`);
    });
  });
}

test("LibreOffice opens the blank template to a zero payment due", { skip: !soffice && "soffice not installed" }, () => {
  const { app } = recalc(workbookXlsx(null));
  for (const no of ["1.", "3.", "5.", "8."]) assert.equal(line(app, no), 0, no);
});
