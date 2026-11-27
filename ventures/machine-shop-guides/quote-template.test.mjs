import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkbook, TEMPLATE, FILE, INPUTS, BREAK_COLS, LINE_ROWS, PRICE_FIRST, CHECK_ROW } from "./quote-template.mjs";
import { costLot, quoteBreaks } from "./quote.mjs";

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

test("the committed .xlsx is exactly what quote-template.mjs builds", () => {
  assert.ok(readFileSync(new URL(`./${FILE}`, import.meta.url)).equals(buildWorkbook(TEMPLATE)), `${FILE} is stale: run node quote-template.mjs`);
});

test("the template ships no rate, price or markup: every input cell is empty but the quantities", () => {
  const ws = unzip(buildWorkbook(TEMPLATE))["xl/worksheets/sheet1.xml"];
  for (const [k, , r] of INPUTS) assert.match(ws, new RegExp(`<c r="C${r}" s="\\d+"/>`), `${k} (C${r}) is not empty`);
  for (let r = 23; r <= 28; r++) for (const c of "ABCD") assert.match(ws, new RegExp(`<c r="${c}${r}" s="\\d+"/>`), `${c}${r}`);
  const values = [...ws.matchAll(/<c r="([A-Z]+\d+)"[^>]*><v>([^<]*)<\/v>/g)].map((m) => m[1]);
  assert.deepEqual(values, BREAK_COLS.map((c) => `${c}31`), "only the quantity breaks carry a number");
});

test("two sheets, formulas as quote.mjs, no macros or external links", () => {
  const files = unzip(buildWorkbook(TEMPLATE));
  assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
  assert.match(files["xl/workbook.xml"], /<sheet name="Quote worksheet"[^>]*\/><sheet name="Customer quote"/);
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  const dec = (t) => t.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  const ws = dec(files["xl/worksheets/sheet1.xml"]), cq = dec(files["xl/worksheets/sheet2.xml"]);
  assert.match(ws, /<c r="C34"[^>]*><f>IF\(C\$32="","",N\(\$C\$14\)\*IF\(N\(\$C\$18\)>0,\$C\$18,1\)\*N\(\$C\$4\)\)<\/f>/, "setup x factor x rate, once per lot");
  assert.match(ws, /<c r="H35"[^>]*><f>[^<]*\/MAX\(1,N\(\$C\$16\)\)/, "programming spread over the lots");
  // The customer sheet reads prices only: no reference to the cost rows.
  for (const name of ["material", "setup", "programming", "machining", "ops", "cost", "price", "costEach", "priceEach"]) {
    assert.doesNotMatch(cq, new RegExp(`'Quote worksheet'!\\$?[C-H]\\$?${LINE_ROWS[name]}\\b`), `customer sheet reads ${name}`);
  }
  for (const [name, body] of Object.entries(files)) assert.doesNotMatch(body, /vbaProject|externalLink|<hyperlink|oleObject|WEBSERVICE|connections/i, name);
});

// Invented numbers, in memory only (never written to the committed file).
const INVENTED = {
  inputs: { setupRate: 80, programRate: 90, machineRate: 105, markupPct: 22, scrapPct: 4, partNumber: "BRK-100", revision: "C", materialPerPart: 6.37, setupHours: 1.75, programHours: 2.5, lotsOverProgramLife: 3, cycleMinutes: 7.3, setupFactor: 1.15, cycleFactor: "" },
  ops: [{ name: "Deburr", minutesPerPart: 2.5, rate: 48, lotCharge: "" }, { name: "Anodize (outside)", minutesPerPart: "", rate: "", lotCharge: 140 }],
  breaks: [1, 7, 10, 25, 60, 250],
  meta: { shopName: "Invented Shop", customer: "Invented Buyer", quoteNumber: "Q-1", date: 46353, validDays: 30, leadTime: "3 weeks", material: "6061-T6", notes: "Invented example." },
};

function soffice() {
  try { execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 60000 }); return true; } catch { return false; }
}
function recalc(buf) {
  const dir = mkdtempSync(join(tmpdir(), "mquote-"));
  writeFileSync(join(dir, "in.xlsx"), buf);
  execFileSync("soffice", ["--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1", "--outdir", dir, join(dir, "in.xlsx")], { stdio: "ignore", timeout: 120000 });
  const read = (sheet) => readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(`${sheet}.csv`))), "utf8").split(/\r?\n/).map((l) => parseCsvLine(l));
  return { ws: read("Quote worksheet"), cq: read("Customer quote") };
}
function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const ops = INVENTED.ops.map((o) => ({ minutesPerPart: o.minutesPerPart, rate: o.rate, lotCharge: o.lotCharge }));
const quoted = (r) => Math.ceil(Math.round(r.priceEach * 1e6) / 1e4) / 100;

