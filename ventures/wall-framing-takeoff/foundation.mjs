// @ts-check
// Foundation quantities: footing, stem wall and slab concrete, rebar, forms,
// gravel base and vapor barrier for a rectangular house.
//
// `type: "stem"` is a footing under a stem wall with a separate slab poured
// inside it; `type: "monolithic"` is one pour with a thickened edge (and
// optional thickened interior strips under bearing walls). The footing and
// stem are centred on one another and `width` x `depth` is the footing's
// outside size. Everything is closed-form geometry in inches and converts to
// cubic yards at the end; nothing here sizes a footing or checks soil bearing,
// frost depth or rebar against a code, those are your inputs.
import { formatLength } from "./engine.mjs";

const BAR_LB_FT = { 3: 0.376, 4: 0.668, 5: 1.043, 6: 1.502 };
const CU_IN_PER_YD = 46656;

/** @typedef {{ id?: string, type?: "stem"|"monolithic", width: number, depth: number, footing?: { width?: number, depth?: number, bars?: number, bar?: number, formed?: boolean }, stem?: { height?: number, thickness?: number, bar?: number, spacing?: number }, slab?: { thickness?: number, bar?: number, spacing?: number, baseThickness?: number }, interior?: { length: number, width?: number, depth?: number }[], anchorBolts?: { spacing?: number, endDistance?: number, plateStock?: number, diameter?: number, embed?: number }, cornerBars?: boolean, piers?: { name?: string, count: number, pad: number, padDepth: number, column?: number, columnHeight?: number, bars?: number, bar?: number }[], cover?: number, barLength?: number, waste?: number, truck?: number, price?: number }} Foundation */

export function sampleFoundation() {
  return { id: "Foundation", type: "stem", width: 480, depth: 336, footing: { width: 20, depth: 10, bars: 2, bar: 4 }, stem: { height: 32, thickness: 8, bar: 4, spacing: 32 }, slab: { thickness: 4, bar: 3, spacing: 18, baseThickness: 4 }, interior: [{ length: 336, width: 24, depth: 12 }] };
}

