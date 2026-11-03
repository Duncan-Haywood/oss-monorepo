// @ts-check
// Your own product in place of a shopping line: you found a different primed
// wood siding at the store than the T1-11 we priced, so you put its name, link,
// price and (if it covers a different area) quantity on that line. The list,
// totals, tax, CSV, quotes and cost breakdown all use your product from then on.
//
// A swap is keyed by the line's item key ('siding8', 'roofSheet'), not its name,
// so it stays on the line when the design changes its quantity. Lumber lines are
// left out: their prices are typed per board length in the price grid, and the
// cost breakdown splits each board across the assemblies that cut from it.

/** @typedef {{ name: string, price: number, qty?: number, unit?: string, url?: string, store?: string }} Swap */

/** The key a swap is stored under, or '' for a line that cannot be swapped. @param {any} r */
export function swapKey(r) {
  if (!r || r.section === 'Lumber') return '';
  return r.source?.key || `${r.section}:${r.name}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A cleaned swap, or null if it has no name or no usable price. Only http(s)
 * links are kept, so a pasted `javascript:` link never becomes a live anchor.
 * @param {any} s @returns {Swap | null}
 */
export function cleanSwap(s) {
  if (!s || typeof s !== 'object') return null;
  const name = String(s.name ?? '').trim().slice(0, 200);
  const price = Number(s.price);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  /** @type {Swap} */
  const out = { name, price: round2(price) };
  const qty = Number(s.qty);
  if (s.qty !== undefined && s.qty !== '' && s.qty !== null && Number.isFinite(qty) && qty > 0) out.qty = Math.round(qty * 1000) / 1000;
  const unit = String(s.unit ?? '').trim().slice(0, 30);
  if (unit) out.unit = unit;
  const url = String(s.url ?? '').trim();
  if (/^https?:\/\/\S+$/i.test(url)) out.url = url.slice(0, 500);
  const store = String(s.store ?? '').trim().slice(0, 60);
  if (store) out.store = store;
  return out;
}

/** Swaps from saved state: a plain object of key -> swap, bad entries dropped. @param {any} raw */
export function cleanSwaps(raw) {
  /** @type {Record<string, Swap>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const s = cleanSwap(v);
    if (s && typeof k === 'string' && k) out[k] = s;
  }
  return out;
}

/**
 * The estimate with your swaps in place. Each swapped line keeps its section and
 * item key (so it lands in the same assembly in the cost breakdown), takes your
 * name, price, unit and quantity, and remembers what it replaced in `was`.
 * Totals, tax and the grand total are worked out again.
 * @template {{ shopping: any[], total: number, tax?: number, grandTotal?: number, deliveryFee?: number }} E
 * @param {E} est @param {Record<string, Swap>} swaps @param {number} taxRate percent
 * @returns {E & { swapped: number }}
 */
export function applySwaps(est, swaps, taxRate = 0) {
  if (!swaps || !Object.keys(swaps).length) return { ...est, swapped: 0 };
  let swapped = 0;
  const shopping = est.shopping.map((r) => {
    const s = swaps[swapKey(r)];
    if (!s) return r;
    swapped++;
    const qty = s.qty ?? r.qty;
    return {
      ...r,
      name: s.name,
      qty,
      unit: s.unit || r.unit,
      price: s.price,
      total: round2(qty * s.price),
      elsewhere: false,
      was: { name: r.name, qty: r.qty, unit: r.unit, price: r.price, total: r.total },
      source: { kind: 'yours', swap: true, key: r.source?.key, url: s.url, store: s.store, note: `your swap for ${r.name}` },
    };
  });
  if (!swapped) return { ...est, swapped: 0 };
  const total = round2(shopping.reduce((t, r) => t + r.total, 0));
  const tax = Math.round(total * taxRate) / 100;
  return { ...est, shopping, total, tax, grandTotal: round2(total + tax + (est.deliveryFee || 0)), swapped };
}
