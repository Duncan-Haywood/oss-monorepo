// A bar bending schedule from an IFC model's reinforcing bars.
//
// Estimators and fabricators order reinforcement by bar mark: for each mark,
// the bar size, how many, the cut length of each, the shape and its leg
// dimensions, and the mass. The takeoff's bill of quantities groups bars by
// class and type, which is not how rebar is bought. This module reads each
// bar's swept-disk path (geom.mjs path3: straight runs, arcs, or a polyline
// whose bends are drawn as short facets) into legs and bends, and groups the
// bars into schedule lines.
//
// What is measured, and how:
//   cut length   the length along the bar's centreline, bends included: the
//                steel that is cut and bent (Tekla's weights are this length
//                times the nominal mass per metre);
//   dimensions   each leg out to out: its straight run plus, at a bent end,
//                (r + d/2) tan(theta/2) for a bend of theta <= 90 degrees and
//                r + d/2 past it (r the centreline radius), which is how
//                BS 8666 and Tekla's DIM_A, DIM_B... measure a leg;
//   mass         cut length x the nominal bar's mass per metre, pi d^2 / 4 x
//                7,850 kg/m3 (0.617 kg/m for 10 mm, 0.888 kg/m for 12 mm),
//                with d the nominal size the file names, not the swept disk's
//                (Tekla draws a 10 mm bar 10.625 mm across: its ribs);
//   shape        a plain description (straight, L, U, Z, closed link, n
//                bends) and a BS 8666 shape code only where the shape is one
//                of the three this reads with certainty: 00 straight, 11 one
//                90 degree bend, 21 two 90 degree bends the same way in one
//                plane. The shape code the file states (Tekla SHAPE, Allplan
//                Shape code, the ISO/BS bending property sets) is kept beside it.
//
// Pure functions: barShape over one path, readBarProps over the file's
// property sets, rebarSchedule over the takeoff's rows (qto.mjs fills
// row.bars and row.barProps for every reinforcing bar it reads).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : null; };
const angleBetween = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
const DEG = 180 / Math.PI;

// a turn smaller than this between two pieces is no bend (collinear pieces)
const TURN_TOL = 0.5 / DEG;
// a straight piece shorter than this many bar diameters, with a turn at both
// ends, is a facet of a bend drawn as a polyline (Allplan writes bends so)
const FACET_D = 2;

const median = (xs) => { if (!xs.length) return null; const v = xs.slice().sort((a, b) => a - b); return v[v.length >> 1]; };
/** The radius of the circle through three points (Infinity when they are in a line). */
function circumradius(a, b, c) {
  const ab = norm(sub(a, b)), bc = norm(sub(b, c)), ca = norm(sub(c, a));
  const area2 = norm(cross(sub(b, a), sub(c, a)));
  return area2 > 0 ? (ab * bc * ca) / (2 * area2) : Infinity;
}

/** The tangent a piece leaves its start along, and arrives at its end along. */
function tangents(g) {
  if (g.kind === "arc") return [unit(cross(g.n, sub(g.a, g.c))), unit(cross(g.n, sub(g.b, g.c)))];
  const t = unit(sub(g.b, g.a));
  return [t, t];
}

/**
 * One bar's shape from its path.
 * @param {{radius:number, segs:object[]}} bar  path3 pieces and the disk's radius, in model units
 * @param {number} f  metres per model unit
 * @param {number|null} nominal  the bar's nominal size in metres, which the leg dimensions are measured with (else the disk's diameter)
 * @returns {{d:number, length:number, legs:number[], bends:{angle:number, r:number|null, sharp:boolean}[], dims:number[], planar:boolean, closed:boolean, turn:number, shape:string, bs8666:string|null, hooks:{end:string, angle:number, r:number|null, tail:number}[]}}
 *   lengths in metres, angles in degrees; r is the centreline radius, null at a sharp corner
 */