/** @param {Foundation} f */
export function validateFoundation(f) {
  const e = [];
  const ft = { width: 16, depth: 8, bars: 2, bar: 4, ...f.footing };
  if (!(f.width >= 120 && f.width <= 2400)) e.push("Foundation width must be between 10 ft and 200 ft.");
  if (!(f.depth >= 120 && f.depth <= 2400)) e.push("Foundation depth must be between 10 ft and 200 ft.");
  if ((f.type ?? "stem") !== "stem" && f.type !== "monolithic") e.push(`Unknown foundation type ${f.type}; use "stem" or "monolithic".`);
  if (!(ft.width >= 8 && ft.width <= 60)) e.push("Footing width must be between 8 and 60 in.");
  if (!(ft.depth >= 6 && ft.depth <= 48)) e.push("Footing depth must be between 6 and 48 in.");
  for (const [i, p] of (f.piers || []).entries()) {
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > 200) e.push(`Pier group ${i + 1}: count must be a whole number from 1 to 200.`);
    if (!(p.pad >= 8 && p.pad <= 96) || !(p.padDepth >= 6 && p.padDepth <= 48)) e.push(`Pier group ${i + 1}: pad must be 8 to 96 in square and 6 to 48 in deep.`);
    if (p.column && (p.column < 6 || p.column > p.pad || !(p.columnHeight > 0))) e.push(`Pier group ${i + 1}: column must be at least 6 in, no wider than the pad, with a height.`);
    if (p.bar != null && !(p.bar in BAR_LB_FT)) e.push(`Pier group ${i + 1}: bar size #${p.bar} is not one of #3 to #6.`);
  }
  if (!Number.isInteger(ft.bars) || ft.bars < 0 || ft.bars > 8) e.push("Footing bars must be a whole number from 0 to 8.");
  for (const [n, b] of [["Footing", ft.bar], ["Stem", f.stem?.bar ?? 4], ["Slab", f.slab?.bar ?? 3]]) if (!(b in BAR_LB_FT)) e.push(`${n} bar size #${b} is not one of #3 to #6.`);
  const st = { height: 32, thickness: 8, spacing: 32, ...f.stem };
  if ((f.type ?? "stem") === "stem") {
    if (!(st.height >= 8 && st.height <= 120)) e.push("Stem wall height must be between 8 and 120 in.");
    if (!(st.thickness >= 6 && st.thickness <= ft.width - 2)) e.push("Stem thickness must be at least 6 in and narrower than the footing.");
    if (!(st.spacing >= 8 && st.spacing <= 96)) e.push("Stem bar spacing must be between 8 and 96 in.");
  }
  const sl = { thickness: 4, spacing: 18, ...f.slab };
  if (!(sl.thickness >= 3 && sl.thickness <= 12)) e.push("Slab thickness must be between 3 and 12 in.");
  if (!(sl.spacing >= 6 && sl.spacing <= 48)) e.push("Slab bar spacing must be between 6 and 48 in.");
  if ((f.type ?? "stem") === "monolithic" && !(ft.depth > sl.thickness)) e.push("A monolithic thickened edge must be deeper than the slab.");
  for (const [i, s] of (f.interior || []).entries()) {
    if (!(s.length > 0 && s.length <= Math.max(f.width, f.depth))) e.push(`Interior footing ${i + 1} must be longer than 0 and no longer than the house.`);
    if (!((s.width ?? 24) >= 8 && (s.depth ?? ft.depth) >= 6)) e.push(`Interior footing ${i + 1} must be at least 8 in wide and 6 in deep.`);
  }
  if (f.anchorBolts) {
    const a = { spacing: 72, endDistance: 12, plateStock: 192, ...f.anchorBolts };
    if (!(a.spacing >= 12 && a.spacing <= 120)) e.push("Anchor bolt spacing must be between 12 and 120 in.");
    if (!(a.endDistance >= 4 && a.endDistance <= 24)) e.push("Anchor bolt end distance must be between 4 and 24 in.");
    if (!(a.plateStock >= 96 && a.plateStock <= 240)) e.push("Sill plate stock must be between 8 and 20 ft.");
    if (a.plateStock < 4 * a.endDistance) e.push("Sill plate stock is too short for the end distance.");
  }
  if (f.waste != null && !(f.waste >= 0 && f.waste <= 0.3)) e.push("Waste must be between 0 and 0.3.");
  if (f.truck != null && !(f.truck >= 1 && f.truck <= 12)) e.push("Truck size must be between 1 and 12 cubic yards.");
  return e;
}

/** Straight bars of `stock` length needed to run `len` with a lap at each joint. */
function splice(len, stock, lap) {
  if (len <= stock) return { bars: 1, joints: 0 };
  const bars = Math.ceil((len - lap) / (stock - lap) - 1e-9);
  return { bars, joints: bars - 1 };
}

