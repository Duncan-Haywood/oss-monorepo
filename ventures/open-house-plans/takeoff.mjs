// @ts-check
// Quantity takeoff, member sizing and schedules for a finished plan.
//
// Framing follows research/house-framing's two schemes: conventional 2x4 at
// 16 in (double top plate, jacks, a header in every opening) and advanced
// (OVE) 2x6 at 24 in (single top plate, two-stud corners, headers sized and
// only where a wall bears). Headers, floor joists, girders and studs are
// checked with structure.mjs; roof trusses are bought engineered and are
// listed, not designed. Quantities carry no waste unless a line says so.

import { T, DEPTH, NOMINAL, sizeHeader, sizeMember, studCheck, worst, check, FLOOR } from "./structure.mjs";
import { bbox, area as polyArea } from "./geom.mjs";
import { kitchenLayout } from "./openings.mjs";

export const SCHEMES = {
  advanced: { label: "Advanced framing, 2x6 at 24 in", stud: "2x6", spacing: 24, topPlates: 1, cornerExtra: 0, teeExtra: 0, teeBlocks: 3, headerInNonBearing: false, partitionSpacing: 24, cavityR: 21 },
  conventional: { label: "Conventional framing, 2x4 at 16 in", stud: "2x4", spacing: 16, topPlates: 2, cornerExtra: 2, teeExtra: 2, teeBlocks: 0, headerInNonBearing: true, partitionSpacing: 16, cavityR: 15 },
};

/** Strength-level wind pressure on a wall face, psf (assumed coefficients: Kz 0.85, Kd 0.85, GCp + GCpi 1.08). */
export function windPressure(mph) {
  return 0.00256 * 0.85 * 0.85 * mph * mph * 1.08;
}

const bf = (size, lengthFt, n = 1) => (2 * NOMINAL[size] / 12) * lengthFt * n;

/** Which exterior walls carry the roof. */
function bearingSides(style) {
  return style.roof === "hip" ? new Set(["front", "back", "left", "right"]) : new Set(["front", "back"]);
}

function sideOf(plan, w) {
  if (w.dir === "h") return Math.abs(w.c) < 1e-6 ? "front" : "back";
  return Math.abs(w.c) < 1e-6 ? "left" : "right";
}