test("recalculated, every line at every break matches costLot() in quote.mjs", { skip: !soffice() && "soffice not installed" }, () => {
  const { ws, cq } = recalc(buildWorkbook(INVENTED));
  const expected = quoteBreaks({ ...INVENTED.inputs, ops }, INVENTED.breaks);
  BREAK_COLS.forEach((_, i) => {
    const col = 2 + i, e = expected[i], at = (name) => Number(ws[LINE_ROWS[name] - 1][col]);
    assert.equal(at("quantity"), e.quantity);
    for (const [name, v] of [["material", e.lines.material], ["setup", e.lines.setup], ["programming", e.lines.programming], ["machining", e.lines.machining], ["ops", e.lines.ops], ["cost", e.cost], ["price", e.price], ["costEach", e.costEach], ["priceEach", e.priceEach], ["fixedShareEach", e.fixedShareEach]]) {
      assert.ok(Math.abs(at(name) - v) < 1e-6, `${name} at ${e.quantity}: sheet ${at(name)} vs quote.mjs ${v}`);
    }
    assert.equal(at("quotedEach"), quoted(e), `rounded price each at ${e.quantity}`);
    const row = cq[PRICE_FIRST + i - 1];
    assert.equal(Number(row[0]), e.quantity);
    assert.equal(Number(row[1]), quoted(e));
    assert.ok(Math.abs(Number(row[2]) - Math.round(quoted(e) * e.quantity * 100) / 100) < 1e-9);
  });
  const check = cq[CHECK_ROW - 1][1];
  assert.doesNotMatch(check, /No part number|No drawing revision|No quantity|No lead time|No prices yet/);
  assert.match(cq[15][1], /^2026-12-27$/, "valid until = date + 30 days");
});

test("recalculated, a blank factor counts as 1 and a fractional quantity is floored, as in quote.mjs", { skip: !soffice() && "soffice not installed" }, () => {
  const data = structuredClone(INVENTED);
  data.inputs.setupFactor = ""; data.breaks = [2.9, "", "", "", "", ""];
  const { ws, cq } = recalc(buildWorkbook(data));
  const e = costLot({ ...data.inputs, ops }, 2.9);
  assert.equal(Number(ws[LINE_ROWS.quantity - 1][2]), 2);
  assert.ok(Math.abs(Number(ws[LINE_ROWS.cost - 1][2]) - e.cost) < 1e-6);
  assert.equal(ws[LINE_ROWS.cost - 1][3], "", "a blank quantity column stays blank");
  assert.equal(cq[PRICE_FIRST][0], "");
});

test("recalculated, the blank template asks for what a buyer would send back", { skip: !soffice() && "soffice not installed" }, () => {
  const { cq } = recalc(buildWorkbook(TEMPLATE));
  const check = cq[CHECK_ROW - 1][1];
  for (const t of ["Your shop's name", "No customer named", "No quote number", "No part number", "No drawing revision", "No lead time", "No validity period", "No quote date", "No material stated"]) assert.ok(check.includes(t), t);
});

test("recalculated, a larger lot cheaper in total is flagged", { skip: !soffice() && "soffice not installed" }, () => {
  const data = structuredClone(INVENTED);
  data.breaks = [10, 9, "", "", "", ""];
  const { cq } = recalc(buildWorkbook(data));
  // Typed out of order (10 then 9): the smaller lot costing less is not a finding.
  assert.doesNotMatch(cq[CHECK_ROW - 1][1], /costs less in total/);
  const neg = structuredClone(INVENTED);
  neg.breaks = [5, 6, "", "", "", ""]; neg.ops = [{ name: "Rebate", minutesPerPart: -60, rate: 2000, lotCharge: "" }];
  const r = recalc(buildWorkbook(neg));
  assert.match(r.cq[CHECK_ROW - 1][1], /Buying 6 costs less in total than buying 5/);
  assert.match(r.ws[46][0], /A negative rate/);
});

test("node quote-template.mjs --check runs and fails on a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "mquote-check-"));
  writeFileSync(join(dir, "quote-template.mjs"), readFileSync(new URL("./quote-template.mjs", import.meta.url)));
  let status = 0, stderr = "";
  try { execFileSync(process.execPath, [join(dir, "quote-template.mjs"), "--check"], { stdio: "pipe" }); } catch (e) { status = e.status; stderr = String(e.stderr); }
  assert.equal(status, 1);
  assert.match(stderr, /machining-quote-template\.xlsx is stale/);
  execFileSync(process.execPath, [new URL("./quote-template.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
});
