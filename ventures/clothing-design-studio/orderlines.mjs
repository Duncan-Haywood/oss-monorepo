/**
 * Purchase-order matrix: a run split into colours and sizes, with the
 * factory's per-colour minimum checked and a CSV a factory can price from.
 *
 * Factories quote a minimum per colour (dyeing a lot of cloth costs the same
 * for 40 pieces as for 400), so "300 tees in four colours" is really four
 * orders of about 75, and two of them may be under the minimum. This takes a
 * total, colour shares and size shares, splits the total by the largest
 * remainder method (every cell a whole piece, the total exact), flags colours
 * under the minimum, and says how many colours the total can carry.
 *
 * Maths only: shares and minimums are typed, nothing is a factory's word.
 * Sizes are split inside each colour on the same shares, so size totals can
 * differ from the target by a piece or two from rounding; both are returned.
 */
import { assignCodes, validate } from "./gtin.mjs";

const MAX_PIECES = 1e6, MAX_COLOURS = 40, MAX_SIZES = 20;

function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

const isPos = x => typeof x === "number" && Number.isFinite(x) && x > 0;

function cleanShares(list, kind, max) {
  if (!Array.isArray(list) || list.length === 0) return { error: `Add at least one ${kind}.` };
  if (list.length > max) return { error: `At most ${max} ${kind}s.` };
  const seen = new Set();
  for (const e of list) {
    if (!e || typeof e.name !== "string" || !e.name.trim()) return { error: `Every ${kind} needs a name.` };
    if (!isPos(e.share)) return { error: `${kind} "${e.name}": share must be a number above 0.` };
    const k = e.name.trim().toLowerCase();
    if (seen.has(k)) return { error: `${kind} "${e.name.trim()}" is listed twice.` };
    seen.add(k);
  }
  return { list: list.map(e => ({ name: e.name.trim(), share: e.share })) };
}

/**
 * @param {{total:number, colours:{name:string,share:number}[], sizes:{name:string,share:number}[],
 *          minPerColour?:number, defectPct?:number}} o
 */
export function planMatrix(o) {
  if (!o || typeof o !== "object") return { ok: false, error: "Give a total, colours and sizes." };
  const { total, minPerColour = 0, defectPct = 0 } = o;
  if (!Number.isInteger(total) || total < 1 || total > MAX_PIECES) return { ok: false, error: `Total must be a whole number from 1 to ${MAX_PIECES}.` };
  if (typeof minPerColour !== "number" || !Number.isInteger(minPerColour) || minPerColour < 0) return { ok: false, error: "Minimum per colour must be a whole number, 0 or more." };
  if (typeof defectPct !== "number" || !(defectPct >= 0 && defectPct < 50)) return { ok: false, error: "Spare percent must be from 0 to under 50." };
  const c = cleanShares(o.colours, "colour", MAX_COLOURS); if (c.error) return { ok: false, error: c.error };
  const s = cleanShares(o.sizes, "size", MAX_SIZES); if (s.error) return { ok: false, error: s.error };

  const perColour = apportion(total, c.list.map(x => x.share));
  const shareSizes = s.list.map(x => x.share);
  const rows = c.list.map((col, i) => {
    const cells = apportion(perColour[i], shareSizes);
    const cut = cells.map(q => Math.ceil(q / (1 - defectPct / 100) - 1e-9));
    return { colour: col.name, qty: perColour[i], sizes: Object.fromEntries(s.list.map((sz, j) => [sz.name, cells[j]])),
      cutSizes: Object.fromEntries(s.list.map((sz, j) => [sz.name, cut[j]])), cutQty: cut.reduce((a, b) => a + b, 0),
      underMin: perColour[i] < minPerColour };
  });
  const sizeTotals = Object.fromEntries(s.list.map(sz => [sz.name, rows.reduce((a, r) => a + r.sizes[sz.name], 0)]));
  const sizeTarget = Object.fromEntries(s.list.map((sz, j) => [sz.name, Math.round((sz.share / shareSizes.reduce((a, b) => a + b, 0)) * total * 10) / 10]));

  const notes = [];
  const under = rows.filter(r => r.underMin);
  const maxColours = minPerColour > 0 ? Math.floor(total / minPerColour) : c.list.length;
  if (under.length) {
    notes.push(`${under.map(r => `${r.colour} (${r.qty})`).join(", ")} ${under.length === 1 ? "is" : "are"} under the ${minPerColour}-piece minimum per colour.`);
    if (maxColours < 1) notes.push(`The whole run of ${total} is under one colour's minimum of ${minPerColour}; ask the factory about a lower minimum or a stock colour.`);
    else notes.push(`${total} pieces carry at most ${maxColours} colour${maxColours === 1 ? "" : "s"} at ${minPerColour} each: drop the smallest colour${c.list.length - maxColours > 1 ? "s" : ""}, raise the total to ${minPerColour * c.list.length}, or ask for a stock colour with no minimum.`);
  }
  const tiny = rows.flatMap(r => Object.entries(r.sizes).filter(([, q]) => q === 0).map(([n]) => `${r.colour} ${n}`));
  if (tiny.length) notes.push(`Zero pieces in ${tiny.slice(0, 6).join(", ")}${tiny.length > 6 ? ` and ${tiny.length - 6} more` : ""}: the run is too small to stock every size in every colour.`);
  return { ok: true, total, minPerColour, sizeNames: s.list.map(x => x.name), rows, sizeTotals, sizeTarget,
    cutTotal: rows.reduce((a, r) => a + r.cutQty, 0), maxColours, underMinCount: under.length, notes };
}

/**
 * GTIN-13 per colour and size from the brand's own GS1 company prefix (gtin.mjs),
 * in the order of the table (colour by colour, sizes inside). Returns the codes
 * as `gtins[colourIndex][sizeName]`, or an error when the prefix is unusable.
 */
export function planGtins(plan, { prefix, start = 0, style = "Style", existing = "" } = {}) {
  if (!plan || !plan.ok) return { ok: false, error: "Plan the matrix first." };
  const res = assignCodes({ prefix, start, existing, styles: [{ name: style || "Style", colours: plan.rows.map(r => r.colour), sizes: plan.sizeNames }] });
  if (!res.ok) return res;
  const gtins = plan.rows.map(() => ({}));
  let k = 0;
  for (let i = 0; i < plan.rows.length; i++) for (const n of plan.sizeNames) gtins[i][n] = res.rows[k++].gtin;
  return { ok: true, gtins, warnings: res.warnings, next: res.next, itemNumbersLeft: res.itemNumbersLeft };
}

/** Quantity table as CSV. A leading = + - @ in a name is defused so a spreadsheet will not run it. */
export function matrixCsv(plan, { style = "", gtins = null } = {}) {
  if (!plan || !plan.ok) return "";
  const cell = v => { let t = String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const out = [["Style", "Colour", "Size", "Order qty", "Cut qty (with spares)"].concat(gtins ? ["GTIN"] : []).join(",")];
  plan.rows.forEach((r, i) => { for (const n of plan.sizeNames) {
    const row = [style, r.colour, n, r.sizes[n], r.cutSizes[n]].map(cell);
    if (gtins) row.push(gtins[i]?.[n] ?? ""); // digits only, never a formula
    out.push(row.join(","));
  } });
  return out.join("\n") + "\n";
}