export function barShape(bar, f = 1, nominal = null) {
  const drawn = 2 * bar.radius * f;
  const d = nominal ?? drawn;
  const segs = bar.segs.filter((g) => g.length > 0).map((g) => ({ ...g, length: g.length * f, r: g.r != null ? g.r * f : undefined }));
  const length = segs.reduce((s, g) => s + g.length, 0);
  const T = segs.map(tangents);
  // the turn at each junction: between piece i-1's end and piece i's start
  const turnAt = segs.map((_, i) => (i === 0 || !T[i - 1][1] || !T[i][0] ? 0 : angleBetween(T[i - 1][1], T[i][0])));
  turnAt.push(0);
  const isBendPiece = segs.map((g, i) => g.kind === "arc" || (g.length < FACET_D * d && turnAt[i] > TURN_TOL && turnAt[i + 1] > TURN_TOL));
  // legs and bends, in order: a leg is a run of straight pieces with no turn
  // between them; a bend is whatever turns between two legs
  const legs = [], bends = [];
  let legLen = 0, bend = null;
  const openBend = () => { if (!bend) bend = { turn: 0, len: 0, n: [0, 0, 0], arcLen: 0, arcAngle: 0, pts: [] }; };
  const closeBend = () => {
    legs.push(legLen);
    legLen = 0;
    // an arc's own radius; a bend drawn as facets: the circle through its
    // vertices (their length over the turn reads 7% small on Allplan's
    // eight facets to a right angle)
    let r = null;
    if (bend.arcAngle > 0) r = bend.arcLen / bend.arcAngle;
    else if (bend.pts.length >= 3) r = median(bend.pts.slice(2).map((p, i) => circumradius(bend.pts[i], bend.pts[i + 1], p) * f).filter(Number.isFinite));
    else if (bend.len > 0) r = bend.len / bend.turn;
    bends.push({ angle: bend.turn * DEG, r, sharp: r == null, n: unit(bend.n) });
    bend = null;
  };
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (turnAt[i] > TURN_TOL) {
      // a corner between two pieces
      openBend();
      bend.turn += turnAt[i];
      const c = cross(T[i - 1][1], T[i][0]);
      bend.n = [bend.n[0] + c[0], bend.n[1] + c[1], bend.n[2] + c[2]];
    }
    if (isBendPiece[i]) {
      openBend();
      bend.len += g.length;
      if (g.kind === "arc") {
        bend.arcLen += g.length;
        bend.arcAngle += g.angle;
        bend.turn += g.angle;
        bend.n = [bend.n[0] + g.n[0] * g.angle, bend.n[1] + g.n[1] * g.angle, bend.n[2] + g.n[2] * g.angle];
      } else {
        if (!bend.pts.length) bend.pts.push(g.a);
        bend.pts.push(g.b);
      }
    } else {
      if (bend) closeBend();
      legLen += g.length;
    }
  }
  if (bend) closeBend();
  legs.push(legLen);
  const ext = (b) => {
    if (!b) return 0;
    const r = b.r ?? 0, th = b.angle / DEG;
    return b.angle <= 90 + 1e-6 ? (r + d / 2) * Math.tan(th / 2) : r + d / 2;
  };
  const dims = legs.map((l, i) => l + ext(bends[i - 1]) + ext(bends[i]));
  const turn = bends.reduce((s, b) => s + b.angle, 0);
  // in one plane when every bend turns about the same axis (either way)
  const ns = bends.map((b) => b.n).filter(Boolean);
  const planar = ns.every((n) => Math.abs(dot(n, ns[0])) > 0.999);
  const first = segs[0]?.a, last = segs[segs.length - 1]?.b;
  const closed = turn >= 330 && first && last ? true : false;
  // hooks: an end bend past 90 degrees whose end leg is at most half the leg
  // on the bend's other side (so a hairpin's two equal legs are not hooks).
  // Its tail is the straight run past the bend, the length a bending machine
  // is set to; the leg dimension keeps the out-to-out figure.
  const hooks = [];
  const hookAt = (end, b, tail, other) => { if (b && b.angle > 91.5 && tail <= 0.5 * other) hooks.push({ end, angle: b.angle, r: b.r, tail }); };
  if (bends.length) {
    hookAt("start", bends[0], legs[0], legs[1]);
    hookAt("end", bends[bends.length - 1], legs[legs.length - 1], legs[legs.length - 2]);
  }
  const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
  let shape, bs8666 = null;
  if (!bends.length) { shape = "straight"; bs8666 = "00"; }
  else if (closed) shape = `closed link, ${bends.length} bends`;
  else if (bends.length === 1) {
    if (near(bends[0].angle, 90)) { shape = "L"; bs8666 = "11"; }
    else if (near(bends[0].angle, 180, 3)) shape = "U (one 180 degree bend)";
    else shape = `1 bend of ${Math.round(bends[0].angle)} degrees`;
  } else if (bends.length === 2 && near(bends[0].angle, 90) && near(bends[1].angle, 90) && planar && ns.length === 2) {
    if (dot(ns[0], ns[1]) > 0) { shape = "U"; bs8666 = "21"; } else shape = "Z (cranked)";
  } else shape = `${bends.length} bends${planar ? "" : ", not in one plane"}`;
  return {
    d: drawn, length, legs, bends: bends.map(({ angle, r, sharp }) => ({ angle, r, sharp })),
    dims, planar, closed, turn, shape, bs8666, hooks,
  };
}

