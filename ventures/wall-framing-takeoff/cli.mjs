#!/usr/bin/env node
// @ts-check
// Wall framing takeoff from the terminal: a plan JSON in, an order, a cut
// list and per-wall layout marks out.
import { readFileSync } from "node:fs";
import { sheathe, defaultSheathing, sheathingText, nailerCuts } from "./sheathing.mjs";
import { layoutFloor, floorCuts, floorText } from "./floor.mjs";
import { layoutFoundation, foundationText } from "./foundation.mjs";
import { layoutDrywall, drywallText } from "./drywall.mjs";
import { layoutInsulation, insulationText } from "./insulation.mjs";
import { layoutTrim, trimText } from "./trim.mjs";
import { layoutSiding, sidingText } from "./siding.mjs";
import { layoutEaves, eavesText } from "./eaves.mjs";
import { layoutGutters, guttersText } from "./gutters.mjs";
import { layoutFasteners, fastenerText } from "./fasteners.mjs";
import { layoutStair, stairCuts, stairText, layoutStairWithLanding, landingCuts, landingText, checkWinders, winderText, STAIR_LIMITS } from "./stairs.mjs";
import { layoutRoof, roofCuts, roofText } from "./roof.mjs";
import { resolveHeaders, headerText } from "./headers.mjs";
import { drawingSetHtml } from "./drawings.mjs";
import { drawingSetPdf } from "./pdf.mjs";
import { panelOrder, panelOrderText, panelPullText } from "./panels.mjs";
import { budget, budgetText, budgetCsv } from "./budget.mjs";
import { levelBids, levelText } from "./bidlevel.mjs";
import { schedule, scheduleText } from "./schedule.mjs";
import { planFromDxf } from "./dxf.mjs";
import { planFromIfc } from "./ifc.mjs";
import { takeoff, samplePlan, toCsv, formatLength, formatInches, parseLength } from "./engine.mjs";

