// @ts-check
// A budget that ties every line to the model: the quantities the takeoff
// already computed (boards, sheets, bundles, cubic yards, pounds) times the
// builder's own unit prices. The tool ships no prices. A quantity with no price
// typed for it is listed as unpriced and left out of the total; it is never
// filled with a guess. Lumber is priced from the plan's `stock` prices (the
// same prices the cutting-stock order minimises), so a lumber line is the
// order's cost, not a second estimate.
//
// Plan `prices` (all optional, dollars): { wallSheet, floorSheet, roofSheet,
// truss, shingleBundle, underlaymentRoll, dripEdgePiece, ridgeBundle,
// starterBundle, concreteYd, rebarLb, formPlywoodSheet, gravelYd, anchorBolt, drywallSheet, baseboard, casing (price per board), sidingBoard, houseWrapRoll, cornerBoard, soffitPanel, fasciaBoard, jChannel, insulationBag, atticFillBag,
// vaporBarrierSqFt, laborWallFoot, laborFloorSqFt, laborRoofSquare, laborFoundationSqFt, laborConcreteYd, laborDrywallSheet (hang, tape and finish, per sheet), laborInsulationBag (per bag installed, wall, rim and attic), tax (fraction on materials), contingency (fraction) }.
// nailBox falls back to fasteners.price; insulationBag falls back to the plan's insulation.price; atticFillBag to insulation.attic.price.
// Labor lines appear once any labor* rate is typed. Wall sheathing is priced by the sheet order's own per-sheet prices
// (`sheathing.summary.cost`) unless `wallSheet` is typed.

/** @typedef {{ section: string, item: string, qty: number, unit: string, unitPrice: number | null, amount: number | null, source: string }} BudgetLine */

const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;

/**
 * @param {any} result takeoff result with optional sheathing, floor, roof, foundation attached
 * @param {Record<string, number>} [prices]
 */
