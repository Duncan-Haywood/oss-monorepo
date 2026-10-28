// @ts-check
// Bid leveling against the model's quantities. Subs bid the same scope with
// different counts: one prices 410 sheets, another 380, a third leaves the
// vapor barrier out. This lines each bid up against the takeoff's own budget
// lines (budget.mjs) so the low number is compared on the same scope.
//
// Input, plan key `bids`: [{ bidder, lines: [{ item, qty, unitPrice?, amount? }] }]
// `item` is a budget line's item name (case and spacing ignored). A line gives
// `amount`, or `qty` and `unitPrice`. Nothing is shipped as a price: a gap is
// priced only from the other bidders' unit prices (median) or the plan's typed
// price for that line, and with neither it is listed as unleveled, never guessed.

const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;
const norm = (/** @type {string} */ s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const median = (/** @type {number[]} */ a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param {{ lines: { item: string, qty: number, unit: string, unitPrice: number | null }[] }} bud result of budget()
 * @param {{ bidder: string, lines: { item: string, qty?: number, unitPrice?: number, amount?: number }[] }[]} bids
 * @param {{ tolerance?: number }} [opts] fraction of the model quantity a bid may differ by before it is flagged (default 0.05)
 */
export function levelBids(bud, bids, opts = {}) {
  const tol = opts.tolerance ?? 0.05;
  const byKey = new Map(bud.lines.map((l) => [norm(l.item), l]));
  const errors = [];
  /** @type {Map<string, Map<string, { qty: number | null, amount: number, unitPrice: number | null }>>} */
  const got = new Map();
  for (const b of bids) {
    const m = new Map();
    for (const l of b.lines || []) {
      const k = norm(l.item);
      if (!byKey.has(k)) { errors.push(`${b.bidder}: "${l.item}" matches no takeoff line (lines: ${bud.lines.map((x) => x.item).join("; ")})`); continue; }
      const qty = typeof l.qty === "number" ? l.qty : null;
      const amount = typeof l.amount === "number" ? l.amount : qty != null && typeof l.unitPrice === "number" ? qty * l.unitPrice : null;
      if (amount == null) { errors.push(`${b.bidder}: "${l.item}" has no amount (give amount, or qty and unitPrice)`); continue; }
      const unitPrice = typeof l.unitPrice === "number" ? l.unitPrice : qty ? amount / qty : null;
      const prev = m.get(k);
      if (prev) errors.push(`${b.bidder}: "${l.item}" given twice; the second is ignored`);
      else m.set(k, { qty, amount, unitPrice });
    }
    got.set(b.bidder, m);
  }

  const rows = bud.lines.map((l) => {
    const k = norm(l.item);
    const peers = bids.map((b) => got.get(b.bidder)?.get(k)?.unitPrice).filter((x) => typeof x === "number");
    const ref = l.unitPrice ?? median(/** @type {number[]} */ (peers));
    return { item: l.item, unit: l.unit, modelQty: l.qty, refUnitPrice: ref == null ? null : r2(ref), refSource: l.unitPrice != null ? "plan price" : ref != null ? "median of bids" : null, k };
  });

  const out = bids.map((b) => {
    const m = got.get(b.bidder) || new Map();
    let bid = 0, adds = 0;
    /** @type {{ item: string, kind: string, note: string }[]} */
    const flags = [];
    /** @type {string[]} */
    const unleveled = [];
    for (const r of rows) {
      const g = m.get(r.k);
      if (!g) {
        if (r.refUnitPrice == null) { unleveled.push(r.item); flags.push({ item: r.item, kind: "missing", note: "not in the bid; no price to level it with" }); continue; }
        const add = r2(r.modelQty * r.refUnitPrice);
        adds += add;
        flags.push({ item: r.item, kind: "missing", note: `not in the bid; ${r.modelQty} ${r.unit} at ${r.refUnitPrice} (${r.refSource}) adds ${add}` });
        continue;
      }
      bid += g.amount;
      if (g.qty != null && r.modelQty > 0) {
        const d = (g.qty - r.modelQty) / r.modelQty;
        if (Math.abs(d) > tol) {
          const p = g.unitPrice ?? r.refUnitPrice;
          const adj = d < 0 && p != null ? r2((r.modelQty - g.qty) * p) : 0;
          adds += adj;
          flags.push({ item: r.item, kind: d < 0 ? "short" : "over", note: `bid ${g.qty} ${r.unit} vs model ${r.modelQty} (${(d * 100).toFixed(1)}%)${adj ? `; the shortfall at the bid's own price adds ${adj}` : d > 0 ? "; extra quantity left in, not removed" : ""}` });
        }
      }
    }
    return { bidder: b.bidder, bidTotal: r2(bid), additions: r2(adds), leveledTotal: r2(bid + adds), unleveled, flags };
  });
  const ranked = [...out].sort((a, b) => a.leveledTotal - b.leveledTotal);
  return { tolerance: tol, rows: rows.map(({ k, ...r }) => r), bidders: out, lowestLeveled: ranked[0]?.bidder ?? null, lowestAsBid: [...out].sort((a, b) => a.bidTotal - b.bidTotal)[0]?.bidder ?? null, errors };
}

/** @param {ReturnType<typeof levelBids>} r */
export function levelText(r) {
  const o = [];
  for (const b of r.bidders) {
    o.push(`${b.bidder}: as bid ${b.bidTotal.toFixed(2)}, leveled ${b.leveledTotal.toFixed(2)} (+${b.additions.toFixed(2)})`);
    for (const f of b.flags) o.push(`  ${f.kind.toUpperCase()} ${f.item}: ${f.note}`);
    if (b.unleveled.length) o.push(`  unleveled (no price anywhere): ${b.unleveled.join(", ")}`);
  }
  if (r.lowestLeveled) o.push(r.lowestLeveled === r.lowestAsBid ? `Lowest on both counts: ${r.lowestLeveled}` : `Lowest as bid: ${r.lowestAsBid}; lowest once leveled: ${r.lowestLeveled}`);
  for (const e of r.errors) o.push(`ERROR ${e}`);
  return o;
}