const HELP = `wall-framing-takeoff: stud layout, cut list and the cheapest lumber order for a set of walls

Usage:
  node cli.mjs plan.json            print the order, the cut list and the layout marks
  node cli.mjs plan.json --json     the full result as JSON
  node cli.mjs plan.json --csv      order, cut list and board-by-board cuts as CSV
  node cli.mjs plan.json --sheathing  add panel layout per wall and the sheet order
  node cli.mjs plan.json --overhang   run sheathing past corners to cover the next wall's end stud (vertical sheets)
  node cli.mjs plan.json --rim-lap=9.25  run sheathing that many inches below the bottom plate to cover the rim board (vertical sheets)
  node cli.mjs plan.json --horizontal sheets long side along the wall (implies --sheathing)
  node cli.mjs plan.json --panel-max=12ft  shop drawings with each wall split into panels no longer than that
  node cli.mjs plan.json --panel-max=12ft --panel-order --pull-lists  boards and cuts each panel is built from (add to --panel-order)
  node cli.mjs plan.json --panel-max=12ft --panel-order  lumber order for the shop panels (plates cut at panel breaks) against the whole-wall order
  node cli.mjs plan.json --panel-max=12ft --panel-sheets  one printable sheet per panel after each wall's sheet
  node cli.mjs plan.json --panel-max=12ft --sheathing-psf=1.5  also weigh the sheathing on each panel (lb per sq ft)
  node cli.mjs plan.json --floor     add the plan's floor (joists, rim, blocking, subfloor sheets); its lumber joins the order
  node cli.mjs plan.json --stairs    add the plan's stairs (plan "stairs": one object or a list of {totalRise, tread, stringer, width, treadBoard, floorThickness, openingLength}): equal risers under the code limit, notch geometry, stringers and treads, the stairwell opening the headroom needs; the lumber joins the order
  node cli.mjs plan.json --roof      add the plan's gable roof, or hip roof with shape "hip" (rafters, ridge, sheathing, shingle and felt quantities); its lumber joins the order
  node cli.mjs plan.json --fasteners   count nails by connection (plan fasteners: studEndNails, plateSpacing, edgeSpacing, nailsPerBox, price; add --sheathing for sheathing nails)
  node cli.mjs plan.json --gutters    add gutters, downspouts, hangers, caps and elbows along the roof's eaves (needs a roof; plan gutters: gutterStock, downspoutStock, eaveHeight, hangerSpacing, maxRunFeet, sqFtPerDownspout, strapSpacing, waste, and a price for each part)
  node cli.mjs plan.json --eaves       add soffit panels, fascia boards and J-channel under the roof overhangs (needs a roof; plan eaves: panelWidth, panelStock, fasciaStock, channelStock, waste, rakeSoffit, panelPrice, fasciaPrice, channelPrice)
  node cli.mjs plan.json --siding      add exterior lap siding courses, house wrap and corner boards (plan siding: exposure, stock, waste, wrapRollSqFt, wrapLap, corners, cornerStock, height, boardPrice, wrapPrice, cornerPrice)
  node cli.mjs plan.json --trim        add baseboard and door and window casing boards (plan trim: scarf, shoe, shoeStock, shoePrice, baseSides, baseStock, casingStock, casingWidth, reveal, waste, basePrice, casingPrice)
  node cli.mjs plan.json --insulation  add wall-cavity insulation bags (measured from the framing placed; plan insulation: bagSqFt, rValue, waste, price)
  node cli.mjs plan.json --drywall     add interior drywall (inside faces, partitions both sides, optional ceilings; plan drywall: sheetLength, ceiling, price)
  node cli.mjs plan.json --foundation  add the plan's foundation (footing, stem wall and slab concrete, trucks, rebar, forms, gravel, vapor barrier)
  node cli.mjs plan.json --level-bids  line up the plan's "bids" (bidder, lines of item, qty, unitPrice or amount) against the budget lines: short quantities and left-out scope are priced at the bid's own, the plan's or the other bids' median price, else listed (add --json)
  node cli.mjs plan.json --budget    price the quantities with the plan's own "prices" (sheets, bundles, concrete, rebar...); lumber uses the stock prices; anything without a price is listed, not guessed (add --csv for a spreadsheet file, --json for the data)
  node cli.mjs plan.json --schedule  critical path, crew levelling and slip effects from the plan's own schedule object (activities, durations, predecessors, crews)
  node cli.mjs plan.json --drawings   printable HTML shop drawings, one sheet per wall (marked members, dimensions, parts table)
  node cli.mjs plan.json --pdf > walls.pdf   the same shop drawings as a PDF file (no browser; add --panel-max=12ft for panel cut lines)
  node cli.mjs plan.json --headers  size headers from the plan's own headerTable ({upTo, header, plies?} rows from your span table; an opening with "header": "auto" takes the first row that covers it) and list hand-picked ones the table says are too light
  node cli.mjs house.ifc [--storey=N|name]  the same from an IFC file (one storey at a time; the lowest by default) (IfcWall axis lines, IfcDoor/IfcWindow; hand-written fixtures only so far)
  node cli.mjs house.dxf --plan-only  read a DXF floor plan (wall centre lines on a layer named like "wall", openings as lines on "door"/"window" layers; --units=in|ft|mm|cm|m when the file does not say; walls drawn as two face lines are paired into centre lines automatically, --double-line forces it, --single-line turns it off) and print the plan JSON; without --plan-only it goes straight on to the takeoff
  node cli.mjs --example            print the example plan (an invented 40 x 28 ft ranch) to start from
  cat plan.json | node cli.mjs -    read the plan from stdin

Lengths in the plan are inches, or text such as "12' 6-1/2\\"".

No warranty. This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not engineering, construction or building-code advice,
and it does not replace a qualified professional. Header sizes, jack counts and
stud spacing are your inputs; nothing here checks them against a span table or a
code. You are responsible for reviewing and verifying its output before relying
on it. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.`;

/** Accept "12' 6\\"" strings anywhere a length goes. */
function normalise(plan) {
  const L = (v) => (typeof v === "string" ? parseLength(v) : v);
  for (const k of ["studSpacing", "studLength", "kerf", "topPlateLap", "defaultHeaderHeight"]) if (k in plan) plan[k] = L(plan[k]);
  for (const r of Array.isArray(plan.headerTable) ? plan.headerTable : []) if (r && "upTo" in r) r.upTo = L(r.upTo);
  for (const s of plan.stock || []) s.length = L(s.length);
  for (const w of plan.walls || []) {
    w.length = L(w.length);
    w.tees = (w.tees || []).map(L);
    if (w.tee && "at" in w.tee) w.tee.at = L(w.tee.at);
    for (const o of w.openings || []) for (const k of ["offset", "width", "height", "headerHeight"]) if (k in o) o[k] = L(o[k]);
  }
  const base = samplePlan();
  for (const k of ["studSpacing", "studLength", "kerf", "topPlateLap", "cornerExtraStuds", "teeExtraStuds", "defaultHeaderHeight", "stock"]) if (!(k in plan)) plan[k] = base[k];
  return plan;
}