export function budget(result, prices = {}) {
  /** @type {BudgetLine[]} */
  const lines = [];
  const P = (/** @type {string} */ k) => (typeof prices[k] === "number" && prices[k] >= 0 ? prices[k] : null);
  const add = (/** @type {string} */ section, /** @type {string} */ item, /** @type {number} */ qty, /** @type {string} */ unit, /** @type {number | null} */ unitPrice, /** @type {string} */ source) => {
    if (!(qty > 0)) return;
    lines.push({ section, item, qty: r2(qty), unit, unitPrice, amount: unitPrice == null ? null : r2(qty * unitPrice), source });
  };

  for (const o of result.orders || []) {
    const boards = o.lines.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.qty, 0);
    add("Lumber", `${o.size} boards (${o.lines.length} lengths)`, boards, "boards", boards ? o.cost / boards : null, `order: ${o.method}${o.proven ? ", proven cheapest" : ""}; plan stock prices`);
  }
  if (result.sheathing?.summary) {
    const s = result.sheathing.summary, wp = P("wallSheet");
    if (wp != null) add("Sheathing", "Wall sheathing sheets", s.sheets, "sheets", wp, "sheathing order sheet count x typed wallSheet");
    else add("Sheathing", "Wall sheathing sheets", s.sheets, "sheets", s.sheets ? s.cost / s.sheets : null, "sheathing order's own per-sheet prices");
  }
  if (result.floor) add("Floor", "Subfloor sheets", result.floor.sheets?.count ?? 0, "sheets", P("floorSheet"), "floor.sheets.count");
  const roof = result.roof;
  if (roof) {
    if (roof.trusses) add("Roof", "Trusses", roof.trusses.count, "each", roof.trusses.price > 0 ? roof.trusses.price : P("truss"), "roof.trusses.count");
    add("Roof", "Roof sheathing sheets", roof.sheets?.count ?? 0, "sheets", P("roofSheet"), "roof.sheets.count");
    const g = roof.roofing;
    if (g) {
      add("Roof", "Shingle bundles", g.shingleBundles, "bundles", P("shingleBundle"), `${g.squares.toFixed(1)} squares at ${g.assumptions.waste} waste`);
      add("Roof", "Underlayment rolls", g.underlaymentRolls ?? g.underlaymentRoll, "rolls", P("underlaymentRoll"), "roof.roofing");
      add("Roof", "Drip edge pieces", g.dripEdgePieces, "pieces", P("dripEdgePiece"), "eave + rake feet");
      add("Roof", "Ridge cap bundles", g.ridgeBundles, "bundles", P("ridgeBundle"), "ridge feet");
      add("Roof", "Starter bundles", g.starterBundles, "bundles", P("starterBundle"), "eave feet");
    }
  }
  if (result.drywall) add("Interior", "Drywall sheets", result.drywall.sheets.count, "sheets", P("drywallSheet") ?? result.drywall.sheets.price, "drywall.sheets.count");
  const ins = result.insulation;
  if (ins?.ok) {
    const bagPrice = P("insulationBag") ?? ins.price;
    add("Insulation", "Wall cavity insulation bags", ins.bags, "bags", bagPrice, `cavity ${ins.cavitySqFt.toFixed(0)} sq ft at ${(100 * ins.waste).toFixed(0)}% waste, ${ins.bagSqFt} sq ft per bag`);
    if (ins.rim) add("Insulation", "Rim joist insulation bags", ins.rim.bags, "bags", bagPrice, `rim bays ${ins.rim.sqFt.toFixed(0)} sq ft`);
    if (ins.attic?.bags != null) add("Insulation", "Attic loose-fill bags", ins.attic.bags, "bags", P("atticFillBag") ?? ins.attic.price, `${ins.attic.bagCuFt} cu ft per bag`);
  }
  const tr = result.trim;
  if (tr?.ok) {
    add("Interior", "Baseboard boards", tr.baseBoards, "boards", P("baseboard") ?? tr.basePrice, `${tr.baseFeet.toFixed(0)} ft in ${tr.baseStock / 12} ft boards`);
    if (tr.shoeBoards) add("Interior", "Shoe moulding boards", tr.shoeBoards, "boards", P("shoeMoulding") ?? tr.shoePrice, `${tr.shoeFeet.toFixed(0)} ft in ${tr.shoeStock / 12} ft boards`);
    add("Interior", "Casing boards", tr.casingBoards, "boards", P("casing") ?? tr.casingPrice, `${tr.doorFaces} door and ${tr.windowFaces} window faces`);
  }
  const sd = result.siding;
  if (sd?.ok) {
    add("Exterior", "Siding boards", sd.boards, "boards", P("sidingBoard") ?? sd.boardPrice, `${sd.courses} courses at ${sd.exposure} in exposure in ${sd.stock / 12} ft boards`);
    add("Exterior", "House wrap rolls", sd.wrapRolls, "rolls", P("houseWrapRoll") ?? sd.wrapPrice, `${sd.wrapSqFt.toFixed(0)} sq ft with laps, ${sd.wrapRollSqFt} sq ft per roll`);
    if (sd.cornerBoards) add("Exterior", "Corner boards", sd.cornerBoards, "boards", P("cornerBoard") ?? sd.cornerPrice, `${sd.corners} outside corners`);
  }
  const ea = result.eaves;
  if (ea?.ok) {
    if (ea.panels) add("Exterior", "Soffit panels", ea.panels, "panels", P("soffitPanel") ?? ea.panelPrice, `${ea.soffitSqFt.toFixed(0)} sq ft, ${ea.panelWidth} in wide in ${ea.panelStock / 12} ft panels`);
    add("Exterior", "Fascia boards", ea.fascia, "boards", P("fasciaBoard") ?? ea.fasciaPrice, `${(ea.eaveFeet + ea.rakeFeet).toFixed(0)} ft in ${ea.fasciaStock / 12} ft boards`);
    if (ea.channel) add("Exterior", "J-channel", ea.channel, "pieces", P("jChannel") ?? ea.channelPrice, `${ea.channelStock / 12} ft pieces along the wall`);
  }
  const gu = result.gutters;
  if (gu?.ok) {
    add("Exterior", "Gutter sections", gu.gutters, "sections", P("gutterSection"), `${gu.runFeet.toFixed(0)} ft in ${gu.gutterStock / 12} ft sections`);
    add("Exterior", "Downspout pieces", gu.downspoutPieces, "pieces", P("downspoutPiece"), `${gu.downspouts} downspouts, ${gu.downspoutStock / 12} ft pieces`);
    add("Exterior", "Gutter hangers", gu.hangers, "each", P("gutterHanger"), `every ${gu.hangerSpacing} in`);
    add("Exterior", "Gutter end caps", gu.endCaps, "each", P("gutterCap"), "two per run");
    add("Exterior", "Downspout elbows", gu.elbows, "each", P("downspoutElbow"), "top offset and bottom kick-out");
    if (gu.outsideCorners) add("Exterior", "Gutter outside corners", gu.outsideCorners, "each", P("gutterCorner"), "hip roof");
    add("Exterior", "Downspout straps", gu.straps, "each", P("downspoutStrap"), "one per strap spacing of drop");
  }
  const fa = result.fasteners;
  if (fa?.ok && fa.boxes != null) add("Fasteners", "Framing nails (boxes)", fa.boxes, "boxes", P("nailBox") ?? fa.price, `${fa.order} nails incl. ${(100 * fa.waste).toFixed(0)}% waste, ${fa.nailsPerBox} per box`);
  if (fa?.ok && fa.holdDowns?.count) add("Fasteners", "Hold-downs", fa.holdDowns.count, "each", P("holdDown") ?? fa.holdDowns.price, `${fa.holdDowns.wallEnds} at wall ends, ${fa.holdDowns.openingSides} beside openings`);
  if (fa?.ok && fa.plateStraps?.count) add("Fasteners", "Plate straps", fa.plateStraps.count, "each", P("plateStrap") ?? fa.plateStraps.price, `${fa.plateStraps.topJoints} top-plate and ${fa.plateStraps.capJoints} cap-plate joints, ${fa.plateStraps.plateTies} single-top-plate ties`);
  const f = result.foundation;
  if (f) {
    add("Foundation", "Concrete", f.concrete.order, "cu yd", P("concreteYd") ?? (f.concrete.cost != null ? f.concrete.cost / f.concrete.order : null), `${f.concrete.trucks} truck(s) incl. ${(100 * f.concrete.waste).toFixed(0)}% waste`);
    add("Foundation", "Rebar", f.rebarLb, "lb", P("rebarLb"), "bar schedule with lap splices");
    add("Foundation", "Form plywood", f.forms.plywoodSheets, "sheets", P("formPlywoodSheet"), "form contact area + 10% spare");
    add("Foundation", "Gravel base", f.base.cuYd, "cu yd", P("gravelYd"), "slab area x base thickness");
    if (f.anchors) add("Foundation", "Anchor bolts (with nut and washer)", f.anchors.bolts, "bolts", P("anchorBolt"), `${f.anchors.pieces} sill plate pieces`);
    add("Foundation", "Vapor barrier", f.vaporBarrierSqFt, "sq ft", P("vaporBarrierSqFt"), "slab area + 10% laps");
  }

  // Labor: a typed rate times a quantity the takeoff already has. Labor is not taxed or given contingency here.
  const laborTyped = Object.keys(prices).some((k) => k.startsWith("labor") && P(k) != null);
  if (laborTyped && result.summary?.wallFeet > 0) add("Labor", "Wall framing", result.summary.wallFeet, "ft of wall", P("laborWallFoot"), "summary.wallFeet x typed laborWallFoot");
  if (laborTyped && result.floor?.sheets?.area > 0) add("Labor", "Floor framing and subfloor", result.floor.sheets.area, "sq ft", P("laborFloorSqFt"), "floor.sheets.area x typed laborFloorSqFt");
  if (laborTyped && roof?.roofing?.squares > 0) add("Labor", "Roof framing and roofing", roof.roofing.squares, "squares", P("laborRoofSquare"), "roof.roofing.squares x typed laborRoofSquare");
  if (laborTyped && f?.slabSqFt > 0) add("Labor", "Foundation forming, rebar and finishing", f.slabSqFt, "sq ft of slab", P("laborFoundationSqFt"), "foundation.slabSqFt x typed laborFoundationSqFt");
  if (laborTyped && f?.concrete?.net > 0) add("Labor", "Concrete placing", f.concrete.net, "cu yd", P("laborConcreteYd"), "foundation.concrete.net (before waste) x typed laborConcreteYd");
  if (laborTyped && result.drywall?.sheets?.count > 0) add("Labor", "Drywall hanging and finishing", result.drywall.sheets.count, "sheets", P("laborDrywallSheet"), "drywall.sheets.count x typed laborDrywallSheet");
  const insBags = ins?.ok ? (ins.bags || 0) + (ins.rim?.bags || 0) + (ins.attic?.bags || 0) : 0;
  if (laborTyped && insBags > 0) add("Labor", "Insulation installation", insBags, "bags", P("laborInsulationBag"), "wall + rim + attic bags x typed laborInsulationBag");

  const sections = [...new Set(lines.map((l) => l.section))].map((name) => {
    const ls = lines.filter((l) => l.section === name);
    return { name, subtotal: r2(ls.reduce((s, l) => s + (l.amount ?? 0), 0)), unpriced: ls.filter((l) => l.amount == null).length };
  });
  const materials = r2(sections.filter((x) => x.name !== "Labor").reduce((s, x) => s + x.subtotal, 0));
  const labor = r2(sections.filter((x) => x.name === "Labor").reduce((s, x) => s + x.subtotal, 0));
  const taxRate = P("tax") ?? 0, contRate = P("contingency") ?? 0;
  const tax = r2(materials * taxRate), contingency = r2((materials + tax) * contRate);
  return {
    lines, sections, materials, labor, taxRate, tax, contingencyRate: contRate, contingency, total: r2(materials + tax + contingency + labor),
    unpriced: lines.filter((l) => l.amount == null).map((l) => `${l.item} (${l.qty} ${l.unit})`),
  };
}

