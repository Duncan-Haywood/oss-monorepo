// @ts-check
// The supplier material list: one page a lumberyard can quote from, gathered from the
// takeoff the engine already made. Nothing is counted here that the modules did not
// count; this file only groups, names and exports their numbers.
//
//   Framing lumber   the cutting-stock order: boards by size and length (pieces cut from them
//                    listed as "used for": studs, plates, headers, rafters...)
//   Members          the pieces those boards are cut into, by kind (a check on the order)
//   Wall sheathing   sheets from sheathing.mjs (when sheathing was asked for)
//   Roof             sheets, squares, shingle bundles, underlayment, drip edge, ridge cap,
//                    starter, flashing and the ridge, hip, valley, eave and rake lengths
//                    from roof.mjs; or, from an outline the framing model cannot frame,
//                    the all-hip squares and eave length (roofoutline.mjs)
//
// Prices: shown only when the caller says the plan's prices are its own (`priced`); the
// default stock price of 1 per foot is a placeholder, not a lumber price.
import { formatLength } from "./engine.mjs";

/** @typedef {{ section: string, item: string, size: string, length: string, qty: number, unit: string, note: string, cost?: number }} Row */

const KIND_ORDER = ["stud", "precut stud", "king", "jack", "cripple", "header", "sill", "plate", "bottom plate", "top plate", "cap plate", "blocking"];

/**
 * @param {any} r takeoff result (engine.mjs `takeoff`), with `sheathing`, `roof` and `roofOutline` attached as the CLI does
 * @param {{ priced?: boolean, job?: string }} [o]
 * @returns {{ ok: boolean, errors: string[], job: string, rows: Row[], totals: { boards: number, sheets: number, squares: number | null, cost: number | null }, notes: string[] }}
 */
