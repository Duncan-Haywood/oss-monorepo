import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUTS, buildWorkbook, EXAMPLE, FIRST, LAST, TOTAL } from "./template.mjs";

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

test("the committed .xlsx files are exactly what template.mjs builds", () => {
  for (const [name, build] of Object.entries(OUTPUTS)) {
    assert.ok(readFileSync(new URL(`./${name}`, import.meta.url)).equals(build()), `${name} is stale: run node template.mjs`);
  }
});

test("the workbook has the two sheets, the formulas and no macros or external links", () => {
  const files = unzip(buildWorkbook({}));
  assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
  const cs = files["xl/worksheets/sheet1.xml"], sum = files["xl/worksheets/sheet2.xml"];
  assert.match(files["xl/workbook.xml"], /<sheet name="Continuation sheet"[^>]*\/><sheet name="Summary"/);
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  assert.match(cs, new RegExp(`<c r="G${FIRST}"[^>]*><f>[^<]*N\\(D${FIRST}\\)\\+N\\(E${FIRST}\\)\\+N\\(F${FIRST}\\)`));
  assert.match(cs, new RegExp(`<c r="J${LAST}"[^>]*><f>[^<]*ROUND\\(\\(N\\(D${LAST}\\)\\+N\\(E${LAST}\\)\\)\\*\\$C\\$5/100\\+N\\(F${LAST}\\)\\*\\$C\\$6/100,2\\)`));
  assert.match(cs, new RegExp(`<c r="G${TOTAL}"[^>]*><f>SUM\\(G${FIRST}:G${LAST}\\)</f>`));
  assert.match(sum, /<c r="C11"[^>]*><f>C9-C10<\/f>/, "line 8 = line 6 - line 7");
  assert.match(sum, /<c r="C12"[^>]*><f>C6-C9<\/f>/, "line 9 = line 3 - line 6");
  assert.match(cs, /not affiliated with the AIA/);
  for (const [name, body] of Object.entries(files)) {
    assert.doesNotMatch(body, /vbaProject|externalLink|<hyperlink|oleObject|WEBSERVICE|connections/i, name);
  }
});

// LibreOffice, where installed, recalculates the formulas from scratch.
function soffice() {
  try { execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 60000 }); return true; } catch { return false; }
}
function recalc(buf) {
  const dir = mkdtempSync(join(tmpdir(), "sov-"));
  writeFileSync(join(dir, "in.xlsx"), buf);
  execFileSync("soffice", ["--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1", "--outdir", dir, join(dir, "in.xlsx")], { stdio: "ignore", timeout: 120000 });
  const read = (sheet) => readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(`${sheet}.csv`))), "utf8");
  return { cs: read("Continuation sheet"), summary: read("Summary") };
}

test("recalculated, the example matches the worked example in the guides", { skip: !soffice() && "soffice not installed" }, () => {
  const { cs, summary } = recalc(buildWorkbook(EXAMPLE));
  for (const [label, value] of [["3. Contract sum to date", "158500"], ["4. Total completed and stored to date", "79850"], ["5. Retainage", "7985"], ["6. Total earned less retainage", "71865"], ["8. Current payment due", "40365"]]) {
    assert.match(summary, new RegExp(`^"?${label.replace(/\./g, "\\.")}"?,,${value},`, "m"), label);
  }
  assert.match(summary, /^"9\. Balance to finish, including retainage",,86635,/m);
  assert.match(cs, /^3,Switchgear \(stored on site\),60000,9000,6000,15000,30000,[^,]*,30000,3000,$/m);
  assert.doesNotMatch(cs, /Over-billed|No scheduled value/);
});

test("recalculated, an over-billed line and work on a line with no value are flagged", { skip: !soffice() && "soffice not installed" }, () => {
  const data = structuredClone(EXAMPLE);
  data.lines[1].thisPeriod = "25000";
  data.lines.push({ item: "5", description: "Unscheduled work", scheduled: "", previous: "", thisPeriod: "100", stored: "" });
  const { cs, summary } = recalc(buildWorkbook(data));
  assert.match(cs, /^2,Underground conduit,40000,20000,25000,0,45000,[^,]*,-5000,4500,Over-billed$/m);
  assert.match(cs, /^5,Unscheduled work,,,100,,100,,-100,10,No scheduled value$/m);
  assert.match(cs, /2 line\(s\) to check/);
  assert.match(summary, /2 line\(s\) to check on the continuation sheet/);
});
