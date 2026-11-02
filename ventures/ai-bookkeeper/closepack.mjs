// @ts-check
// Branded close pack: a bookkeeper's or small firm's month- or year-end deliverable on their own
// letterhead, as one page set that prints to PDF. Cover with logo and period, the close checks
// (open items first), profit and loss, balance sheet, cash flow, and a notes page. Every number
// comes from the same engine reports the free tool shows; this is presentation only and nothing
// but the letterhead is gated. Pure: no network, every typed or imported string escaped, the logo
// accepted only as a raster data: URL.
import { reports, closeChecks, fmt } from "./engine.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** @param {string} c */
export function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f3a5f"; }

/** Only raster data URLs (an SVG can carry script). @param {string} u */
export function safeLogo(u) {
  const s = String(u || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : "";
}

const rows = (list, key = "amount") => list.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="n">${esc(fmt(r[key]))}</td></tr>`).join("");

/**
 * @param {any} books
 * @param {{ business?: string, client?: string, contact?: string, accent?: string, logo?: string, notes?: string, from?: string|null, to?: string|null, date?: string, preparedBy?: string }} [o]
 */
export function closePackHtml(books, o = {}) {
  const from = o.from || null, to = o.to || null;
  const r = reports(books, { from, to });
  const checks = closeChecks(books);
  const business = esc((o.business || "").trim() || "Close pack");
  const client = esc((o.client || "").trim());
  const accent = safeColor(o.accent || "");
  const logo = safeLogo(o.logo || "");
  const period = from || to ? `${esc(from || "start")} to ${esc(to || "latest entry")}` : "all entries";
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const order = { high: 0, medium: 1, low: 2 };
  const open = [...checks].sort((a, b) => order[a.severity] - order[b.severity]);
  const checkBlock = open.length
    ? `<table><thead><tr><th>Severity</th><th>Check</th><th>What to do</th></tr></thead><tbody>${open.map((c) => `<tr><td>${esc(c.severity)}</td><td>${esc(c.check)}</td><td>${esc(c.message)}</td></tr>`).join("")}</tbody></table>`
    : `<p>No open findings from the engine's close checks. That does not mean the books are right; it means these checks found nothing.</p>`;
  const pl = r.profitAndLoss, bs = r.balanceSheet, cf = r.cashFlow;
  const head = `<header class="bar">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<div><strong>${business}</strong> <span>${client}</span></div></header>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${business}: close pack ${period}</title>
<style>:root{--a:${accent}}body{font:14px/1.5 system-ui,sans-serif;margin:0 auto;max-width:52rem;padding:1rem;color:#1a1a1a;background:#fff}.bar{display:flex;align-items:center;gap:.75rem;border-bottom:4px solid var(--a);padding-bottom:.4rem;margin-bottom:.8rem}.bar span{color:#555}.logo{max-height:3rem;max-width:8rem}.cover{min-height:40vh;border-left:8px solid var(--a);padding:1rem 1.2rem;margin-bottom:1rem}.cover h1{margin:.2em 0;color:var(--a)}table{border-collapse:collapse;width:100%;margin:.4rem 0 1rem}th,td{border:1px solid #ccc;padding:.25rem .5rem;text-align:left;vertical-align:top}th{background:#f3f3f3}td.n{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:700;background:#fafafa}h2{color:var(--a);break-before:page}footer{margin-top:1.5rem;padding-top:.5rem;border-top:1px solid #ccc;font-size:.8rem;color:#555}@media print{body{padding:0}.cover{break-after:page}}</style></head>
<body>
<section class="cover">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<h1>${business}</h1><p>Close pack${client ? ` for ${client}` : ""}</p><p>Period: ${period}${o.date ? `. Prepared ${esc(o.date)}` : ""}${o.preparedBy ? ` by ${esc(o.preparedBy)}` : ""}</p>${o.contact ? `<p>${esc(o.contact)}</p>` : ""}
<table><tr><th>Income</th><td class="n">${esc(fmt(pl.totalIncome))}</td></tr><tr><th>Expenses</th><td class="n">${esc(fmt(pl.totalExpense))}</td></tr><tr><th>Net</th><td class="n">${esc(fmt(pl.net))}</td></tr><tr><th>Total assets</th><td class="n">${esc(fmt(bs.totalAssets))}</td></tr><tr><th>Open close findings</th><td class="n">${open.length}</td></tr></table></section>
${head}
<h2>Close checks</h2>${checkBlock}
<h2>Profit and loss</h2>
<table><thead><tr><th>Code</th><th>Account</th><th>Total</th></tr></thead><tbody><tr><th colspan="3">Income</th></tr>${rows(pl.income, "total")}<tr class="tot"><td></td><td>Total income</td><td class="n">${esc(fmt(pl.totalIncome))}</td></tr><tr><th colspan="3">Expenses</th></tr>${rows(pl.expense, "total")}<tr class="tot"><td></td><td>Total expenses</td><td class="n">${esc(fmt(pl.totalExpense))}</td></tr><tr class="tot"><td></td><td>Net profit (loss)</td><td class="n">${esc(fmt(pl.net))}</td></tr></tbody></table>
<h2>Balance sheet${bs.to ? ` at ${esc(bs.to)}` : ""}</h2>
<table><thead><tr><th>Code</th><th>Account</th><th>Balance</th></tr></thead><tbody><tr><th colspan="3">Assets</th></tr>${rows(bs.assets)}<tr class="tot"><td></td><td>Total assets</td><td class="n">${esc(fmt(bs.totalAssets))}</td></tr><tr><th colspan="3">Liabilities</th></tr>${rows(bs.liabilities)}<tr class="tot"><td></td><td>Total liabilities</td><td class="n">${esc(fmt(bs.totalLiabilities))}</td></tr><tr><th colspan="3">Equity</th></tr>${rows(bs.equity)}<tr><td></td><td>Current earnings</td><td class="n">${esc(fmt(bs.currentEarnings))}</td></tr><tr class="tot"><td></td><td>Total equity</td><td class="n">${esc(fmt(bs.totalEquity))}</td></tr></tbody></table>
${bs.balanced ? "" : "<p><strong>The balance sheet does not balance.</strong> Resolve before sending.</p>"}
${notes.length ? `<h2>Notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
<footer>Produced from the books by the free AI Bookkeeper. Not tax, legal or accounting advice and not an audit, review or compilation: the preparer is responsible for checking every figure before relying on or sending it. Lines still awaiting an account are left out of the reports. <strong>No warranty.</strong> Provided as-is, without warranty of any kind.</footer>
</body></html>
`;
}