// BS 8666:2020 Table 2: the minimum scheduling radius of a bend in a B500 bar,
// to the inside of the bend: 2d up to 16 mm, 3.5d from 20 mm
export const minBendRadius = (dmm) => (dmm <= 16 ? 2 : 3.5) * dmm;

// ACI 318's shortest straight extension past a hook, mm: a 180 degree hook
// the larger of 4d and 65 mm (2.5 in), a 135 degree stirrup or tie hook 6d.
// Other angles (90 degree hooks differ by use: 12d to develop a bar, 6d on a
// small stirrup) are not checked.
export function minHookTail(angle, dmm) {
  if (Math.abs(angle - 180) <= 3) return { min: Math.max(4 * dmm, 65), rule: "the larger of 4d and 65 mm for a 180 degree hook" };
  if (Math.abs(angle - 135) <= 3) return { min: 6 * dmm, rule: "6d for a 135 degree stirrup or tie hook" };
  return null;
}

/**
 * A bar's hooks: those its geometry shows (an end bend past 90 degrees on a
 * short end leg) and those the file names (Tekla's HOOK_START_ANGLE, the
 * ISO/BS bending sets' BendingStartHook...), which may be 90 degrees. A
 * file's start can be the drawn path's end (Tekla lists an L-bar's long leg
 * as A and draws it last), so its two angles are matched to the drawn ends
 * either way round: the way whose angles agree, else the way whose named
 * hooks are the shorter legs. Ends are reported in the drawn path's order,
 * the order of the leg dimensions.
 * @returns {{hooks: {end:string, angle:number, r:number|null, tail:number|null, fileAngle:number|null}[], notes: string[]}}
 */