export function takeoff(plan, brief, style, h) {
  const sch = SCHEMES[brief.frame];
  const rows = [];
  const row = (section, item, spec, qty, unit, note = "") => rows.push({ section, item, spec, qty: Math.round(qty * 100) / 100, unit, note });
  const struct = { headers: [], studs: [], floor: null, trusses: null };
  const W = plan.W, D = plan.D;
  const Wg = plan.p.Wg || 0;
  const conditioned = (W - Wg) * D;
  const studLenIn = (plan.ceiling + 0.33) * 12 - (1 + sch.topPlates) * T; // plate height less plates
  const studLen = studLenIn / 12;
  const bearing = bearingSides(style);
  const trib = D / 2 + style.eave;
  const snow = brief.snow;
  const roofPlf = [15 * trib, snow * trib];
  const wPlf = roofPlf[0] + roofPlf[1];
  const windPsf = windPressure(brief.wind);
  const extWalls = plan.walls.filter((w) => w.type === "ext");
  const partitions = plan.walls.filter((w) => w.type === "int" || w.type === "fire");
  const opsOn = (w) => plan.openings.filter((o) => o.wall === w.id);
  // --- exterior walls ---
  let studs = 0, plateLf = 0, headerBf = 0, extLen = 0, extOpenArea = 0, extGross = 0;
  const headerCount = {};
  for (const w of extWalls) {
    const len = w.b - w.a;
    const side = sideOf(plan, w);
    const isBearing = bearing.has(side);
    extLen += len;
    extGross += len * (h.plate - h.base);
    plateLf += len * (1 + sch.topPlates);
    let n = Math.floor(len / (sch.spacing / 12)) + 1;
    for (const o of opsOn(w)) {
      extOpenArea += o.width * o.height;
      const spanIn = o.width * 12 + 3; // rough opening plus bearing
      let hdr = null;
      if (isBearing || sch.headerInNonBearing) {
        hdr = isBearing ? sizeHeader(spanIn, wPlf + (side === "front" && plan.porch ? (65 * plan.porch.d) / 2 : 0), sch.stud) : { size: "2x6", plies: 2, jacks: 1, ratio: null, nominal: true };
        if (!hdr) {
          hdr = { size: "LVL", plies: 1, jacks: 2, ratio: null, engineered: true };
        }
        const key = `${hdr.plies}-ply ${hdr.size}`;
        headerCount[key] = (headerCount[key] || 0) + 1;
        if (hdr.size !== "LVL") headerBf += bf(hdr.size, o.width + 0.25, hdr.plies);
        struct.headers.push({ opening: o.id, kind: o.kind, width: o.width, wall: side, bearing: isBearing, ...hdr, ratio: hdr.ratio === null ? null : Math.round(hdr.ratio * 100) / 100 });
      }
      const jacks = hdr ? (sch.topPlates === 1 && !sch.headerInNonBearing && hdr.jacks === 1 ? 0 : hdr.jacks) : 0;
      // kings, jacks (or hangers), cripples under a sill
      n += 2 + 2 * jacks;
      if (o.kind === "window") n += Math.floor(o.width / (sch.spacing / 12)) + 1;
      // studs on layout that the opening displaces
      n -= Math.max(0, Math.floor(o.width / (sch.spacing / 12)) - 0);
      if (o.kind === "window") plateLf += o.width; // rough sill
    }
    studs += n;
  }
  studs += 4 * sch.cornerExtra;
  const tees = partitions.reduce((s, w) => {
    let k = 0;
    for (const end of [w.a, w.b]) if (end < 1e-6 || Math.abs(end - (w.dir === "h" ? W : D)) < 1e-6) k++;
    return s + k;
  }, 0);
  studs += tees * sch.teeExtra;
  // stud check on the worst bearing wall
  const sc = studCheck(sch.stud, sch.spacing, studLenIn, roofPlf, windPsf);
  struct.studs.push({ stud: sch.stud, spacing: sch.spacing, lengthIn: Math.round(studLenIn * 10) / 10, ratio: Math.round(sc * 100) / 100, pass: sc <= 1, windPsf: Math.round(windPsf * 10) / 10 });
  row("Walls", "Studs, exterior", `${sch.stud} x ${studLen.toFixed(2)} ft precut, ${sch.spacing} in o.c.`, studs, "pcs", `stud check ratio ${sc.toFixed(2)} (D+S, wind ${windPsf.toFixed(0)} psf)`);
  row("Walls", "Plates, exterior", `${sch.stud}, bottom plate pressure-treated`, plateLf, "lf", `${1 + sch.topPlates} plates`);
  if (tees && sch.teeBlocks) row("Walls", "Ladder blocking at partition tees", `${sch.stud} x 14.5 in`, tees * sch.teeBlocks, "pcs");
  for (const [k, n] of Object.entries(headerCount)) row("Walls", "Headers", k, n, "pcs", k.includes("LVL") ? "engineered beam: size by supplier" : "sized for roof dead + snow");
  // --- partitions ---
  let pStuds = 0, pPlate = 0, partLen = 0;
  for (const w of partitions) {
    const len = w.b - w.a;
    partLen += len;
    pPlate += len * 3;
    pStuds += Math.floor(len / (sch.partitionSpacing / 12)) + 1 + opsOn(w).length * 2;
  }
  row("Walls", "Studs, partitions", `2x4 x ${(plan.ceiling - 0.1).toFixed(2)} ft precut, ${sch.partitionSpacing} in o.c.`, pStuds, "pcs");
  row("Walls", "Plates, partitions", "2x4 (bottom + double top)", pPlate, "lf");
  // --- sheathing and envelope ---
  const wallNet = extGross - extOpenArea;
  const gableArea = style.roof === "gable" ? 2 * (D * (D / 2) * h.pitch) / 2 : style.roof === "shed" ? D * D * h.pitch + W * D * h.pitch : 0;
  row("Walls", "Wall sheathing", "7/16 in OSB, 4 x 8", ((wallNet + gableArea) / 32) * 1.1, "sheets", "10% waste");
  row("Walls", "Weather-resistive barrier", "house wrap", (wallNet + gableArea) * 1.1, "sq ft");
  const claddingName = { lap: "fiber-cement lap siding", "board-and-batten": "board-and-batten (panel + battens)", vertical: "vertical metal or wood siding", shingle: "cedar or fiber-cement shingles" }[style.cladding];
  row("Exterior", "Cladding", claddingName, (wallNet + gableArea) * 1.1, "sq ft", "10% waste");
  // --- roof ---
  const slope = Math.sqrt(1 + h.pitch * h.pitch);
  const roofArea = (W + 2 * style.rake) * (D + 2 * style.eave) * slope;
  const trussCount = Math.floor(W / 2) + 1;
  struct.trusses = { count: trussCount, span: D, pitch: style.pitch, overhang: style.eave, type: style.roof === "shed" ? "mono" : style.roof === "hip" ? "hip set (girder, hip jacks, commons)" : "common", loads: `TC dead 10 psf, TC snow ${snow} psf, BC dead 10 psf (assumed)` };
  row("Roof", "Roof trusses", `${struct.trusses.type}, ${D} ft span, ${style.pitch}:12, 24 in o.c.`, trussCount, "pcs", "engineered and sealed by the truss maker; not designed here");
  if (style.roof === "gable") row("Roof", "Gable end trusses", "drop-top for outlookers", 2, "pcs", "included in the count above");
  row("Roof", "Roof sheathing", "7/16 in OSB, 4 x 8, H-clips", (roofArea / 32) * 1.1, "sheets", "10% waste");
  row("Roof", "Underlayment", "synthetic", roofArea / 100 * 1.1, "squares");
  const roofing = style.roof === "shed" || style.label === "Modern farmhouse" ? "standing-seam metal" : "architectural asphalt shingles";
  row("Roof", "Roofing", roofing, (roofArea / 100) * 1.12, "squares", "12% waste and starter");
  const eaveLf = style.roof === "hip" ? 2 * (W + D + 4 * style.eave) : 2 * (W + 2 * style.rake);
  const rakeLf = style.roof === "gable" ? 4 * (D / 2 + style.eave) * slope : style.roof === "shed" ? 2 * (D + 2 * style.eave) * slope : 0;
  row("Roof", "Drip edge and fascia", "aluminium drip edge, 1x6 fascia", eaveLf + rakeLf, "lf");
  if (style.roof !== "shed") row("Roof", "Ridge vent", "", style.roof === "hip" ? Math.max(0, W - D) : W, "lf");
  // --- floor and foundation ---
  const footprint = W * D;
  if (brief.foundation === "slab") {
    const slabCy = (footprint * (4 / 12)) / 27;
    const edgeCy = (2 * (W + D) * 1.0 * 1.0) / 27; // 12 x 12 in turned-down edge beyond the slab
    row("Foundation", "Concrete, slab and thickened edge", "4 in slab, 12 x 12 in turned-down edge (assumed; footing depth is set by local frost depth)", (slabCy + edgeCy) * 1.05, "cu yd", "5% waste");
    row("Foundation", "Vapor retarder", "10 mil polyethylene", footprint * 1.1, "sq ft");
    row("Foundation", "Reinforcing", "#4 bars, two in the edge", 2 * 2 * (W + D) * 1.1, "lf");
    row("Foundation", "Slab edge insulation", "R-10 rigid, 2 ft", 2 * (W - Wg + D) + (Wg ? D : 0), "lf", "conditioned edge only");
  } else {
    // joists front to back over girder lines at equal spacing
    let lines = 1, joist = null;
    for (lines = 1; lines <= 3; lines++) {
      const span = D / (lines + 1) - 0.5;
      joist = sizeMember(span, FLOOR, { spacingIn: 16 });
      if (joist) { joist.span = span; break; }
    }
    let girder = null, postSpacing = 8;
    for (postSpacing of [8, 7, 6, 5]) {
      girder = sizeMember(postSpacing, { ...FLOOR, liveLimit: 360, totalLimit: 240 }, { spacingIn: (joist.span + 0.5) * 12, plies: 3, sizes: ["2x8", "2x10", "2x12"] });
      if (girder) break;
    }
    struct.floor = { joist: { size: joist.size, spacing: 16, span: Math.round(joist.span * 100) / 100, governs: joist.governs, ratio: Math.round(joist.ratio * 100) / 100 }, girderLines: lines, girder: girder ? { size: `3-ply ${girder.size}`, postSpacing, governs: girder.governs, ratio: Math.round(girder.ratio * 100) / 100 } : null };
    const nJoists = (Math.floor((W - Wg) / (16 / 12)) + 1) * (lines + 1);
    row("Floor", "Floor joists", `${joist.size} at 16 in o.c., ${joist.span.toFixed(1)} ft span`, nJoists, "pcs", `${joist.governs} governs at ${joist.ratio.toFixed(2)}`);
    row("Floor", "Rim joist", joist.size, 2 * (W - Wg + D), "lf");
    if (girder) row("Floor", "Girders", `3-ply ${girder.size} on posts at ${postSpacing} ft`, lines * (W - Wg), "lf", `${girder.governs} governs at ${girder.ratio.toFixed(2)}`);
    row("Floor", "Piers and footings", "post on pier at each girder support", lines * (Math.ceil((W - Wg) / postSpacing) + 1), "pcs", "footing size depends on soil");
    row("Floor", "Subfloor", "23/32 in T&G OSB, glued and nailed", ((W - Wg) * D / 32) * 1.08, "sheets");
    row("Foundation", "Stem wall", "8 in CMU or poured, 2.5 ft above grade on a continuous footing (assumed)", 2 * (W + D), "lf", "footing depth is set by local frost depth");
    if (Wg) row("Foundation", "Garage slab", "4 in on 4 in base", (Wg * D * (4 / 12)) / 27 * 1.05, "cu yd");
  }
  // --- insulation and drywall ---
  const condExtGross = extGross - (Wg ? (Wg * 2 + D) * (h.plate - h.base) : 0);
  row("Insulation", "Wall cavity insulation", `R-${sch.cavityR} batts`, Math.max(0, condExtGross - extOpenArea), "sq ft", "conditioned walls, net of openings");
  row("Insulation", "Attic insulation", "R-49 blown cellulose or fiberglass", conditioned, "sq ft");
  const ceilingDrywall = conditioned;
  const wallDrywall = Math.max(0, condExtGross - extOpenArea) + partLen * plan.ceiling * 2;
  row("Interior", "Drywall", "1/2 in, 4 x 12 (walls and ceilings)", ((ceilingDrywall + wallDrywall) / 48) * 1.12, "sheets", "12% waste");
  if (Wg) row("Interior", "Garage separation", "5/8 in type X gypsum on the garage side of the house wall and ceiling (check local code)", ((D + Wg * D) / 48) * 1.1, "sheets");
  // --- openings, fixtures, finishes ---
  const kl = plan.kitchenLayout || kitchenLayout(plan);
  row("Interior", "Kitchen cabinets and counter", "base cabinets with counter (uppers over the run)", kl.counterLf, "lf");
  const fixtures = fixtureSchedule(plan);
  for (const f of fixtures) row("Plumbing", f.item, f.spec, f.qty, "ea");
  const alarms = plan.rooms.filter((r) => r.kind === "bed" || r.kind === "primary").length + 1;
  row("Electrical", "Smoke alarms, interconnected", "one in each bedroom and one outside the sleeping area", alarms, "ea", "plus a CO alarm if there is a gas appliance or an attached garage");
  // porch
  if (plan.porch) {
    const po = plan.porch;
    row("Porch", "Porch slab", "4 in concrete", ((po.w * po.d) * (4 / 12)) / 27 * 1.05, "cu yd");
    row("Porch", "Posts", style.porch?.post > 1 ? "tapered column on a pier base" : "6x6", Math.max(2, Math.round(po.w / 8) + 1), "ea");
    row("Porch", "Porch roof framing", "2x6 rafters at 24 in, doubled 2x10 beam", Math.ceil(po.w / 2) + 1, "rafters");
  }
  // --- totals ---
  const studBf = bf(sch.stud, studLen, studs) + bf("2x4", plan.ceiling - 0.1, pStuds);
  const plateBf = bf(sch.stud, plateLf) + bf("2x4", pPlate);
  const lumberBf = studBf + plateBf + headerBf;
  return {
    rows,
    struct,
    totals: { wallLumberBf: Math.round(lumberBf), wallLumberBfPerSqFt: Math.round((lumberBf / conditioned) * 100) / 100, extWallNet: Math.round(wallNet), roofArea: Math.round(roofArea), openingsArea: Math.round(extOpenArea), partitionLf: Math.round(partLen) },
    scheme: sch,
  };
}

