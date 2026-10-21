// Getting paid: a customer statement (everything one customer owes, aged) and a
// payment reminder for each customer with overdue invoices, in a tone that steps up
// with how late the oldest one is (friendly, firm, final). Built on the same open
// documents as aging(), so the amounts always agree with the ledger. Drafts are
// plain text and HTML for the owner to read and send; nothing is sent from here.
// Pure functions, no DOM, no network.

import { aging } from "./accruals.mjs";
import { fmt } from "./ledger.mjs";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (v) => esc(v).replace(/\r?\n/g, "<br>");

export const TONES = ["friendly", "firm", "final"];
// Days past due at which the tone steps up. Defaults are a common practice, not a rule.
export const DEFAULT_STEPS = { firm: 15, final: 45 };

export const toneFor = (daysLate, steps = DEFAULT_STEPS) =>
  daysLate >= steps.final ? "final" : daysLate >= steps.firm ? "firm" : "friendly";

const ref = (id) => id.replace(/^INV-/, "");

// Open invoices and unapplied credit notes of one customer (case-insensitive name).
function openFor(books, party, asOf) {
  const a = aging(books, asOf);
  const rows = a.open.filter((x) => x.kind === "invoice" && x.party.toLowerCase() === party.toLowerCase());
  return { asOf: a.asOf, buckets: a.buckets, rows };
}

// -> { party, asOf, rows, total, overdue, byBucket, buckets, html, text }
export function customerStatement(books, party, { asOf = null } = {}) {
  const { asOf: day, buckets, rows } = openFor(books, party, asOf);
  if (!rows.length) throw new Error(`nothing open for ${party}`);
  const cur = books.currency ?? "";
  const m = (c) => fmt(c, cur);
  const p = books.profile ?? {};
  const seller = p.name || books.name || "";
  const name = rows[0].party;
  const total = rows.reduce((a, x) => a + x.total, 0);
  const byBucket = buckets.map((_, i) => rows.filter((x) => x.bucket === buckets[i]).reduce((a, x) => a + x.total, 0));
  const overdue = byBucket.slice(1).reduce((a, x) => a + x, 0);
  const lines = rows.map((x) => `<tr><td>${esc(ref(x.id))}${x.credit ? " (credit)" : ""}</td><td>${esc(x.date)}</td><td>${esc(x.due ?? "")}</td><td class="n">${x.daysLate || ""}</td><td class="n">${esc(m(x.total))}</td></tr>`).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Statement ${esc(name)}${seller ? ` - ${esc(seller)}` : ""}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;color:#1a1a1a;max-width:720px;margin:32px auto;padding:0 16px}
h1{font-size:28px;margin:0}.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.muted{color:#666}
table{width:100%;border-collapse:collapse;margin:20px 0 8px}th{text-align:left;border-bottom:2px solid #1a1a1a;padding:6px 0}
td{padding:7px 0;border-bottom:1px solid #ddd}.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.sum td,.sum th{font-size:13px}.due{font-size:20px;font-weight:700;text-align:right}.late{color:#b42318}@media print{body{margin:0}}
</style></head><body>
<div class="top"><div><h1>Statement</h1><div class="muted">as of ${esc(day)}</div></div>
<div style="text-align:right"><strong>${esc(seller)}</strong><br>${nl(p.address)}${p.email ? `<br>${esc(p.email)}` : ""}</div></div>
<p><span class="muted">For</span><br><strong>${esc(name)}</strong></p>
<table><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="n">Days late</th><th class="n">Open</th></tr></thead><tbody>${lines}</tbody></table>
<table class="sum"><thead><tr>${buckets.map((b) => `<th class="n">${esc(b)}</th>`).join("")}</tr></thead><tbody><tr>${byBucket.map((x) => `<td class="n">${esc(m(x))}</td>`).join("")}</tr></tbody></table>
<p class="due">Total due ${esc(m(total))}${overdue > 0 ? ` <span class="late">(${esc(m(overdue))} overdue)</span>` : ""}</p>
${p.payTo ? `<p><strong>How to pay.</strong><br>${nl(p.payTo)}</p>` : ""}${p.terms ? `<p class="muted">${nl(p.terms)}</p>` : ""}
</body></html>
`;
  const text = [`Statement for ${name} as of ${day}`, ...rows.map((x) => `  ${ref(x.id).padEnd(10)} due ${x.due ?? "-"}  ${String(x.daysLate || "").padStart(4)} late  ${m(x.total).padStart(12)}`), `Total due ${m(total)}${overdue > 0 ? `, of which overdue ${m(overdue)}` : ""}`].join("\n");
  return { party: name, asOf: day, rows, total, overdue, byBucket, buckets, html, text };
}

const OPEN = {
  friendly: (n, who) => `Hello ${n},\n\nA quick note from ${who}: payment of {subject} may have slipped past. If it has already been paid, please ignore this and thank you.`,
  firm: (n, who) => `Hello ${n},\n\nOur records show payment of {subject} to ${who} is past due. Please arrange payment this week, or tell us if something is holding it up.`,
  final: (n, who) => `Dear ${n},\n\nThis is a final reminder from ${who}. Payment of {subject} is now well past due. Unless we receive payment or hear from you within 7 days, we will have to stop further work or supplies on the account and consider other recovery steps.`,
};

// One reminder per customer with an overdue invoice, oldest debt first.
// -> [{ party, tone, daysLate, overdue, invoices:[id], subject, text }]
export function reminders(books, { asOf = null, steps = DEFAULT_STEPS, min = 1 } = {}) {
  const a = aging(books, asOf);
  const cur = books.currency ?? "";
  const m = (c) => fmt(c, cur);
  const p = books.profile ?? {};
  const who = p.name || books.name || "us";
  const by = new Map();
  for (const x of a.open) {
    if (x.kind !== "invoice" || x.credit || x.daysLate < 1) continue;
    const k = x.party.toLowerCase();
    if (!by.has(k)) by.set(k, { party: x.party, rows: [] });
    by.get(k).rows.push(x);
  }
  const out = [];
  for (const { party, rows } of by.values()) {
    const overdue = rows.reduce((s, x) => s + x.total, 0);
    if (overdue < min) continue;
    const daysLate = Math.max(...rows.map((x) => x.daysLate));
    const tone = toneFor(daysLate, steps);
    const subject = rows.length === 1 ? `invoice ${ref(rows[0].id)} (${m(rows[0].total)})` : `${rows.length} invoices (${m(overdue)} in all)`;
    const list = rows.map((x) => `  - ${ref(x.id)}, due ${x.due}, ${x.daysLate} days late, ${m(x.total)}`).join("\n");
    const body = OPEN[tone](party, who).replace("{subject}", subject);
    const text = `${body}\n\n${list}\n\nTotal overdue: ${m(overdue)}\n${p.payTo ? `\nHow to pay:\n${p.payTo}\n` : ""}\nThank you,\n${who}${p.email ? `\n${p.email}` : ""}\n`;
    out.push({ party, tone, daysLate, overdue, invoices: rows.map((x) => x.id), subject: `${tone === "final" ? "Final reminder" : "Reminder"}: ${subject}`, text });
  }
  out.sort((x, y) => y.daysLate - x.daysLate || y.overdue - x.overdue || x.party.localeCompare(y.party));
  return out;
}
