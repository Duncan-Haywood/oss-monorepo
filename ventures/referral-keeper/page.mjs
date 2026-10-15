// Server-rendered affiliate pages. No scripts: nothing here needs one.
import { money } from "./commission.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#0f766e");

const shell = (company, color, title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · ${esc(company)}</title>
<style>body{font:16px system-ui,sans-serif;max-width:40rem;margin:2.5rem auto;padding:0 1rem;color:#1b1f2a}h1{color:${safeColor(color)};font-size:1.6rem}
.card{border:1px solid #d9dee5;border-radius:12px;padding:1rem 1.2rem;margin:1rem 0}.big{font-size:1.6rem;font-weight:800}
input,button{font:inherit;padding:.55rem .7rem;border-radius:8px;border:1px solid #9aa4b2;width:100%;box-sizing:border-box;margin:.3rem 0 .8rem}
button{background:${safeColor(color)};color:#fff;border:0;font-weight:700;cursor:pointer}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.35rem .4rem;border-bottom:1px solid #eceff3}
.note{font-size:.85rem;color:#4b5563}</style></head><body>${body}</body></html>`;

export function renderJoin({ company, color, policyText, error, done }) {
  return shell(company, color, "Partner program", `<h1>${esc(company)} partner program</h1>
<p>${esc(policyText)}</p>${error ? `<p role="alert"><strong>${esc(error)}</strong></p>` : ""}
<form method="post" action="/join" class="card"><label>Name<input name="name" required maxlength="80" autocomplete="name"></label>
<label>Email (used for payouts and to stop self-referrals)<input name="email" type="email" required maxlength="120" autocomplete="email"></label>
<button>Get my link</button></form>
<p class="note">Commissions are paid by ${esc(company)} directly, not by the software that tracks them. Self-referrals and purchases made by you or on your behalf do not earn commission.</p>`);
}

export function renderDashboard({ company, color, affiliate, link, stats, policyText }) {
  const cur = Object.keys(stats.balances);
  const rows = cur.length ? cur.map((c) => { const b = stats.balances[c]; return `<tr><td>${esc(c.toUpperCase())}</td><td>${money(b.earned, c)}</td><td>${money(b.pending, c)}</td><td>${money(b.payable, c)}</td><td>${money(b.paid, c)}</td></tr>`; }).join("") : `<tr><td colspan="5">No commission yet.</td></tr>`;
  const recent = stats.recent.length ? stats.recent.map((e) => `<tr><td>${esc(new Date(e.at).toISOString().slice(0, 10))}</td><td>${esc(e.kind === "adjust" ? "refund adjustment" : "commission")}</td><td>${money(e.cents, e.currency)}</td><td>${e.paid ? "paid" : "open"}</td></tr>`).join("") : `<tr><td colspan="4">Nothing yet.</td></tr>`;
  return shell(company, color, "Your partner dashboard", `<h1>${esc(affiliate.name)}, your ${esc(company)} link</h1>
<div class="card"><label for="l">Share this link</label><input id="l" readonly value="${esc(link)}"><p class="note">${esc(policyText)}</p></div>
<div class="card"><span class="big">${stats.visits}</span> link visits · <span class="big">${stats.referred}</span> sign-ups · <span class="big">${stats.paying}</span> paying</div>
<div class="card"><table><tr><th>Currency</th><th>Earned</th><th>Maturing</th><th>Payable</th><th>Paid</th></tr>${rows}</table></div>
<div class="card"><table><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr>${recent}</table></div>
<p class="note">"Maturing" commission is held until the refund window closes. Refunds and chargebacks reduce commission. Payouts are sent by ${esc(company)}. Bookmark this page: the link is your login.</p>`);
}
