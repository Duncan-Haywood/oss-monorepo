#!/usr/bin/env node
// @ts-check
// Wall framing takeoff from the terminal: a plan JSON in, an order, a cut
// list and per-wall layout marks out.
import { readFileSync } from "node:fs";
import { expandSteppedWalls } from "./stepwall.mjs";
import { sheathe, defaultSheathing, sheathingText, nailerCuts } from "./sheathing.mjs";
import { layoutFloor, floorCuts, floorText } from "./floor.mjs";
import { layoutDeck, deckText } from "./deck.mjs";
import { layoutFoundation, foundationText } from "./foundation.mjs";
import { layoutDrywall, drywallText } from "./drywall.mjs";
import { layoutInsulation, insulationText } from "./insulation.mjs";
import { layoutTrim, trimText } from "./trim.mjs";
import { layoutPaint, paintText } from "./paint.mjs";
import { layoutWallTile, wallTileText } from "./walltile.mjs";
import { layoutFireblock, fireblockText } from "./fireblock.mjs";
import { layoutFlooring, flooringText } from "./flooring.mjs";
import { layoutElectrical, electricalText } from "./electrical.mjs";
import { layoutPlumbing, plumbingText } from "./plumbing.mjs";
import { layoutHvac, hvacText } from "./hvac.mjs";
import { layoutDrilling, drillingText } from "./drilling.mjs";
import { layoutOpeningSchedule, openingScheduleText } from "./openingschedule.mjs";
import { layoutSiding, sidingText } from "./siding.mjs";
import { layoutStucco, stuccoText } from "./stucco.mjs";
import { layoutPaver, paverText } from "./paver.mjs";
import { layoutEaves, eavesText } from "./eaves.mjs";
import { layoutVentilation, ventilationText } from "./ventilation.mjs";
import { layoutGutters, guttersText } from "./gutters.mjs";
import { layoutDormer, layoutShedDormer, dormerText } from "./dormer.mjs";
import { layoutFasteners, fastenerText } from "./fasteners.mjs";
import { layoutStair, linkStairReaction, stairCuts, stairText, layoutStairWithLanding, landingCuts, landingText, checkWinders, layoutWinders, winderText, STAIR_LIMITS } from "./stairs.mjs";
import { layoutRoof, roofCuts, roofText } from "./roof.mjs";
import { resolveHeaders, headerText } from "./headers.mjs";
import { gangOpenings } from "./ganged.mjs";
import { doorsToFloor, shallowHeaders, trimOpenings } from "./shallowheaders.mjs";
import { openingSizes, wallHeights } from "./ifcwasm.mjs";
import { drawingSetHtml } from "./drawings.mjs";
import { drawingSetPdf } from "./pdf.mjs";
import { panelMaxError, panelOrder, panelOrderText, panelPullText } from "./panels.mjs";
import { budget, budgetText, budgetCsv } from "./budget.mjs";
import { proposal, proposalText } from "./bidletter.mjs";
import { budgetDiff, diffText } from "./compare.mjs";
import { sensitivity, sensitivityText } from "./sensitivity.mjs";
import { levelBids, levelText } from "./bidlevel.mjs";
import { scheduleRisk, riskText } from "./risk.mjs";
import { procurement, procurementText, procurementCsv } from "./procurement.mjs";
import { schedule, scheduleText, scheduleCsv, resolveRates, templateSchedule } from "./schedule.mjs";
import { planFromDxf } from "./dxf.mjs";
import { stackFloors } from "./stackfloors.mjs";

/** `--wall-layer=RE`, `--door-layer=RE`, `--window-layer=RE`: layer-name patterns (case-insensitive) for drawings whose layers are not named like "wall". */
function layerOptions(argv) {
  const out = {};
  for (const [flag, key] of [["wall", "wallLayer"], ["door", "doorLayer"], ["window", "windowLayer"]]) {
    const v = argv.find((a) => a.startsWith(`--${flag}-layer=`))?.slice(flag.length + 9);
    if (v) out[key] = new RegExp(v, "i");
  }
  return out;
}
import { planFromIfc } from "./ifc.mjs";
import { misspeltPlanKeys, misspeltPlanKeysNote } from "./planKeys.mjs";
import { validatePlan, takeoff, samplePlan, toCsv, formatLength, formatInches, parseLength } from "./engine.mjs";

