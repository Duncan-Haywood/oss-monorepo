import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUTS, buildChangeOrder, EXAMPLE, FIRST, LAST, R } from "./change-order-template.mjs";

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

test("the committed change order .xlsx files are exactly what change-order-template.mjs builds", () => {
  for (const [name, build] of Object.entries(OUTPUTS)) {
    assert.ok(readFileSync(new URL(`./${name}`, import.meta.url)).equals(build()), `${name} is stale: run node change-order-template.mjs`);
  }
});

test("the form has one sheet, the formulas, valid styles and no macros or external links", () => {
  const files = unzip(buildChangeOrder({}));
  assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
  const sh = files["xl/worksheets/sheet1.xml"].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), st = files["xl/styles.xml"];
  assert.match(files["xl/workbook.xml"], /<sheet name="Change order"/);
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  const xfs = st.split("<cellXfs")[1].split("</cellXfs>")[0];
  assert.equal(Number(/count="(\d+)"/.exec(xfs)[1]), (xfs.match(/<xf /g) || []).length);
  assert.match(sh, new RegExp(`<c r="F${R.subtotal}"[^>]*><f>SUM\\(F${FIRST}:F${LAST}\\)</f>`));
  assert.match(sh, new RegExp(`<c r="F${R.markup}"[^>]*><f>ROUND\\(F${R.subtotal}\\*N\\(E${R.markup}\\)/100,2\\)</f>`));
  assert.match(sh, new RegExp(`<c r="F${R.after}"[^>]*><f>IF\\(F${R.original}="","",F${R.before}\\+F${R.thisCo}\\)</f>`));
  // Rows are written in ascending order, or Excel reports the file as damaged.
  const nums = [...sh.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
  assert.equal(new Set(nums).size, nums.length);
  for (const [name, body] of Object.entries(files)) {
    assert.doesNotMatch(body, /vbaProject|externalLink|<hyperlink|oleObject|WEBSERVICE|connections/i, name);
  }
});

test("the page states the example's figures", () => {
  const html = readFileSync(new URL("./change-order-template.html", import.meta.url), "utf8");
  for (const s of ["$7,727.27", "$772.73", "$8,500.00", "$158,500.00", "3 April 2027"]) assert.ok(html.includes(s), s);
  assert.match(html, /href="change-order-template\.xlsx" download/);
  assert.match(html, /href="change-order-example\.xlsx" download/);
});

function soffice() {
  try { execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 60000 }); return true; } catch { return false; }
}
function recalc(buf) {
  const dir = mkdtempSync(join(tmpdir(), "co-"));
  writeFileSync(join(dir, "in.xlsx"), buf);
  execFileSync("soffice", ["--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1", "--outdir", dir, join(dir, "in.xlsx")], { stdio: "ignore", timeout: 120000 });
  return readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(".csv"))), "utf8");
}

test("recalculated, the example matches the page's worked example", { skip: !soffice() && "soffice not installed" }, () => {
  const csv = recalc(buildChangeOrder(EXAMPLE));
  assert.match(csv, /^1,"Electrician labor: 4 EV charger circuits, garage level P1",44,HR,92\.5,4070$/m);
  assert.match(csv, /^,"Subtotal, cost of the change",,,,7727\.27$/m);
  assert.match(csv, /^,"Overhead and profit, % \(type your contract's rate\)",,,10,772\.73$/m);
  assert.match(csv, /^,Total of this change order,,,,8500$/m);
  assert.match(csv, /^,Contract sum before this change order,,,,150000$/m);
  assert.match(csv, /^,"New contract sum, once signed",,,,158500$/m);
  assert.match(csv, /^,"New completion date, once signed",,,,2027-04-03$/m);
  assert.match(csv, /^Checks,,,,,$/m);
});

test("recalculated, the blank form shows no figures and no warnings", { skip: !soffice() && "soffice not installed" }, () => {
  const csv = recalc(buildChangeOrder({}));
  assert.match(csv, /^,"New contract sum, once signed",,,,$/m);
  assert.match(csv, /^,"New completion date, once signed",,,,$/m);
  assert.match(csv, /^Checks,,,,,$/m);
});

test("recalculated, a deduct, a missing price, a missing contract sum and a missing time are flagged", { skip: !soffice() && "soffice not installed" }, () => {
  const deduct = { lines: [{ item: "1", description: "Delete 2 circuits", qty: "-2", unit: "EA", price: "600" }], settings: { markup: "10", original: "1000", days: "0" } };
  const d = recalc(buildChangeOrder(deduct));
  assert.match(d, /^,Total of this change order,,,,-1320$/m);
  assert.match(d, /^,"New contract sum, once signed",,,,-320$/m);
  assert.match(d, /^Checks,New contract sum is negative: check the deduct\.,,,,$/m);
  const data = structuredClone(EXAMPLE);
  data.lines.push({ item: "4", description: "Patch", qty: "2", unit: "EA", price: "" });
  assert.match(recalc(buildChangeOrder(data)), /^Checks,1 line\(s\) have a quantity and no unit price\.,,,,$/m);
  data.lines.pop();
  data.settings.original = "";
  assert.match(recalc(buildChangeOrder(data)), /^Checks,Type the original contract sum to see the new one\.,,,,$/m);
  data.settings.original = "150000";
  data.settings.days = "";
  assert.match(recalc(buildChangeOrder(data)), /^Checks,"Say the change in contract time, even if it is 0 days\.",,,,$/m);
});

test("node change-order-template.mjs --check passes on the committed files", () => {
  execFileSync(process.execPath, [new URL("./change-order-template.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
});
