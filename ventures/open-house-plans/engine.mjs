// Open House Plans: from a brief to a complete, downloadable plan set.
//
//   design(brief)       -> the best design's summary (rooms, cost, checks, scores) and the runners-up
//   designFiles(brief)  -> every file of the plan set, as { name: text }
//   parseBrief(text)    -> a brief from plain English
//
// A brief is JSON (brief.mjs, DEFAULTS); everything is optional. The same
// brief always gives the same design. Nothing leaves the machine it runs on.
// @ts-check

import { normalizeBrief, parseBrief as parseText, DEFAULTS as BRIEF_DEFAULTS } from "./brief.mjs";
import { STYLES, STYLE_NAMES } from "./styles.mjs";
import { searchDesigns, facadeScore, lightScore } from "./search.mjs";
import { netBox, NAMES } from "./layout.mjs";
import { planDrivers, estimate, STAGE_LABELS, ANCHOR, STAGE_SHARES } from "./cost.mjs";
import { takeoff, openingSchedule } from "./takeoff.mjs";
import { runChecks } from "./checks.mjs";
import { buildModel, toOBJ } from "./model3d.mjs";
import { axonPrimitives, elevationPrimitives } from "./views.mjs";
import { planPrimitives } from "./plan-draw.mjs";
import { svgDoc, svgGroup, boundsOf, dxfDoc } from "./draw.mjs";
import { toIFC } from "./ifc.mjs";
import { area as polyArea, ftIn } from "./geom.mjs";
import { frameHouse, orderCsv, cutListCsv, framingSheetSvg } from "./framing.mjs";

export const DEFAULTS = { ...BRIEF_DEFAULTS, text: "" };
export const VERSION = "1.0.0";
export const LICENSE_NAME = "CC0 1.0 Universal (public domain dedication)";
export const STYLES_AVAILABLE = STYLE_NAMES;

export function parseBrief(text) {
  return parseText(text);
}

function resolve(input) {
  let raw = input || {};
  let matched = [];
  if (typeof raw === "string") ({ brief: raw, matched } = parseText(raw));
  else if (raw.text) {
    // the text sets the brief; other fields override it only where they differ
    // from the defaults (an agent's call merges DEFAULTS into its input)
    const { text, ...rest } = raw;
    const parsed = parseText(text);
    const changed = Object.fromEntries(Object.entries(rest).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(BRIEF_DEFAULTS[k])));
    raw = { ...parsed.brief, ...changed };
    matched = parsed.matched;
  }
  const { brief, notes } = normalizeBrief(raw);
  return { brief, notes: [...matched.map((m) => `read "${m}"`), ...notes] };
}

const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
const r1 = (v) => Math.round(v * 10) / 10;

function slugOf(brief, plan) {
  const b = brief.beds === 0 ? "studio" : `${brief.beds}bed`;
  return `${brief.style}-${b}-${String(brief.baths).replace(".", "p")}bath-${plan.W}x${plan.D}${brief.garage ? `-${brief.garage}car` : ""}`;
}

function titleOf(brief, plan, conditioned) {
  const style = STYLES[brief.style].label;
  const beds = brief.beds === 0 ? "Studio" : `${brief.beds} bed`;
  return `${style}, ${beds} / ${brief.baths} bath, ${Math.round(conditioned).toLocaleString("en-US")} sq ft`;
}

