import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUTS, buildWip, EXAMPLE, FIRST, LAST, TOTAL } from "./wip-template.mjs";
import { evaluate } from "../contractor-wip-schedule/calc.mjs";

function unzip(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString("utf8");
    out[name] = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size).toString("utf8");
    p += 30 + nlen + xlen + size;
  }
  return out;
}

// Hand-worked on the page (wip-schedule-template.html, "Worked example").
const HAND = [
  { earned: 288000, over: 24000, under: 0, gp: 48000, provision: 0, backlog: 192000, ctc: 160000 },
  { earned: 112500, over: 0, under: 15000, gp: 22500, provision: 0, backlog: 37500, ctc: 30000 },
  { earned: 150000, over: 0, under: 0, gp: -30000, provision: 15000, backlog: 150000, ctc: 165000 },
  { earned: 27500, over: 16500, under: 0, gp: 5500, provision: 0, backlog: 192500, ctc: 154000 },
];

test("the committed WIP .xlsx files are exactly what wip-template.mjs builds", () => {
  for (const [name, build] of Object.entries(OUTPUTS)) {
    assert.ok(readFileSync(new URL(`./${name}`, import.meta.url)).equals(build()), `${name} is stale: run node wip-template.mjs`);
  }
});

test("the page's hand figures agree with the contractor-wip-schedule tool's own engine", () => {
  EXAMPLE.jobs.forEach((j, i) => {
    const r = evaluate({ name: j.name, contract: +j.contract, est: +j.est, cost: +j.cost, billed: +j.billed, prior: null });
    const h = HAND[i];
    assert.equal(r.earned, h.earned, j.name);
    assert.equal(r.overbilled, h.over, j.name);
    assert.equal(r.underbilled, h.under, j.name);
    assert.equal(r.grossRecognised, h.gp, j.name);
    assert.equal(r.lossProvision, h.provision, j.name);
    assert.equal(r.backlog, h.backlog, j.name);
    assert.equal(r.remainingCost, h.ctc, j.name);
  });
});

test("one sheet, frozen headers, valid styles, no macros or external links", () => {
  const files = unzip(buildWip({}));
  assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
  assert.match(files["xl/workbook.xml"], /<sheet name="WIP schedule"/);
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  const sh = files["xl/worksheets/sheet1.xml"].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  assert.match(sh, /state="frozen"/);
  assert.match(sh, new RegExp(`<c r="K${TOTAL}"[^>]*><f>SUM\\(K${FIRST}:K${LAST}\\)</f>`));
  for (const [name, body] of Object.entries(files)) {
    assert.doesNotMatch(body, /vbaProject|externalLink|<hyperlink|oleObject|WEBSERVICE|connections/i, name);
  }
});

function soffice() {
  try { execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 60000 }); return true; } catch { return false; }
}
function recalc(buf) {
  const dir = mkdtempSync(join(tmpdir(), "wip-"));
  writeFileSync(join(dir, "in.xlsx"), buf);
  execFileSync("soffice", ["--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1", "--outdir", dir, join(dir, "in.xlsx")], { stdio: "ignore", timeout: 120000 });
  return readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(".csv"))), "utf8");
}

test("recalculated, the example matches the page's worked example", { skip: !soffice() && "soffice not installed" }, () => {
  const csv = recalc(buildWip(EXAMPLE));
  const rows = csv.split(/\r?\n/);
  const cells = (label) => {
    const line = rows.find((l) => l.startsWith(label + ",") || l.startsWith(`"${label}",`));
    assert.ok(line, `no row ${label}\n${csv}`);
    return line;
  };
  assert.match(cells("Clinic fit-out"), /^Clinic fit-out,480000,400000,240000,312000,80000,60(\.0)?%,288000,24000,0,48000,0,192000,160000,$/);
  assert.match(cells("Warehouse lighting retrofit"), /,75(\.0)?%,112500,0,15000,22500,0,37500,30000,$/);
  assert.match(cells("School gym (bid low)"), /,-30000,50(\.0)?%,150000,0,0,-30000,15000,150000,165000,Losing job: whole loss booked now\.$/);
  assert.match(cells("Retail shell"), /,12\.5%,27500,16500,0,5500,0,192500,154000,$/);
  assert.match(cells("Totals"), /^Totals,1150000,1026000,517000,603500,124000,50\.(4|3\d+)%,578000,40500,15000,46000,15000,572000,509000,1 job\(s\) to check$/);
  assert.match(cells("Net over (+) or under (-) billed").replace(/,+$/, ""), /,25500$/);
  assert.match(cells("Gross profit recognised to date").replace(/,+$/, ""), /,46000$/);
  assert.match(cells("Gross profit left in backlog").replace(/,+$/, ""), /,78000$/);
  assert.match(cells("Backlog gross margin, %").replace(/,+$/, ""), /,13\.6\d*%$/);
  assert.match(cells("Jobs expected to lose money").replace(/,+$/, ""), /,1$/);
});

test("recalculated, the blank template shows no figures and an overrun is flagged", { skip: !soffice() && "soffice not installed" }, () => {
  assert.match(recalc(buildWip({})), /^Totals,0,0,0,0,0,,0,0,0,0,0,0,0,$/m);
  const csv = recalc(buildWip({ jobs: [{ name: "Overrun", contract: "100000", est: "80000", cost: "90000", billed: "120000" }] }));
  assert.match(csv, /^Overrun,100000,80000,90000,120000,20000,100(\.0)?%,100000,20000,0,10000,0,0,0,Cost is past the estimate: raise the estimate if work remains\.$/m);
});

test("node wip-template.mjs --check passes on the committed files", () => {
  execFileSync(process.execPath, [new URL("./wip-template.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
});
