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
//                    the all-hip squares and eave length (roofoutline.mjs), with that roof's
//                    rafters, hips, valleys and ridge boards in the order (hipframe.mjs)
//   Siding           boards, battens, starter, corner boards, house wrap, opening trim,
//                    flashing, tape, caulk and nails from siding.mjs (when the plan has `siding`)
//   Soffit and fascia soffit panels (vented and solid when the ventilation sizing set them),
//                    fascia boards, J-channel and frieze board from eaves.mjs (when the plan
//                    has `eaves`), under the framed roof's eaves and rakes
//
// Prices: shown only when the caller says the plan's prices are its own (`priced`); the
// default stock price of 1 per foot is a placeholder, not a lumber price.
import { formatLength } from "./engine.mjs";

/** @typedef {{ section: string, item: string, size: string, length: string, qty: number, unit: string, note: string, cost?: number }} Row */

const KIND_ORDER = ["stud", "precut stud", "king", "jack", "cripple", "header", "sill", "plate", "bottom plate", "top plate", "cap plate", "blocking"];

/**
 * @param {any} r takeoff result (engine.mjs `takeoff`), with `sheathing`, `roof`, `roofOutline` (and `roofSheathing`, its courses), `siding` and `eaves` attached as the CLI does
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
    rows.push({ section: "Roof", item: `roof sheathing 4x8`, size: "4x8", length: "", qty: roof.sheets.count, unit: "sheets", note: `${shape}, ${roof.pitch}:12; ${roof.sheets.area.toFixed(0)} sq ft covered${roof.sheets.hipStarts ? `; ${roof.sheets.hipStarts} hip ends from hip offcuts, other offcuts not reused` : ""}` });
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
      rows.push({ section: "Roof", item: "ridge length (from outline)", size: "", length: "", qty: round2(ro.ridgeFeet), unit: "ft", note: `${ro.ridges} ridge${ro.ridges === 1 ? "" : "s"}, ridge boards and cap` });
      rows.push({ section: "Roof", item: "hip length (from outline)", size: "", length: "", qty: round2(ro.hipFeet), unit: "ft", note: `${ro.hips} hips along the slope` });
      if (ro.valleys) rows.push({ section: "Roof", item: "valley length (from outline)", size: "", length: "", qty: round2(ro.valleyFeet), unit: "ft", note: `${ro.valleys} valle${ro.valleys === 1 ? "y" : "ys"} along the slope, flashing` });
      notes.push(...ro.notes);
      const rs = r.roofSheathing;
      if (rs && rs.ok) {
        const size = rs.sheet && !(rs.sheet.width === 48 && rs.sheet.length === 96) ? `${rs.sheet.width}x${rs.sheet.length} in` : "4x8";
        rows.push({ section: "Roof", item: "roof sheathing (all-hip, from outline)", size, length: "", qty: rs.sheets.count, unit: "sheets", note: `${rs.planes.length} planes in courses; ${rs.sheets.area.toFixed(0)} sq ft covered, an upper bound (${rs.sheets.valleyFills || rs.sheets.hipStarts ? `${[rs.sheets.valleyFills ? `${rs.sheets.valleyFills} valley corners` : "", rs.sheets.hipStarts ? `${rs.sheets.hipStarts} hip ends` : ""].filter(Boolean).join(" and ")} from hip offcuts; other offcuts not reused` : "offcuts not reused"})` });
        sheets += rs.sheets.count;
        notes.push(...rs.notes);
      }
      if (r.roofFrame && r.roofFrame.ok) {
        const c = r.roofFrame.counts;
        rows.push({ section: "Roof", item: "rafters framed from outline", size: r.roofFrame.rafterSize, length: "", qty: c.commons + c.jacks + c.valleyJacks + c.cripples, unit: "pcs", note: `${c.commons} common, ${c.jacks} jack, ${c.valleyJacks} valley jack, ${c.cripples} cripple; ${c.hips} hips, ${c.valleys} valleys (in the lumber order above)` });
        notes.push(...r.roofFrame.notes);
      }
    } else if (Math.abs(ro.squares - squares) > 0.01) {
      notes.push(`From the outline, an all-hip roof at the same pitch and eave would be ${ro.squares.toFixed(2)} squares (the framed roof above is ${squares?.toFixed(2)}: gable ends and rake overhangs differ).`);
    }
  }
  // Siding (siding.mjs, when the plan asks for it): what a siding crew or a remodeler orders
  const sd = r.siding;
  if (sd && sd.ok === true) {
    const ft = (/** @type {number} */ inches) => `${round2(inches / 12)} ft`;
    /** @param {string} item @param {number} qty @param {string} unit @param {string} length @param {string} note @param {number | null | undefined} price */
    const add = (item, qty, unit, length, note, price) => {
      if (!(Number.isFinite(qty) && qty > 0)) return;
      const priced = o.priced && price != null && Number.isFinite(price);
      rows.push({ section: "Siding", item, size: "", length, qty, unit, note, ...(priced ? { cost: round2(qty * Number(price)) } : {}) });
      if (priced) cost += qty * Number(price);
    };
    const what = sd.style === "vertical" ? `vertical, ${sd.courses} columns at ${sd.boardWidth} in coverage` : `lap, ${sd.courses} courses at ${sd.exposure} in exposure`;
    add("siding boards", sd.boards, "pcs", ft(sd.stock), `${what}; ${round2(sd.runFeet)} ft of runs cut round openings, ${(100 * sd.waste).toFixed(0)}% waste added`, sd.boardPrice);
    if (sd.battens) add("battens", sd.battens.boards, "pcs", ft(sd.battens.stock), `one over each of ${sd.battens.pieces} seams`, sd.battens.price);
    if (sd.starter) add("siding starter strip", sd.starter.boards, "pcs", ft(sd.starter.stock), `${round2(sd.starter.feet)} ft along ${sd.starter.walls} wall base(s)`, sd.starter.price);
    add("corner boards", sd.cornerBoards, "pcs", ft(sd.cornerStock), `${sd.corners} outside corners x 2, waste added`, sd.cornerPrice);
    add("house wrap", sd.wrapRolls, "rolls", "", `${sd.wrapRollSqFt} sq ft rolls; ${round2(sd.netSqFt)} sq ft of wall net of ${round2(sd.openingSqFt)} sq ft of openings, laps added`, sd.wrapPrice);
    if (sd.trim) add("opening trim boards", sd.trim.boards, "pcs", ft(sd.trim.stock), `${sd.trim.width} in wide; ${sd.trim.doors} door(s), ${sd.trim.windows} window(s)`, sd.trim.price);
    if (sd.flashing) add("head flashing", sd.flashing.pieces, "pcs", ft(sd.flashing.stock), `over ${sd.flashing.openings} opening(s)`, sd.flashing.price);
    if (sd.tape) add("flashing tape", sd.tape.rolls, "rolls", "", `${sd.tape.rollFeet} ft rolls; ${round2(sd.tape.feet)} ft of sill and jamb runs`, sd.tape.price);
    if (sd.caulk) add("caulk", sd.caulk.tubes, "tubes", "", `${sd.caulk.tubeOz} oz; ${round2(sd.caulk.feet)} ft of joints at a ${sd.caulk.bead} in bead`, sd.caulk.price);
    if (sd.nails) add("siding nails", sd.nails.boxes, "boxes", "", `${sd.nails.boxLb} lb boxes; ${sd.nails.count} nails`, sd.nails.price);
    add("siding area", round2(sd.netSqFt), "sq ft", "", "wall net of openings, before waste (for labor by the square foot)", null);
    const fromRoof = (sd.gableWalls || []).filter((/** @type {any} */ g) => g.from === "roof");
    if (fromRoof.length) notes.push(`Siding gable ends from the framed roof: ${fromRoof.map((/** @type {any} */ g) => `${g.wall} (${g.pitch}:12, ${round2(g.rise / 12)} ft rise)`).join(", ")}; ${sd.rakeHeel > 0 ? `a band ${sd.rakeHeel} in tall under the rake on each (${round2(sd.bandSqFt)} sq ft) is in the siding and wrap` : "the band under the rake (the rafter heel) is not counted: type the siding's rakeHeel to count it"}.`);
    notes.push(...(sd.gableNotes || []));
    notes.push(`Siding is counted course by course on the sheathed walls with openings cut out; ${r.eaves && r.eaves.ok === true ? "paint is" : "soffit, fascia and paint are"} not counted, and the reveal, lengths and coverage are the figures you typed.`);
  }
  // Soffit and fascia (eaves.mjs, when the plan asks for it): under the framed roof's overhangs
  const ev = r.eaves;
  if (ev && ev.ok === true) {
    const ft = (/** @type {number} */ inches) => `${round2(inches / 12)} ft`;
    /** @param {string} item @param {number} qty @param {string} unit @param {string} length @param {string} note @param {number | null | undefined} price */
    const add = (item, qty, unit, length, note, price) => {
      if (!(Number.isFinite(qty) && qty > 0)) return;
      const priced = o.priced && price != null && Number.isFinite(price);
      rows.push({ section: "Soffit and fascia", item, size: "", length, qty, unit, note, ...(priced ? { cost: round2(qty * Number(price)) } : {}) });
      if (priced) cost += qty * Number(price);
    };
    const under = `${round2(ev.eaveFeet)} ft of eave${ev.rakeSoffit && ev.rakeFeet > 0 ? ` and ${round2(ev.rakeFeet)} ft of rake` : ""}`;
    const courses = `${ev.eaveCourses} course(s) of ${ev.panelWidth} in panels under ${under}, ${(100 * ev.waste).toFixed(0)}% waste added`;
    if (ev.ventedPanels != null && ev.ventedPanels > 0) {
      // the vented panels stand in for solid ones (eaves.mjs), so the two rows add up to the panels counted
      add("vented soffit panels", ev.ventedPanels, "pcs", ft(ev.panelStock), `${ev.ventedPanelNfa} sq in net free area each, for the intake area the ventilation sizing asks for${ev.ventedFits ? "" : "; too few panels to carry it: use a higher-NFA panel or a continuous vent"}`, ev.panelPrice);
      add("solid soffit panels", ev.solidPanels, "pcs", ft(ev.panelStock), courses, ev.panelPrice);
    } else {
      add("soffit panels", ev.panels, "pcs", ft(ev.panelStock), courses, ev.panelPrice);
    }
    add("fascia boards", ev.fascia, "pcs", ft(ev.fasciaStock), `${round2(ev.eaveFeet + ev.rakeFeet)} ft of eave${ev.rakeFeet > 0 ? " and rake" : ""}, waste added`, ev.fasciaPrice);
    add("J-channel", ev.channel, "pcs", ft(ev.channelStock), "along the wall where the soffit meets it, waste added", ev.channelPrice);
    if (ev.frieze) add("frieze boards", ev.frieze.boards, "pcs", ft(ev.frieze.stock), `${round2(ev.frieze.feet)} ft along the wall under the soffit, waste added`, ev.frieze.price);
    add("soffit area", round2(ev.soffitSqFt), "sq ft", "", "under the overhangs, before waste (for labor by the square foot)", null);
    add("fascia length", round2(ev.eaveFeet + ev.rakeFeet), "ft", "", "eave and rake runs, before waste (for labor by the foot)", null);
    notes.push(ev.shape === "outline" ? "Soffit and fascia are counted under the all-hip roof read from the outline: one eave run on each side of its eave line, the overhang deep, no rakes; corner mitres, drip edge (on the roof's own rows), nails, caulk and paint are not counted, and panel widths and stock lengths are the figures you typed." : "Soffit and fascia are counted from the framed roof's eave and rake runs and overhangs; corner mitres, drip edge (on the roof's own rows), nails, caulk and paint are not counted, and panel widths and stock lengths are the figures you typed.");
    for (const n of ev.wingNotes || []) notes.push(n);
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
