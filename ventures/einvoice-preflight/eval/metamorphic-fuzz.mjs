// Metamorphic fuzz for the JSON checker (checks.mjs + breakdown.mjs).
// Generates seeded random valid invoices (1-5 lines, 5 rates, fractional
// quantities, per-rate breakdown rounded to cents) and perturbs each in ways
// with a known answer: valid ones must raise no finding, every perturbation of
// the amounts must raise one. INV-035 (exemption reason) is excluded: the
// generator writes 0% lines with no reason on purpose.
// Usage: node eval/metamorphic-fuzz.mjs [N=3000] [seed=12345]
import { checkInvoice } from "../checks.mjs";

const N = Number(process.argv[2] || 3000);
let seed = Number(process.argv[3] || 12345);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
const c = (x) => Math.round(x * 100) / 100;
const RATES = [0, 7, 19, 21, 5.5];

export function gen() {
  const lines = [];
  const by = {};
  const n = ri(1, 5);
  for (let i = 0; i < n; i++) {
    const q = ri(1, 20) / (rand() < 0.3 ? 4 : 1);
    const p = ri(1, 50000) / 100;
    const t = RATES[ri(0, 4)];
    const net = c(q * p);
    lines.push({ description: "x" + i, quantity: q, unit_price: p, tax_percent: t, net });
    by[t] = c((by[t] || 0) + net);
  }
  const tb = Object.entries(by).map(([t, b]) => ({
    tax_percent: +t, taxable: b, tax: c((b * t) / 100), tax_category: +t === 0 ? "Z" : "S",
  }));
  const net = c(tb.reduce((s, x) => s + x.taxable, 0));
  const tax = c(tb.reduce((s, x) => s + x.tax, 0));
  return {
    invoice_number: "A" + ri(1, 999), issue_date: "2026-08-24", currency: "EUR",
    supplier: { id: "1", name: "S", vat_id: "DE136695976" }, customer: { id: "2", name: "C" },
    lines, tax_breakdown: tb, totals: { net, tax, gross: c(net + tax) },
  };
}

const findings = (inv) => checkInvoice(inv).filter((f) => f.rule !== "INV-035");
const MUTATIONS = {
  "line net +0.01": (m) => { m.lines[0].net = c(m.lines[0].net + 0.01); },
  "breakdown tax +0.01": (m) => { m.tax_breakdown[0].tax = c(m.tax_breakdown[0].tax + 0.01); },
  "breakdown and totals +0.01 together": (m) => {
    m.tax_breakdown[0].tax = c(m.tax_breakdown[0].tax + 0.01);
    m.totals.tax = c(m.totals.tax + 0.01); m.totals.gross = c(m.totals.gross + 0.01);
  },
  "net total +0.01": (m) => { m.totals.net = c(m.totals.net + 0.01); },
  "gross total +0.01..5.00": (m) => { m.totals.gross = c(m.totals.gross + ri(1, 500) / 100); },
  "quantity +1": (m) => { m.lines[0].quantity += 1; },
  "line rate swapped": (m) => { m.lines[0].tax_percent = m.lines[0].tax_percent === 19 ? 7 : 19; },
  "quantity negated": (m) => { m.lines[0].quantity = -m.lines[0].quantity; },
};

let falsePositives = 0;
for (let k = 0; k < N; k++) if (findings(gen()).length) falsePositives++;
console.log(`valid invoices flagged: ${falsePositives}/${N}`);
let missed = 0;
for (const [name, f] of Object.entries(MUTATIONS)) {
  let det = 0;
  for (let k = 0; k < N; k++) {
    const m = structuredClone(gen()); f(m);
    if (findings(m).length) det++;
  }
  console.log(`${name}: detected ${det}/${N}`);
  missed += N - det;
}
process.exitCode = falsePositives || missed ? 1 : 0;