/** @param {ReturnType<typeof budget>} b */
export function budgetText(b) {
  const out = [];
  let sec = "";
  for (const l of b.lines) {
    if (l.section !== sec) { sec = l.section; out.push(`  ${sec}`); }
    out.push(`    ${l.item.padEnd(34)} ${String(l.qty).padStart(8)} ${l.unit.padEnd(7)} ${l.unitPrice == null ? "no price".padStart(10) : l.unitPrice.toFixed(2).padStart(10)} ${l.amount == null ? "".padStart(11) : l.amount.toFixed(2).padStart(11)}`);
  }
  out.push("  Subtotals: " + b.sections.map((s) => `${s.name} ${s.subtotal.toFixed(2)}`).join(", "));
  out.push(`  Materials ${b.materials.toFixed(2)}${b.taxRate ? `, tax ${b.tax.toFixed(2)} at ${(100 * b.taxRate).toFixed(2)}%` : ""}${b.contingencyRate ? `, contingency ${b.contingency.toFixed(2)} at ${(100 * b.contingencyRate).toFixed(1)}%` : ""}${b.labor ? `, labor ${b.labor.toFixed(2)}` : ""}; total ${b.total.toFixed(2)}`);
  if (b.unpriced.length) out.push(`  Not in the total, no price typed: ${b.unpriced.join("; ")}. Add them under \`prices\` in the plan.`);
  out.push("  Not included: equipment, permits, delivery, overhead or waste beyond what the takeoff already counts" + (b.lines.some((l) => l.section === "Labor") ? "; labor is only the rates you typed." : "; no labor rate typed."));
  return out;
}

/** @param {ReturnType<typeof budget>} b */
export function budgetCsv(b) {
  const q = (/** @type {any} */ v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["section", "item", "qty", "unit", "unit_price", "amount", "source"], ...b.lines.map((l) => [l.section, l.item, l.qty, l.unit, l.unitPrice ?? "", l.amount ?? "", l.source])];
  rows.push(["", "Materials", "", "", "", b.materials, ""], ["", "Tax", "", "", b.taxRate, b.tax, ""], ["", "Contingency", "", "", b.contingencyRate, b.contingency, ""], ["", "Labor", "", "", "", b.labor, ""], ["", "Total", "", "", "", b.total, ""]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