export function main(argv, readInput = (p) => readFileSync(p === "-" ? 0 : p, "utf8")) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rimLap = Math.max(0, parseLength(argv.find((a) => a.startsWith("--rim-lap="))?.slice(10) ?? "0") || 0);
  if (flags.has("--help") || flags.has("-h")) return { code: 0, out: HELP };
  if (flags.has("--example")) return { code: 0, out: JSON.stringify(samplePlan(), null, 2) };
  if (!args.length) return { code: 2, out: HELP };
  let plan;
  let dxfNotes = "";
  try {
    if (/\.(dxf|ifc)$/i.test(args[0])) {
      const units = argv.find((a) => a.startsWith("--units="))?.slice(8);
      const r = /** @type {{ ok: boolean, errors: string[], notes: string[], plan?: any, stats?: any }} */ ((/\.ifc$/i.test(args[0]) ? planFromIfc : planFromDxf)(readInput(args[0]), { units: /** @type {any} */ (units), storey: (() => { const v = argv.find((a) => a.startsWith("--storey="))?.slice(9); return v == null ? undefined : /^\d+$/.test(v) ? Number(v) : v; })(), doubleLine: argv.includes("--single-line") ? false : argv.includes("--double-line") ? true : "auto" }));
      if (!r.ok) return { code: 2, out: `Could not read the drawing: ${r.errors.join(" ")}` };
      const note = r.notes.map((n) => `  - ${n}`).join("\n");
      if (flags.has("--plan-only")) return { code: 0, out: JSON.stringify(r.plan, null, 2) + `\n\nNotes (not part of the JSON):\n${note}` };
      plan = normalise({ ...samplePlan(), ...r.plan });
      dxfNotes = `Read ${r.stats.walls} walls (${r.stats.exterior} exterior, ${r.stats.interior} interior), ${r.stats.tees} tees, ${r.stats.openings} openings from ${args[0]}:\n${note}\n\n`;
    } else plan = normalise(JSON.parse(readInput(args[0])));
  } catch (e) {
    return { code: 2, out: `Could not read the plan: ${e instanceof Error ? e.message : e}` };
  }
  /** @type {ReturnType<typeof resolveHeaders> | null} */
  let headers = null;
  if (plan.headerTable) {
    headers = resolveHeaders(plan);
    if (!headers.ok) return { code: 1, out: `The header table has problems:\n${headers.errors.map((e) => `  - ${e}`).join("\n")}` };
    plan = headers.plan;
  } else if (flags.has("--headers")) return { code: 2, out: "The plan has no `headerTable` (rows of {upTo, header, plies?} from your span table)." };
  let floor = null;
  if (flags.has("--floor") || plan.floor) {
    if (!plan.floor) return { code: 2, out: "The plan has no `floor` object (width, depth, joist, spacing, beam)." };
    for (const k of ["width", "depth", "beam"]) if (typeof plan.floor[k] === "string") plan.floor[k] = parseLength(plan.floor[k]);
    for (const o of plan.floor.openings || []) for (const k of ["x", "y", "width", "depth"]) if (typeof o[k] === "string") o[k] = parseLength(o[k]);
    floor = layoutFloor(plan.floor, plan);
    if (!floor.ok) return { code: 1, out: `The floor has problems:\n${floor.errors.map((e) => `  - ${e}`).join("\n")}` };
  }
  /** @type {any[]} */
  const stairs = [];
  if (flags.has("--stairs") || plan.stairs) {
    if (!plan.stairs) return { code: 2, out: "The plan has no `stairs` object (totalRise, tread, stringer, width)." };
    for (const [i, st] of (Array.isArray(plan.stairs) ? plan.stairs : [plan.stairs]).entries()) {
      for (const k of ["totalRise", "tread", "width", "openingLength", "floorThickness"]) if (typeof st[k] === "string") st[k] = parseLength(st[k]);
      if (typeof st.landing === "object" && st.landing) for (const k of ["depth", "landingRise"]) if (typeof st.landing[k] === "string") st.landing[k] = parseLength(st.landing[k]);
      const withLanding = st.landing || st.totalRise > (st.limits?.maxRise ?? STAIR_LIMITS.maxRise);
      const l = withLanding ? layoutStairWithLanding({ id: `Stair ${i + 1}`, ...st }, plan) : layoutStair({ id: `Stair ${i + 1}`, ...st }, plan);
      if (!l.ok) return { code: 1, out: `The stairs have problems:\n${l.errors.map((e) => `  - ${e}`).join("\n")}` };
      if (st.winders) { l.winders = checkWinders(typeof st.winders === "object" ? { width: st.width, ...st.winders } : { width: st.width }); if (!l.winders.ok && !l.winders.problems) return { code: 1, out: `The winders have problems:\n${winderText(l.winders).join("\n")}` }; }
      stairs.push(l);
    }
  }
  let roof = null;
  if (flags.has("--roof") || plan.roof) {
    if (!plan.roof) return { code: 2, out: "The plan has no `roof` object (width, length, pitch, rafter, spacing)." };
    for (const k of ["width", "length", "overhang", "gableOverhang", "ceilingBearing", "collarDrop"]) if (typeof plan.roof[k] === "string") plan.roof[k] = parseLength(plan.roof[k]);
    for (const wg of [plan.roof.wing, plan.roof.wing2]) if (wg) for (const k of ["width", "projection", "at"]) if (typeof wg[k] === "string") wg[k] = parseLength(wg[k]);
    roof = layoutRoof(plan.roof, plan);
    if (!roof.ok) return { code: 1, out: `The roof has problems:\n${roof.errors.map((e) => `  - ${e}`).join("\n")}` };
  }
  let foundation = null;
  if (flags.has("--foundation") || plan.foundation) {
    if (!plan.foundation) return { code: 2, out: "The plan has no `foundation` object (type, width, depth, footing, stem, slab)." };
    for (const k of ["width", "depth", "cover", "barLength"]) if (typeof plan.foundation[k] === "string") plan.foundation[k] = parseLength(plan.foundation[k]);
    foundation = layoutFoundation(plan.foundation);
    if (!foundation.ok) return { code: 1, out: `The foundation has problems:\n${foundation.errors.map((e) => `  - ${e}`).join("\n")}` };
  }
  let drywall = null;
  if (flags.has("--drywall") || plan.drywall) {
    plan.drywall = plan.drywall || {};
    for (const k of ["height"]) if (typeof plan.drywall[k] === "string") plan.drywall[k] = parseLength(plan.drywall[k]);
    for (const c of plan.drywall.ceiling || []) for (const k of ["width", "depth"]) if (typeof c[k] === "string") c[k] = parseLength(c[k]);
    drywall = layoutDrywall(plan.drywall, plan, roof);
    if (!drywall.ok) return { code: 1, out: `The drywall has problems:\n${drywall.errors.map((e) => `  - ${e}`).join("\n")}` };
  }
  const shell = () => [...(floor ? floorCuts(floor) : []), ...stairs.flatMap((x) => (x.flights ? [...x.flights.flatMap(stairCuts), ...landingCuts(x)] : stairCuts(x))), ...(roof ? roofCuts(roof) : [])];
  /** @type {any} */
  let r = takeoff(plan, shell());
  if (floor && r.ok) r.floor = floor;
  if (stairs.length && r.ok) r.stairs = stairs;
  if (roof && r.ok) r.roof = roof;
  if (foundation && r.ok) r.foundation = foundation;
  if (drywall && r.ok) r.drywall = drywall;
  let insulation = null;
  if (r.ok && (flags.has("--insulation") || plan.insulation)) {
    insulation = layoutInsulation(plan.insulation || {}, plan, r);
    if (!insulation.ok) return { code: 1, out: `The insulation has problems:\n${insulation.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.insulation = insulation;
  }
  let trimmed = null;
  if (r.ok && (flags.has("--trim") || plan.trim)) {
    const trim = layoutTrim(plan.trim || {}, plan);
    if (!trim.ok) return { code: 1, out: `The trim has problems:\n${trim.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.trim = trimmed = trim;
  }
  let sided = null;
  if (r.ok && (flags.has("--siding") || plan.siding)) {
    const siding = layoutSiding(plan.siding || {}, plan);
    if (!siding.ok) return { code: 1, out: `The siding has problems:\n${siding.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.siding = sided = siding;
  }
  let eaved = null;
  if (r.ok && (flags.has("--eaves") || plan.eaves)) {
    const eaves = layoutEaves(plan.eaves || {}, roof);
    if (!eaves.ok) return { code: 1, out: `The eaves have problems:\n${eaves.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.eaves = eaved = eaves;
  }
  let guttered = null;
  if (r.ok && (flags.has("--gutters") || plan.gutters)) {
    const gutters = layoutGutters(plan.gutters || {}, roof);
    if (!gutters.ok) return { code: 1, out: `The gutters have problems:\n${gutters.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.gutters = guttered = gutters;
  }
  if (!r.ok) return { code: 1, out: `The plan has problems:\n${r.errors.map((e) => `  - ${e}`).join("\n")}` };
  if (flags.has("--sheathing") || flags.has("--horizontal") || flags.has("--overhang") || rimLap > 0 || plan.sheathing) {
    const sheathing = sheathe({ ...plan, sheathing: { ...defaultSheathing(), ...(plan.sheathing || {}), ...(flags.has("--horizontal") ? { orientation: "horizontal" } : {}), ...(flags.has("--overhang") ? { overhang: true } : {}), ...(rimLap > 0 ? { rimLap } : {}) } }, r);
    const extra = nailerCuts(sheathing);
    if (extra.length) { r = takeoff(plan, [...extra, ...shell()]); if (floor) r.floor = floor; if (stairs.length) r.stairs = stairs; if (roof) r.roof = roof; if (foundation) r.foundation = foundation; if (drywall) r.drywall = drywall; if (insulation) r.insulation = insulation; if (trimmed) r.trim = trimmed; if (sided) r.siding = sided; if (eaved) r.eaves = eaved; if (guttered) r.gutters = guttered; } // nailers join the cut list and the lumber order
    r.sheathing = sheathing;
  }
  if (r.ok && (flags.has("--fasteners") || plan.fasteners)) {
    const fasteners = layoutFasteners(plan.fasteners || {}, plan, r);
    if (!fasteners.ok) return { code: 1, out: `The fasteners have problems:\n${fasteners.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.fasteners = fasteners;
  }
  const sheathPsf = Math.max(0, parseFloat(argv.find((a) => a.startsWith("--sheathing-psf="))?.slice(16) ?? "0") || 0);
  const panelMax = Math.max(0, parseLength(argv.find((a) => a.startsWith("--panel-max="))?.slice(12) ?? "0") || 0);
  if (flags.has("--panel-order") && panelMax > 0) {
    const po = panelOrder(r, plan, panelMax, r.sheathing ? nailerCuts(r.sheathing) : []);
    return { code: 0, out: flags.has("--json") ? JSON.stringify(po, null, 2) : [...panelOrderText(po), ...(flags.has("--pull-lists") ? ["", ...panelPullText(po)] : [])].join("\n") };
  }
  if (flags.has("--pdf")) return { code: 0, out: "", bytes: drawingSetPdf(r, plan, { panelMax }) };
  if (flags.has("--drawings") || panelMax > 0) return { code: 0, out: drawingSetHtml(r, plan, { panelMax, sheathPsf, panelSheets: flags.has("--panel-sheets") }).trimEnd() };
  if (flags.has("--schedule") && flags.has("--json")) return { code: 0, out: JSON.stringify(schedule(plan.schedule), null, 2) };
  if (flags.has("--level-bids")) {
    if (!Array.isArray(plan.bids) || !plan.bids.length) return { code: 1, out: 'plan has no "bids" list (each: { bidder, lines: [{ item, qty, unitPrice | amount }] })' };
    const lv = levelBids(budget(r, plan.prices || {}), plan.bids);
    return { code: lv.errors.length ? 1 : 0, out: flags.has("--json") ? JSON.stringify(lv, null, 2) : levelText(lv).join("\n") };
  }
  if (flags.has("--budget") && flags.has("--csv")) return { code: 0, out: budgetCsv(budget(r, plan.prices || {})).trimEnd() };
  if (flags.has("--budget") && flags.has("--json")) return { code: 0, out: JSON.stringify(budget(r, plan.prices || {}), null, 2) };
  if (flags.has("--json")) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (flags.has("--csv")) return { code: 0, out: toCsv(r).trimEnd() };
  const s = r.summary;
  const lines = [];
  lines.push(`${s.walls} walls, ${s.wallFeet.toFixed(1)} ft of wall, ${s.pieces} pieces from ${s.boards} boards`);
  lines.push(`Order cost ${s.cost.toFixed(2)} (lower bound ${s.bound.toFixed(2)}, gap ${(100 * s.gap).toFixed(2)}%); every piece on its own board would cost ${s.naiveCost.toFixed(2)}`);
  lines.push(`Bought ${s.boughtFeet.toFixed(1)} ft for ${s.neededFeet.toFixed(1)} ft of pieces: ${(100 * s.waste).toFixed(1)}% offcut and kerf`);
  lines.push("", "ORDER");
  for (const o of r.orders) {
    for (const l of o.lines) lines.push(`  ${String(l.qty).padStart(4)}  ${o.size.padEnd(7)} ${formatLength(l.length).padEnd(10)} ${l.label}`);
    lines.push(`        ${o.size}: ${o.method}, cost ${o.cost.toFixed(2)}${o.proven ? ", proven cheapest" : ""}`);
  }
  lines.push("", "CUT LIST");
  for (const c of r.cuts) lines.push(`  ${String(c.qty).padStart(4)}  ${c.size.padEnd(7)} ${formatInches(c.length).padEnd(10)} ${c.kind}`);
  lines.push("", "LAYOUT MARKS (left edge of each member, from the wall start)");
  for (const w of r.walls) {
    const marks = w.members.filter((m) => m.orient === "v" && m.kind !== "cripple" && m.kind !== "jack").sort((a, b) => a.x - b.x);
    lines.push(`  ${w.id} (${formatLength(w.length)}): ${marks.map((m) => `${formatInches(m.x)}${m.kind === "stud" ? "" : ` ${m.kind[0].toUpperCase()}`}`).join(", ")}`);
  }
  lines.push("  K = king, C = corner backing, T = tee backing; jacks sit inside the kings.");
  if (r.sheathing) lines.push("", `SHEATHING (panels run ${r.sheathing.orientation === "horizontal" ? "horizontally, course by course from the floor" : "vertically from the wall start"}; lengths left to right)`, ...sheathingText(r.sheathing));
  if (r.floor) lines.push("", "FLOOR", ...floorText(r.floor));
  if (r.stairs) lines.push("", "STAIRS", ...r.stairs.flatMap((x) => [...(x.flights ? landingText(x) : stairText(x)), ...(x.winders ? winderText(x.winders) : [])]));
  if (r.foundation) lines.push("", "FOUNDATION", ...foundationText(r.foundation));
  if (r.drywall) lines.push("", "DRYWALL", ...drywallText(r.drywall));
  if (r.fasteners) lines.push("", "FASTENERS", ...fastenerText(r.fasteners));
  if (r.insulation) lines.push("", "INSULATION", ...insulationText(r.insulation));
  if (r.trim) lines.push("", "TRIM", ...trimText(r.trim));
  if (r.siding) lines.push("", "SIDING", ...sidingText(r.siding));
  if (r.eaves) lines.push("", "SOFFIT AND FASCIA", ...eavesText(r.eaves));
  if (r.gutters) lines.push("", "GUTTERS AND DOWNSPOUTS", ...guttersText(r.gutters));
  if (r.roof) lines.push("", "ROOF", ...roofText(r.roof));
  if (flags.has("--budget")) lines.push("", "BUDGET", ...budgetText(budget(r, plan.prices || {})));
  if (flags.has("--schedule")) lines.push("", "SCHEDULE", ...scheduleText(schedule(plan.schedule)));
  if (headers && (flags.has("--headers") || headers.notes.length)) lines.push("", "HEADERS", ...headerText(headers));
  if (r.notes.length) lines.push("", "NOTES", ...r.notes.map((n) => `  - ${n}`));
  lines.push("", "Header sizes and jack counts are your inputs and are not checked against a span table or code.");
  return { code: 0, out: dxfNotes + lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, out, bytes } = main(process.argv.slice(2));
  if (bytes) process.stdout.write(bytes);
  else (code ? process.stderr : process.stdout).write(out + "\n");
  process.exitCode = code;
}
