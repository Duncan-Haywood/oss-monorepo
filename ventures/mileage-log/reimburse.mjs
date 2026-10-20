// Employer mileage-reimbursement claim. Since 2018 an employee cannot deduct
// unreimbursed business mileage on a federal return, so the useful document is
// a claim to the employer under an accountable plan: date, destination,
// business purpose and miles for every trip, priced at the employer's own
// per-mile rate (any rate; the IRS rate is only the tax-free ceiling).
// Pure functions, no DOM, no network. Not tax or legal advice.
import { tripMiles, rateFor, money } from "./calc.mjs";

const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cents = (dollars) => Math.round(dollars * 100 + 1e-9);
const round1 = (n) => Math.round(n * 10) / 10;

// Business trips in [from, to] (inclusive ISO dates; either may be empty),
// each priced in whole cents so the rows always add up to the total.
// `rate` is the employer's $/mile; null/blank uses the IRS business rate on
// each trip's date, and `usedIrsRate` says so. Zero-mile trips are skipped.
export function reimbursementClaim(trips, { from = "", to = "", rate = null, override = {}, client = "" } = {}) {
  const custom = rate !== null && rate !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0 ? Number(rate) : null;
  const rows = [];
  for (const t of trips) {
    if (t.category !== "business") continue;
    if (from && t.date < from) continue;
    if (to && t.date > to) continue;
    if (client && (t.client || "") !== client) continue;
    const miles = tripMiles(t);
    if (!(miles > 0)) continue;
    const r = custom ?? rateFor(t.date, "business", override) ?? 0;
    rows.push({ ...t, miles, rate: r, cents: cents(miles * r), missing: !String(t.to || "").trim() || !String(t.purpose || "").trim() });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map();
  for (const r of rows) {
    const m = r.date.slice(0, 7), g = byMonth.get(m) || { month: m, miles: 0, cents: 0, trips: 0 };
    g.miles = round1(g.miles + r.miles); g.cents += r.cents; g.trips += 1; byMonth.set(m, g);
  }
  return {
    rows,
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    miles: round1(rows.reduce((s, r) => s + r.miles, 0)),
    cents: rows.reduce((s, r) => s + r.cents, 0),
    usedIrsRate: custom === null,
    incomplete: rows.filter((r) => r.missing).length,
    // Reimbursing above the IRS rate is allowed but the excess is taxable wages.
    overIrsCents: custom === null ? 0 : rows.reduce((s, r) => s + Math.max(0, r.cents - cents(r.miles * (rateFor(r.date, "business", override) ?? 0))), 0),
  };
}

export function reimbursementHtml(trips, { name = "", employer = "", generated = new Date().toISOString().slice(0, 10), ...opts } = {}) {
  const c = reimbursementClaim(trips, opts);
  const d = (x) => money(x / 100);
  const rows = c.rows.map((r) => `<tr><td>${h(r.date)}</td><td>${h(r.from)}${r.from && r.to ? " &rarr; " : ""}${h(r.to)}</td><td>${h(r.purpose)}${r.client ? " (" + h(r.client) + ")" : ""}</td><td>${h(r.vehicle)}</td><td class="n">${r.miles}</td><td class="n">$${r.rate.toFixed(3)}</td><td class="n">${d(r.cents)}</td></tr>`).join("");
  const months = c.months.map((m) => `<tr><td>${h(m.month)}</td><td class="n">${m.trips}</td><td class="n">${m.miles}</td><td class="n">${d(m.cents)}</td></tr>`).join("");
  const period = opts.from || opts.to ? `${h(opts.from || "start")} to ${h(opts.to || "latest")}` : "all dates in the log";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mileage reimbursement claim</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}td.n,th.n{text-align:right}.note{color:#444;font-size:12px}.sig{margin-top:30px}@media print{body{margin:10mm}tr{break-inside:avoid}}</style></head><body>
<h1>Mileage reimbursement claim</h1>
<p>${name ? "Employee: <strong>" + h(name) + "</strong>. " : ""}${employer ? "Employer: <strong>" + h(employer) + "</strong>. " : ""}Period: ${period}. Prepared ${h(generated)}.</p>
<table><tbody><tr><th>Business trips</th><td class="n">${c.rows.length}</td><th>Business miles</th><td class="n">${c.miles}</td></tr>
<tr><th>Rate</th><td class="n">${c.usedIrsRate ? "IRS business rate on each trip's date" : "$" + Number(opts.rate).toFixed(3) + " per mile (employer rate)"}</td><th>Amount claimed</th><td class="n"><strong>${d(c.cents)}</strong></td></tr></tbody></table>
${c.incomplete ? `<p class="note"><strong>${c.incomplete} trip(s) lack a destination or purpose.</strong> An accountable plan normally requires both; add them before submitting.</p>` : ""}
<h2>By month</h2><table><thead><tr><th>Month</th><th class="n">Trips</th><th class="n">Miles</th><th class="n">Amount</th></tr></thead><tbody>${months}</tbody></table>
<h2>Trips</h2><table><thead><tr><th>Date</th><th>Route</th><th>Business purpose</th><th>Vehicle</th><th class="n">Miles</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<p class="sig">Employee signature: ______________________ Date: ____________</p>
<p class="note">A record of trips the employee entered, priced at the stated rate. Reimbursements under an accountable plan up to the IRS rate are generally not taxable wages; amounts above it generally are. Your employer's policy decides what is reimbursable. Not tax or legal advice.</p>
</body></html>`;
}
