// Scores the converter's rows against a ground-truth CSV for the same statement:
//   node eval/score.mjs statement.pdf truth.csv --format transtractor|icici
// transtractor: date (YYYY-MM-DD), description, signed amount, balance, ...
// icici:        date (DD-MM-YYYY), description, debit, credit, balance
// Prints rows found, and how many match a true row on date and signed amount
// (order-free, each true row used once).
import { readFileSync } from 'node:fs';
import { inflate } from '../inflate-browser.mjs';
import { parseStatementPdf, formatDate } from '../calc.mjs';

const [pdf, truth] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fmt = process.argv.includes('icici') ? 'icici' : 'transtractor';
const r = await parseStatementPdf(new Uint8Array(readFileSync(pdf)), inflate, {});
const cents = (s) => Math.round(Number(s || 0) * 100);
const want = readFileSync(truth, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => (fmt === 'icici'
  ? { date: c[0].split('-').reverse().join('-'), cents: cents(c[3]) - cents(c[2]) }
  : { date: c[0], cents: cents(c[2]) }));
const pool = new Map();
for (const w of want) { const k = `${w.date}|${w.cents}`; pool.set(k, (pool.get(k) || 0) + 1); }
let matched = 0;
for (const t of r.transactions) { const k = `${formatDate(t.date)}|${t.amount}`; if (pool.get(k)) { matched++; pool.set(k, pool.get(k) - 1); } }
console.log(`${pdf.split('/').pop()}: ${r.transactions.length} rows (truth ${want.length}); ${matched} match a true row on date and signed amount; proved: ${r.reconcile.ok}`);
for (const f of r.findings.filter((x) => x.severity !== 'info')) console.log(`  ${f.severity}: ${f.title}`);