/** @param {Foundation} f */
export function layoutFoundation(f) {
  const errors = validateFoundation(f);
  if (errors.length) return { ok: false, errors };
  const type = f.type ?? "stem";
  const ft = { width: 16, depth: 8, bars: 2, bar: 4, ...f.footing };
  const st = { height: 32, thickness: 8, bar: 4, spacing: 32, ...f.stem };
  const sl = { thickness: 4, bar: 3, spacing: 18, baseThickness: 4, ...f.slab };
  const cover = f.cover ?? 3, stock = f.barLength ?? 240, waste = f.waste ?? 0.05, truck = f.truck ?? 10;
  const lapOf = (/** @type {number} */ bar) => 40 * (bar / 8); // 40 bar diameters
  const interior = (f.interior || []).map((s) => ({ length: s.length, width: s.width ?? 24, depth: s.depth ?? ft.depth }));

  // Perimeter run of the footing's centreline (the footing is `width` x `depth` outside).
  const cw = f.width - ft.width, cd = f.depth - ft.width;
  const centreline = 2 * (cw + cd);
  const footVol = centreline * ft.width * ft.depth;
  const interiorVol = interior.reduce((s, i) => s + i.length * i.width * i.depth, 0);

  /** @type {{ name: string, cuYd: number }[]} */
  const pours = [];
  let slabW, slabD, slabArea, formArea, formEdge;
  if (type === "stem") {
    slabW = f.width - ft.width - st.thickness; slabD = f.depth - ft.width - st.thickness;
    slabArea = slabW * slabD / 144;
    pours.push({ name: "footing", cuYd: footVol / CU_IN_PER_YD });
    pours.push({ name: "stem wall", cuYd: (2 * (cw + cd)) * st.thickness * st.height / CU_IN_PER_YD });
    pours.push({ name: "slab", cuYd: slabW * slabD * sl.thickness / CU_IN_PER_YD });
    if (interiorVol) pours.push({ name: "interior footings", cuYd: interiorVol / CU_IN_PER_YD });
    // Stem forms on both faces; footings are poured in the trench unless `footing.formed`.
    const stemFaces = 2 * centreline * st.height / 144;
    const footForms = ft.formed ? centreline * 2 * ft.depth / 144 : 0;
    formArea = stemFaces + footForms;
    formEdge = 2 * centreline / 12 + (ft.formed ? 2 * centreline / 12 : 0);
  } else {
    // One pour: the slab over the whole outside, plus the thickened edge band below it.
    slabW = f.width; slabD = f.depth;
    slabArea = slabW * slabD / 144;
    const band = f.width * f.depth - (f.width - 2 * ft.width) * (f.depth - 2 * ft.width);
    pours.push({ name: "slab", cuYd: f.width * f.depth * sl.thickness / CU_IN_PER_YD });
    pours.push({ name: "thickened edge", cuYd: band * (ft.depth - sl.thickness) / CU_IN_PER_YD });
    if (interiorVol) pours.push({ name: "interior thickened strips", cuYd: interior.reduce((s, i) => s + i.length * i.width * Math.max(0, i.depth - sl.thickness), 0) / CU_IN_PER_YD });
    const outside = 2 * (f.width + f.depth);
    formArea = outside * sl.thickness / 144; // edge form above grade; the trench shapes the rest
    formEdge = outside / 12;
  }
  // Piers: square pads with an optional square column on top (deck posts, interior columns).
  const piers = (f.piers || []).map((p, i) => ({ name: p.name ?? `pier ${i + 1}`, count: p.count, pad: p.pad, padDepth: p.padDepth, column: p.column ?? 0, columnHeight: p.columnHeight ?? 0, bars: p.bars ?? 4, bar: p.bar ?? 4 }));
  for (const p of piers) {
    const vol = p.count * (p.pad * p.pad * p.padDepth + p.column * p.column * p.columnHeight);
    pours.push({ name: `${p.name} (${p.count} pads${p.column ? " and columns" : ""})`, cuYd: vol / CU_IN_PER_YD });
  }
  const concreteNet = pours.reduce((s, p) => s + p.cuYd, 0);
  const concrete = concreteNet * (1 + waste);
  const trucks = Math.max(1, Math.ceil(concrete / truck - 1e-9));
  const lastLoad = concrete - (trucks - 1) * truck;

  // Rebar.
  /** @type {{ what: string, bar: number, qty: number, length: number, feet: number }[]} */
  const rebar = [];
  const addBars = (what, bar, runs, runLen) => {
    if (!runs) return;
    const lap = lapOf(bar);
    const sp = splice(runLen, stock, lap);
    const feet = runs * (runLen + sp.joints * lap) / 12;
    rebar.push({ what, bar, qty: runs * sp.bars, length: Math.min(stock, runLen) / 12, feet });
  };
  const loop = 2 * ((f.width - 2 * cover) + (f.depth - 2 * cover));
  const sideW = f.width - 2 * cover, sideD = f.depth - 2 * cover;
  // With `cornerBars` the horizontal layers run straight along each side and an L-bar (a lap-length
  // leg each way) ties every layer at every corner; otherwise a layer is one loop bent on site.
  const horizontal = (/** @type {string} */ what, /** @type {number} */ bar, /** @type {number} */ layers) => {
    if (!f.cornerBars) return addBars(`${what} continuous bars`, bar, layers, loop);
    addBars(`${what} bars, long sides`, bar, 2 * layers, sideW);
    addBars(`${what} bars, short sides`, bar, 2 * layers, sideD);
    const leg = Math.ceil(lapOf(bar)), len = 2 * leg;
    if (layers) rebar.push({ what: `${what} corner L-bars (${leg} in legs)`, bar, qty: 4 * layers, length: len / 12, feet: 4 * layers * len / 12 });
  };
  horizontal("footing", ft.bar, ft.bars);
  for (const [i, s] of interior.entries()) addBars(`interior footing ${i + 1} bars`, ft.bar, Math.max(ft.bars, 2), s.length - 2 * cover);
  if (type === "stem") {
    const dowels = Math.ceil(centreline / st.spacing);
    const len = ft.depth - cover + st.height + 6 + lapOf(st.bar); // up from the footing, hook back at the slab, lapped to the sill
    rebar.push({ what: "stem verticals", bar: st.bar, qty: dowels, length: len / 12, feet: dowels * len / 12 });
    horizontal("stem horizontal", st.bar, 2);
  }
  const nx = Math.floor((slabW - 2 * cover) / sl.spacing) + 1, ny = Math.floor((slabD - 2 * cover) / sl.spacing) + 1;
  addBars("slab bars along the width", sl.bar, ny, slabW - 2 * cover);
  addBars("slab bars along the depth", sl.bar, nx, slabD - 2 * cover);
  for (const p of piers) {
    if (p.column) {
      // Column verticals: down to 3 in above the pad bottom, up through the column, lapped 40 diameters at the top.
      const len = p.padDepth - cover + p.columnHeight + lapOf(p.bar);
      rebar.push({ what: `${p.name} column verticals`, bar: p.bar, qty: p.count * p.bars, length: len / 12, feet: p.count * p.bars * len / 12 });
    }
    // Pad mat: bars each way, one per ~6 in across the pad inside the cover.
    const n = Math.max(2, Math.floor((p.pad - 2 * cover) / 6) + 1), len = p.pad - 2 * cover;
    rebar.push({ what: `${p.name} pad mat`, bar: p.bar, qty: p.count * 2 * n, length: len / 12, feet: p.count * 2 * n * len / 12 });
  }
  const rebarLb = rebar.reduce((s, r) => s + r.feet * BAR_LB_FT[r.bar], 0);

  // Sub-slab.
  const base = slabArea * sl.baseThickness / 12 / 27;
  const barrier = slabArea * 1.1;
  const stakes = Math.ceil(formEdge * 12 / 48) + 4;
  // Anchor bolts: the sill plate on each side is cut into equal pieces no longer than the stock
  // length; every piece gets at least two bolts, one within `endDistance` of each end, and the
  // rest at no more than `spacing`. Plate length per side = centreline length + wall thickness.
  let anchors = null;
  if (f.anchorBolts) {
    const a = { spacing: 72, endDistance: 12, plateStock: 192, diameter: 0.5, embed: 7, ...f.anchorBolts };
    const t = type === "stem" ? st.thickness : ft.width;
    const sides = [cw + t, cw + t, cd + t, cd + t];
    let pieces = 0, bolts = 0;
    for (const L of sides) {
      const n = Math.ceil(L / a.plateStock - 1e-9), p = L / n;
      pieces += n;
      bolts += n * Math.max(2, Math.ceil((p - 2 * a.endDistance) / a.spacing - 1e-9) + 1);
    }
    anchors = { bolts, pieces, diameter: a.diameter, embed: a.embed, spacing: a.spacing, endDistance: a.endDistance, plateStock: a.plateStock };
  }
  const notes = [
    f.cornerBars ? "Horizontal bars run straight along each side with an L-bar at every corner and layer; chairs are not counted." : "Footing bars are one continuous loop (bent at the corners on site); corner L-bars and chairs are not counted.",
    `Rebar is lapped 40 bar diameters at each joint in ${formatLength(stock)} stock; ${waste * 100}% waste is added to concrete only.`,
    "Sizes, bar schedules, frost depth and soil bearing are your inputs; nothing here checks them against a code or an engineer's design.",
  ];
  if (lastLoad < 3 && trucks > 1) notes.push(`The last truck carries only ${lastLoad.toFixed(1)} cu yd; most plants charge a short-load fee under about 3 yd, so consider rounding the pour up or splitting it.`);
  if (anchors) notes.push(`Anchor bolts: ${anchors.bolts} of ${anchors.diameter} in x ${anchors.embed} in embed for ${anchors.pieces} sill plate pieces (at most ${anchors.spacing} in apart, one within ${anchors.endDistance} in of each plate end, two per piece); spacing and edge distances are your inputs, check them against your code edition. Interior bearing lines are not counted.`);
  if (type === "stem" && !ft.formed) notes.push("Footings are assumed poured against the trench, so only the stem wall is formed.");
  if (piers.length) notes.push("Piers: pad mat bars every 6 in each way and column verticals are typed-geometry estimates, not a pier design; bearing area and depth are your engineer's call.");
  return {
    ok: true, errors: [], id: f.id ?? "Foundation", type, width: f.width, depth: f.depth, footing: ft, stem: type === "stem" ? st : null, slab: sl,
    interior, pours: pours.map((p) => ({ ...p, cuYd: +p.cuYd.toFixed(3) })), concrete: { net: +concreteNet.toFixed(3), waste, order: +concrete.toFixed(2), trucks, truck, lastLoad: +lastLoad.toFixed(2), cost: f.price != null ? +(concrete * f.price).toFixed(2) : null },
    rebar: rebar.map((r) => ({ ...r, feet: +r.feet.toFixed(1), length: +r.length.toFixed(2) })), rebarLb: +rebarLb.toFixed(0),
    forms: { contactSqFt: +formArea.toFixed(1), plywoodSheets: Math.ceil(formArea * 1.1 / 32), edgeLinearFt: +formEdge.toFixed(1), stakes },
    base: { cuYd: +base.toFixed(2), thickness: sl.baseThickness }, anchors, vaporBarrierSqFt: +barrier.toFixed(0), slabSqFt: +slabArea.toFixed(1), centreline: +centreline.toFixed(1), notes,
  };
}

