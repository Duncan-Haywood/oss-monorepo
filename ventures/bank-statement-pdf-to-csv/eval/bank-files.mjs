// Writes OFX, QFX, QBO and QIF files from statements read through the real PDF
// route, then checks them with readers this venture did not write:
//   - the monorepo's ofx-file-check (validate), run here;
//   - Python's ofxtools and ofxparse, run by eval/bank-files-check.py on the
//     folder this script writes (pip install ofxtools ofxparse).
// Usage: node eval/bank-files.mjs <out-folder>
// Every statement is made up; nothing outside the repository is read.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseStatementPdf, parseStatementText, sampleStatement, sampleCard } from "../calc.mjs";
import { buildStatementPdf, inflate } from "../pdf-fixtures.mjs";
import { toOfx, toQif, stitch } from "../bankfile.mjs";
import { validate } from "../../ofx-file-check/calc.mjs";

const out = process.argv[2];
if (!out) { console.error("usage: node eval/bank-files.mjs <out-folder>"); process.exit(2); }
mkdirSync(out, { recursive: true });
const NOW = "2026-11-18T00:00:00";
const fmt = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

// Twelve made-up months of one checking account, each its own PDF.
function month(m, opening) {
  let bal = opening, seed = m * 7919;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const rows = [];
  const n = 8 + Math.floor(rnd() * 10);
  const days = [...Array(n)].map(() => 1 + Math.floor(rnd() * 27)).sort((a, b) => a - b);
  const names = ["ACH CREDIT STRIPE PAYOUT", "CARD PURCHASE OFFICE SUPPLY", "ACH DEBIT ADOBE SYSTEMS", "CHECK 10", "DEPOSIT MOBILE", "ONLINE TRANSFER TO SAVINGS", "CARD PURCHASE CAFE & BAKERY", "MONTHLY SERVICE FEE"];
  for (const d of days) {
    const i = Math.floor(rnd() * names.length);
    const credit = i === 0 || i === 4;
    const amt = Math.round((credit ? 300 + rnd() * 2500 : 5 + rnd() * 900) * 100) * (credit ? 1 : -1);
    const desc = i === 3 ? `CHECK ${1040 + m * 3 + d}` : names[i];
    bal += amt;
    rows.push(`${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}   ${desc.padEnd(34)} ${amt < 0 ? fmt(-amt).padStart(12) : "".padStart(12)} ${amt > 0 ? fmt(amt).padStart(12) : "".padStart(12)} ${fmt(bal).padStart(12)}`);
  }
  const text = [`EXAMPLE BANK   Statement period: ${m}/01/2025 - ${m}/28/2025`, `Beginning balance   ${fmt(opening)}`, `Ending balance   ${fmt(bal)}`, "", "Date   Description                         Withdrawals     Deposits      Balance", ...rows].join("\n");
  return { text, closing: bal };
}

const cases = [];
cases.push({ name: "bank-sample", result: await parseStatementPdf(buildStatementPdf(sampleStatement()), inflate, {}) });
cases.push({ name: "card-sample", result: await parseStatementPdf(buildStatementPdf(sampleCard()), inflate, { kind: "card" }) });
const year = [];
let open = 1250000;
for (let m = 1; m <= 12; m++) { const s = month(m, open); year.push({ name: `2025-${String(m).padStart(2, "0")}.pdf`, result: await parseStatementPdf(buildStatementPdf(s.text, { pages: 1 }), inflate, {}) }); open = s.closing; }
cases.push({ name: "year-2025", result: stitch(year) });
cases.push({ name: "year-2025-no-june", result: stitch(year.filter((y) => !y.name.includes("-06"))) });

const truth = {};
for (const c of cases) {
  const r = c.result;
  const sum = r.transactions.reduce((s, t) => s + t.amount, 0);
  const kind = r.kind === "card" ? "card" : "bank";
  truth[c.name] = { rows: r.transactions.length, sumCents: sum, proved: r.reconcile.ok === true, ledger: kind === "card" ? -r.reconcile.closing : r.reconcile.closing, kind };
  for (const [ext, o] of [["ofx", { format: "ofx" }], ["qfx", { format: "qfx", intuBid: "1234" }], ["qbo", { format: "qbo", intuBid: "1234" }]]) {
    const body = toOfx(r, { ...o, now: NOW, accountId: "000123456789" });
    writeFileSync(join(out, `${c.name}.${ext}`), body);
    const v = validate(body);
    const bad = v.findings.filter((f) => f.severity === "error" || f.severity === "warning");
    console.log(`${c.name}.${ext}: ofx-file-check ${bad.length ? bad.map((f) => `${f.severity}: ${f.title}`).join("; ") : "no errors or warnings"} (${v.findings.length} findings in all)`);
  }
  writeFileSync(join(out, `${c.name}.qif`), toQif(r));
  console.log(`${c.name}: ${truth[c.name].rows} rows, net ${fmt(sum)}, ${truth[c.name].proved ? "proved" : "NOT proved"}${r.statements ? `, ${r.statements.length} statements, ${r.breaks.length} gap(s)` : ""}`);
}
const june = year.find((y) => y.name.includes("-06")).result;
const juneNet = june.transactions.reduce((s, t) => s + t.amount, 0);
const gap = cases.find((c) => c.name === "year-2025-no-june").result.breaks[0];
console.log(`June left out: the gap found is ${fmt(gap.gap)} between ${gap.after} and ${gap.before}; June's own net movement is ${fmt(juneNet)} (${gap.gap === juneNet ? "equal" : "DIFFERENT"})`);
writeFileSync(join(out, "truth.json"), JSON.stringify(truth, null, 1));
