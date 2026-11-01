// Customer-facing proposal from a priced budget. Turns the builder's own prices
// into a one-page scope-and-price letter: section prices with the markup spread
// pro rata (the customer never sees cost or margin), typed allowances, typed
// inclusions/exclusions/terms. Refuses while any line is unpriced, since a
// proposal that silently omits scope is a liability; `partial: true` overrides
// and says so in the text. Nothing here is a price list; every number is the
// builder's typed price times the model's quantity.
const r2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;
const money = (/** @type {number} */ x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * @param {ReturnType<import("./budget.mjs").budget>} b
 * @param {{client?: string, project?: string, date?: string, validDays?: number, inclusions?: string[], exclusions?: string[], terms?: string[], partial?: boolean, payments?: {name: string, pct: number}[]}} [p]
 */
export function proposal(b, p = {}) {
  if (b.unpriced.length && !p.partial) {
    return { ok: false, error: `${b.unpriced.length} line(s) have no price (${b.unpriced.slice(0, 3).join("; ")}${b.unpriced.length > 3 ? "; ..." : ""}). Price them, or pass partial to issue the proposal with a stated gap.` };
  }
  const price = b.bid > 0 ? b.bid : b.total; // bid when markup typed, else cost total
  const scale = b.total > 0 ? price / b.total : 1;
  // Pro rata spread: tax and contingency ride on materials, so fold them into the non-labor, non-allowance sections.
  const matSections = b.sections.filter((s) => s.name !== "Labor" && s.name !== "Allowances");
  const loadMat = b.materials > 0 ? (b.materials + b.tax + b.contingency) / b.materials : 1;
  const rows = b.sections.map((s) => ({ name: s.name, amount: r2(s.subtotal * (matSections.includes(s) ? loadMat : 1) * scale) })).filter((s) => s.amount > 0);
  // Put rounding drift in the largest row so the rows add to the price exactly.
  const drift = r2(price - rows.reduce((t, s) => t + s.amount, 0));
  if (rows.length && drift !== 0) rows.reduce((m, s) => (s.amount > m.amount ? s : m)).amount = r2(rows.reduce((m, s) => (s.amount > m.amount ? s : m)).amount + drift);
  // Typed payment schedule: milestone percentages must add to 100; the last takes the cent drift.
  let payments = [];
  if (p.payments && p.payments.length) {
    const sum = p.payments.reduce((t, m) => t + Number(m.pct), 0);
    if (p.payments.some((m) => !(Number(m.pct) > 0)) || Math.abs(sum - 100) > 1e-9) {
      return { ok: false, error: `payment milestones must be positive and add to 100% (they add to ${r2(sum)}%)` };
    }
    payments = p.payments.map((m) => ({ name: m.name, pct: Number(m.pct), amount: r2(price * Number(m.pct) / 100) }));
    const pd = r2(price - payments.reduce((t, m) => t + m.amount, 0));
    payments[payments.length - 1].amount = r2(payments[payments.length - 1].amount + pd);
  }
  const scope = [...new Set(b.lines.filter((l) => l.section !== "Allowances").map((l) => l.section))];
  const allowances = b.lines.filter((l) => l.section === "Allowances").map((l) => ({ item: l.item, amount: l.amount ?? 0 }));
  return {
    ok: true, price: r2(price), rows, payments, scope, allowances, partial: !!(b.unpriced.length),
    gaps: b.unpriced, validDays: p.validDays ?? 30, meta: { client: p.client || "", project: p.project || "", date: p.date || "" },
    inclusions: p.inclusions || [], exclusions: p.exclusions || [], terms: p.terms || [],
  };
}

/** @param {ReturnType<typeof proposal>} q @returns {string[]} */
export function proposalText(q) {
  if (!q.ok) return [`  Proposal not issued: ${q.error}`];
  const o = [];
  o.push(`PROPOSAL${q.meta.project ? ": " + q.meta.project : ""}`);
  if (q.meta.client) o.push(`Prepared for ${q.meta.client}${q.meta.date ? ", " + q.meta.date : ""}`);
  else if (q.meta.date) o.push(q.meta.date);
  o.push("", "Scope of work: " + q.scope.join(", ") + ".");
  if (q.inclusions.length) o.push("Also included: " + q.inclusions.join("; ") + ".");
  o.push("", "Price by section");
  for (const r of q.rows) o.push(`  ${r.name.padEnd(24)} ${money(r.amount).padStart(14)}`);
  o.push(`  ${"Total".padEnd(24)} ${money(q.price).padStart(14)}`);
  if (q.allowances.length) {
    o.push("", "Allowances (actual cost billed; the price moves with the difference):");
    for (const a of q.allowances) o.push(`  ${a.item}: ${money(a.amount)}`);
  }
  if (q.payments.length) {
    o.push("", "Payment schedule");
    for (const m of q.payments) o.push(`  ${m.name.padEnd(24)} ${String(m.pct).padStart(5)}% ${money(m.amount).padStart(14)}`);
  }
  if (q.exclusions.length) o.push("", "Not included: " + q.exclusions.join("; ") + ".");
  if (q.terms.length) { o.push("", "Terms"); for (const t of q.terms) o.push("  - " + t); }
  o.push("", `This price is valid for ${q.validDays} days. Quantities come from the plans as drawn; changes are priced by change order.`);
  if (q.partial) o.push(`WARNING: partial proposal, not priced: ${q.gaps.join("; ")}.`);
  return o;
}

const escHtml = (/** @type {string} */ s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

/**
 * The proposal as a self-contained printable HTML document (no scripts, no
 * external files), for the page's "Print or save as PDF" button. Same numbers
 * and wording as proposalText; every typed string is escaped.
 * @param {ReturnType<typeof proposal>} q
 * @returns {string}
 */
export function proposalHtml(q) {
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Proposal${q.ok && q.meta.project ? ": " + escHtml(q.meta.project) : ""}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:1.5rem;margin:0 0 .25rem}table{width:100%;border-collapse:collapse;margin:.5rem 0}td,th{padding:.3rem .4rem;border-bottom:1px solid #ccc;text-align:left}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.total td{font-weight:700;border-top:2px solid #111}.warn{border:2px solid #b00;padding:.5rem;margin:1rem 0;font-weight:700}.small{font-size:.85rem;color:#444}@media print{body{margin:0}}</style></head><body>`;
  if (!q.ok) return head + `<h1>Proposal not issued</h1><p>${escHtml(q.error)}</p></body></html>`;
  const h = [head, `<h1>Proposal${q.meta.project ? ": " + escHtml(q.meta.project) : ""}</h1>`];
  if (q.meta.client || q.meta.date) h.push(`<p>${q.meta.client ? "Prepared for " + escHtml(q.meta.client) : ""}${q.meta.client && q.meta.date ? ", " : ""}${escHtml(q.meta.date)}</p>`);
  h.push(`<h2>Scope of work</h2><p>${q.scope.map(escHtml).join(", ")}.</p>`);
  if (q.inclusions.length) h.push(`<p>Also included: ${q.inclusions.map(escHtml).join("; ")}.</p>`);
  h.push(`<h2>Price by section</h2><table><tbody>${q.rows.map((r) => `<tr><td>${escHtml(r.name)}</td><td class="n">${money(r.amount)}</td></tr>`).join("")}<tr class="total"><td>Total</td><td class="n">${money(q.price)}</td></tr></tbody></table>`);
  if (q.allowances.length) h.push(`<h2>Allowances</h2><p class="small">Actual cost is billed; the price moves with the difference.</p><table><tbody>${q.allowances.map((a) => `<tr><td>${escHtml(a.item)}</td><td class="n">${money(a.amount)}</td></tr>`).join("")}</tbody></table>`);
  if (q.exclusions.length) h.push(`<h2>Not included</h2><ul>${q.exclusions.map((e) => `<li>${escHtml(e)}</li>`).join("")}</ul>`);
  if (q.terms.length) h.push(`<h2>Terms</h2><ul>${q.terms.map((t) => `<li>${escHtml(t)}</li>`).join("")}</ul>`);
  h.push(`<p class="small">This price is valid for ${q.validDays} days. Quantities come from the plans as drawn; changes are priced by change order.</p>`);
  if (q.partial) h.push(`<p class="warn">Partial proposal, not priced: ${q.gaps.map(escHtml).join("; ")}.</p>`);
  h.push("</body></html>");
  return h.join("");
}
