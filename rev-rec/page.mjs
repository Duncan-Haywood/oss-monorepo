// The dashboard the server serves, and the table the browser demo reuses.
// Everything dynamic is escaped.
import { formatMoney } from "./revrec.mjs";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function scheduleTable(rows, currency) {
  const $ = (n) => esc(formatMoney(n, currency));
  const body = [...rows].reverse().map((r) => `<tr${r.future ? ' class="f"' : ""}><td>${esc(r.month)}${r.future ? " <abbr title='Already invoiced, not yet earned'>↗</abbr>" : ""}</td><td>${$(r.opening)}</td><td>+${$(r.billed)}</td><td>-${$(r.recognized)}</td><td>${$(r.closing)}</td></tr>`).join("");
  return `<table><thead><tr><th>Month</th><th>Deferred, opening</th><th>Billed</th><th>Recognised</th><th>Deferred, closing</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function renderDashboard({ company, summary, rows, currency, lastSyncAt, lineCount, skipped }) {
  const $ = (n) => esc(formatMoney(n, currency));
  const tile = (l, v, s = "") => `<div class="t"><div class="l">${esc(l)}</div><div class="v">${v}</div><div class="s">${esc(s)}</div></div>`;
  const s = summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(company)} · Rev Rec</title>
<style>:root{font:16px system-ui,sans-serif;color:#1b1f2a;background:#f3f7f5}body{max-width:980px;margin:auto;padding:24px}h1{font-size:1.5rem;color:#0f5132;margin:0 0 4px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0}.t,.card{background:#fff;border:1px solid #cfe0d8;border-radius:12px;padding:14px}.l{font-size:.8rem;color:#3d4f47}.v{font-size:1.5rem;font-weight:800;color:#0f5132}.s,.note{font-size:.84rem;color:#3d4f47}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{text-align:right;padding:6px 8px;border-bottom:1px solid #e3eee9}th:first-child,td:first-child{text-align:left}tr.f{color:#5b6b64}a{color:#0f5132}</style></head><body>
<h1>${esc(company)} · Rev Rec</h1><p class="note">Last synced ${lastSyncAt ? esc(new Date(lastSyncAt).toISOString().replace("T", " ").slice(0, 16)) + " UTC" : "never"}; ${lineCount} invoice lines. Read-only: this server cannot change anything in Stripe.${skipped ? ` ${skipped} line(s) in another currency were left out.` : ""}</p>
${s ? `<div class="grid">${tile("Deferred revenue now", $(s.deferredNow), "invoiced, not yet earned")}${tile("Recognised last month", s.lastMonth ? $(s.lastMonth.recognized) : "n/a", s.lastMonth ? s.lastMonth.month : "")}${tile("Billed last month", s.lastMonth ? $(s.lastMonth.billed) : "n/a", s.lastMonth ? s.lastMonth.month : "")}${tile("Still to recognise", $(s.backlog), "after this month, already invoiced")}</div>
<div class="card" style="overflow-x:auto">${scheduleTable(rows, currency)}</div>
<p class="note"><a href="/v1/journal.csv">Download journal entries (CSV)</a> · <a href="/v1/schedule">schedule JSON</a>. Import the CSV into your accounting tool or hand it to your accountant.</p>` : `<p>No data yet. Click sync or wait for the first scheduled sync.</p>`}
<p class="note">Revenue is recognised evenly per day over each invoice line's service period, on paid invoices, net of discounts and tax included in the price. Credit notes reduce revenue in the month they are issued. This is a working schedule for your bookkeeping, not accounting, tax or audit advice: check it against your own policy and with your accountant.</p></body></html>`;
}
