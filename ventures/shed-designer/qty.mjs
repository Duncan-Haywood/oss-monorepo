// @ts-check
// Quantities you type on the shopping list. The list counts what the design
// needs; you may want one more 2x4 x 12' for a sixth plate, fewer screws because
// you have a box, or none of a line at all. A typed quantity reprices its line;
// 0 takes the line off the total (it stays on the list, struck through, so the
// plans and quotes still show it). The design, cut sheet and plans are not
// changed by a typed quantity: they follow the design.
//
// Quantities are keyed by the line's section and listed name (before any swap),
// so a quantity stays on its line when you swap the product or resize the shed
// (some item keys, like hurricane ties and spare boards, buy on two lines).

/** The key a typed quantity is stored under. @param {any} r */
export const lineKey = (r) => `${r?.section}:${r?.was?.name ?? r?.name}`;

const round2 = (n) => Math.round(n * 100) / 100;

/** A typed quantity, or null if it is not a number of 0 or more. @param {any} v */
export function cleanQty(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

/** Saved quantities: key -> number, bad entries dropped. @param {any} raw */
export function cleanQtys(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) { const q = cleanQty(v); if (k && q !== null) out[k] = q; }
  return out;
}

/**
 * The estimate with your quantities in place. A line you typed a quantity for
 * keeps the list's count in `listQty`; at 0 it is marked `off` and keeps its
 * listed total (struck through on the page) so what it would cost is still shown.
 * A key that is not on the list is matched by the line's name, for quantities
 * saved by name before item keys were used. Totals and tax are worked out again.
 * @template {{ shopping: any[], total: number, tax?: number, grandTotal?: number, deliveryFee?: number }} E
 * @param {E} est @param {Record<string, number>} qtys @param {number} taxRate percent
 * @returns {E & { adjusted: number }}
 */
export function applyQty(est, qtys, taxRate = 0) {
  if (!qtys || !Object.keys(qtys).length) return { ...est, adjusted: 0 };
  let adjusted = 0;
  const shopping = est.shopping.map((r) => {
    const q = qtys[lineKey(r)] ?? qtys[r.was?.name ?? r.name];
    if (q === undefined || q === r.qty) return r;
    adjusted++;
    if (q === 0) return { ...r, off: true, listQty: r.qty };
    return { ...r, qty: q, listQty: r.qty, total: round2(q * r.price) };
  });
  if (!adjusted) return { ...est, adjusted: 0 };
  const total = round2(shopping.reduce((t, r) => t + r.total, 0));
  const tax = Math.round(total * taxRate) / 100;
  return { ...est, shopping, total, tax, grandTotal: round2(total + tax + (est.deliveryFee || 0)), adjusted };
}
