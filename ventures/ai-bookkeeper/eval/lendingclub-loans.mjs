// The loan register's arithmetic against a real lender's own numbers: LendingClub's
// public loan book (2007-2014; amount funded, rate, term and the monthly instalment
// LendingClub itself set, plus what each borrower actually paid).
//
//   node eval/lendingclub-loans.mjs <loan_data_2007_2014.csv> [--json]
//
// The file is not committed (240 MB; fetch line in eval/lendingclub-loans-2026-11-15.md).
// Checks, in order:
//   1. instalment: levelPayment(funded, rate, term), rounded to the nearest cent and
//      rounded up, against LendingClub's `installment`, by year of issue;
//   2. on-schedule payoffs: a Fully Paid loan whose last payment fell in the month of
//      its last scheduled instalment, with no late fee, compared on total interest
//      received (`total_rec_int`) against the register's schedule.
import { readFileSync } from "node:fs";
import { levelPayment, loanSchedule } from "../loans.mjs";

const path = process.argv[2];
if (!path) { console.error("usage: node eval/lendingclub-loans.mjs <csv> [--json]"); process.exit(2); }
const json = process.argv.includes("--json");

// streaming-free but quote-aware CSV split (desc fields hold commas and newlines)
function* rows(text) {
  let i = 0, field = "", row = [], q = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); yield row; row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); yield row; }
}

const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const monthIndex = (s) => { const m = /^([A-Z][a-z]{2})-(\d{2})$/.exec(s ?? ""); return m ? (2000 + +m[2]) * 12 + MON[m[1]] - 1 : null; };
const cents = (s) => Math.round(parseFloat(s) * 100);

const it = rows(readFileSync(path, "utf8"));
const head = it.next().value, ix = Object.fromEntries(head.map((h, i) => [h, i]));
const need = ["funded_amnt", "term", "int_rate", "installment", "issue_d", "loan_status", "total_rec_int", "total_rec_late_fee", "last_pymnt_d"];
for (const n of need) if (!(n in ix)) { console.error(`column ${n} missing`); process.exit(2); }

const pay = { n: 0, exact: 0, off1: 0, worse: 0, up: 0, byYear: {}, worst: [], byTerm: {} };
const intr = { n: 0, diffs: [], byTerm: {} };
for (const r of it) {
  if (r.length < head.length - 5) continue;
  const funded = cents(r[ix.funded_amnt]), months = parseInt(r[ix.term]), rateBp = Math.round(parseFloat(r[ix.int_rate]) * 100);
  const inst = cents(r[ix.installment]);
  if (!(funded > 0 && months > 0 && rateBp > 0 && inst > 0)) continue;
  const ours = levelPayment(funded, rateBp, months), d = ours - inst;
  const year = 2000 + +r[ix.issue_d].slice(4);
  const up = levelPayment(funded, rateBp, months, "up") === inst;
  pay.n++;
  const y = (pay.byYear[year] ??= { n: 0, exact: 0, off1: 0, up: 0 }), t = (pay.byTerm[months] ??= { n: 0, exact: 0, off1: 0, up: 0 });
  y.n++; t.n++;
  if (up) { pay.up++; y.up++; t.up++; }
  if (d === 0) { pay.exact++; y.exact++; t.exact++; }
  else if (Math.abs(d) === 1) { pay.off1++; y.off1++; t.off1++; }
  else { pay.worse++; if (!up && pay.worst.length < 12) pay.worst.push({ id: r[ix.id], funded: funded / 100, rate: rateBp / 100, months, theirs: inst / 100, ours: ours / 100, issue: r[ix.issue_d] }); }

  // on-schedule payoffs only
  const issue = monthIndex(r[ix.issue_d]), last = monthIndex(r[ix.last_pymnt_d]);
  if (r[ix.loan_status] !== "Fully Paid" || issue === null || last !== issue + months || parseFloat(r[ix.total_rec_late_fee]) !== 0) continue;
  // the register on the lender's own instalment (as `loan add --payment` would)
  const sched = loanSchedule({ cents: funded, rateBp, months, first: "2012-01-01", payment: inst });
  const ourInt = sched.reduce((s, x) => s + x.interest, 0);
  const dd = cents(r[ix.total_rec_int]) - ourInt;
  intr.n++; intr.diffs.push(dd);
  const tt = (intr.byTerm[months] ??= []); tt.push(dd);
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
const quant = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const within = (xs, c) => xs.filter((x) => Math.abs(x) <= c).length;
const sumIntr = (xs) => ({ n: xs.length, within1: within(xs, 1), within5: within(xs, 5), within100: within(xs, 100), p10: quant(xs, 0.1), median: quant(xs, 0.5), p90: quant(xs, 0.9) });
const out = { instalment: { ...pay, exactPct: pct(pay.exact, pay.n), upPct: pct(pay.up, pay.n), within1Pct: pct(pay.exact + pay.off1, pay.n) }, onSchedule: { all: sumIntr(intr.diffs), byTerm: Object.fromEntries(Object.entries(intr.byTerm).map(([k, v]) => [k, sumIntr(v)])) } };
if (json) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`instalment: ${pay.n} loans; nearest cent exact ${pay.exact} (${out.instalment.exactPct}), 1 cent off ${pay.off1}, more ${pay.worse}; rounded up exact ${pay.up} (${out.instalment.upPct})`);
  for (const [y, v] of Object.entries(pay.byYear)) console.log(`  ${y}: ${v.n} loans, nearest ${v.exact} (${pct(v.exact, v.n)}), up ${v.up} (${pct(v.up, v.n)}), neither within 1c ${v.n - v.exact - v.off1}`);
  for (const [k, v] of Object.entries(pay.byTerm)) console.log(`  ${k} months: ${v.n}, nearest ${pct(v.exact, v.n)}, up ${pct(v.up, v.n)}`);
  console.log("  worst:", JSON.stringify(pay.worst.slice(0, 6)));
  console.log(`on-schedule payoffs: ${JSON.stringify(out.onSchedule.all)}`);
  for (const [k, v] of Object.entries(out.onSchedule.byTerm)) console.log(`  ${k} months: ${JSON.stringify(v)}`);
}
