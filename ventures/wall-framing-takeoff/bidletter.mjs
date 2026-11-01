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
 * @param {{client?: string, project?: string, date?: string, validDays?: number, inclusions?: string[], exclusions?: string[], terms?: string[], partial?: boolean}} [p]
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
  const scope = [...new Set(b.lines.filter((l) => l.section !== "Allowances").map((l) => l.section))];
  const allowances = b.lines.filter((l) => l.section === "Allowances").map((l) => ({ item: l.item, amount: l.amount ?? 0 }));
  return {
    ok: true, price: r2(price), rows, scope, allowances, partial: !!(b.unpriced.length),
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
  if (q.exclusions.length) o.push("", "Not included: " + q.exclusions.join("; ") + ".");
  if (q.terms.length) { o.push("", "Terms"); for (const t of q.terms) o.push("  - " + t); }
  o.push("", `This price is valid for ${q.validDays} days. Quantities come from the plans as drawn; changes are priced by change order.`);
  if (q.partial) o.push(`WARNING: partial proposal, not priced: ${q.gaps.join("; ")}.`);
  return o;
}