export function barHooks(b, p = {}) {
  const hooks = [], notes = [];
  const nb = b.bends?.length ?? 0;
  const geo = {
    start: nb ? { angle: b.bends[0].angle, r: b.bends[0].r, tail: b.legs?.[0] ?? null } : null,
    end: nb ? { angle: b.bends[nb - 1].angle, r: b.bends[nb - 1].r, tail: b.legs?.[b.legs.length - 1] ?? null } : null,
  };
  const named = [p.hookStart ?? null, p.hookEnd ?? null];
  const cost = (ends) => {
    let miss = 0, tail = 0;
    ends.forEach((e, i) => {
      if (named[i] == null) return;
      const g = geo[e];
      if (!g) { miss++; return; }
      if (Math.abs(named[i] - g.angle) > 3) miss++;
      tail += g.tail ?? 0;
    });
    return [miss, tail];
  };
  const fwd = cost(["start", "end"]), rev = cost(["end", "start"]);
  const flip = rev[0] < fwd[0] || (rev[0] === fwd[0] && rev[1] < fwd[1] - 1e-9);
  const fileAt = flip ? { end: named[0], start: named[1] } : { start: named[0], end: named[1] };
  for (const end of ["start", "end"]) {
    const drawn = (b.hooks ?? []).find((h) => h.end === end);
    const fileAngle = fileAt[end];
    if (!drawn && fileAngle == null) continue;
    if (!geo[end]) { notes.push(`the file names a ${Math.round(fileAngle)} degree hook; the bar is drawn straight`); continue; }
    const h = drawn ? { ...drawn, fileAngle } : { end, ...geo[end], fileAngle };
    hooks.push(h);
    if (h.fileAngle != null && Math.abs(h.fileAngle - h.angle) > 3) notes.push(`the file names a ${Math.round(h.fileAngle)} degree hook where the bar is drawn with a ${Math.round(h.angle)} degree bend`);
  }
  return { hooks, notes };
}

// property names (lower case) each figure is read from, first found wins:
// Tekla (Rebar_properties, Tekla Reinforcement - Bending List), Allplan
// (Allplan_ReinforcingBar, AllplanAttributes), Revit (the ISO/BS bending
// property sets) and the IFC4 Pset_ReinforcingBarBendings*Common names
const NAMES = {
  mark: ["rebar_pos", "position number", "group position number", "schedulemark", "barmark", "bar mark", "mark", "bewehrungsposition", "posnr", "pos"],
  shape: ["shape", "shape code", "shapecode", "bs8666shapecode", "isocd3766shapecode", "din135610shapecode", "becshapecode", "bendingshapecode"],
  count: ["number_of_bars_in_group", "number of bars in group"],
  // bars of the whole position (mark) across the model: Allplan, and the
  // piece count Allplan's attributes carry
  positionCount: ["count of bars/meshes", "stückzahl", "anzahl"],
  length: ["dim_l", "length", "barlength", "bar length"],
  weight: ["weight_total_in_group", "weight total in group"],
  diameter: ["diameter_nominal", "size", "bewehrungsdurchmesser", "nominaldiameter", "nominal diameter"],
  grade: ["grade", "steelgrade", "steel grade", "material"],
  massPerMetre: ["weight per meter", "weight per metre", "weight_per_meter"],
  bendingDiameter: ["bending diameter", "mandrel diameter"],
  member: ["cast_unit_pos", "cast unit mark", "assembly_pos"],
  // the hook each end is drawn with, by angle (Tekla's labels, the ISO/BS
  // bending sets' plane angles) and Tekla's hook length where it fills it
  hookStart: ["hook_start_angle", "isocd3766bendingstarthook", "bs8666bendingstarthook", "din135610bendingstarthook", "becbendingstarthook"],
  hookEnd: ["hook_end_angle", "isocd3766bendingendhook", "bs8666bendingendhook", "din135610bendingendhook", "becbendingendhook"],
  hookStartLength: ["hook_start_length"],
  hookEndLength: ["hook_end_length"],
};
const DIM_KEYS = ["a", "b", "c", "d", "e"];

/** The plain value of a property's nominal value: a number, string or boolean. */
const valueOf = (v) => (v && typeof v === "object" && "value" in v ? valueOf(v.value) : v);

/**
 * The author's own schedule figures from a bar's property sets (and its
 * type's): mark, shape code, bars in the group, length, group weight,
 * nominal diameter (mm), grade, mass per metre, bending diameter (mm) and
 * leg dimensions, each as the file states it, or null.
 * @param {Map<number, any>} E entities
 * @param {number[]} psetIds IfcPropertySet ids
 */