const HELP = `wall-framing-takeoff: stud layout, cut list and the cheapest lumber order for a set of walls

Usage:
  node cli.mjs plan.json            print the order, the cut list and the layout marks
  node cli.mjs plan.json --json     the full result as JSON
  node cli.mjs plan.json --csv      order, cut list and board-by-board cuts as CSV
  node cli.mjs plan.json --sheathing  add panel layout per wall and the sheet order
  node cli.mjs plan.json --overhang   run sheathing past corners to cover the next wall's end stud (vertical sheets)
  node cli.mjs plan.json --rim-lap=9.25  run sheathing that many inches below the bottom plate to cover the rim board (vertical sheets)
  node cli.mjs plan.json --horizontal sheets long side along the wall (implies --sheathing)
  node cli.mjs 1st.json --stack=2nd.json,3rd.json      (a drawing takes its heights: 2nd.dxf+2nd-plan.json) order several floors' plan files together (ids get the file name in front; one lumber list, one cutting-stock order)
  node cli.mjs plan.json --add-board=2x4:20ft[:price]  add a longer board to the lumber list (repeatable; a DXF or IFC read has the 16 ft default only; unpriced boards cost per foot like the longest of that size)
  node cli.mjs plan.json --whole-house  shorthand for --doors-to-floor --shallow-headers --trim-openings --skip-refused: frame a whole-house read through the model's own height conflicts, each change noted (placeholders, check them against the source model)
  node cli.mjs plan.json --doors-to-floor  a door whose bottom is more than 2 in above the floor in the model (a 39 in sill on a French door) is framed down to the floor, leaf height kept, with a note
  node cli.mjs plan.json --shallow-headers --trim-openings  with --shallow-headers, an opening taller than the room under the plates for even a 2x4 header is framed shorter by the excess, with a note
  node cli.mjs plan.json --shallow-headers  where a header is deeper than the room under the top plates, use the deepest listed header that fits (2x10 to 2x8 to 2x6 to 2x4) and note it for your engineer; the span is not checked
  node cli.mjs plan.json --whole-house --fixed-plan  print the plan after the fixes above, as JSON, and stop (feeds allowance-bench.mjs)
  node cli.mjs plan.json --skip-refused  frame the walls that pass the plan checks and list the ones refused (opening too near a wall end, header too tall...), instead of stopping at the first bad wall
  node cli.mjs plan.json --panel-max=12ft  shop drawings with each wall split into panels no longer than that
  node cli.mjs plan.json --panel-max=12ft --panel-order --pull-lists  boards and cuts each panel is built from (add to --panel-order)
  node cli.mjs plan.json --panel-max=12ft --panel-order  lumber order for the shop panels (plates cut at panel breaks) against the whole-wall order
  node cli.mjs plan.json --panel-max=12ft --panel-sheets  one printable sheet per panel after each wall's sheet
  node cli.mjs plan.json --panel-max=12ft --sheathing-psf=1.5  also weigh the sheathing on each panel (lb per sq ft)
  node cli.mjs plan.json --floor     add the plan's floor (joists, rim, blocking, subfloor sheets); its lumber joins the order
  node cli.mjs plan.json --deck      add the plan's deck (plan "deck": {stairs: {width, tread, stringer} adds a stair with the deck height as its rise; width, depth, height, joist, spacing, beam, beamPlies, postSize, freestanding, overhang, spanTable}): joists, rims or ledger, beam and posts, footing concrete, decking rows with joints on joists, hardware; its own pressure-treated lumber order
  node cli.mjs plan.json --stairs    add the plan's stairs (plan "stairs": one object or a list of {totalRise, tread, stringer, width, treadBoard, floorThickness, openingLength}): equal risers under the code limit, notch geometry, stringers and treads, the stairwell opening the headroom needs; the lumber joins the order
  node cli.mjs plan.json --roof      add the plan's gable roof, or hip roof with shape "hip" (rafters, ridge, sheathing, shingle and felt quantities); its lumber joins the order
  node cli.mjs plan.json --fasteners   count nails by connection (plan fasteners: studEndNails, plateSpacing, edgeSpacing, nailsPerBox, price; add --sheathing for sheathing nails)
  node cli.mjs plan.json --ventilation  size attic vents (IRC R806 net free area, 1/150 or 1/300) and count the ridge vent and soffit vents (needs a roof; plan ventilation: ratio, atticSqFt, ridgeVent, upperShare, ridgeNfaPerFt, soffitUnitNfa, soffitUnitWidth, ridgePrice, soffitPrice)
  node cli.mjs plan.json --gutters    add gutters, downspouts, hangers, caps and elbows along the roof's eaves (needs a roof; plan gutters: gutterStock, downspoutStock, eaveHeight, hangerSpacing, maxRunFeet, sqFtPerDownspout, strapSpacing, waste, and a price for each part)
  node cli.mjs plan.json --dormer     frame a gable dormer from plan.dormer: width, eaveHeight, pitch, mainPitch (defaults to the roof pitch), spacing, studSize, rafterSize, valleySize, ridgeSize, window {width, height, sill}
  node cli.mjs plan.json --eaves       add soffit panels, fascia boards and J-channel under the roof overhangs (needs a roof; plan eaves: panelWidth, panelStock, fasciaStock, channelStock, waste, rakeSoffit, ventedPanelNfa, frieze, friezeStock, friezePrice, panelPrice, fasciaPrice, channelPrice)
  node cli.mjs plan.json --siding      add exterior lap siding courses, house wrap and corner boards (plan siding: exposure, stock, waste, wrapRollSqFt, wrapLap, corners, cornerStock, height, boardPrice, wrapPrice, cornerPrice, style, boardWidth, openingTrim, trimWidth, trimStock, trimPrice)
  node cli.mjs plan.json --paver       add the plan's paver patio or walk (plan "paver": {areas: [{width, length, subtract?}] in feet, edgeFeet, paver: {length, width, thickness, joint, baseDepth, sandDepth, baseOverhang, compaction, waste, prices}}): pavers, dig, base, bedding sand, fabric, edge restraint, joint sand
  node cli.mjs plan.json --stucco      add cement stucco over metal lath on the exterior walls: barrier, lath, plaster bags, weep screed, casing and corner bead, control joints (plan stucco: scratch, brown, finish thickness in, rebound, bagYieldCuFt, maxRunFt, maxPanelSqFt, corners, prices)
  node cli.mjs plan.json --electrical  add receptacle and switch boxes (NEC 210.52 wall-space rule) and a cable estimate (plan electrical: skipWalls, maxSpacing, minSpace, switchPerDoor, cablePerDevice, cableRoll, waste, receptaclePrice, switchPrice, boxPrice, cablePrice)
  node cli.mjs plan.json --hvac        add HVAC duct rough-in quantities from plan.hvac.rooms (typed supply and return runs, outlets): trunk sticks, flex rolls, boots, registers, grilles, fittings
  node cli.mjs plan.json --plumbing    add plumbing rough-in quantities from plan.plumbing.fixtures (typed drain, vent, hot and cold runs per fixture): pipe sticks, PEX coils, traps, stops, fittings
  node cli.mjs plan.json --drilling    check pipe and cable holes and notches against stud limits (plan drilling: runs [{wall, kind: bore|notch, size or pipe, count, doubled, label}], clearance, limits)
  node cli.mjs plan.json --trim        add baseboard and door and window casing boards (plan trim: scarf, shoe, shoeStock, shoePrice, baseSides, baseStock, casingStock, casingWidth, reveal, waste, basePrice, casingPrice)
  node cli.mjs plan.json --wall-tile   add wall tile orders (shower, tub, backsplash) from typed surfaces: tiles, thinset, grout, cement backer board, screws, membrane (plan wallTile: surfaces [{name, width, height, openings}], tile, backer, membrane)
  node cli.mjs plan.json --flooring    add finish flooring orders from typed rooms: plank boxes, tile with thinset and grout, carpet strips from a roll with pad and tack strip (plan flooring: rooms [{name, width, depth, kind}], plank, tile, carpet)
  node cli.mjs plan.json --fireblock   add fireblocking rows for walls taller than the typed cavity limit (plan fireblock: intervalFt, boardFt, rows, waste, boardPrice)
  node cli.mjs plan.json --paint       add interior paint gallons: walls less openings, doors, ceilings, coats, primer (plan paint: height, faces, coats, primerCoats, coverage, waste, ceilings, trimFeet, gallonPrice, fivePrice)
  node cli.mjs plan.json --openings    print the door and window schedule: marks, counts, rough and unit sizes, header, sill height, where each sits (plan openingSchedule: unitAllowance, doorPrefix, windowPrefix)
  node cli.mjs plan.json --insulation  add wall-cavity insulation bags (measured from the framing placed; plan insulation: bagSqFt, rValue, waste, price)
  node cli.mjs plan.json --drywall     add interior drywall (inside faces, partitions both sides, optional ceilings; plan drywall: sheetLength, ceiling, price)
  node cli.mjs plan.json --foundation  add the plan's foundation (footing, stem wall and slab concrete, trucks, rebar, forms, gravel, vapor barrier)
  node cli.mjs plan.json --level-bids  line up the plan's "bids" (bidder, lines of item, qty, unitPrice or amount) against the budget lines: short quantities and left-out scope are priced at the bid's own, the plan's or the other bids' median price, else listed (add --json)
  node cli.mjs plan.json --compare=revised.json  change order: each plan priced with its own "prices", then the budget difference line by line (add --json); pass the same flags the budget needs (--sheathing...)
  node cli.mjs plan.json --proposal  customer letter from the budget: section prices with markup spread pro rata, plan "proposal" {client, project, date, validDays, inclusions, exclusions, terms, partial, payments [{name, pct}] adding to 100}; refused while any line is unpriced (add --json)
  node cli.mjs plan.json --sensitivity [--swing=10]  what a price swing in each budget section does to the cost and the bid, and the rise a fixed bid absorbs (add --json)
  node cli.mjs plan.json --budget    price the quantities with the plan's own "prices" (sheets, bundles, concrete, rebar...); lumber uses the stock prices; anything without a price is listed, not guessed (add --csv for a spreadsheet file, --json for the data)
  node cli.mjs --schedule-template   a starter activity list (order and predecessors, every duration 0) to paste into a plan as "schedule"
  node cli.mjs plan.json --risk      Monte Carlo finish dates (P50/P80/P90, chance of the deadline) from min/max days on the schedule activities
  node cli.mjs plan.json --orders[=YYYY-MM-DD]  order-by dates for long-lead items (plan schedule.orders: item, for, leadDays, bufferDays); with a date, which are already late and what that does to the start; add --csv or --json
  node cli.mjs plan.json --schedule  critical path, crew levelling and slip effects from the plan's own schedule object (activities, durations, predecessors, crews); add --csv for a spreadsheet file
  node cli.mjs plan.json --drawings   printable HTML shop drawings, one sheet per wall (marked members, dimensions, parts table)
  node cli.mjs plan.json --pdf > walls.pdf   the same shop drawings as a PDF file (no browser; add --panel-max=12ft for panel cut lines)
  node cli.mjs plan.json --gang     frame openings too close for their own kings (same kind, height and head) as one ganged opening with a mullion, and say which
  node cli.mjs plan.json --headers  size headers from the plan's own headerTable ({upTo, header, plies?} rows from your span table; an opening with "header": "auto" takes the first row that covers it) and list hand-picked ones the table says are too light
  node cli.mjs plan.dxf --ifc-json=plan.json  read each wall's and opening's real height from the JSON of ifc-engine plan, same storey (a DXF carries only places and widths)
  node cli.mjs house.ifc [--storey=N|name]  the same from an IFC file (one storey at a time; the lowest by default) (IfcWall axis lines, IfcDoor/IfcWindow; hand-written fixtures only so far)
  node cli.mjs house.dxf --plan-only  read a DXF floor plan (wall centre lines on a layer named like "wall", openings as lines on "door"/"window" layers; --units=in|ft|mm|cm|m when the file does not say; --wall-layer=RE, --door-layer=RE and --window-layer=RE name the layers when they are not called like that; walls drawn as two face lines are paired into centre lines automatically, --double-line forces it, --single-line turns it off) and print the plan JSON; without --plan-only it goes straight on to the takeoff
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
  // a plan file of the wrong shape used to fail with a raw JavaScript message ("Cannot create property 'length' on number")
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) { if (Array.isArray(plan)) return plan; throw new Error("the plan file must be a JSON object with a \"walls\" list (see --example)"); }
  if ("walls" in plan && !Array.isArray(plan.walls)) throw new Error("\"walls\" must be a list of wall objects");
  if ("stock" in plan && !Array.isArray(plan.stock)) throw new Error("\"stock\" must be a list of {length, price} objects");
  const bad = (name, list) => { const i = (list || []).findIndex((e) => !e || typeof e !== "object" || Array.isArray(e)); if (i >= 0) throw new Error(`${name} ${i + 1} must be an object (for example {"length": 96}), not ${JSON.stringify(list[i])}`); };
  bad("wall", plan.walls); bad("stock entry", plan.stock);
  for (const w of plan.walls || []) { if ("openings" in w && !Array.isArray(w.openings)) throw new Error("a wall's \"openings\" must be a list"); bad("opening", w.openings); }
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

/** `--ifc-json=FILE` (the output of `ifc-engine plan`, same storey and flags as the DXF) for a DXF read. */
function ifcJsonFile(argv) { return argv.find((a) => a.startsWith("--ifc-json="))?.slice(11); }
function ifcJsonOptions(argv) {
  const f = ifcJsonFile(argv);
  if (!f) return {};
  const info = JSON.parse(readFileSync(f, "utf8"));
  return { openingSize: openingSizes(info), wallHeight: wallHeights(info) };
}

let keyNote = "";

/** Runs the CLI; a text report (not JSON, which must stay parseable) gets a note on misspelt plan keys. */
// Every flag the CLI reads. A flag outside this list used to be ignored, so a misspelt option
// quietly printed the plain order. cli-flags.test.mjs checks this list against the flags in this file.
export const BARE_FLAGS = ["--budget", "--csv", "--deck", "--doors-to-floor", "--dormer", "--double-line", "--drawings", "--drilling", "--drywall", "--eaves", "--electrical", "--example", "--fasteners", "--fireblock", "--fixed-plan", "--floor", "--flooring", "--foundation", "--gang", "--gutters", "--headers", "--help", "--horizontal", "--hvac", "--insulation", "--json", "--level-bids", "--openings", "--orders", "--overhang", "--paint", "--panel-order", "--panel-sheets", "--paver", "--pdf", "--plan-only", "--plumbing", "--proposal", "--pull-lists", "--risk", "--roof", "--schedule", "--schedule-template", "--sensitivity", "--shallow-headers", "--sheathing", "--siding", "--single-line", "--skip-refused", "--stairs", "--stucco", "--trim", "--trim-openings", "--ventilation", "--wall-tile", "--whole-house"];
export const VALUE_FLAGS = ["--add-board", "--compare", "--door-layer", "--ifc-json", "--orders", "--panel-max", "--rim-lap", "--sheathing-psf", "--stack", "--storey", "--swing", "--units", "--wall-layer", "--window-layer"];

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** @param {string[]} argv @returns {string} an error naming the first flag the CLI does not read, "" when all are known */
export function unknownFlag(argv) {
  for (const a of argv) {
    if (typeof a !== "string" || !a.startsWith("--") || a === "--") continue;
    const eq = a.indexOf("=");
    const name = eq < 0 ? a : a.slice(0, eq);
    if (eq >= 0 && a.length === eq + 1 && VALUE_FLAGS.includes(name) && name !== "--orders") return `${name}= has no value after the equals sign; write ${name}=... (see --help).`;
    if (eq < 0 ? BARE_FLAGS.includes(name) : VALUE_FLAGS.includes(name)) continue;
    if (eq >= 0 && BARE_FLAGS.includes(name) && !VALUE_FLAGS.includes(name)) return `${name} takes no value (you wrote ${a}). Try ${name} on its own.`;
    if (eq < 0 && VALUE_FLAGS.includes(name) && !BARE_FLAGS.includes(name)) return `${name} needs a value, such as ${name}=...; see --help.`;
    const all = [...BARE_FLAGS, ...VALUE_FLAGS];
    const near = all.map((f) => [editDistance(name, f), f]).sort((x, y) => x[0] - y[0])[0];
    return `Unknown option ${name}.${near && near[0] <= 3 ? ` Did you mean ${near[1]}${VALUE_FLAGS.includes(near[1]) && !BARE_FLAGS.includes(near[1]) ? "=..." : ""}?` : ""} --help lists the options.`;
  }
  return "";
}

export function main(argv, readInput = (p) => readFileSync(p === "-" ? 0 : p, "utf8")) {
  const r = runMain(argv, readInput);
  if (keyNote && typeof r.out === "string" && !/^\s*[\[{]/.test(r.out)) return { ...r, out: keyNote + r.out };
  return r;
}

function runMain(argv, readInput = (p) => readFileSync(p === "-" ? 0 : p, "utf8")) {
  // --whole-house: the four placeholders a whole-house IFC or DXF read needed on the Schultz file, in one flag.
  if (argv.includes("--whole-house")) argv = [...argv.filter((a) => a !== "--whole-house"), ...["--skip-refused", "--doors-to-floor", "--shallow-headers", "--trim-openings"].filter((f) => !argv.includes(f))];
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rimLap = Math.max(0, parseLength(argv.find((a) => a.startsWith("--rim-lap="))?.slice(10) ?? "0") || 0);
  if (flags.has("--help") || flags.has("-h")) return { code: 0, out: HELP };
  const flagErr = unknownFlag(argv);
  if (flagErr) return { code: 1, out: flagErr };
  // A mistyped size must stop the run, not quietly turn the feature off (a "--panel-max=zzz" used to print the plain order).
  for (const [flag, kind] of [["--rim-lap=", "length"], ["--panel-max=", "length"], ["--sheathing-psf=", "number"]]) {
    const raw = argv.find((a) => a.startsWith(flag))?.slice(flag.length);
    if (raw === undefined) continue;
    const v = kind === "length" ? parseLength(raw) : (/^\s*\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(v) || v < 0) return { code: 1, out: `${flag}${raw} is not a ${kind === "length" ? "length such as 4ft or 9.25in" : "number of pounds per square foot"} (zero or more).` };
  }
  const pm = argv.find((a) => a.startsWith("--panel-max="))?.slice(12);
  if (pm !== undefined && parseLength(pm) > 0 && panelMaxError(parseLength(pm))) return { code: 1, out: `--panel-max=${pm}: ${panelMaxError(parseLength(pm))}.` };
  if (flags.has("--schedule-template")) return { code: 0, out: JSON.stringify(templateSchedule(), null, 2) };
  if (flags.has("--example")) return { code: 0, out: JSON.stringify(samplePlan(), null, 2) };
  if (!args.length) return { code: 2, out: HELP };
  let plan;
  let dxfNotes = "";
  keyNote = "";
  if (!/\.(dxf|ifc)$/i.test(args[0])) {
    // These options only steer the reading of a drawing; on a plan JSON they used to be ignored without a word.
    const drawingOnly = argv.find((a) => /^--(units|storey|wall-layer|door-layer|window-layer|ifc-json)=/.test(a) || a === "--double-line" || a === "--single-line");
    if (drawingOnly) return { code: 1, out: `${drawingOnly.split("=")[0]} only applies when the input is a .dxf or .ifc file; ${args[0]} is read as a plan JSON.` };
  }
  if (argv.some((a) => a.startsWith("--swing=")) && !flags.has("--sensitivity")) return { code: 1, out: "--swing= only applies with --sensitivity." };
  try {
    if (/\.(dxf|ifc)$/i.test(args[0])) {
      const units = argv.find((a) => a.startsWith("--units="))?.slice(8);
      const r = /** @type {{ ok: boolean, errors: string[], notes: string[], plan?: any, stats?: any }} */ ((/\.ifc$/i.test(args[0]) ? planFromIfc : planFromDxf)(readInput(args[0]), { units: /** @type {any} */ (units), storey: (() => { const v = argv.find((a) => a.startsWith("--storey="))?.slice(9); return v == null ? undefined : /^\d+$/.test(v) ? Number(v) : v; })(), doubleLine: argv.includes("--single-line") ? false : argv.includes("--double-line") ? true : "auto", ...layerOptions(argv), ...ifcJsonOptions(argv) }));
      if (!r.ok) return { code: 2, out: `Could not read the drawing: ${r.errors.join(" ")}` };
      const note = r.notes.map((n) => `  - ${n}`).join("\n");
      if (flags.has("--plan-only")) return { code: 0, out: JSON.stringify(r.plan, null, 2) + `\n\nNotes (not part of the JSON):\n${note}` };
      if (ifcJsonFile(argv)) {
        // the model's own wall heights: the plan's stud length is the commonest, each wall keeps its own
        const lens = (r.plan.walls || []).map((w) => w.studLength).filter((v) => v > 0);
        if (lens.length) {
          const tally = new Map(); for (const v of lens) tally.set(v, (tally.get(v) || 0) + 1);
          r.plan.studLength = [...tally.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0][0];
          for (const w of r.plan.walls) if (w.studLength === r.plan.studLength) delete w.studLength;
        }
      }
      plan = normalise({ ...samplePlan(), ...r.plan });
      dxfNotes = `Read ${r.stats.walls} walls (${r.stats.exterior} exterior, ${r.stats.interior} interior), ${r.stats.tees} tees, ${r.stats.openings} openings from ${args[0]}:\n${note}\n\n`;
    } else {
      const raw = JSON.parse(readInput(args[0])); keyNote = misspeltPlanKeysNote(misspeltPlanKeys(raw)); plan = normalise(raw);
      for (const w of plan.walls || []) if (w && typeof w.studLength === "string") w.studLength = parseLength(w.studLength);
      for (const w of plan.walls || []) if (w && Array.isArray(w.steps)) for (const st of w.steps) if (st) for (const k of ["at", "studLength"]) if (typeof st[k] === "string") st[k] = parseLength(st[k]);
      const ex = /** @type {any} */ (expandSteppedWalls(plan));
      if (!ex.ok) return { code: 1, out: `The stepped walls have problems:\n${ex.errors.map((e) => `  - ${e}`).join("\n")}` };
      plan = ex.plan; keyNote += ex.notes.map((n) => `Note: ${n}\n`).join("");
    }
  } catch (e) {
    return { code: 2, out: `Could not read the plan: ${e instanceof Error ? e.message : e}` };
  }
  // --stack=FILE,FILE: more floors' plan JSON files, ordered together with this one (ids get the file's name in front).
  const stackArg = argv.find((a) => a.startsWith("--stack="))?.slice(8);
  if (stackArg !== undefined) {
    const base = (f) => f.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
    const files = stackArg.split(",").filter(Boolean);
    if (!files.length) return { code: 1, out: "--stack=FILE,FILE needs at least one more plan file." };
    try {
      const floors = [{ name: base(args[0]), plan }];
      for (const f of files) {
        // FILE.dxf+HEIGHTS.json: a drawing read like the first file, with its own `ifc-engine plan` JSON for heights
        const [fpath, hpath] = f.split("+");
        let raw;
        if (/\.dxf$/i.test(fpath)) {
          const units = argv.find((a) => a.startsWith("--units="))?.slice(8);
          const o = hpath ? (() => { const info = JSON.parse(readInput(hpath)); return { openingSize: openingSizes(info), wallHeight: wallHeights(info) }; })() : {};
          const r2 = /** @type {any} */ (planFromDxf(readInput(fpath), { units: /** @type {any} */ (units), doubleLine: argv.includes("--single-line") ? false : argv.includes("--double-line") ? true : "auto", ...layerOptions(argv), ...o }));
          if (!r2.ok) return { code: 2, out: `Could not read the drawing ${fpath}: ${r2.errors.join(" ")}` };
          if (hpath) {
            const lens = (r2.plan.walls || []).map((w) => w.studLength).filter((v) => v > 0);
            if (lens.length) {
              const tally = new Map(); for (const v of lens) tally.set(v, (tally.get(v) || 0) + 1);
              r2.plan.studLength = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
              for (const w of r2.plan.walls) if (w.studLength === r2.plan.studLength) delete w.studLength;
            }
          }
          raw = { ...samplePlan(), ...r2.plan };
          dxfNotes += `Read ${r2.stats.walls} walls from ${fpath}:\n${r2.notes.map((n) => `  - ${n}`).join("\n")}\n\n`;
        } else raw = JSON.parse(readInput(fpath));
        const p2 = normalise(raw);
        for (const w of p2.walls || []) if (w && typeof w.studLength === "string") w.studLength = parseLength(w.studLength);
        const ex = /** @type {any} */ (expandSteppedWalls(p2));
        if (!ex.ok) return { code: 1, out: `${f}: the stepped walls have problems:\n${ex.errors.map((e) => `  - ${e}`).join("\n")}` };
        floors.push({ name: base(f.split("+")[0]), plan: ex.plan });
      }
      const st = stackFloors(floors);
      if (!st.ok) return { code: 1, out: `Could not stack the floors:\n${st.errors.map((e) => `  - ${e}`).join("\n")}` };
      plan = st.plan; dxfNotes += st.notes.map((n) => `Note: ${n}`).join("\n") + "\n\n";
    } catch (e) {
      return { code: 2, out: `Could not read a stacked plan: ${e instanceof Error ? e.message : e}` };
    }
  }
  // --add-board=SIZE:LENGTH[:PRICE] (repeatable) puts a longer board on the lumber list, for a DXF or IFC read (which carries no stock) or a plan that lacks one.
  const boardNotes = [];
  for (const a of argv.filter((x) => x.startsWith("--add-board="))) {
    const [size, len, price, ...extra] = a.slice(12).split(":");
    const length = parseLength(len ?? "");
    const given = price === undefined ? undefined : /^\s*\d+(\.\d+)?\s*$/.test(price) ? Number(price) : NaN;
    if (!size || extra.length || !(length > 0) || length > 1200 || Number.isNaN(given)) return { code: 1, out: `${a} is not SIZE:LENGTH[:PRICE], such as --add-board=2x4:20ft or --add-board=2x4:240in:31.5 (length 1200 in or less).` };
    const same = (plan.stock || []).filter((st) => st.size === size && st.length > 0 && !st.label);
    if (!same.length && given === undefined) return { code: 1, out: `${a}: no ${size} on the lumber list to price from, so give a price: --add-board=${size}:${len}:PRICE.` };
    let cost = given;
    if (cost === undefined) {
      const ref = same.reduce((m, st) => (st.length > m.length ? st : m));
      cost = Math.round((ref.price / ref.length) * length * 100) / 100;
      boardNotes.push(`Added a ${size} ${formatLength(length)} board at ${cost}, priced per foot like the ${formatLength(ref.length)} ${size} (${ref.price}); set a real price with --add-board=${size}:${len}:PRICE.`);
    } else boardNotes.push(`Added a ${size} ${formatLength(length)} board at ${cost}.`);
    plan.stock = [...(plan.stock || []), { size, length, price: cost }];
  }
  if (boardNotes.length) dxfNotes += boardNotes.map((n) => `Note: ${n}`).join("\n") + "\n\n";
  if (flags.has("--doors-to-floor") && Array.isArray(plan.walls)) {
    const df = doorsToFloor(plan);
    if (df.length) dxfNotes += df.map((n) => `Note: ${n}`).join("\n") + "\n\n";
  }
  // --shallow-headers swaps a header that is deeper than the room under the plates for the deepest listed one that fits, with a note, before the plan checks run.
  if (flags.has("--shallow-headers") && Array.isArray(plan.walls)) {
    const sh = shallowHeaders(plan);
    if (flags.has("--trim-openings")) sh.push(...trimOpenings(plan));
    if (sh.length) dxfNotes += sh.map((n) => `Note: ${n}`).join("\n") + "\n\n";
  }
  // --skip-refused frames the walls that pass the plan checks and lists the ones that do not (a whole-house IFC or DXF read often has a few walls the engine refuses), so one bad wall does not hide the takeoff of the rest.
  if (flags.has("--skip-refused") && Array.isArray(plan.walls)) {
    const skipped = [];
    const unlapped = [];
    for (let pass = 0; pass < 50; pass++) {
      const errs = validatePlan(plan);
      if (!errs.length) break;
      const bad = new Set();
      for (const e of errs) for (const w of plan.walls) if (w && typeof w.id === "string" && w.id.trim() && (e.startsWith(`Wall ${w.id}:`) || e.startsWith(`Wall ${w.id},`))) bad.add(w);
      if (!bad.size) break; // an error that names no wall (stock, spacing, shape) cannot be skipped past
      for (const w of bad) skipped.push(`Wall ${w.id}: ${errs.filter((e) => e.startsWith(`Wall ${w.id}:`) || e.startsWith(`Wall ${w.id},`)).map((e) => e.replace(/^Wall [^:,]*[:,]\s*/, "")).join("; ")}`);
      plan.walls = plan.walls.filter((w) => !bad.has(w));
      // a wall that tees into a skipped wall must not be refused for that alone: drop its lap (a tee end drawn square) and say so
      const gone = new Set([...bad].map((w) => w.id));
      for (const w of plan.walls) if (w.tee && gone.has(w.tee.wall)) { unlapped.push(`Wall ${w.id}: its tee lap onto skipped wall ${w.tee.wall} was dropped, so it is framed as a free-standing wall end; check that joint.`); delete w.tee; }
      if (!plan.walls.length) return { code: 1, out: `Every wall was refused:\n${skipped.map((n) => `  - ${n}`).join("\n")}` };
    }
    if (skipped.length) dxfNotes += `SKIPPED ${skipped.length} WALL${skipped.length === 1 ? "" : "S"} THE PLAN CHECKS REFUSE (not in the takeoff below; fix them and re-run):\n${skipped.map((n) => `  - ${n}`).join("\n")}\n\n`;
    if (unlapped.length) dxfNotes += `${unlapped.map((n) => `Note: ${n}`).join("\n")}\n\n`;
  }
  // --fixed-plan prints the plan as the takeoff would frame it (after the board, door, header and skip-refused steps above) and stops: the input for `node allowance-bench.mjs FILE...`.
  if (flags.has("--fixed-plan")) return { code: 0, out: JSON.stringify(plan, null, 2) };
  let gangNotes = [];
  if (flags.has("--gang")) {
    const g = gangOpenings(plan);
    plan = g.plan;
    gangNotes = g.notes;
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
    // `headerCheck.stairFrom: N` links the stairwell header to plan.stairs[N]'s stringerCheck (typed figures only) instead of copying totalReaction by hand
    { const e = linkStairReaction(plan, parseLength); if (e) return { code: 1, out: `The floor has problems:\n  - ${e}` }; }
    floor = layoutFloor(plan.floor, plan);
    if (!floor.ok) return { code: 1, out: `The floor has problems:\n${floor.errors.map((e) => `  - ${e}`).join("\n")}` };
  }
  let deck = null;
  if (flags.has("--deck") || plan.deck) {
    if (!plan.deck) return { code: 2, out: "The plan has no `deck` object (width, depth, height; joist, spacing, beam, postSize optional)." };
    for (const k of ["width", "depth", "height", "overhang"]) if (typeof plan.deck[k] === "string") plan.deck[k] = parseLength(plan.deck[k]);
    deck = layoutDeck(plan.deck);
    if (!deck.ok) return { code: 1, out: `The deck has problems:\n${deck.errors.map((e) => `  - ${e}`).join("\n")}` };
  }
  /** @type {any[]} */
  const stairs = [];
  // a deck's own stair takes its total rise from the deck surface height above grade
  const deckStair = deck && plan.deck.stairs ? [{ id: "Deck stair", tread: 10, stringer: "2x12", width: 36, ...plan.deck.stairs, totalRise: plan.deck.height }] : [];
  if (flags.has("--stairs") || plan.stairs || deckStair.length) {
    if (!plan.stairs && !deckStair.length) return { code: 2, out: "The plan has no `stairs` object (totalRise, tread, stringer, width)." };
    const stairList = [...(plan.stairs ? (Array.isArray(plan.stairs) ? plan.stairs : [plan.stairs]) : []), ...deckStair];
    const badStair = stairList.findIndex((st) => st == null || typeof st !== "object" || Array.isArray(st));
    if (badStair >= 0) return { code: 1, out: `The stairs have problems:\n  - Stair ${badStair + 1} must be an object (totalRise, tread, stringer, width).` };
    for (const [i, st] of stairList.entries()) {
      for (const k of ["totalRise", "tread", "width", "openingLength", "floorThickness"]) if (typeof st[k] === "string") st[k] = parseLength(st[k]);
      if (typeof st.landing === "object" && st.landing) for (const k of ["depth", "landingRise"]) if (typeof st.landing[k] === "string") st.landing[k] = parseLength(st.landing[k]);
      const withLanding = st.landing || st.totalRise > (st.limits?.maxRise ?? STAIR_LIMITS.maxRise);
      const l = withLanding ? layoutStairWithLanding({ id: `Stair ${i + 1}`, ...st }, plan) : layoutStair({ id: `Stair ${i + 1}`, ...st }, plan);
      if (!l.ok) return { code: 1, out: `The stairs have problems:\n${l.errors.map((e) => `  - ${e}`).join("\n")}` };
      if (st.winders) { l.winders = layoutWinders(typeof st.winders === "object" ? { width: st.width, ...(typeof st.tread === "number" ? { straightTread: st.tread } : {}), ...(typeof st.treadThickness === "number" ? { treadThickness: st.treadThickness } : {}), ...st.winders } : { width: st.width }); if (!l.winders.ok && !l.winders.problems) return { code: 1, out: `The winders have problems:\n${winderText(l.winders).join("\n")}` }; }
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
  if (deck && r.ok) r.deck = deck;
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
  let wired = null;
  if (r.ok && (flags.has("--electrical") || plan.electrical)) {
    const el = layoutElectrical(plan.electrical || {}, plan, Object.fromEntries((r.walls || []).map((/** @type {any} */ w) => [w.id, w])));
    if (!el.ok) return { code: 1, out: `The electrical settings have problems:\n${el.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.electrical = wired = el;
  }
  if (r.ok && (flags.has("--hvac") || plan.hvac)) {
    const hv = layoutHvac(plan.hvac || {});
    if (!hv.ok) return { code: 1, out: `The HVAC settings have problems:\n${hv.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.hvac = hv;
  }
  if (r.ok && (flags.has("--plumbing") || plan.plumbing)) {
    const pl = layoutPlumbing(plan.plumbing || {});
    if (!pl.ok) return { code: 1, out: `The plumbing settings have problems:\n${pl.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.plumbing = pl;
  }
  let drilled = null;
  if (r.ok && (flags.has("--drilling") || plan.drilling)) {
    const dr = layoutDrilling(plan.drilling || {}, plan);
    if (!dr.ok) return { code: 1, out: `The drilling runs have problems:\n${dr.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.drilling = drilled = dr;
  }
  let trimmed = null;
  if (r.ok && (flags.has("--trim") || plan.trim)) {
    const trim = layoutTrim(plan.trim || {}, plan);
    if (!trim.ok) return { code: 1, out: `The trim has problems:\n${trim.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.trim = trimmed = trim;
  }
  if (r.ok && (flags.has("--fireblock") || plan.fireblock)) {
    const fb = layoutFireblock(plan.fireblock || {}, r);
    if (!fb.ok) return { code: 1, out: `The fireblocking has problems:\n${fb.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.fireblock = fb;
  }
  if (r.ok && (flags.has("--paint") || plan.paint)) {
    // with --trim also on, the baseboard, casing and shoe feet become the paint's trim feet unless the plan types its own
    const fromTrim = trimmed && (plan.paint || {}).trimFeet == null ? trimmed.baseFeet + trimmed.casingFeet + trimmed.shoeFeet : null;
    const pt = layoutPaint(fromTrim != null ? { ...(plan.paint || {}), trimFeet: fromTrim } : (plan.paint || {}), plan);
    if (pt.ok && fromTrim != null) pt.trimFeetFromTrim = true;
    if (!pt.ok) return { code: 1, out: `The paint has problems:\n${pt.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.paint = pt;
  }
  if (r.ok && (flags.has("--flooring") || plan.flooring)) {
    const fl = layoutFlooring(plan.flooring || {});
    if (!fl.ok) return { code: 1, out: `The flooring has problems:\n${fl.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.flooring = fl;
  }
  if (r.ok && (flags.has("--wall-tile") || plan.wallTile)) {
    const wt = layoutWallTile(plan.wallTile || {});
    if (!wt.ok) return { code: 1, out: `The wall tile has problems:\n${wt.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.wallTile = wt;
  }
  if (r.ok && (flags.has("--openings") || plan.openingSchedule)) {
    const os = layoutOpeningSchedule(plan.openingSchedule || {}, plan);
    if (!os.ok) return { code: 1, out: `The opening schedule has problems:\n${os.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.openingSchedule = os;
  }
  let sided = null;
  if (r.ok && (flags.has("--siding") || plan.siding)) {
    const siding = layoutSiding(plan.siding || {}, plan);
    if (!siding.ok) return { code: 1, out: `The siding has problems:\n${siding.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.siding = sided = siding;
  }
  if (r.ok && (flags.has("--stucco") || plan.stucco)) {
    const stucco = layoutStucco(plan.stucco || {}, plan);
    if (!stucco.ok) return { code: 1, out: `The stucco has problems:\n${stucco.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.stucco = stucco;
  }
  if (r.ok && (flags.has("--paver") || plan.paver)) {
    if (!plan.paver) return { code: 2, out: "The plan has no `paver` object (areas: [{width, length}] in feet; paver settings optional)." };
    const paver = layoutPaver(plan.paver);
    if (!paver.ok) return { code: 1, out: `The pavers have problems:\n${paver.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.paver = paver;
  }
  let eaved = null;
  if (r.ok && (flags.has("--eaves") || plan.eaves)) {
    const eaves = layoutEaves(plan.eaves || {}, roof, plan.ventilation || flags.has("--ventilation") ? layoutVentilation(plan.ventilation || {}, roof) : undefined);
    if (!eaves.ok) return { code: 1, out: `The eaves have problems:\n${eaves.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.eaves = eaved = eaves;
  }
  let vented = null;
  if (r.ok && (flags.has("--ventilation") || plan.ventilation)) {
    const vent = layoutVentilation(plan.ventilation || {}, roof);
    if (!vent.ok) return { code: 1, out: `The attic ventilation has problems:\n${vent.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.ventilation = vented = vent;
  }
  let guttered = null;
  if (r.ok && (flags.has("--gutters") || plan.gutters)) {
    const gutters = layoutGutters(plan.gutters || {}, roof);
    if (!gutters.ok) return { code: 1, out: `The gutters have problems:\n${gutters.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.gutters = guttered = gutters;
  }
  let dormered = null;
  if (r.ok && (flags.has("--dormer") || plan.dormer)) {
    const dArgs = { mainPitch: plan.roof?.pitch, ...(plan.dormer || {}) };
    const dm = dArgs.shape === "shed" ? layoutShedDormer(dArgs) : layoutDormer(dArgs);
    if (!dm.ok) return { code: 1, out: `The dormer has problems:\n${dm.errors.map((e) => `  - ${e}`).join("\n")}` };
    r.dormer = dormered = dm;
  }
  if (!r.ok) return { code: 1, out: `The plan has problems:\n${r.errors.map((e) => `  - ${e}`).join("\n")}` };
  if (flags.has("--sheathing") || flags.has("--horizontal") || flags.has("--overhang") || rimLap > 0 || plan.sheathing) {
    const sheathing = sheathe({ ...plan, sheathing: { ...defaultSheathing(), ...(plan.sheathing || {}), ...(flags.has("--horizontal") ? { orientation: "horizontal" } : {}), ...(flags.has("--overhang") ? { overhang: true } : {}), ...(rimLap > 0 ? { rimLap } : {}) } }, r);
    const extra = nailerCuts(sheathing);
    // nailers join the cut list and the lumber order: rebuild the takeoff, then carry over every module already attached (a hand-kept list had dropped flooring and paint)
    if (extra.length) { const prev = r; r = takeoff(plan, [...extra, ...shell()]); for (const k of Object.keys(prev)) if (!(k in r)) /** @type {any} */ (r)[k] = /** @type {any} */ (prev)[k]; }
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
  if (flags.has("--risk")) { const rr = scheduleRisk(resolveRates(plan.schedule, r)); return { code: rr.ok ? 0 : 1, out: flags.has("--json") ? JSON.stringify(rr, null, 2) : riskText(rr).join("\n") }; }
  if (flags.has("--orders") || argv.some((a) => a.startsWith("--orders="))) {
    const today = argv.find((a) => a.startsWith("--orders="))?.slice(9);
    const pr = procurement(schedule(resolveRates(plan.schedule, r)), plan.schedule?.orders, today || undefined);
    if (!pr.ok) return { code: 1, out: procurementText(pr).join("\n") };
    return { code: 0, out: flags.has("--json") ? JSON.stringify(pr, null, 2) : flags.has("--csv") ? procurementCsv(pr).trimEnd() : procurementText(pr).join("\n") };
  }
  if (flags.has("--schedule") && flags.has("--csv")) return { code: 0, out: scheduleCsv(schedule(resolveRates(plan.schedule, r))).trimEnd() };
  if (flags.has("--schedule") && flags.has("--json")) return { code: 0, out: JSON.stringify(schedule(resolveRates(plan.schedule, r)), null, 2) };
  if (flags.has("--level-bids")) {
    if (!Array.isArray(plan.bids) || !plan.bids.length) return { code: 1, out: 'plan has no "bids" list (each: { bidder, lines: [{ item, qty, unitPrice | amount }] })' };
    const lv = levelBids(budget(r, plan.prices || {}, plan.allowances || {}), plan.bids);
    return { code: lv.errors.length ? 1 : 0, out: flags.has("--json") ? JSON.stringify(lv, null, 2) : levelText(lv).join("\n") };
  }
  const cmp = argv.find((a) => a.startsWith("--compare="))?.slice(10);
  if (cmp) {
    // Each plan is priced with its own "prices"; copy the prices block into both to isolate a design change.
    const rest = argv.filter((a) => !a.startsWith("--compare=") && a !== args[0] && a !== "--json" && a !== "--csv" && a !== "--budget");
    const other = main([cmp, ...rest, "--budget", "--json"], readInput);
    if (other.code !== 0) return { code: 1, out: `The revised plan has problems:\n${other.out}` };
    const b2 = JSON.parse(other.out);
    const d = budgetDiff(budget(r, plan.prices || {}, plan.allowances || {}), b2);
    return { code: 0, out: flags.has("--json") ? JSON.stringify(d, null, 2) : ["CHANGE ORDER (revised minus original)", ...diffText(d)].join("\n") };
  }
  if (flags.has("--sensitivity")) {
    const sp = argv.find((a) => a.startsWith("--swing="))?.slice(8);
    const pct = sp == null ? 10 : Number(sp);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) return { code: 1, out: "--swing= is a percent from 1 to 100." };
    const sv = sensitivity(budget(r, plan.prices || {}, plan.allowances || {}), pct);
    return { code: 0, out: flags.has("--json") ? JSON.stringify(sv, null, 2) : ["PRICE SENSITIVITY", ...sensitivityText(sv)].join("\n") };
  }
  if (flags.has("--proposal")) {
    const q = proposal(budget(r, plan.prices || {}, plan.allowances || {}), plan.proposal || {});
    return { code: q.ok ? 0 : 1, out: flags.has("--json") ? JSON.stringify(q, null, 2) : proposalText(q).join("\n") };
  }
  if (flags.has("--budget") && flags.has("--csv")) return { code: 0, out: budgetCsv(budget(r, plan.prices || {}, plan.allowances || {})).trimEnd() };
  if (flags.has("--budget") && flags.has("--json")) return { code: 0, out: JSON.stringify(budget(r, plan.prices || {}, plan.allowances || {}), null, 2) };
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
  if (r.culls && r.culls.length) {
    lines.push("", "CULL ALLOWANCE (spare boards, typed rate)");
    for (const l of r.culls) lines.push(`  ${String(l.qty).padStart(4)}  ${l.size.padEnd(7)} ${formatLength(l.length).padEnd(10)} ${(100 * l.pct).toFixed(1)}%  ${l.cost.toFixed(2)}`);
    lines.push(`  ${r.summary.cullBoards} boards, ${r.summary.cullCost.toFixed(2)}; order with culls ${r.summary.costWithCulls.toFixed(2)}`);
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
  if (r.deck) lines.push("", "DECK", ...deckText(r.deck));
  if (r.stairs) lines.push("", "STAIRS", ...r.stairs.flatMap((x) => [...(x.flights ? landingText(x) : stairText(x)), ...(x.winders ? winderText(x.winders) : [])]));
  if (r.foundation) lines.push("", "FOUNDATION", ...foundationText(r.foundation));
  if (r.drywall) lines.push("", "DRYWALL", ...drywallText(r.drywall));
  if (r.fasteners) lines.push("", "FASTENERS", ...fastenerText(r.fasteners));
  if (r.insulation) lines.push("", "INSULATION", ...insulationText(r.insulation));
  if (r.trim) lines.push("", "TRIM", ...trimText(r.trim));
  if (r.fireblock) lines.push("", "FIREBLOCKING", ...fireblockText(r.fireblock));
  if (r.paint) lines.push("", "PAINT", ...paintText(r.paint));
  if (r.flooring) lines.push("", "FLOORING", ...flooringText(r.flooring));
  if (r.wallTile) lines.push("", "WALL TILE", ...wallTileText(r.wallTile));
  if (r.electrical) lines.push("", "ELECTRICAL ROUGH-IN", ...electricalText(r.electrical));
  if (r.hvac) lines.push("", "HVAC DUCT ROUGH-IN", ...hvacText(r.hvac));
  if (r.plumbing) lines.push("", "PLUMBING ROUGH-IN", ...plumbingText(r.plumbing));
  if (r.drilling) lines.push("", "STUD DRILLING AND NOTCHING", ...drillingText(r.drilling));
  if (r.openingSchedule) lines.push("", "DOOR AND WINDOW SCHEDULE", ...openingScheduleText(r.openingSchedule));
  if (r.siding) lines.push("", "SIDING", ...sidingText(r.siding));
  if (r.stucco) lines.push("", "STUCCO", ...stuccoText(r.stucco));
  if (r.paver) lines.push("", "PAVERS", ...paverText(r.paver));
  if (r.eaves) lines.push("", "SOFFIT AND FASCIA", ...eavesText(r.eaves));
  if (r.ventilation) lines.push("", "ATTIC VENTILATION", ...ventilationText(r.ventilation));
  if (r.gutters) lines.push("", "GUTTERS AND DOWNSPOUTS", ...guttersText(r.gutters));
  if (r.dormer) lines.push("", "DORMER", ...dormerText(r.dormer));
  if (r.roof) lines.push("", "ROOF", ...roofText(r.roof));
  if (flags.has("--budget")) lines.push("", "BUDGET", ...budgetText(budget(r, plan.prices || {}, plan.allowances || {})));
  if (flags.has("--schedule")) lines.push("", "SCHEDULE", ...scheduleText(schedule(resolveRates(plan.schedule, r))));
  if (gangNotes.length) lines.push("", "GANGED OPENINGS", ...gangNotes.map((n) => `  - ${n}`));
  if (headers && (flags.has("--headers") || headers.notes.length)) lines.push("", "HEADERS", ...headerText(headers));
  if (r.notes.length) lines.push("", "NOTES", ...r.notes.map((n) => `  - ${n}`));
  lines.push("", "Header sizes and jack counts are your inputs and are not checked against a span table or code.");
  return { code: 0, out: dxfNotes + lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, out, bytes } = main(process.argv.slice(2));
  if (bytes) process.stdout.write(bytes);
  else if (code && process.argv.includes("--json") && !/^\s*[\[{]/.test(out)) {
    // A script asking for JSON gets JSON on stdout for a refusal too, with the same exit code (text still goes to stderr).
    process.stdout.write(JSON.stringify({ ok: false, code, errors: out.split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean) }, null, 2) + "\n");
    process.stderr.write(out + "\n");
  } else (code ? process.stderr : process.stdout).write(out + "\n");
  process.exitCode = code;
}
