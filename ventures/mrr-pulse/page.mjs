// The dashboard the server serves. Everything dynamic is escaped.
import { formatMoney } from "./metrics.mjs";
import { mrrChart } from "./chart.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pc = (v, d = 1) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(d)}%`);

export function renderDashboard({ company, summary, months, currency, lastSyncAt, skipped }) {
  const $ = (n) => esc(formatMoney(n, currency));
  const r = summary?.rates || {};
  const tile = (label, value, sub = "") => `<div class="t"><div class="l">${esc(label)}</div><div class="v">${value}</div><div class="s">${esc(sub)}</div></div>`;
  const rows = [...months].reverse().map((m) => `<tr><td>${esc(m.month)}${m.approximate ? " <abbr title='Rebuilt from subscription dates at today&#39;s prices: no expansion or contraction'>~</abbr>" : ""}</td><td>${$(m.mrr)}</td><td>${m.customers}</td><td>+${$(m.new)}</td><td>+${$(m.expansion)}</td><td>+${$(m.reactivation)}</td><td>-${$(m.contraction)}</td><td>-${$(m.churn)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(company)} · MRR Pulse</title>
<style>:root{font:16px system-ui,sans-serif;color:#1b1f2a;background:#f5f4fa}body{max-width:980px;margin:auto;padding:24px}h1{font-size:1.5rem;color:#2e2a74;margin:0 0 4px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}.t,.card{background:#fff;border:1px solid #dcdbec;border-radius:12px;padding:14px}.l{font-size:.8rem;color:#4a4a63}.v{font-size:1.5rem;font-weight:800;color:#2e2a74}.s{font-size:.78rem;color:#4a4a63}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{text-align:right;padding:6px 8px;border-bottom:1px solid #e8e7f3}th:first-child,td:first-child{text-align:left}.note{font-size:.84rem;color:#4a4a63}</style></head><body>
<h1>${esc(company)} · MRR Pulse</h1><p class="note">Last synced ${lastSyncAt ? esc(new Date(lastSyncAt).toISOString().replace("T", " ").slice(0, 16)) + " UTC" : "never"}. Read-only: this server cannot change anything in Stripe.${skipped ? ` ${skipped} subscription(s) in another currency were left out.` : ""}</p>
${summary ? `<div class="grid">${tile("MRR", $(summary.mrr), summary.growthPct === null ? "" : `${pc(summary.growthPct)} vs last month`)}${tile("ARR (MRR × 12)", $(summary.arr))}${tile("Customers", String(summary.customers), `ARPA ${formatMoney(summary.arpa, currency)}`)}${tile("Net new MRR", $(summary.netNew), summary.month + " so far")}${tile("Net revenue retention", pc(r.nrr), "month " + (r.basis || ""))}${tile("Logo churn", pc(r.logoChurn), "month " + (r.basis || ""))}${tile("Quick ratio", r.quickRatio === null || r.quickRatio === undefined ? "n/a" : r.quickRatio.toFixed(1), "(new+expansion) ÷ (churn+contraction)")}</div>
<div class="card">${mrrChart(months, currency)}</div>
<div class="card" style="margin-top:16px;overflow-x:auto"><table><thead><tr><th>Month</th><th>MRR</th><th>Cust.</th><th>New</th><th>Expansion</th><th>Reactiv.</th><th>Contraction</th><th>Churn</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p>No data yet. Click sync or wait for the first scheduled sync.</p>`}
<p class="note">MRR counts active and past-due subscriptions, normalises every price to a month, nets percent-off coupons, and excludes trials, paused subscriptions and metered usage. Months marked ~ were rebuilt from subscription dates at today's prices. Not financial or accounting advice.</p></body></html>`;
}