export function readBarProps(E, psetIds) {
  const all = new Map();
  for (const id of psetIds || []) {
    const ps = E.get(id);
    if (!ps || ps.type !== "IFCPROPERTYSET") continue;
    for (const pr of ps.args[4] || []) {
      const p = E.get(pr && typeof pr === "object" ? pr.ref : pr);
      if (!p || p.type !== "IFCPROPERTYSINGLEVALUE" || typeof p.args[0] !== "string") continue;
      const v = valueOf(p.args[2]);
      if (v == null || v === "") continue;
      // ISO/BS bending sets prefix their names with the standard
      const k = p.args[0].trim().toLowerCase().replace(/^(isocd3766|bs8666|din135610|bec)shapeparameter_/, "dim_");
      if (!all.has(k)) all.set(k, v);
    }
  }
  const pick = (names) => { for (const n of names) if (all.has(n)) return all.get(n); return null; };
  const numOr = (v) => (typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null);
  let mark = pick(NAMES.mark);
  if (mark != null) mark = String(mark).trim();
  // Tekla writes "0(?)" for a bar not yet numbered
  if (mark === "" || /\(\?\)/.test(mark ?? "")) mark = null;
  let shape = pick(NAMES.shape);
  if (shape != null) shape = String(shape).trim() || null;
  const dims = {};
  for (const k of DIM_KEYS) {
    const v = numOr(all.get(`dim_${k}`) ?? all.get(k));
    if (v != null) dims[k.toUpperCase()] = v;
  }
  const member = pick(NAMES.member);
  // a hook angle in degrees, whichever way it turns (Tekla writes -90); a
  // figure of 2 pi or less is read as radians; 0 is no hook
  const angle = (v) => { const x = numOr(v); if (x == null || x === 0) return null; const a = Math.abs(x); return a <= 2 * Math.PI + 1e-6 ? a * DEG : a; };
  return {
    mark, shape,
    count: numOr(pick(NAMES.count)),
    positionCount: numOr(pick(NAMES.positionCount)),
    length: numOr(pick(NAMES.length)),
    weight: numOr(pick(NAMES.weight)),
    diameter: numOr(pick(NAMES.diameter)),
    grade: pick(NAMES.grade) != null ? String(pick(NAMES.grade)).trim() || null : null,
    massPerMetre: numOr(pick(NAMES.massPerMetre)),
    bendingDiameter: numOr(pick(NAMES.bendingDiameter)),
    member: member != null ? String(member).replace(/\(\?\)/, "").trim() || null : null,
    hookStart: angle(pick(NAMES.hookStart)), hookEnd: angle(pick(NAMES.hookEnd)),
    hookStartLength: numOr(pick(NAMES.hookStartLength)), hookEndLength: numOr(pick(NAMES.hookEndLength)),
    dims,
  };
}

/** A diameter as the file writes it, to millimetres: sizes are 3 to 60 mm, so a figure under 0.1 is in metres. */
export const toMm = (v, f) => (v == null ? null : v >= 3 ? v : v < 0.1 ? v * 1000 : v * f * 1000);

/** Nominal mass per metre of a round bar of d mm, kg/m. */
export const massPerMetre = (dmm) => (Math.PI / 4) * (dmm / 1000) ** 2 * 7850;

const r1 = (x) => Math.round(x);

/**
 * The bar bending schedule: one line per member, bar mark, size, shape and
 * cut length, with the bars counted and their mass, and the author's own
 * figures beside ours where the file states them.
 * @param {object[]} rows takeoff rows (qto.mjs), of which those with row.bars are read
 * @returns {{lines: object[], bySize: object[], total: {bars:number, length:number, mass:number}, notes: string[]}}
 */