export function foundationText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${l.type === "stem" ? "footing, stem wall and slab" : "monolithic slab with thickened edge"}, ${formatLength(l.width)} x ${formatLength(l.depth)} outside`];
  out.push("  Concrete (cu yd, before waste):");
  for (const p of l.pours) out.push(`    ${p.name.padEnd(28)} ${p.cuYd.toFixed(2)}`);
  const c = l.concrete;
  out.push(`  Order ${c.order} cu yd with ${(100 * c.waste).toFixed(0)}% waste: ${c.trucks} truck${c.trucks === 1 ? "" : "s"} of ${c.truck} yd (last carries ${c.lastLoad})${c.cost != null ? `, ${c.cost.toFixed(2)} at the typed price` : ""}`);
  out.push(`  Rebar, ${l.rebarLb} lb:`);
  for (const r of l.rebar) out.push(`    ${String(r.qty).padStart(4)}  #${r.bar} x ${r.length.toFixed(1)} ft  ${r.what} (${r.feet.toFixed(0)} ft)`);
  out.push(`  Forms: ${l.forms.contactSqFt} sq ft of contact (${l.forms.plywoodSheets} sheets of 4x8 ply with 10% spare), ${l.forms.edgeLinearFt} ft of edge board, ${l.forms.stakes} stakes`);
  if (l.anchors) out.push(`  Anchor bolts: ${l.anchors.bolts} (${l.anchors.diameter} in x ${l.anchors.embed} in embed, with nut and washer) for ${l.anchors.pieces} sill plate pieces`);
  out.push(`  Under the slab (${l.slabSqFt} sq ft): ${l.base.cuYd} cu yd of ${l.base.thickness} in gravel, ${l.vaporBarrierSqFt} sq ft of vapor barrier with laps`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