/** Everything about one finished plan, without the drawings. */
function analyse(plan, brief, searchInfo) {
  const style = STYLES[brief.style];
  const model = buildModel(plan, brief, style);
  const h = model.h;
  const tk = takeoff(plan, brief, style, h);
  const drivers = planDrivers(plan, brief, style);
  const cost = estimate(drivers, brief, plan.porch ? plan.porch.w * plan.porch.d : 0);
  const checks = runChecks(plan, brief, style, { takeoff: tk });
  const conditioned = (plan.W - (plan.p.Wg || 0)) * plan.D;
  const fac = facadeScore(plan);
  const rooms = plan.rooms.map((r) => {
    const nb = netBox(plan, r);
    return { name: r.name, kind: r.kind, area: r1(polyArea(r.poly)), clear: `${ftIn(nb.w)} x ${ftIn(nb.d)}`, w: r1(nb.w), d: r1(nb.d) };
  });
  const summary = {
    id: slugOf(brief, plan),
    title: titleOf(brief, plan, conditioned),
    style: { key: brief.style, label: style.label, roof: style.roof, pitch: `${style.pitch}:12`, cladding: style.cladding },
    footprint: { width: plan.W, depth: plan.D, conditioned, garage: (plan.p.Wg || 0) * plan.D, porch: plan.porch ? plan.porch.w * plan.porch.d : 0, arrangement: plan.p.arrangement },
    heights: { floor: r1(h.base), ceiling: plan.ceiling, plate: r1(h.plate), ridge: r1(h.ridge) },
    rooms,
    cost: {
      total: Math.round(cost.total), perSqFt: Math.round(cost.perSqFt), priceExLot: Math.round(cost.priceExLot),
      stages: Object.fromEntries(Object.entries(cost.stages).map(([k, v]) => [k, Math.round(v)])),
      basis: `${ANCHOR.source}, ${ANCHOR.year} dollars: ${money(ANCHOR.construction)} for ${ANCHOR.area.toLocaleString("en-US")} sq ft, scaled by this design's geometry with assumed drivers (cost.mjs). Not a quote.`,
    },
    framing: { scheme: tk.scheme.label, ...tk.totals },
    structure: tk.struct,
    checks: { passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass && c.severity === "rule").map((c) => c.label), list: checks },
    scores: { total: r1(searchInfo.score.total * 100) / 100, parts: Object.fromEntries(Object.entries(searchInfo.score.parts).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), facade: { symmetry: r1(fac.symmetry * 100) / 100, rhythm: r1(fac.rhythm * 100) / 100, frontGlazing: r1(fac.glazing * 1000) / 1000 }, daylight: Math.round(lightScore(plan) * 100) / 100 },
  };
  return { summary, model, tk, cost, checks };
}

function explainFailure(brief) {
  const garageW = brief.garage === 2 ? 22 : brief.garage === 1 ? 12 : 0;
  const minW = Math.ceil(brief.area / 36) + garageW;
  const lot = brief.maxWidth ? ` The lot leaves ${brief.maxWidth} ft of width; this single-storey plan needs about ${minW} ft (at most 36 ft deep${garageW ? `, plus ${garageW} ft for the garage` : ""}).` : "";
  return `No layout satisfies this brief.${lot} Try a smaller area, fewer rooms${garageW ? ", no garage" : ""}, or a wider lot.`;
}

/** The design for a brief: its summary and the runners-up. */
export function design(input = {}) {
  const { brief, notes } = resolve(input);
  const res = searchDesigns(brief, { keep: Math.max(6, brief.variant + 1) });
  if (!res.designs.length) return { brief, notes, error: explainFailure(brief) };
  const pick = res.designs[Math.min(brief.variant, res.designs.length - 1)];
  const { summary } = analyse(pick.plan, brief, pick);
  return {
    brief, notes, design: summary,
    alternatives: res.designs.map((d, i) => ({ variant: i, width: d.plan.W, depth: d.plan.D, arrangement: d.plan.p.arrangement, cost: Math.round(d.score.cost.total), score: Math.round(d.score.total * 100) / 100 })),
    search: { candidates: res.evaluated, feasible: res.feasible },
    license: LICENSE_NAME,
  };
}

// --- drawings and files -----------------------------------------------------

export function panelScale(prims, w, h, pad = 10) {
  const b = boundsOf(prims);
  return Math.min((w - 2 * pad) / (b.x1 - b.x0), (h - 2 * pad) / (b.y1 - b.y0));
}

function fitPanel(prims, x, y, w, h, { pad = 10, maxScale = 30, scale: fixed = null } = {}) {
  const b = boundsOf(prims);
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const scale = fixed ?? Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, maxScale);
  const ox = b.x0 - (w / scale - bw) / 2, oy = b.y1 + (h / scale - bh) / 2;
  return `<g transform="translate(${x} ${y})">${svgGroup(prims, { scale, ox, oy })}</g>`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A one-page presentation sheet: view, plan, two elevations and a title block. */