export function rebarSchedule(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = new Map();
  const notes = [];
  let unmarked = 0;
  const unread = {};
  for (const r of rows) {
    if (/^IFCREINFORCINGBAR$/.test(r.ifcType ?? "") && !r.bars?.length) {
      const why = r.computed?.status !== "ok" ? r.computed?.reason ?? r.computed?.status ?? "no body" : "body is not a swept disk or round extrusion";
      unread[why] = (unread[why] ?? 0) + 1;
    }
    if (!r.bars || !r.bars.length) continue;
    const p = r.barProps ?? {};
    const parent = r.assembly != null ? byId.get(r.assembly) : null;
    const member = p.member ?? (parent ? parent.name ?? parent.tag ?? `#${parent.id}` : null) ?? r.storey ?? "";
    for (const b of r.bars) {
      const dmm = p.diameterMm ?? b.d * 1000;
      const sig = [member, p.mark ?? "", Math.round(dmm * 10) / 10, r1(b.length * 1000), b.shape, b.dims.map((x) => r1(x * 1000)).join("/")].join("|");
      if (!groups.has(sig)) {
        if (p.mark == null) unmarked++;
        groups.set(sig, {
          member, mark: p.mark, markFrom: p.mark != null ? "file" : null, grade: p.grade ?? null, size: Math.round(dmm * 10) / 10,
          drawn: Math.round(b.d * 10000) / 10, count: 0, length: b.length, dims: b.dims, bends: b.bends, shape: b.shape, bs8666: b.bs8666,
          fileShape: p.shape ?? null, closed: b.closed, planar: b.planar, hooks: barHooks(b, p).hooks,
          author: { count: 0, length: p.lengthM ?? null, weight: 0, groups: new Set(), dims: p.dims ?? {}, massPerMetre: p.massPerMetre ?? null, bendingDiameter: p.bendingDiameter ?? null, positionCount: p.positionCount ?? null },
          elements: new Set(), notes: new Set(),
        });
      }
      const g = groups.get(sig);
      g.count++;
      g.elements.add(r.id);
      // a group's own count and weight once per element (Tekla writes them on the group)
      if (!g.author.groups.has(r.id)) {
        g.author.groups.add(r.id);
        if (p.count != null) g.author.count += p.count; else g.author.count = null;
        if (p.weight != null && g.author.weight != null) g.author.weight += p.weight; else g.author.weight = null;
      }
      const inside = b.bends.filter((x) => !x.sharp).map((x) => x.r * 1000 - dmm / 2);
      if (inside.some((x) => x < minBendRadius(dmm) * 0.95)) g.notes.add(`bend tighter than BS 8666's minimum ${minBendRadius(dmm)} mm inside radius for a ${dmm} mm bar`);
      if (b.bends.some((x) => x.sharp)) g.notes.add("a bend drawn as a sharp corner: its radius is not in the file");
      const hk = barHooks(b, p);
      for (const t of hk.notes) g.notes.add(t);
      for (const h of hk.hooks) {
        const m = h.tail != null ? minHookTail(h.angle, dmm) : null;
        if (m && h.tail * 1000 < m.min - 0.5) g.notes.add(`${h.end} hook's tail ${r1(h.tail * 1000)} mm is under ACI 318's ${r1(m.min)} mm (${m.rule}); the note names the standard, not the project's code`);
      }
      if (Math.abs(b.d * 1000 - dmm) > 0.05 * dmm) g.notes.add(`drawn ${Math.round(b.d * 10000) / 10} mm across; mass from the ${dmm} mm nominal size`);
    }
  }
  // marks for bars the file leaves unmarked: one per distinct bar, in order
  let n = 0;
  const lines = [...groups.values()];
  lines.sort((a, b) => String(a.member).localeCompare(String(b.member), undefined, { numeric: true }) || String(a.mark ?? "~").localeCompare(String(b.mark ?? "~"), undefined, { numeric: true }) || a.size - b.size || b.length - a.length);
  for (const g of lines) if (g.mark == null) { g.mark = `A${String(++n).padStart(2, "0")}`; g.markFrom = "assigned"; }
  for (const [why, k] of Object.entries(unread)) notes.push(`${k} reinforcing bar element${k > 1 ? "s" : ""} not in the schedule: ${why}`);
  if (unmarked) notes.push(`${unmarked} schedule line${unmarked > 1 ? "s" : ""} had no bar mark in the file; marks A01, A02... were assigned here, one per distinct bar`);
  const out = lines.map((g) => {
    const mpm = massPerMetre(g.size);
    const totalLength = g.length * g.count;
    return {
      member: g.member, mark: g.mark, markFrom: g.markFrom, grade: g.grade, size: g.size, count: g.count,
      length: g.length, dims: g.dims, bends: g.bends.map((b) => ({ angle: b.angle, r: b.r })), shape: g.shape, bs8666: g.bs8666, fileShape: g.fileShape, hooks: g.hooks,
      totalLength, mass: totalLength * mpm, massPerMetre: mpm,
      author: { count: g.author.count, length: g.author.length, weight: g.author.weight || null, dims: g.author.dims, massPerMetre: g.author.massPerMetre, bendingDiameter: g.author.bendingDiameter, positionCount: g.author.positionCount },
      elements: [...g.elements], notes: [...g.notes],
    };
  });
  const sizes = new Map();
  for (const l of out) {
    const s = sizes.get(l.size) ?? { size: l.size, bars: 0, length: 0, mass: 0 };
    s.bars += l.count; s.length += l.totalLength; s.mass += l.mass;
    sizes.set(l.size, s);
  }
  const bySize = [...sizes.values()].sort((a, b) => a.size - b.size);
  const total = bySize.reduce((t, s) => ({ bars: t.bars + s.bars, length: t.length + s.length, mass: t.mass + s.mass }), { bars: 0, length: 0, mass: 0 });
  return { lines: out, bySize, total, notes };
}

