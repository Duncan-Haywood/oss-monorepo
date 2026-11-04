/**
 * The shelf: the designs a designer has put in one shop. Pure functions over a
 * plain list so the page only keeps it in the browser's own storage and
 * nothing leaves the device. A design is identified by its name: adding a
 * second design with the same name replaces the first (a re-save), which
 * also keeps the shop file free of two products with one handle.
 *
 * Each entry keeps the designer's own payment link for that product, because
 * a Stripe or PayPal link is per product. Links are checked later by
 * `storefront()`, which drops anything that is not https.
 */

export const MAX_SHELF = 24;

const key = d => String(d?.name ?? "").trim().toLowerCase();

/** Add or replace by name. Returns { shelf, replaced, full }; never mutates. */
export function addToShelf(shelf, design, link = "") {
  const entry = { design: structuredClone(design), link: String(link ?? "").trim() };
  const i = shelf.findIndex(e => key(e.design) === key(design));
  if (i >= 0) { const next = shelf.slice(); next[i] = entry; return { shelf: next, replaced: true, full: false }; }
  if (shelf.length >= MAX_SHELF) return { shelf, replaced: false, full: true };
  return { shelf: [...shelf, entry], replaced: false, full: false };
}

export function removeFromShelf(shelf, name) {
  const k = String(name).trim().toLowerCase();
  return shelf.filter(e => key(e.design) !== k);
}

/** Arguments for `storefront(designs, options)`: designs plus links keyed by name. */
export function shelfToShop(shelf) {
  const paymentLinks = {};
  for (const e of shelf) if (e.link) paymentLinks[e.design.name] = e.link;
  return { designs: shelf.map(e => e.design), paymentLinks };
}

/** Read a stored shelf back, dropping anything malformed. `clean` is design.mjs `sanitizeDesign`. */
export function loadShelf(raw, clean) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw.slice(0, MAX_SHELF)) {
    if (!e || typeof e !== "object" || !e.design || typeof e.design !== "object") continue;
    try { out.push({ design: clean(e.design), link: typeof e.link === "string" ? e.link : "" }); } catch { /* skip */ }
  }
  return out;
}
