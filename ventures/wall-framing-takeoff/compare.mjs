// @ts-check
// Change order: what a design change does to the budget. Pure function over two budget() results,
// matched by section and item, so it needs no prices or rules beyond what each plan already typed.

const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;

/**
 * @param {any} base budget() of the original plan
 * @param {any} revised budget() of the changed plan
 */
export function budgetDiff(base, revised) {
  const key = (/** @type {any} */ l) => `${l.section}\u0000${l.item}`;
  const bm = new Map(base.lines.map((/** @type {any} */ l) => [key(l), l]));
  const rm = new Map(revised.lines.map((/** @type {any} */ l) => [key(l), l]));
  /** @type {any[]} */
  const lines = [];
  for (const k of new Set([...bm.keys(), ...rm.keys()])) {
    const a = /** @type {any} */ (bm.get(k)), b = /** @type {any} */ (rm.get(k));
    const l = a || b;
    // lumber line names carry the count of lengths, e.g. "2x4 boards (7 lengths)": a changed count is still one line
    const status = !a ? "added" : !b ? "removed" : "changed";
    const dq = r2((b?.qty ?? 0) - (a?.qty ?? 0));
    // an amount delta only means something when both sides are priced (or one side is absent)
    const priced = (!a || a.amount != null) && (!b || b.amount != null);
    const dAmount = priced ? r2((b?.amount ?? 0) - (a?.amount ?? 0)) : null;
    if (status === "changed" && dq === 0 && (dAmount ?? 0) === 0) continue;
    lines.push({ section: l.section, item: l.item, unit: l.unit, status, qtyBefore: a?.qty ?? 0, qtyAfter: b?.qty ?? 0, dQty: dq, amountBefore: a?.amount ?? null, amountAfter: b?.amount ?? null, dAmount });
  }
  // lumber lines carry "(N lengths)" in the name; pair a removed and an added line of the same size so a changed length count reads as one change
  const strip = (/** @type {string} */ s) => s.replace(/ \(\d+ lengths\)$/, "");
  for (const rem of lines.filter((l) => l.status === "removed" && l.section === "Lumber")) {
    const add = lines.find((l) => l.status === "added" && l.section === "Lumber" && strip(l.item) === strip(rem.item));
    if (!add) continue;
    rem.status = "changed"; rem.item = strip(rem.item);
    rem.qtyAfter = add.qtyAfter; rem.dQty = r2(add.qtyAfter - rem.qtyBefore);
    rem.amountAfter = add.amountAfter;
    rem.dAmount = rem.amountBefore != null && add.amountAfter != null ? r2(add.amountAfter - rem.amountBefore) : null;
    lines.splice(lines.indexOf(add), 1);
  }
  const fields = ["materials", "tax", "contingency", "labor", "allowances", "total", "overhead", "profit", "bid"];
  /** @type {Record<string, any>} */
  const totals = {};
  for (const f of fields) totals[f] = { before: base[f] ?? 0, after: revised[f] ?? 0, delta: r2((revised[f] ?? 0) - (base[f] ?? 0)) };
  const sections = [...new Set(lines.map((l) => l.section))].map((name) => ({ name, delta: r2(lines.filter((l) => l.section === name).reduce((s, l) => s + (l.dAmount ?? 0), 0)) }));
  // a line priced on one side only cannot be netted: say so rather than report a half number
  const unpricedChanges = lines.filter((l) => l.dAmount == null).map((l) => `${l.item} (${l.dQty >= 0 ? "+" : ""}${l.dQty} ${l.unit})`);
  const pct = base.total > 0 ? r2(100 * totals.total.delta / base.total) : null;
  return { lines, sections, totals, pctOfBase: pct, unpricedChanges };
}

/** @param {ReturnType<typeof budgetDiff>} d */
export function diffText(d) {
  const sg = (/** @type {number} */ n) => (n >= 0 ? "+" : "") + n.toFixed(2);
  const out = [];
  let sec = "";
  for (const l of d.lines) {
    if (l.section !== sec) { sec = l.section; out.push(`  ${sec}`); }
    const tag = l.status === "changed" ? "" : ` [${l.status}]`;
    out.push(`    ${(l.item + tag).padEnd(40)} ${String(l.qtyBefore).padStart(8)} -> ${String(l.qtyAfter).padStart(8)} ${l.unit.padEnd(7)} ${l.dAmount == null ? "no price".padStart(11) : sg(l.dAmount).padStart(11)}`);
  }
  if (!d.lines.length) out.push("  No line changed.");
  out.push("  Section change: " + (d.sections.map((s) => `${s.name} ${sg(s.delta)}`).join(", ") || "none"));
  const t = d.totals;
  out.push(`  Cost total ${t.total.before.toFixed(2)} -> ${t.total.after.toFixed(2)} (${sg(t.total.delta)}${d.pctOfBase == null ? "" : `, ${d.pctOfBase >= 0 ? "+" : ""}${d.pctOfBase.toFixed(1)}%`})`);
  if (t.overhead.before || t.overhead.after || t.profit.before || t.profit.after) out.push(`  Bid price ${t.bid.before.toFixed(2)} -> ${t.bid.after.toFixed(2)} (${sg(t.bid.delta)}; overhead and profit follow the cost change at the typed rates)`);
  if (d.unpricedChanges.length) out.push(`  Not in the change, a side has no price: ${d.unpricedChanges.join("; ")}.`);
  return out;
}