export function fixtureSchedule(plan) {
  const out = [];
  const n = (kind) => plan.rooms.filter((r) => r.kind === kind).length;
  const full = n("bath") + n("ensuite"), half = n("half");
  if (full + half) out.push({ item: "Toilets", spec: "1.28 gpf", qty: full + half });
  if (full + half) out.push({ item: "Lavatories", spec: "vanity sink", qty: full + half + n("ensuite") });
  if (full) out.push({ item: "Tubs or showers", spec: "60 in tub/shower or shower", qty: full });
  out.push({ item: "Kitchen sink and dishwasher", spec: "double-bowl sink", qty: 1 });
  if (n("laundry") + n("mud")) out.push({ item: "Washer box", spec: "with dryer vent", qty: 1 });
  out.push({ item: "Water heater", spec: "heat-pump water heater (assumed)", qty: 1 });
  return out;
}

/** Window and door schedule rows. */
export function openingSchedule(plan, h) {
  const groups = new Map();
  for (const o of plan.openings) {
    if (!o.exterior && o.kind !== "window" && o.kind !== "door" && o.kind !== "bifold" && o.kind !== "closet" && o.kind !== "cased") continue;
    const type = o.kind === "window" ? (o.egress ? "Window, casement (egress)" : o.obscure ? "Window, obscure glass" : "Window") : o.kind === "entry" ? "Entry door, insulated" : o.kind === "slider" ? "Sliding glass door" : o.kind === "garage" ? "Garage door, sectional" : o.exterior ? "Exterior door" : o.kind === "bifold" || o.kind === "closet" ? "Bifold door" : o.kind === "cased" ? "Cased opening" : "Interior door, passage";
    const key = `${type}|${o.width}|${o.height}`;
    if (!groups.has(key)) groups.set(key, { type, width: o.width, height: o.height, sill: o.kind === "window" ? o.sill : 0, qty: 0 });
    groups.get(key).qty++;
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || b.width - a.width);
}
