// BR-CO-17 tolerance: built-in route vs CEN's own rules (plain/en16931-*.json on
// fontoxpath, which matched CEN's XSLT under SaxonC 609/609 in the 2026-11-19 audit).
// Seeded random invoices from generate.mjs, UBL and CII; every VAT row's amount moved
// by a delta in cents, the tax total, gross and amount due moved with it, so only
// BR-CO-17 is in play. Counts, per delta band, files where the built-in route blocks
// and CEN passes (false alarm) or the reverse (miss).
// Run: npm i --no-save slimdom fontoxpath; node eval/brco17-tolerance-crosscheck.mjs [n] [seed]
import { generateInvoice } from "../generate.mjs";
import { parseUblInvoice } from "../ubl.mjs";
import { parseCiiInvoice } from "../cii.mjs";
import { checkInvoice } from "../checks.mjs";
import { isBlocking } from "../report.mjs";
import { runPlain } from "../plain-node.mjs";
import draft from "../examples/draft-invoice.json" with { type: "json" };

const N = Number(process.argv[2] || 300);
let seed = Number(process.argv[3] || 20261125);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DELTAS = [-100, -99, -50, -3, -2, -1, 1, 2, 3, 50, 99, 100];
const ARITH = new Set(["BR-CO-17", "BR-CO-14", "BR-CO-15", "BR-CO-16", "BR-S-08", "BR-S-09"]);
const band = (d) => (Math.abs(d) >= 100 ? "|d| = 1.00" : Math.abs(d) >= 50 ? "0.50-0.99" : "0.01-0.03");
const f2 = (c) => (c / 100).toFixed(2);

function shift(xml, format, delta) {
  // every VAT row and the totals move together: tax total = sum of rows (BR-CO-14).
  let rows = 0;
  if (format === "ubl") {
    xml = xml.replace(/(<cac:TaxSubtotal>\s*<cbc:TaxableAmount[^>]*>[^<]*<\/cbc:TaxableAmount>\s*<cbc:TaxAmount[^>]*>)([^<]+)/g, (m, a, v) => (rows++, a + f2(Math.round(Number(v) * 100) + delta)));
    const add = rows * delta;
    xml = xml.replace(/(<cac:TaxTotal>\s*<cbc:TaxAmount[^>]*>)([^<]+)/, (m, a, v) => a + f2(Math.round(Number(v) * 100) + add));
    for (const tag of ["TaxInclusiveAmount", "PayableAmount"]) xml = xml.replace(new RegExp(`(<cbc:${tag}[^>]*>)([^<]+)`), (m, a, v) => a + f2(Math.round(Number(v) * 100) + add));
  } else {
    xml = xml.replace(/(<ram:ApplicableTradeTax>\s*<ram:CalculatedAmount[^>]*>)([^<]+)/g, (m, a, v) => (rows++, a + f2(Math.round(Number(v) * 100) + delta)));
    const add = rows * delta;
    for (const tag of ["TaxTotalAmount", "GrandTotalAmount", "DuePayableAmount"]) xml = xml.replace(new RegExp(`(<ram:${tag}[^>]*>)([^<]+)`), (m, a, v) => a + f2(Math.round(Number(v) * 100) + add));
  }
  return xml;
}

const tally = {};
let files = 0;
for (let i = 0; i < N; i++) {
  const d = structuredClone(draft);
  d.number = `X-${i}`;
  d.lines = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({
    description: `Item ${k}`, quantity: 1 + Math.floor(rnd() * 9), unit: "pieces",
    unit_price: Math.round(rnd() * 50000) / 100, tax_percent: pick([19, 7]),
  }));
  for (const format of ["ubl", "cii"]) {
    const g = generateInvoice(d, { format });
    if (!g.ok) throw new Error(JSON.stringify(g.errors));
    const delta = pick(DELTAS);
    const xml = shift(g.xml, format, delta);
    const parsed = format === "ubl" ? parseUblInvoice(xml) : parseCiiInvoice(xml);
    const ours = checkInvoice(parsed).filter(isBlocking).map((f) => f.rule).filter((r) => r === "INV-038" || r === "INV-018");
    const cen = (await runPlain(xml)).findings.filter((f) => f.severity !== "information" && f.severity !== "warning").map((f) => f.rule).filter((r) => ARITH.has(r));
    const key = `${format} ${band(delta)}`;
    const t = (tally[key] ||= { files: 0, cenBlocks: 0, oursBlocks: 0, falseAlarm: 0, miss: 0 });
    t.files++; files++;
    if (cen.length) t.cenBlocks++;
    if (ours.length) t.oursBlocks++;
    if (ours.length && !cen.length) t.falseAlarm++;
    if (!ours.length && cen.length) t.miss++;
  }
}
console.log(`${files} files (seed ${process.argv[3] || 20261125})`);
console.table(tally);