export function sheetSVG(plan, brief, analysis, prims) {
  const W = 1700, H = 1100;
  const s = analysis.summary;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`, `<title>${esc(s.title)}</title>`, `<rect width="100%" height="100%" fill="#fbfaf7"/>`];
  out.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#222" stroke-width="2"/>`);
  out.push(fitPanel(prims.axon, 30, 30, 800, 520));
  out.push(fitPanel(prims.plan, 840, 30, 830, 640));
  // both elevations at one scale
  const es = Math.min(panelScale(prims.front, 800, 300), panelScale(prims.side, 560, 210));
  out.push(fitPanel(prims.front, 30, 560, 800, 300, { scale: es }));
  out.push(fitPanel(prims.side, 30, 860, 560, 210, { scale: es }));
  // title block
  const tx = 840, ty = 690, tw = 830, th = 380;
  out.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#ffffff" stroke="#222" stroke-width="1.5"/>`);
  const t = (x, y, text, size = 14, weight = "normal", fill = "#222") => out.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(text)}</text>`);
  t(tx + 20, ty + 40, s.title, 24, "bold");
  t(tx + 20, ty + 68, `${s.footprint.width}' x ${s.footprint.depth}' footprint${s.footprint.garage ? `, ${brief.garage}-car garage` : ""}${s.footprint.porch ? ", covered porch" : ""} · ${s.style.roof} roof ${s.style.pitch} · ${s.heights.ceiling} ft ceilings`, 14, "normal", "#444");
  const col = (x, y, rows) => rows.forEach(([k, v], i) => { t(x, y + i * 22, k, 13, "normal", "#666"); t(x + 170, y + i * 22, v, 13, "bold"); });
  col(tx + 20, ty + 105, [
    ["Construction cost*", `${money(s.cost.total)} (${money(s.cost.perSqFt)}/sq ft)`],
    ["Framing", s.framing.scheme],
    ["Wall lumber", `${s.framing.wallLumberBf.toLocaleString("en-US")} bf (${s.framing.wallLumberBfPerSqFt} bf/sq ft)`],
    ["Foundation", brief.foundation === "crawl" ? "crawlspace, framed floor" : "slab on grade"],
    ["Checks", `${s.checks.passed} passed${s.checks.failed.length ? `, ${s.checks.failed.length} failed` : ", none failed"}`],
    ["Licence", "CC0 1.0: free to use, change and build"],
  ]);
  t(tx + 20, ty + 255, "* Anchored on NAHB's 2024 cost survey ($162/sq ft average), scaled by geometry. Not a quote.", 11, "normal", "#666");
  out.push(`<rect x="${tx + 20}" y="${ty + 275}" width="${tw - 40}" height="80" fill="#fff4e5" stroke="#c77700"/>`);
  t(tx + 35, ty + 300, "NOT FOR CONSTRUCTION. Generated by software, not reviewed by a licensed architect or engineer,", 12, "bold", "#7a4700");
  t(tx + 35, ty + 320, "and not checked against any building code. Before anyone builds it: a licensed review, the local code,", 12, "normal", "#7a4700");
  t(tx + 35, ty + 340, "site, soils and energy design, and a permit. Open House Plans · github.com/Duncan-Haywood/oss-monorepo", 12, "normal", "#7a4700");
  t(600, 1050, "FRONT AND LEFT ELEVATIONS", 11, "normal", "#888");
  t(600, 1066, s.id, 10, "normal", "#aaa");
  out.push("</svg>\n");
  return out.join("\n");
}

function elevationsSheet(prims) {
  const W = 1600, H = 1000;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`, `<rect width="100%" height="100%" fill="#ffffff"/>`];
  const cells = [["front", "FRONT ELEVATION"], ["back", "REAR ELEVATION"], ["left", "LEFT ELEVATION"], ["right", "RIGHT ELEVATION"]];
  const sc = Math.min(...cells.map(([k]) => panelScale(prims[k], 800, 460, 20)));
  cells.forEach(([k, label], i) => {
    const x = (i % 2) * 800, y = Math.floor(i / 2) * 500;
    out.push(fitPanel(prims[k], x, y, 800, 460, { pad: 20, scale: sc }));
    out.push(`<text x="${x + 400}" y="${y + 485}" font-size="16" text-anchor="middle" letter-spacing="2" fill="#333">${label}</text>`);
  });
  out.push("</svg>\n");
  return out.join("\n");
}