export function materialList(r, o = {}) {
  if (!r || r.ok !== true) return { ok: false, errors: (r && r.errors) || ["The takeoff did not run."], job: "", rows: [], totals: { boards: 0, sheets: 0, squares: null, cost: null }, notes: [] };
  const job = typeof o.job === "string" ? o.job.slice(0, 80) : "";
  /** @type {Row[]} */
  const rows = [];
  const notes = [];
  let cost = 0, boards = 0, sheets = 0;
  /** @type {number | null} */
  let squares = null;

  // Framing lumber: the order, by size then board length
  for (const ord of r.orders || []) {
    const used = new Map();
    for (const b of ord.bars || []) {
      const key = b.length;
      const set = used.get(key) || new Set();
      for (const c of b.cuts || []) set.add(c.ref);
      used.set(key, set);
    }
    for (const l of ord.lines || []) {
      const kinds = [...(used.get(l.length) || [])].sort();
      rows.push({ section: "Framing lumber", item: l.label ? `${ord.size} ${l.label}` : `${ord.size} board`, size: ord.size, length: formatLength(l.length), qty: l.qty, unit: "pcs", note: kinds.length ? `used for ${kinds.join(", ")}` : "", ...(o.priced ? { cost: round2(l.qty * l.price) } : {}) });
      boards += l.qty;
      cost += l.qty * (l.price || 0);
    }
  }
  for (const l of r.culls || []) rows.push({ section: "Framing lumber", item: `${l.size} spare for culls`, size: l.size, length: formatLength(l.length), qty: l.qty, unit: "pcs", note: `${(100 * l.pct).toFixed(1)}% spare` });

  // Members by kind (what the boards are cut into: a check on the order, not more to buy)
  const byKind = new Map();
  for (const c of r.cuts || []) {
    const k = `${c.kind}|${c.size}`;
    byKind.set(k, (byKind.get(k) || 0) + c.qty);
  }
  const rank = (k) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
  for (const [k, qty] of [...byKind.entries()].sort((a, b) => rank(a[0].split("|")[0]) - rank(b[0].split("|")[0]) || a[0].localeCompare(b[0]))) {
    const [kind, size] = k.split("|");
    rows.push({ section: "Members cut from those boards", item: `${size} ${kind}`, size, length: "", qty, unit: "pcs", note: "" });
  }

  // Wall sheathing
  if (r.sheathing && r.sheathing.ok !== false) {
    // one row per sheet size; `orders` has a row per course, `order` is the single-course shape
    const bySize = new Map();
    const src = Array.isArray(r.sheathing.orders) ? r.sheathing.orders : r.sheathing.order ? [r.sheathing.order] : [];
    for (const s of src) { const t = bySize.get(s.label) || { label: s.label, qty: 0, cost: 0 }; t.qty += s.qty; t.cost += Number.isFinite(s.cost) ? s.cost : 0; bySize.set(s.label, t); }
    for (const s of bySize.values()) {
      rows.push({ section: "Wall sheathing", item: `sheathing ${s.label}`, size: s.label, length: "", qty: s.qty, unit: "sheets", note: "", ...(o.priced && Number.isFinite(s.cost) ? { cost: round2(s.cost) } : {}) });
      sheets += s.qty;
      if (Number.isFinite(s.cost)) cost += s.cost;
    }
  }

  // Roof
  const roof = r.roof;
  if (roof && roof.ok !== false) {
    const g = roof.roofing || {};
    const shape = roof.shape === "hip" ? "hip" : roof.wings && roof.wings.length ? `gable with ${roof.wings.length} cross wing${roof.wings.length === 1 ? "" : "s"}` : roof.trusses ? "gable (trusses)" : "gable";
    rows.push({ section: "Roof", item: `roof sheathing 4x8`, size: "4x8", length: "", qty: roof.sheets.count, unit: "sheets", note: `${shape}, ${roof.pitch}:12; ${roof.sheets.area.toFixed(0)} sq ft covered` });
    sheets += roof.sheets.count;
    squares = g.squares;
    const add = (item, qty, unit, note = "") => { if (Number.isFinite(qty) && qty > 0) rows.push({ section: "Roof", item, size: "", length: "", qty: Math.round(qty * 100) / 100, unit, note }); };
    add("roof area", g.squares, "squares", "100 sq ft each, before waste");
    add("shingles", g.shingleBundles, "bundles", `${g.assumptions?.bundlesPerSquare ?? 3} per square x ${g.assumptions?.waste ?? 1.1} waste (typed rule)`);
    add("underlayment", g.underlaymentRolls, "rolls");
    add("drip edge", g.dripEdgePieces, "pcs");
    add("ridge cap", g.ridgeBundles, "bundles");
    add("starter strip", g.starterBundles, "bundles");
    add("valley flashing", g.valleyFlashingRolls, "rolls");
    add("ice and water shield", g.iceShieldRolls, "rolls");
    add("roofing nails", g.nailBoxes, "boxes", g.nailLb ? `${g.nailLb.toFixed(0)} lb` : "");
    add("ridge length", g.ridgeFeet - (g.hipFeet || 0), "ft", "ridge boards and cap");
    add("hip length", g.hipFeet, "ft", "along the slope");
    add("valley length", g.valleyFeet, "ft", "along the slope");
    add("eave length", g.eaveFeet, "ft", "drip edge, gutter, fascia");
    add("rake length", g.rakeFeet, "ft", "gable edges");
    if (roof.trusses) rows.push({ section: "Roof", item: "trusses", size: "", length: formatLength(roof.trusses.span), qty: roof.trusses.count, unit: "pcs", note: "from the truss maker's drawings" });
  }
  const ro = r.roofOutline;
  if (ro && ro.ok) {
    if (!roof) {
      squares = ro.squares;
      rows.push({ section: "Roof", item: "roof area (all-hip, from outline)", size: "", length: "", qty: round2(ro.squares), unit: "squares", note: `${ro.pitch}:12, ${ro.overhang} in eave; exact for one pitch and level eaves` });
      rows.push({ section: "Roof", item: "eave length (from outline)", size: "", length: "", qty: round2(ro.eaveFeet), unit: "ft", note: "drip edge, gutter, fascia" });
      if (ro.hipFeet != null) {
        rows.push({ section: "Roof", item: "ridge length (from outline)", size: "", length: "", qty: round2(ro.ridgeFeet), unit: "ft", note: "rectangle, closed form" });
        rows.push({ section: "Roof", item: "hip length (from outline)", size: "", length: "", qty: round2(ro.hipFeet), unit: "ft", note: "four hips along the slope" });
      } else rows.push({ section: "Roof", item: "hips and valleys (from outline)", size: "", length: "", qty: ro.convex + ro.reflex, unit: "lines", note: `${ro.convex} hips, ${ro.reflex} valleys; lengths not computed for this outline` });
      notes.push(...ro.notes);
    } else if (Math.abs(ro.squares - squares) > 0.01) {
      notes.push(`From the outline, an all-hip roof at the same pitch and eave would be ${ro.squares.toFixed(2)} squares (the framed roof above is ${squares?.toFixed(2)}: gable ends and rake overhangs differ).`);
    }
  }
  if (Array.isArray(r.skippedWalls) && r.skippedWalls.length) {
    // a wall the plan checks refused is not on this list; say so where the list is read, the CSV included
    rows.unshift({ section: "Warning", item: `${r.skippedWalls.length} wall${r.skippedWalls.length === 1 ? "" : "s"} not on this list`, size: "", length: "", qty: r.skippedWalls.length, unit: "walls", note: r.skippedWalls.map((w) => String(w).slice(0, 200)).join(" | ") });
    notes.unshift(`INCOMPLETE: ${r.skippedWalls.length} wall${r.skippedWalls.length === 1 ? " was" : "s were"} refused by the plan checks and ${r.skippedWalls.length === 1 ? "is" : "are"} not counted here: fix ${r.skippedWalls.length === 1 ? "it" : "them"} and re-run.`);
  }
  notes.push("Quantities are counted from the layout; lumber grade, species, treatment and the supplier's own waste allowance are yours to set.");
  if (!o.priced) notes.push("No prices: the plan's board prices are the default placeholder (1 per foot). Type your yard's prices and pass priced to show cost.");
  return { ok: true, errors: [], job, rows, totals: { boards, sheets, squares, cost: o.priced ? round2(cost) : null }, notes };
}