// a cell a spreadsheet would read as a formula (a bar mark or member name
// from the file starting =, +, -, @) is prefixed with an apostrophe
const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The schedule as CSV, laid out like a BS 8666 bar schedule (member, bar
 * mark, size, number, length of each bar, shape code, leg dimensions A-E),
 * then the bends, totals, the file's own figures and notes.
 * @param {ReturnType<typeof rebarSchedule>} s
 */
export function rebarCsv(s) {
  const head = ["Member", "Bar mark", "Mark from", "Grade", "Size (mm)", "No. of bars", "Length of each bar (mm)", "Shape", "BS 8666 shape code", "File's shape code", "A (mm)", "B (mm)", "C (mm)", "D (mm)", "E (mm)", "More legs (mm)", "Bends (degrees)", "Start hook (degrees)", "Start hook tail (mm)", "End hook (degrees)", "End hook tail (mm)", "Total length (m)", "Mass (kg)", "File's no. of bars", "File's length (mm)", "File's weight (kg)", "Notes"];
  const lines = [head.join(",")];
  for (const l of s.lines) {
    const dims = l.dims.map((x) => r1(x * 1000));
    lines.push([
      l.member, l.mark, l.markFrom, l.grade, l.size, l.count, r1(l.length * 1000), l.shape, l.bs8666, l.fileShape,
      ...[0, 1, 2, 3, 4].map((i) => dims[i]), dims.slice(5).join(" "), l.bends.map((b) => Math.round(b.angle)).join(" "),
      ...["start", "end"].flatMap((e) => { const h = (l.hooks ?? []).find((x) => x.end === e); return h ? [Math.round(h.angle), h.tail != null ? r1(h.tail * 1000) : ""] : ["", ""]; }),
      l.totalLength.toFixed(3), l.mass.toFixed(2), l.author.count, l.author.length != null ? r1(l.author.length * 1000) : "", l.author.weight != null ? l.author.weight.toFixed(2) : "",
      l.notes.join("; "),
    ].map(csvCell).join(","));
  }
  lines.push("");
  lines.push(["Size (mm)", "Bars", "Total length (m)", "Mass (kg)"].join(","));
  for (const z of s.bySize) lines.push([z.size, z.bars, z.length.toFixed(3), z.mass.toFixed(2)].join(","));
  lines.push(["Total", s.total.bars, s.total.length.toFixed(3), s.total.mass.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