function csv(rows, cols) {
  const q = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => q(c[0])).join(","), ...rows.map((r) => cols.map((c) => q(r[c[1]])).join(","))].join("\n") + "\n";
}

export const CC0 = `This plan set was generated by Open House Plans and is dedicated to the public
domain under CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/

To the extent possible under law, the authors have waived all copyright and
related or neighbouring rights to these drawings, models and schedules. You can
copy, modify, distribute and build from them, even commercially, without asking
permission and without credit (credit is welcome).

CC0 covers rights in these files only. It is not a warranty and does not make
the design safe, buildable, or compliant with any code. THE FILES ARE PROVIDED
AS IS, WITHOUT WARRANTY OF ANY KIND. They have not been reviewed by a licensed
architect or engineer. A real house needs a licensed review or the local code's
prescriptive path, site and soils work, and a permit before anyone builds it.

The software that generated them is MIT-licensed:
https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-house-plans
`;

function readme(s, brief, notes, files) {
  const L = [];
  L.push(`# ${s.title}`, "");
  L.push(`A free, public-domain (CC0) house plan generated from a brief by [Open House Plans](https://duncan-haywood.github.io/monorepo-projects/open-house-plans/). Design id \`${s.id}\`.`, "");
  L.push("> **Not for construction.** Generated by software. Not reviewed by a licensed architect or engineer and not checked against any building code. Before anyone builds it you need a licensed review (or the local code's prescriptive path), site, soils and energy design, and a permit.", "");
  L.push("## At a glance", "");
  L.push(`| | |`, `|---|---|`);
  L.push(`| Style | ${s.style.label} (${s.style.roof} roof, ${s.style.pitch}, ${s.style.cladding} cladding) |`);
  L.push(`| Footprint | ${s.footprint.width} ft x ${s.footprint.depth} ft${s.footprint.garage ? ` incl. ${brief.garage}-car garage` : ""}${s.footprint.porch ? ` + ${s.footprint.porch} sq ft porch` : ""} |`);
  L.push(`| Conditioned area | ${s.footprint.conditioned.toLocaleString("en-US")} sq ft (gross, to the outside of the walls) |`);
  L.push(`| Bedrooms / baths | ${brief.beds} / ${brief.baths} |`);
  L.push(`| Heights | floor ${ftIn(s.heights.floor)} above grade, ${s.heights.ceiling} ft ceilings, top of roof ${ftIn(s.heights.ridge)} |`);
  L.push(`| Framing | ${s.framing.scheme}; ${s.framing.wallLumberBf.toLocaleString("en-US")} bf of wall lumber |`);
  L.push(`| Construction cost | **${money(s.cost.total)}** (${money(s.cost.perSqFt)}/sq ft), ${brief.region === 1 ? "US average" : `region factor ${brief.region}`}, ${ANCHOR.year} dollars* |`);
  L.push(`| Checks | ${s.checks.passed} passed, ${s.checks.failed.length} failed |`, "");
  if (s.studFraming) {
    const f = s.studFraming;
    L.push("## Wall framing, stud by stud", "");
    L.push(`Every wall is laid out member by member (\`framing.svg\`): ${f.walls} walls, ${f.wallFeet} ft, ${f.pieces} pieces cut from ${f.boards} boards (${f.boardFeet.toLocaleString("en-US")} board feet, ${f.waste}% offcut, within ${f.gapToBound}% of the cutting-stock lower bound for this cut list). Studs are ${f.studLength} precuts. \`framing-cuts.csv\` lists every cut and the board it comes from; \`lumber-order.csv\` is the order. The board order counts wall framing only (no floor, roof, sheathing or blocking), and comes from the Wall Framing Takeoff engine.${f.engineeredHeaders ? ` ${f.engineeredHeaders} header${f.engineeredHeaders > 1 ? "s are" : " is an"} engineered beam${f.engineeredHeaders > 1 ? "s" : ""} (LVL), drawn at 2x12 depth and listed for the supplier to size.` : ""}`, "");
    if (f.notes.length) { L.push("Framing notes:", ""); for (const n of f.notes) L.push(`- ${n}`); L.push(""); }
  }
  L.push(`\\* ${s.cost.basis}`, "");
  L.push("## Rooms", "", "| Room | Clear size | Area (sq ft, to wall centres) |", "|---|---|---|");
  for (const r of s.rooms) if (r.kind !== "closet") L.push(`| ${r.name} | ${r.clear} | ${r.area} |`);
  L.push("", "## Cost by stage", "", "| Stage | Cost | Share |", "|---|---|---|");
  for (const [k, v] of Object.entries(s.cost.stages)) L.push(`| ${STAGE_LABELS[k] || "Porch"} | ${money(v)} | ${((100 * v) / s.cost.total).toFixed(1)}% |`);
  L.push("", `Builder's sale price excluding land, at NAHB's 2024 price shares: about ${money(s.cost.priceExLot)}.`, "");
  L.push("## Checks", "", "| | Check | Basis |", "|---|---|---|");
  for (const c of s.checks.list) L.push(`| ${c.pass ? "pass" : c.severity === "advice" ? "note" : "**FAIL**"} | ${c.label} | ${c.basis} |`);
  L.push("", "## Files", "");
  const what = {
    "sheet.svg": "presentation sheet: view, plan, elevations, title block",
    "plan.svg": "dimensioned floor plan", "plan.dxf": "floor plan for CAD (AutoCAD R12 DXF, inches, layered)",
    "elevations.svg": "front, rear and side elevations", "view.svg": "3D view from the front left",
    "model.ifc": "BIM model (IFC4): walls, slab, roof, windows, doors, openings and named spaces; metres",
    "model.obj": "3D model (Wavefront OBJ, metres, y up) for Blender, SketchUp and others", "model.mtl": "materials for model.obj",
    "bom.csv": "bill of materials: framing, sheathing, roofing, foundation, insulation, drywall, fixtures",
    "openings.csv": "window and door schedule", "cost.csv": "cost by stage", "rooms.csv": "room schedule",
    "design.json": "the brief and the full design as data; feed the brief back to regenerate it",
    "framing.svg": "every wall's framing elevation: studs, kings, jacks, headers, sills, cripples and plates at their real lengths, marked",
    "framing-cuts.csv": "wall framing cut list, and which board each piece is cut from",
    "lumber-order.csv": "wall framing board order: how many of each size and length to buy",
    "LICENSE.txt": "CC0 1.0 dedication and disclaimer", "README.md": "this file",
  };
  for (const f of files) L.push(`- \`${f}\`: ${what[f] || ""}`);
  L.push("", "## Brief", "", "```json", JSON.stringify(brief, null, 2), "```", "");
  if (notes.length) { L.push("Notes from reading the brief:", ""); for (const n of notes) L.push(`- ${n}`); L.push(""); }
  L.push("## What this design does not include", "");
  L.push("Site plan, grading and drainage; foundation design for your soil and frost depth; braced-wall (lateral) design; truss design (by the truss maker); plumbing, electrical and HVAC drawings; energy-code compliance; fire separation details beyond the garage note; stairs (single storey only). Room sizes are to wall centres; clear sizes deduct the walls.", "");
  L.push("## Licence", "", "CC0 1.0 Universal (public domain). Use, change and build from it freely; no warranty. See `LICENSE.txt`.", "");
  return L.join("\n");
}