/** @param {number} v */
const round2 = (v) => Math.round(v * 100) / 100;

/** A cell that a spreadsheet would read as a formula gets a leading apostrophe. @param {unknown} v */
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {ReturnType<typeof materialList>} m */
export function materialListCsv(m) {
  if (!m.ok) return "";
  const priced = m.totals.cost != null;
  const head = ["section", "item", "size", "length", "qty", "unit", "note", ...(priced ? ["cost"] : [])];
  const lines = [head, ...m.rows.map((x) => [x.section, x.item, x.size, x.length, String(x.qty), x.unit, x.note, ...(priced ? [x.cost == null ? "" : x.cost.toFixed(2)] : [])])];
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

/** @param {ReturnType<typeof materialList>} m */
export function materialListText(m) {
  if (!m.ok) return m.errors.map((e) => `  - ${e}`);
  const out = [`MATERIAL LIST${m.job ? `: ${m.job}` : ""}`];
  let sec = "";
  for (const x of m.rows) {
    if (x.section !== sec) { sec = x.section; out.push("", sec.toUpperCase()); }
    const q = Number.isInteger(x.qty) ? String(x.qty) : x.qty.toFixed(2);
    out.push(`  ${q.padStart(7)} ${x.unit.padEnd(8)} ${x.item}${x.length ? ` x ${x.length}` : ""}${x.note ? `  (${x.note})` : ""}${x.cost != null ? `  ${x.cost.toFixed(2)}` : ""}`);
  }
  out.push("", `Totals: ${m.totals.boards} boards, ${m.totals.sheets} sheets${m.totals.squares != null ? `, ${m.totals.squares.toFixed(2)} squares of roof` : ""}${m.totals.cost != null ? `, cost ${m.totals.cost.toFixed(2)}` : ""}`);
  for (const n of m.notes) out.push(`  - ${n}`);
  return out;
}
