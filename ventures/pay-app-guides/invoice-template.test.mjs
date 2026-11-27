import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUTS, buildInvoice, EXAMPLE, FIRST, LAST, R, serial } from "./invoice-template.mjs";

// Read the stored entries back out of our own zip.
function unzip(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    assert.equal(buf.readUInt16LE(p + 8), 0, "stored entries only");
    const name = buf.subarray(p + 30, p + 30 + nlen).toString("utf8");
    out[name] = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size).toString("utf8");
    p += 30 + nlen + xlen + size;
  }
  assert.equal(buf.readUInt32LE(p), 0x02014b50, "central directory follows the entries");
  return out;
}

test("the committed invoice .xlsx files are exactly what invoice-template.mjs builds", () => {
  for (const [name, build] of Object.entries(OUTPUTS)) {
    assert.ok(readFileSync(new URL(`./${name}`, import.meta.url)).equals(build()), `${name} is stale: run node invoice-template.mjs`);
  }
});

test("date serials match Excel's 1899-12-30 epoch", () => {
  assert.equal(serial("1900-03-01"), 61);
  assert.equal(serial("2026-11-30"), 46356);
  assert.equal(serial(""), "");
});

test("the invoice has one sheet, the formulas, valid styles and no macros or external links", () => {
  const files = unzip(buildInvoice({}));
  assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
  const sh = files["xl/worksheets/sheet1.xml"].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), st = files["xl/styles.xml"];
  assert.match(files["xl/workbook.xml"], /<sheet name="Invoice"/);
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  // The cellXfs count must match the xf elements, or Excel reports the file as damaged.
  const xfs = st.split("<cellXfs")[1].split("</cellXfs>")[0];
  assert.equal(Number(/count="(\d+)"/.exec(xfs)[1]), (xfs.match(/<xf /g) || []).length);
  const fmts = st.split("</numFmts>")[0];
  assert.equal(Number(/<numFmts count="(\d+)"/.exec(fmts)[1]), (fmts.match(/<numFmt /g) || []).length);
  assert.match(sh, new RegExp(`<c r="F${FIRST}"[^>]*><f>IF\\(E${FIRST}="","",ROUND\\(IF\\(C${FIRST}="",1,C${FIRST}\\)\\*E${FIRST},2\\)\\)</f>`));
  assert.match(sh, new RegExp(`<c r="F${R.subtotal}"[^>]*><f>SUM\\(F${FIRST}:F${LAST}\\)</f>`));
  assert.match(sh, new RegExp(`<c r="F${R.due}"[^>]*><f>F${R.subtotal}\\+F${R.retainage}\\+N\\(F${R.tax}\\)-N\\(F${R.deposit}\\)</f>`));
  assert.match(sh, /<c r="F8"[^>]*><f>IF\(OR\(F7="",B8=""\),"",F7\+B8\)<\/f>/);
  for (const [name, body] of Object.entries(files)) {
    assert.doesNotMatch(body, /vbaProject|externalLink|<hyperlink|oleObject|WEBSERVICE|connections/i, name);
  }
});

function soffice() {
  try { execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 60000 }); return true; } catch { return false; }
}
function recalc(buf) {
  const dir = mkdtempSync(join(tmpdir(), "inv-"));
  writeFileSync(join(dir, "in.xlsx"), buf);
  execFileSync("soffice", ["--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1", "--outdir", dir, join(dir, "in.xlsx")], { stdio: "ignore", timeout: 120000 });
  return readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(".csv"))), "utf8");
}

test("recalculated, the example matches the page's worked example", { skip: !soffice() && "soffice not installed" }, () => {
  const csv = recalc(buildInvoice(EXAMPLE));
  assert.match(csv, /^2,"Hang and finish 5\/8 in\. Type X board, level 4",6200,SF,1\.85,11470$/m);
  assert.match(csv, /^,"Subtotal, work this invoice",,,,21120$/m);
  assert.match(csv, /^,"Less retainage held, % \(type the rate\)",,,10,-2112$/m);
  assert.match(csv, /^,Amount due,,,,16008$/m);
  assert.match(csv, /^,Retainage held on this job to date,,,,2112$/m);
  assert.match(csv, /^"Payment terms, days",30,,Due date,,2026-12-30$/m);
  assert.match(csv, /^Checks,,,,,$/m);
});

test("recalculated, a priced-less quantity and a negative amount due are flagged", { skip: !soffice() && "soffice not installed" }, () => {
  const data = structuredClone(EXAMPLE);
  data.lines.push({ item: "3", description: "Patch at existing", qty: "40", unit: "SF", price: "" });
  assert.match(recalc(buildInvoice(data)), /^Checks,1 line\(s\) have a quantity and no unit price\.,,,,$/m);
  data.settings.deposit = "50000";
  assert.match(recalc(buildInvoice(data)), /^Checks,Amount due is negative: check the deposit applied\.,,,,$/m);
});

test("node invoice-template.mjs --check passes on the committed files", () => {
  execFileSync(process.execPath, [new URL("./invoice-template.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
});
