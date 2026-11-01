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
// starterBundle, concreteYd, rebarLb, formPlywoodSheet, gravelYd, anchorBolt, drywallSheet, baseboard, casing (price per board), sidingBoard, sidingStarter, headFlashing (price per piece), openingTape (price per roll), houseWrapRoll, cornerBoard, soffitPanel, fasciaBoard, jChannel, insulationBag, atticFillBag,
// vaporBarrierSqFt, laborWallFoot, laborFloorSqFt, laborRoofSquare, laborFoundationSqFt, laborConcreteYd, drywallScrewThousand (per 1,000 screws), drywallTapeRoll, drywallCompoundPail, cornerBeadStick, laborDrywallSheet (hang, tape and finish, per sheet), laborInsulationBag (per bag installed, wall, rim and attic), laborSidingSqFt (siding and house wrap, per sq ft of wall net of openings), laborTrimFoot (baseboard, shoe and casing, per linear foot), laborEavesFoot (fascia run, eave plus rake, per linear foot; soffit and J-channel included), laborGutterFoot (gutter run, per linear foot; downspouts included), laborWallSheet (wall sheathing, per sheet hung), stairConnector (top connector or foot anchor, each), stairRiserBoard (solid riser board, when the stair has `riserBoard`), stairBaluster, stairRailPost, handrailBracket (each; stairs with a `rail`), handrailFoot (per linear foot of handrail run), laborDeckSqFt (deck framing, decking and rails, per sq ft of deck), deckConcreteBag, deckScrewBox, laborStairRiser (stairs, per riser, both flights of a landing stair; stringers, treads and risers set), dormerMember (each framing piece, average), dormerSheet (per sheet), laborDormerSqFt (dormer roof plus cheek walls, per sq ft), laborHoldDown (per hold-down or plate strap set, each), tax (fraction on materials), contingency (fraction) }.
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
  if (result.floor?.hangers?.singles) add("Floor", "Joist hangers", result.floor.hangers.singles, "each", P("joistHanger"), `single, ${result.floor.hangers.size}, at tail-joist ends`);
  if (result.floor?.hangers?.doubles) add("Floor", "Double joist hangers", result.floor.hangers.doubles, "each", P("doubleJoistHanger"), `${result.floor.hangers.size}, at doubled-header ends`);
  if (result.floor?.hangers?.nails) add("Floor", "Joist hanger nails", result.floor.hangers.nails, "each", P("hangerNail"), `${result.floor.hangers.nailsPerSingle} per single, ${result.floor.hangers.nailsPerDouble} per double hanger (typed)`);
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
  const dwf = result.drywall?.finishing;
  if (result.drywall) {
    // Finishing materials the drywall engine already counts; each is priced only when you type a price.
    add("Interior", "Drywall screws (per 1,000)", result.drywall.screws / 1000, "thousand", P("drywallScrewThousand"), `${result.drywall.screws} screws at ${result.drywall.assumptions?.screwsPerSqFt ?? 1} per sq ft`);
    if (dwf?.tapeRolls) add("Interior", "Drywall tape rolls", dwf.tapeRolls, "rolls", P("drywallTapeRoll"), `${dwf.tapeFt} ft of seam and angle at ${dwf.rollFt} ft per roll`);
    if (dwf?.compoundPails) add("Interior", "Joint compound pails", dwf.compoundPails, "pails", P("drywallCompoundPail"), `${dwf.compoundGal} gal at ${dwf.compoundGalPerSqFt} gal per sq ft, ${dwf.pailGal} gal pails`);
    if (dwf?.beadSticks) add("Interior", "Corner bead sticks", dwf.beadSticks, "sticks", P("cornerBeadStick"), `${dwf.beadFt} ft at ${dwf.beadStickFt} ft per stick`);
  }
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
    if (sd.starter?.boards) add("Exterior", "Siding starter strip boards", sd.starter.boards, "boards", P("sidingStarter") ?? sd.starter.price, `${sd.starter.feet.toFixed(0)} ft along ${sd.starter.walls} wall(s) in ${sd.starter.stock / 12} ft boards`);
    if (sd.flashing?.pieces) add("Exterior", "Head flashing pieces", sd.flashing.pieces, "pieces", P("headFlashing") ?? sd.flashing.price, `${sd.flashing.openings} opening(s), ${sd.flashing.feet.toFixed(0)} ft in ${sd.flashing.stock / 12} ft pieces`);
    if (sd.tape?.rolls) add("Exterior", "Opening tape rolls", sd.tape.rolls, "rolls", P("openingTape") ?? sd.tape.price, `${sd.tape.openings} opening(s), ${sd.tape.feet.toFixed(0)} ft in ${sd.tape.rollFeet} ft rolls`);
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
  const dm = result.dormer;
  if (dm?.ok) {
    const members = dm.parts.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + x.count, 0);
    add("Dormer", "Dormer framing members (rafters, studs, headers; each cut piece)", members, "pieces", P("dormerMember"), "dormer.parts counts; the price is one average per piece, since dormer lumber is not in the cutting-stock order");
    const sheets = Math.ceil((dm.areas.roofSqFt + dm.areas.wallSqFt) * 1.1 / 32 - 1e-9);
    add("Dormer", "Dormer roof and cheek-wall sheathing", sheets, "sheets", P("dormerSheet"), `${dm.areas.roofSqFt} sq ft roof + ${dm.areas.wallSqFt} sq ft walls, 10% waste, 4x8 sheets`);
  }
  const fa = result.fasteners;
  if (fa?.ok && fa.boxes != null) add("Fasteners", "Framing nails (boxes)", fa.boxes, "boxes", P("nailBox") ?? fa.price, `${fa.order} nails incl. ${(100 * fa.waste).toFixed(0)}% waste, ${fa.nailsPerBox} per box`);
  if (fa?.ok && fa.holdDowns?.count) add("Fasteners", "Hold-downs", fa.holdDowns.count, "each", P("holdDown") ?? fa.holdDowns.price, `${fa.holdDowns.wallEnds} at wall ends, ${fa.holdDowns.openingSides} beside openings`);
  if (fa?.ok && fa.plateStraps?.count) add("Fasteners", "Plate straps", fa.plateStraps.count, "each", P("plateStrap") ?? fa.plateStraps.price, `${fa.plateStraps.topJoints} top-plate and ${fa.plateStraps.capJoints} cap-plate joints, ${fa.plateStraps.plateTies} single-top-plate ties`);
  const dk = result.deck;
  if (dk?.ok) {
    const boards = dk.orders.reduce((/** @type {number} */ t, /** @type {any} */ o) => t + o.boards, 0);
    add("Deck", "Deck lumber boards (pressure-treated order)", boards, "boards", boards ? dk.cost / boards : null, "deck.orders cost (the deck's own stock prices) over boards bought");
    add("Deck", "Footing concrete bags", dk.concrete.bags, "bags", P("deckConcreteBag"), `${dk.concrete.count} footings, ${dk.concrete.diameter} in x ${dk.concrete.depth} in, ${dk.concrete.bagYield} cu ft per bag, 10% spare`);
    add("Deck", "Deck screw boxes", dk.screwBoxes, "boxes", P("deckScrewBox"), `${dk.screws} screws, two per board crossing`);
  }
  // Stairs: stringer and tread lumber is already in the cutting-stock order. Connectors and solid risers are priced here.
  const fl = (result.stairs || []).flatMap((/** @type {any} */ x) => (x.flights ? x.flights : [x])).filter((/** @type {any} */ x) => x.ok);
  const conns = fl.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.hardware?.topConnectors || 0) + (x.hardware?.footAnchors || 0), 0);
  if (conns) add("Stairs", "Stringer top connectors and foot anchors", conns, "each", P("stairConnector"), "one connector at the top and one anchor at the foot of every stringer");
  const riserBd = fl.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.riserStock?.count || 0), 0);
  if (riserBd) add("Stairs", "Solid riser boards", riserBd, "boards", P("stairRiserBoard"), "boards across the stair width, enough per riser to cover its height");
  const bal = fl.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.rail?.balusters?.count || 0), 0);
  if (bal) add("Stairs", "Stair balusters", bal, "each", P("stairBaluster"), "vertical balusters on every flight with a rail, spaced by the clear-gap limit");
  const rpost = fl.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.rail?.posts?.count || 0), 0);
  if (rpost) add("Stairs", "Stair guard posts", rpost, "each", P("stairRailPost"), "posts on every flight with a rail");
  const brk = fl.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.rail?.handrail?.brackets || 0), 0);
  const hrIn = fl.reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.rail?.handrail?.length || 0), 0);
  if (hrIn > 0) add("Stairs", "Handrail", Math.round(hrIn / 12 * 10) / 10, "ft", P("handrailFoot"), "handrail run on every flight with a rail: pitch length plus 12 in past the top and one tread past the bottom");
  if (brk) add("Stairs", "Handrail wall brackets", brk, "each", P("handrailBracket"), "one near each end and enough between to keep the typed bracket spacing");
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
  if (laborTyped && sd?.ok && sd.netSqFt > 0) add("Labor", "Siding and house wrap installation", sd.netSqFt, "sq ft", P("laborSidingSqFt"), "siding.netSqFt (wall net of openings) x typed laborSidingSqFt");
  const trimFt = tr?.ok ? (tr.baseFeet || 0) + (tr.shoeFeet || 0) + (tr.casingFeet || 0) : 0;
  if (laborTyped && trimFt > 0) add("Labor", "Trim installation", trimFt, "ft", P("laborTrimFoot"), "baseboard + shoe + casing feet x typed laborTrimFoot");
  const eavesFt = ea?.ok ? (ea.eaveFeet || 0) + (ea.rakeFeet || 0) : 0;
  if (laborTyped && eavesFt > 0) add("Labor", "Fascia, soffit and J-channel installation", eavesFt, "ft", P("laborEavesFoot"), "eaves.eaveFeet + rakeFeet x typed laborEavesFoot");
  if (laborTyped && gu?.ok && gu.runFeet > 0) add("Labor", "Gutter and downspout installation", gu.runFeet, "ft", P("laborGutterFoot"), "gutters.runFeet x typed laborGutterFoot");
  if (laborTyped && result.sheathing?.summary?.sheets > 0) add("Labor", "Wall sheathing installation", result.sheathing.summary.sheets, "sheets", P("laborWallSheet"), "sheathing.summary.sheets x typed laborWallSheet");
  if (laborTyped && dk?.ok && dk.area > 0) add("Labor", "Deck framing, decking and rails", dk.area, "sq ft", P("laborDeckSqFt"), "deck.area x typed laborDeckSqFt");
  const stairRisers = (result.stairs || []).reduce((/** @type {number} */ t, /** @type {any} */ x) => t + (x.flights ? x.flights.reduce((/** @type {number} */ u, /** @type {any} */ g) => u + (g.risers || 0), 0) : (x.risers || 0)), 0);
  if (laborTyped && stairRisers > 0) add("Labor", "Stair building and installation", stairRisers, "risers", P("laborStairRiser"), "sum of stairs risers (each flight of a landing stair) x typed laborStairRiser");
  const hardware = fa?.ok ? (fa.holdDowns?.count || 0) + (fa.plateStraps?.count || 0) : 0;
  if (laborTyped && hardware > 0) add("Labor", "Hold-down and plate strap installation", hardware, "each", P("laborHoldDown"), "fasteners.holdDowns.count + plateStraps.count x typed laborHoldDown");
  if (laborTyped && dm?.ok) add("Labor", "Dormer framing and sheathing", Math.round((dm.areas.roofSqFt + dm.areas.wallSqFt) * 10) / 10, "sq ft", P("laborDormerSqFt"), "dormer roof + wall areas x typed laborDormerSqFt");
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