/** All files of the plan set for a brief: { brief, notes, design, files: { name: text } }. */
export function designFiles(input = {}, { timestamp = Date.UTC(2026, 0, 1) } = {}) {
  const { brief, notes } = resolve(input);
  const style = STYLES[brief.style];
  const res = searchDesigns(brief, { keep: Math.max(6, brief.variant + 1) });
  if (!res.designs.length) return { brief, notes, error: explainFailure(brief), files: {} };
  const pick = res.designs[Math.min(brief.variant, res.designs.length - 1)];
  const plan = pick.plan;
  const a = analyse(plan, brief, pick);
  const s = a.summary;
  const planP = planPrimitives(plan, brief, style);
  const prims = {
    plan: planP,
    axon: axonPrimitives(a.model, style, plan),
    front: elevationPrimitives(a.model, style, plan, "front"),
    back: elevationPrimitives(a.model, style, plan, "back"),
    left: elevationPrimitives(a.model, style, plan, "left"),
    right: elevationPrimitives(a.model, style, plan, "right"),
  };
  prims.side = prims.left;
  const files = {};
  files["sheet.svg"] = sheetSVG(plan, brief, a, prims);
  files["plan.svg"] = svgDoc(planP, { scale: 14, title: `${s.title}: floor plan` });
  files["elevations.svg"] = elevationsSheet(prims);
  files["view.svg"] = svgDoc(prims.axon, { scale: 12, margin: 1, title: `${s.title}: view`, background: "#ffffff" });
  files["plan.dxf"] = dxfDoc(planP.filter((p) => p.layer && p.layer !== "A-AREA"));
  const model = { ...a.model, roofType: { gable: "GABLE_ROOF", hip: "HIP_ROOF", shed: "SHED_ROOF" }[style.roof] };
  files["model.ifc"] = toIFC(plan, model, brief, { name: s.id, timestamp });
  const { obj, mtl } = toOBJ(a.model, style, "model");
  files["model.obj"] = obj;
  files["model.mtl"] = mtl;
  files["bom.csv"] = csv(a.tk.rows, [["Section", "section"], ["Item", "item"], ["Specification", "spec"], ["Quantity", "qty"], ["Unit", "unit"], ["Note", "note"]]);
  files["openings.csv"] = csv(openingSchedule(plan, a.model.h), [["Type", "type"], ["Width (ft)", "width"], ["Height (ft)", "height"], ["Sill (ft)", "sill"], ["Quantity", "qty"]]);
  files["cost.csv"] = csv(Object.entries(s.cost.stages).map(([k, v]) => ({ stage: STAGE_LABELS[k] || "Porch", cost: v, share: ((100 * v) / s.cost.total).toFixed(1), nahb: STAGE_SHARES[k] ? (100 * STAGE_SHARES[k]).toFixed(1) : "" })), [["Stage", "stage"], ["Cost (USD)", "cost"], ["Share %", "share"], ["NAHB 2024 share %", "nahb"]]);
  files["rooms.csv"] = csv(s.rooms, [["Room", "name"], ["Kind", "kind"], ["Clear width (ft)", "w"], ["Clear depth (ft)", "d"], ["Area (sq ft)", "area"]]);
  // every wall stud by stud: drawings, cut list and board order (framing.mjs, Wall Framing Takeoff's engine)
  const fr = frameHouse(plan, brief, a.tk, style);
  s.studFraming = { ...fr.summary, notes: fr.notes };
  files["framing.svg"] = framingSheetSvg(fr, s.title);
  files["framing-cuts.csv"] = cutListCsv(fr);
  files["lumber-order.csv"] = orderCsv(fr);
  files["design.json"] = JSON.stringify({
    generator: { name: "Open House Plans", version: VERSION, license: LICENSE_NAME },
    brief, notes, summary: s,
    geometry: {
      units: "feet; x along the front, y from the front wall toward the back",
      width: plan.W, depth: plan.D, zones: plan.zones,
      rooms: plan.rooms.map((r) => ({ id: r.id, kind: r.kind, name: r.name, polygon: r.poly })),
      walls: plan.walls.map((w) => ({ id: w.id, type: w.type, dir: w.dir, at: w.c, from: w.a, to: w.b, thickness: Math.round(w.thickness * 1000) / 1000 })),
      openings: plan.openings.map((o) => ({ id: o.id, kind: o.kind, wall: o.wall, centre: Math.round(o.pos * 100) / 100, width: o.width, height: o.height, sill: o.sill, rooms: o.rooms })),
      porch: plan.porch,
      parameters: plan.p.split ? { ...plan.p, split: { front: plan.p.split.front, back: plan.p.split.back } } : plan.p,
    },
  }, null, 1);
  files["LICENSE.txt"] = CC0;
  const names = Object.keys(files);
  files["README.md"] = readme(s, brief, notes, [...names, "README.md"]);
  const alternatives = res.designs.map((d, i) => ({ variant: i, width: d.plan.W, depth: d.plan.D, arrangement: d.plan.p.arrangement, cost: Math.round(d.score.cost.total), score: Math.round(d.score.total * 100) / 100 }));
  return { brief, notes, design: s, alternatives, search: { candidates: res.evaluated, feasible: res.feasible }, files };
}
