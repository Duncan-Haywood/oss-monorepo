// @ts-check
// Wall framing takeoff: from a list of walls and openings to a stud layout,
// a cut list and the cheapest lumber order that covers it.
//
// Everything is in inches. Lumber is nominal 2x: 1.5 in thick, 3.5 in (2x4)
// or 5.5 in (2x6) deep. A wall is laid out from its start end: an end stud,
// then studs centred on every multiple of the spacing, then an end stud.
// Openings replace the layout studs they cover with king and jack studs, a
// header and cripples kept on layout. Plates longer than the longest board
// are spliced over a full-length stud, with the cap plate's joints kept a
// set distance from the top plate's.
//
// The order is a cutting-stock problem over the boards the user can buy
// (several lengths, each with its own price): Gilmore-Gomory column
// generation gives an LP lower bound on the cost, sequential rounding of the
// LP gives the order, and first-fit-decreasing is kept as a fallback. The
// result reports both the cost and the bound, so the gap is visible.
//
// Header sizes and jack counts are inputs. Nothing here checks them against
// a span table or a building code.

export const THICK = 1.5;
export const DEPTH = { "2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25 };
const STEP = 16; // cutting resolution: 1/16 in
export const EPS = 1e-9;

/** The method the lumber order uses, cited for `tools.mjs describe`. */
export const PAPERS = [
  {
    citation: "Gilmore, P. C. & Gomory, R. E. (1961). A linear programming approach to the cutting-stock problem. Operations Research 9(6), 849-859. doi:10.1287/opre.9.6.849",
    implemented: "Column generation for the LP relaxation, with a bounded knapsack (dynamic programming in 1/16 in) as the pricing problem, over several board lengths with their own prices; the LP value is reported as a lower bound.",
    departs: "Integer orders come from sequential rounding of the LP and re-solving the remainder, compared with first-fit-decreasing; small groups are solved exactly by dynamic programming over the demand vector instead.",
  },
];

/** Precut stud lengths sold for 8, 9 and 10 ft walls (one bottom, two top plates). */
export const PRECUT = { "8ft": 92.625, "9ft": 104.625, "10ft": 116.625 };

/**
 * @typedef {{ kind: "window"|"door", offset: number, width: number, height: number,
 *   headerHeight?: number, header?: string, headerPlies?: number, jacks?: number,
 *   kings?: number, sillPlies?: number, label?: string }} Opening
 * @typedef {{ id: string, length: number, stud?: "2x4"|"2x6", treatedPlate?: boolean,
 *   corner?: boolean, tees?: number[], tee?: { wall: string, at: number, end?: "start"|"end" }, openings?: Opening[], sheathed?: boolean, freeEnds?: 0|1|2, gable?: { pitch: number, peak?: number } }} Wall
 * @typedef {{ size: string, length: number, price: number, label?: string }} Stock
 * @typedef {{ studSpacing: number, studLength: number, kerf: number, topPlateLap: number,
 *   cornerExtraStuds: number, teeExtraStuds: number, defaultHeaderHeight: number,
 *   blocking?: { rows?: number, fire?: boolean, stagger?: boolean }, plateLaps?: boolean, advanced?: { twoStudCorners?: boolean, ladderTees?: boolean, singleTopPlate?: boolean }, stock: Stock[], walls: Wall[] }} Plan
 * @typedef {{ kind: string, x: number, y: number, w: number, h: number, size: string,
 *   length: number, orient: "v"|"h", label: string, sloped?: boolean }} Member
 */

/** A small invented house (a 40 x 28 ft ranch), for the page's example. Not a real plan. */
export function samplePlan() {
  const ft = (f, i = 0) => f * 12 + i;
  /** @type {Plan} */
  const plan = {
    studSpacing: 16,
    studLength: PRECUT["8ft"],
    kerf: 0.125,
    topPlateLap: 24,
    cornerExtraStuds: 2,
    teeExtraStuds: 2,
    defaultHeaderHeight: 82.5,
    stock: defaultStock(),
    walls: [
      {
        id: "Front", length: ft(40), stud: "2x4", treatedPlate: true, corner: true, tees: [ft(14), ft(26)],
        openings: [
          { kind: "door", label: "Entry", offset: ft(17), width: 38, height: 82.5, header: "2x10" },
          { kind: "window", label: "Living", offset: ft(4), width: 72, height: 60, header: "2x10", jacks: 2 },
          { kind: "window", label: "Bed 1", offset: ft(31), width: 36, height: 48, header: "2x10" },
        ],
      },
      {
        id: "Right", length: ft(28), stud: "2x4", treatedPlate: true, corner: true, tees: [ft(12)],
        openings: [{ kind: "window", label: "Bed 1 side", offset: ft(4), width: 36, height: 48, header: "2x10" }],
      },
      {
        id: "Back", length: ft(40), stud: "2x4", treatedPlate: true, corner: true, tees: [ft(14), ft(26)],
        openings: [
          { kind: "door", label: "Patio", offset: ft(6), width: 74, height: 82.5, header: "2x12", jacks: 2 },
          { kind: "window", label: "Kitchen", offset: ft(19), width: 48, height: 36, header: "2x10" },
          { kind: "window", label: "Bath", offset: ft(30), width: 24, height: 36, header: "2x10" },
        ],
      },
      {
        id: "Left", length: ft(28), stud: "2x4", treatedPlate: true, corner: true, tees: [ft(14)],
        openings: [{ kind: "window", label: "Bed 2", offset: ft(8), width: 36, height: 48, header: "2x10" }],
      },
      {
        id: "Hall", sheathed: false, length: ft(37), stud: "2x4", tees: [ft(11), ft(23)],
        openings: [
          { kind: "door", label: "Bed 1", offset: ft(3), width: 32, height: 82.5, header: "2x4", headerPlies: 2 },
          { kind: "door", label: "Bath", offset: ft(15), width: 30, height: 82.5, header: "2x4", headerPlies: 2 },
          { kind: "door", label: "Bed 2", offset: ft(28), width: 32, height: 82.5, header: "2x4", headerPlies: 2 },
        ],
      },
      { id: "Bed 1 / Bath", sheathed: false, length: ft(13, 3), stud: "2x4" },
      { id: "Bath / Bed 2", sheathed: false, length: ft(13, 3), stud: "2x4", openings: [{ kind: "door", label: "Closet", offset: 40, width: 50, height: 82.5, header: "2x4", headerPlies: 2 }] },
      { id: "Kitchen", sheathed: false, length: ft(12), stud: "2x4" },
    ],
  };
  return plan;
}

/**
 * Board lengths and prices used until the user types their own: 8 to 16 ft
 * in every size, plus the precut stud for the wall height. Price is 1 per
 * linear foot, so the default order minimises the length bought; type your
 * lumberyard's prices to minimise cost.
 * @param {number} studLength
 */
export function defaultStock(studLength = PRECUT["8ft"]) {
  /** @type {Stock[]} */
  const out = [];
  for (const size of ["2x4", "2x4 PT", "2x6", "2x6 PT", "2x8", "2x10", "2x12"]) {
    for (const f of [8, 10, 12, 14, 16]) out.push({ size, length: f * 12, price: f });
  }
  for (const size of ["2x4", "2x6"]) out.push({ size, length: studLength, price: Math.round((studLength / 12) * 100) / 100, label: "precut stud" });
  return out;
}

/** The example plan: `tools.mjs call wall-framing-takeoff takeoff --input` lays its object over this. */
export const DEFAULTS = samplePlan();

/**
 * Parse a length typed as feet and inches: `12' 6-1/2"`, `12ft 6in`, `150.5`, `150 1/2`, `12'`.
 * A bare number is inches. Returns NaN when it cannot read the text.
 * @param {string|number} text
 */
export function parseLength(text) {
  if (typeof text === "number") return text;
  let s = String(text).trim().toLowerCase().replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '"').replace(/″/g, '"').replace(/′/g, "'");
  if (!s) return NaN;
  let feet = 0;
  const fm = s.match(/^(\d+(?:\.\d+)?)\s*'/);
  if (fm) {
    feet = Number(fm[1]);
    s = s.slice(fm[0].length).trim().replace(/^-\s*/, "");
  }
  s = s.replace(/"$/, "").trim();
  if (!s) return fm ? feet * 12 : NaN;
  const m = s.match(/^(\d+)\/(\d+)$/) ? [s, undefined, ...s.split("/")] : s.match(/^(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return NaN;
  let inches = m[1] ? Number(m[1]) : 0;
  if (m[2]) {
    if (Number(m[3]) === 0) return NaN;
    inches += Number(m[2]) / Number(m[3]);
  }
  return feet * 12 + inches;
}

/** Format inches as feet-inches to the nearest 1/16: 150.5 -> 12' 6-1/2". */
export function formatLength(inches) {
  let sixteenths = Math.round(inches * 16);
  const neg = sixteenths < 0;
  sixteenths = Math.abs(sixteenths);
  const ft = Math.floor(sixteenths / 192);
  const rest = sixteenths - ft * 192;
  const whole = Math.floor(rest / 16);
  let num = rest - whole * 16;
  let den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? `${whole ? `${whole}-` : ""}${num}/${den}` : `${whole}`;
  return `${neg ? "-" : ""}${ft ? `${ft}' ` : ""}${frac}"`;
}

/** Format inches as a plain inch figure to the nearest 1/16: 92.625 -> 92-5/8". */
export function formatInches(inches) {
  const s = Math.round(inches * 16);
  const whole = Math.floor(s / 16);
  let num = s - whole * 16;
  let den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  if (!num) return `${whole}"`;
  return whole ? `${whole}-${num}/${den}"` : `${num}/${den}"`;
}

/**
 * Check a plan and list every problem in it, in words a framer would use.
 * @param {Plan} plan
 * @returns {string[]}
 */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || !Array.isArray(plan.walls) || !plan.walls.length) return ["Add at least one wall."];
  if (!(plan.studSpacing >= 8 && plan.studSpacing <= 48)) errors.push("Stud spacing must be between 8 and 48 inches.");
  if (!(plan.studLength >= 24 && plan.studLength <= 240)) errors.push("Stud length must be between 24 and 240 inches.");
  if (!(plan.kerf >= 0 && plan.kerf <= 0.5)) errors.push("Saw kerf must be between 0 and 1/2 inch.");
  if (!(plan.topPlateLap >= 0 && plan.topPlateLap <= 96)) errors.push("Top plate joint offset must be between 0 and 96 inches.");
  const sizes = new Set((plan.stock || []).filter((s) => s.length > 0 && s.price >= 0).map((s) => s.size));
  const ids = new Set();
  for (const wall of plan.walls) {
    const name = `Wall ${wall.id || "?"}`;
    if (!wall.id) errors.push("Every wall needs a name.");
    else if (ids.has(wall.id)) errors.push(`${name}: two walls have this name.`);
    ids.add(wall.id);
    if (!(wall.length >= 12)) { errors.push(`${name}: length must be at least 12 inches.`); continue; }
    const stud = wall.stud || "2x4";
    if (!(stud in DEPTH) || (stud !== "2x4" && stud !== "2x6")) errors.push(`${name}: studs must be 2x4 or 2x6.`);
    if (!sizes.has(plateSize(wall))) errors.push(`${name}: no ${plateSize(wall)} boards in the lumber list.`);
    if (!sizes.has(stud)) errors.push(`${name}: no ${stud} boards in the lumber list.`);
    for (const t of wall.tees || []) {
      if (!(t >= THICK && t <= wall.length - THICK)) errors.push(`${name}: a tee at ${formatLength(t)} is off the wall.`);
    }
    if (wall.tee) {
      const through = plan.walls.find((w) => w.id === wall.tee.wall);
      if (!through || through === wall) errors.push(`${name}: its tee lap names a wall that is not in the plan.`);
      else if (!(wall.tee.at >= THICK && wall.tee.at <= through.length - THICK)) errors.push(`${name}: its tee lap is off wall ${through.id}.`);
      if (wall.tee.end && wall.tee.end !== "start" && wall.tee.end !== "end") errors.push(`${name}: a tee lap end is "start" or "end".`);
    }
    if (wall.gable) {
      const g = wall.gable;
      if (!(g.pitch > 0 && g.pitch <= 24)) errors.push(`${name}: a gable pitch is the rise per 12 inches of run, more than 0 and at most 24.`);
      if (g.peak !== undefined && !(g.peak >= 2 * THICK + EPS && g.peak <= wall.length - 2 * THICK - EPS)) errors.push(`${name}: a gable peak is the distance from the wall start, clear of both end studs.`);
    }
    const ops = [...(wall.openings || [])].sort((a, b) => a.offset - b.offset);
    let prevEnd = -Infinity;
    let prevName = "";
    const vzones = framingZones(ops, wall.length);
    for (const [oi, op] of ops.entries()) {
      const on = `${name}, ${op.label || op.kind} at ${formatLength(op.offset)}`;
      if (!(op.width > 0)) { errors.push(`${on}: rough opening width must be more than zero.`); continue; }
      if (!(op.height > 0)) { errors.push(`${on}: rough opening height must be more than zero.`); continue; }
      const z = vzones[oi];
      if (z.start < THICK - EPS || z.end > wall.length - THICK + EPS) {
        errors.push(`${on}: the king studs run past the end studs. Move the opening at least ${formatInches(THICK * (z.jacks + 1))} from the wall end (its jacks must clear the end stud), or frame this end by hand.`);
      }
      if (z.start < prevEnd - EPS) errors.push(`${on}: its king studs overlap the ${prevName}, and the ${formatInches(op.offset - (ops[oi - 1].offset + ops[oi - 1].width))} between them is too narrow to share kings. Make them one wider opening, or move them at least ${formatInches(THICK * ((ops[oi - 1].jacks ?? 1) + (op.jacks ?? 1) + Math.max(ops[oi - 1].kings ?? 1, op.kings ?? 1)))} apart.`);
      prevEnd = z.end;
      prevName = op.label || op.kind;
      const g = openingGeometry(plan, wall, op);
      if (!(op.header in DEPTH)) errors.push(`${on}: header must be one of ${Object.keys(DEPTH).join(", ")}.`);
      else if (!sizes.has(op.header)) errors.push(`${on}: no ${op.header} boards in the lumber list.`);
      if (wall.gable && g.topCripple < -EPS) {
        // On a gable wall the header may rise into the triangle: it must clear the sloped plate at the end where the roof is lowest.
        const rise = gableRiseAt(wall);
        const hs = op.offset - THICK * (op.jacks ?? 1);
        const he = op.offset + op.width + THICK * (op.jacks ?? 1);
        const room = g.topCripple + Math.min(rise(hs), rise(he));
        if (room < -EPS) errors.push(`${on}: the header does not fit under the sloped top plate (${formatInches(-room)} too tall at its lower end). Lower the header height or use a shallower header.`);
      } else if (g.topCripple < -EPS) errors.push(`${on}: the header does not fit under the top plates (${formatInches(-g.topCripple)} too tall). Lower the header height or use a shallower header.`);
      if (op.kind === "window" && g.bottomCripple < -EPS) errors.push(`${on}: the window sill is below the bottom plate. Raise the header height or shorten the window.`);
      if (op.kind === "door" && g.roBottom > THICK + EPS) errors.push(`${on}: a door opening should reach the floor; check the header height and opening height.`);
    }
  }
  return errors;
}

/** Rise of a gable wall's roof line above the eave line at x inches from the wall start. */
function gableRiseAt(wall) {
  const L = wall.length;
  const mid = wall.gable.peak ?? L / 2;
  const slopeL = wall.gable.pitch / 12;
  const slopeR = (slopeL * mid) / (L - mid);
  return (x) => (x <= mid ? slopeL * x : slopeR * (L - x));
}

function plateSize(wall) {
  const stud = wall.stud || "2x4";
  return wall.treatedPlate ? `${stud} PT` : stud;
}

/** Extent of the kings and jacks around an opening, from the wall start. */
function framingZone(op) {
  const jacks = op.jacks ?? 1;
  const kings = op.kings ?? 1;
  const reach = THICK * (jacks + kings);
  return { start: op.offset - reach, end: op.offset + op.width + reach, reach, jacks, kings, leftKings: kings, rightKings: kings, sharedWith: null };
}

/**
 * Zones for a wall's openings in offset order. Two openings whose kings would
 * overlap share one set of kings between them when the gap fits both pairs of
 * jacks plus those kings (the larger of the two king counts): the shared kings
 * sit against the left opening's jacks, and the right opening has none on that
 * side. Closer than that, the zones stay overlapped and validatePlan says so.
 */
function framingZones(ops, length) {
  const zones = ops.map((op) => framingZone(op));
  // Near a wall end the end stud (or the corner's) does a king's work: drop the kings that do not fit, down to none,
  // as long as the jacks still clear the end stud.
  for (const [i, z] of zones.entries()) {
    const op = ops[i];
    const fit = (room) => Math.max(0, Math.floor((room - THICK * z.jacks + EPS) / THICK));
    if (z.start < THICK - EPS && op.offset - THICK >= THICK * z.jacks - EPS) {
      z.leftKings = Math.min(z.kings, fit(op.offset - THICK));
      z.start = op.offset - THICK * (z.jacks + z.leftKings);
      z.endStudKing = "start";
    }
    if (length !== undefined && z.end > length - THICK + EPS && length - THICK - (op.offset + op.width) >= THICK * z.jacks - EPS) {
      z.rightKings = Math.min(z.kings, fit(length - THICK - (op.offset + op.width)));
      z.end = op.offset + op.width + THICK * (z.jacks + z.rightKings);
      z.endStudKing = z.endStudKing ? "both" : "end";
    }
  }
  for (let i = 0; i + 1 < zones.length; i++) {
    const a = zones[i];
    const b = zones[i + 1];
    if (a.end <= b.start + EPS) continue;
    const gap = ops[i + 1].offset - (ops[i].offset + ops[i].width);
    const k = Math.max(a.kings, b.kings);
    if (gap < THICK * (a.jacks + b.jacks + k) - EPS) continue;
    a.rightKings = k;
    a.end = ops[i].offset + ops[i].width + THICK * (a.jacks + k);
    b.leftKings = 0;
    b.start = ops[i + 1].offset - THICK * b.jacks;
    a.sharedWith = ops[i + 1];
    b.sharedWith = ops[i];
    a.sharedGap = b.sharedGap = gap - THICK * (a.jacks + b.jacks + k);
  }
  return zones;
}

function openingGeometry(plan, wall, op) {
  const top = THICK + plan.studLength; // underside of the top plate, from the bottom of the bottom plate
  const headerHeight = op.headerHeight ?? plan.defaultHeaderHeight;
  const depth = DEPTH[op.header] ?? DEPTH["2x10"];
  const sillPlies = op.kind === "window" ? op.sillPlies ?? 1 : 0;
  const roBottom = headerHeight - op.height;
  return {
    headerHeight,
    depth,
    sillPlies,
    roBottom,
    jack: headerHeight - THICK,
    topCripple: top - headerHeight - depth,
    bottomCripple: roBottom - sillPlies * THICK - THICK,
  };
}

/**
 * Lay out every member in one wall: plates, studs, kings, jacks, headers,
 * sills and cripples, with positions from the wall start.
 * @param {Plan} plan
 * @param {Wall} wall
 */
export function layoutWall(plan, wall) {
  if (wall.gable) return layoutGable(plan, wall);
  const L = wall.length;
  const stud = wall.stud || "2x4";
  const s = plan.studSpacing;
  const top = THICK + plan.studLength;
  const single = Boolean(plan.advanced?.singleTopPlate);
  const height = top + (single ? 1 : 2) * THICK;
  /** @type {Member[]} */
  const members = [];
  const notes = [];
  const spacers = [];
  const shortCripples = [];
  const shimGaps = [];
  const add = (kind, x, y, w, h, size, orient, label) =>
    members.push({ kind, x, y, w, h, size, length: orient === "v" ? h : w, orient, label });

  // Layout positions: left edges of the end studs and of a stud centred on every multiple of the spacing.
  const layout = [0];
  for (let k = 1; k * s + THICK / 2 <= L - THICK - EPS; k++) {
    const x = k * s - THICK / 2;
    if (x + THICK <= L - THICK + EPS) layout.push(x);
  }
  if (L - THICK > layout[layout.length - 1] + EPS) layout.push(L - THICK);

  const ops = [...(wall.openings || [])].sort((a, b) => a.offset - b.offset);
  const zones = framingZones(ops, wall.length).map((z, i) => ({ op: ops[i], ...z, g: openingGeometry(plan, wall, ops[i]) }));
  for (const z of zones) if (z.sharedWith && z.sharedWith.offset > z.op.offset) notes.push(`${z.op.label || z.op.kind} and ${z.sharedWith.label || z.sharedWith.kind} are ${formatInches(z.sharedWith.offset - (z.op.offset + z.op.width))} apart: they share ${z.rightKings} king stud${z.rightKings > 1 ? "s" : ""}${z.sharedGap > EPS ? ` (${formatInches(z.sharedGap)} left open beside the second opening's jack: block it)` : ""}.`);
  for (const z of zones) if (z.endStudKing) notes.push(`${z.op.label || z.op.kind} is close to the wall end: the end stud serves as its king${z.endStudKing === "both" ? " on both sides" : ""}${z.leftKings < z.kings && z.endStudKing !== "end" ? `, ${z.leftKings} of ${z.kings} extra king${z.kings > 1 ? "s" : ""} on the left` : ""}.`);
  const overlaps = (x, a, b) => x < b - EPS && x + THICK > a + EPS;
  const inside = (x, a, b) => x >= a - EPS && x + THICK <= b + EPS;

  const fullStudX = [];
  for (const x of layout) {
    const z = zones.find((zz) => overlaps(x, zz.start, zz.end));
    if (!z) {
      fullStudX.push(x);
      add("stud", x, THICK, THICK, plan.studLength, stud, "v", x === 0 || x === L - THICK ? "end stud" : "stud");
    }
  }
  for (const z of zones) {
    const { op, g } = z;
    const name = op.label || op.kind;
    const hStart = op.offset - THICK * z.jacks;
    const hEnd = op.offset + op.width + THICK * z.jacks;
    const kingLabel = z.sharedWith && z.sharedWith.offset > op.offset ? `shared king, ${name} and ${z.sharedWith.label || z.sharedWith.kind}` : `king, ${name}`;
    for (let i = 0; i < z.leftKings; i++) {
      const xl = z.start + i * THICK;
      fullStudX.push(xl);
      add("king", xl, THICK, THICK, plan.studLength, stud, "v", `king, ${name}`);
    }
    for (let i = 0; i < z.rightKings; i++) {
      const xr = z.end - (i + 1) * THICK;
      fullStudX.push(xr);
      add("king", xr, THICK, THICK, plan.studLength, stud, "v", kingLabel);
    }
    for (let i = 0; i < z.jacks; i++) {
      add("jack", hStart + i * THICK, THICK, THICK, g.jack, stud, "v", `jack, ${name}`);
      add("jack", hEnd - (i + 1) * THICK, THICK, THICK, g.jack, stud, "v", `jack, ${name}`);
    }
    const plies = op.headerPlies ?? (stud === "2x6" ? 3 : 2);
    for (let i = 0; i < plies; i++) add("header", hStart, g.headerHeight, hEnd - hStart, g.depth, op.header, "h", `header ply, ${name}`);
    if (plies * THICK < DEPTH[stud] - EPS && DEPTH[op.header] > DEPTH["2x4"]) spacers.push(`${name} (${formatInches(DEPTH[stud] - plies * THICK)})`);
    if (g.topCripple > 0.5) {
      for (const x of layout) if (inside(x, hStart, hEnd)) add("cripple", x, g.headerHeight + g.depth, THICK, g.topCripple, stud, "v", `top cripple, ${name}`);
      const room = g.topCripple + g.depth;
      const deeper = Object.entries(DEPTH).filter(([, d]) => d > g.depth && d <= room + EPS).pop();
      if (g.topCripple < 6 && deeper) shortCripples.push(`${name} (${formatInches(g.topCripple)}; a ${deeper[0]} header would leave ${formatInches(room - deeper[1])})`);
    } else if (g.topCripple > EPS) {
      shimGaps.push(`${name} (${formatInches(g.topCripple)})`);
    }
    if (op.kind === "window") {
      for (let i = 0; i < g.sillPlies; i++) add("sill", op.offset, g.roBottom - (i + 1) * THICK, op.width, THICK, stud, "h", `rough sill, ${name}`);
      if (g.bottomCripple > 0.5) {
        const xs = [op.offset, op.offset + op.width - THICK];
        for (const x of layout) {
          if (inside(x, op.offset, op.offset + op.width) && !xs.some((e) => overlaps(x, e, e + THICK))) xs.push(x);
        }
        for (const x of xs.sort((a, b) => a - b)) add("cripple", x, THICK, THICK, g.bottomCripple, stud, "v", `bottom cripple, ${name}`);
      }
    }
  }
  // Corner and tee backing: extra full studs, each nudged to the nearest spot clear of the studs already placed.
  const backing = (target, kind, label) => {
    const clear = (x) =>
      x >= -EPS && x + THICK <= L + EPS &&
      !members.some((m) => m.kind !== "plate" && overlaps(x, m.x, m.x + m.w)) &&
      !zones.some((z) => overlaps(x, z.start, z.end));
    for (let d = 0; d <= 48 * 16; d++) {
      for (const x of d ? [target + d / 16, target - d / 16] : [target]) {
        if (clear(x)) {
          add(kind, x, THICK, THICK, plan.studLength, stud, "v", label);
          fullStudX.push(x);
          return;
        }
      }
    }
    notes.push(`No room for ${label} near ${formatLength(target)}; add it by hand.`);
  };
  const adv = plan.advanced || {};
  const cornerBacking = adv.twoStudCorners ? Math.min(1, plan.cornerExtraStuds) : plan.cornerExtraStuds;
  if (wall.corner) for (let i = 0; i < cornerBacking; i++) backing(THICK * (i + 1), "corner", "corner backing");
  /** Ladder blocking at tees: [x0, x1] gaps between the full-height studs either side of the tee. */
  const ladders = [];
  for (const t of wall.tees || []) {
    if (adv.ladderTees) {
      const tall = members.filter((m) => m.orient === "v" && Math.abs(m.y - THICK) < EPS && Math.abs(m.h - plan.studLength) < EPS);
      // by centre, so a stud the tee lands on (centred on it, as on a 16 or 24 in layout mark) bounds the ladder instead of sitting inside it
      const left = tall.filter((m) => m.x + THICK / 2 <= t + EPS).sort((a, b) => b.x - a.x)[0];
      const right = tall.filter((m) => m.x + THICK / 2 > t + EPS).sort((a, b) => a.x - b.x)[0];
      if (left && right) {
        const x0 = left.x + THICK;
        const x1 = right.x;
        if (x1 - x0 >= 1 - EPS && x1 - x0 <= plan.studSpacing + EPS && !ops.some((op) => x0 < op.offset + op.width - EPS && x1 > op.offset + EPS)) {
          ladders.push([x0, x1, t]);
          continue;
        }
      }
      notes.push(`Ladder blocking at ${formatLength(t)} does not fit between studs; standard tee backing used.`);
    }
    for (let i = 0; i < plan.teeExtraStuds; i++) backing(t - (plan.teeExtraStuds * THICK) / 2 + i * THICK, "tee", `tee backing at ${formatLength(t)}`);
  }

  // Plates. Joints sit on the centre of a full-length stud.
  const centres = [...new Set(fullStudX.map((x) => Math.round((x + THICK / 2) * 16) / 16))].sort((a, b) => a - b);
  const pSize = plateSize(wall);
  const gaps = ops.filter((o) => o.kind === "door").map((o) => [o.offset, o.offset + o.width]);
  let at = 0;
  const bottomSegs = [];
  for (const [a, b] of gaps) {
    if (a > at + EPS) bottomSegs.push([at, a]);
    at = b;
  }
  if (L > at + EPS) bottomSegs.push([at, L]);
  const stockFor = (size) => (plan.stock || []).filter((st) => st.size === size && st.length > 0 && !st.label);
  const bottomJoints = [];
  for (const [a, b] of bottomSegs) {
    const cut = splitPlate(a, b, centres, stockFor(pSize), []);
    if (!cut) notes.push(`Bottom plate ${formatLength(a)} to ${formatLength(b)}: no way to splice it over studs with the boards listed; it is shown as one piece.`);
    const joints = cut || [];
    bottomJoints.push(...joints);
    let p = a;
    for (const j of [...joints, b]) {
      add("plate", p, 0, j - p, THICK, pSize, "h", "bottom plate");
      p = j;
    }
  }
  const studStock = stockFor(stud);
  const lap = plateLaps(plan, wall);
  const [topA, topB] = [lap.topStart, L + lap.topEnd];
  const [capA, capB] = [lap.capStart, L + lap.capEnd];
  const topJoints = splitPlate(topA, topB, centres, studStock, []);
  // The cap plate is cut where a partition's cap plate runs over this wall (tee laps); each run is spliced on its own.
  const capSegs = [];
  let capAt = capA;
  for (const [lo, hi] of [...lap.capGaps].sort((x, y) => x[0] - y[0])) {
    if (lo > capAt + EPS) capSegs.push([capAt, lo]);
    capAt = Math.max(capAt, hi);
  }
  if (capB > capAt + EPS) capSegs.push([capAt, capB]);
  const forbidden = topJoints ? topJoints.map((j) => [j - plan.topPlateLap, j + plan.topPlateLap]) : [];
  const capRuns = topJoints ? capSegs.map(([a, b]) => splitPlate(a, b, centres, studStock, forbidden)) : [null];
  const capJoints = capRuns.every(Boolean) ? capRuns.flat() : null;
  if (!topJoints || !capJoints) notes.push(`Top plates: no way to splice them over studs with joints ${formatInches(plan.topPlateLap)} apart using the boards listed; shown as one piece each.`);
  const pieces = (a, b, joints) => {
    const out = [];
    let p = a;
    for (const j of [...joints, b]) {
      out.push([p, j]);
      p = j;
    }
    return out;
  };
  const topPieces = pieces(topA, topB, topJoints || []);
  const capPieces = capJoints ? capSegs.flatMap(([a, b], k) => pieces(a, b, capRuns[k])) : capSegs.map(([a, b]) => [a, b]);
  /** @type {[string, number, number[][]][]} */
  const plateRuns = single ? [["top plate", top, topPieces]] : [["top plate", top, topPieces], ["cap plate", top + THICK, capPieces]];
  // A single top plate has nothing lapping its joints, so each joint, corner and tee takes a steel tie instead (IRC R602.3.2 exception).
  const ties = single ? (topJoints || []).length + (wall.corner ? 1 : 0) + (wall.tees || []).length : 0;
  if (single) notes.push(`single top plate: roof or floor framing must sit within 1 in of the stud centres, and ${ties} steel plate tie${ties === 1 ? "" : "s"} (not in the takeoff) go at ${[...(topJoints || []).map(formatLength), ...(wall.corner ? ["the corner"] : []), ...(wall.tees || []).map((t) => `the tee at ${formatLength(t)}`)].join(", ") || "no joints"}. Whether this is allowed here is the code and engineer's call.`);
  for (const [label, y, list] of plateRuns) {
    for (const [a, b] of list) add("plate", a, y, b - a, THICK, stud, "h", label);
  }
  // Ladder blocking at tees: flat 2x between the studs either side of the tee, 24 in apart, for the partition to nail to.
  for (const [x0, x1, t] of ladders) {
    for (let y = THICK + 24 - THICK / 2; y + THICK / 2 < THICK + plan.studLength - EPS; y += 24) {
      add("blocking", x0, y, x1 - x0, THICK, stud, "h", `ladder blocking at ${formatLength(t)}`);
    }
  }
  // Blocking: flat 2x between neighbouring full-height studs at evenly spaced heights, never across an opening.
  const rows = blockingRows(plan);
  if (rows > 0) {
    const tall = members
      .filter((m) => m.orient === "v" && Math.abs(m.y - THICK) < EPS && Math.abs(m.h - plan.studLength) < EPS)
      .sort((a, b) => a.x - b.x);
    for (let r = 1; r <= rows; r++) {
      const y = THICK + (plan.studLength * r) / (rows + 1) - THICK / 2;
      for (let i = 0; i + 1 < tall.length; i++) {
        const x0 = tall[i].x + THICK;
        const x1 = tall[i + 1].x;
        if (x1 - x0 < 1 - EPS) continue;
        if (ops.some((op) => x0 < op.offset + op.width - EPS && x1 > op.offset + EPS)) continue;
        // Staggered: alternate bays sit THICK above and below the row line, so each block's end can be face-nailed through the stud.
        const dy = plan.blocking?.stagger ? (i % 2 ? THICK : -THICK) : 0;
        add("blocking", x0, y + dy, x1 - x0, THICK, stud, "h", plan.blocking?.fire ? "fire blocking" : "blocking");
      }
    }
  } else if (plan.studLength > 120 + EPS) {
    notes.push(`the studs are ${formatInches(plan.studLength)}: fire blocking is needed at most 10 ft apart (set blocking.fire).`);
  }
  if (shortCripples.length) notes.push(`short top cripples over ${shortCripples.join(", ")}. Header sizes are yours to check.`);
  if (shimGaps.length) notes.push(`a gap too small for cripples between header and top plate over ${shimGaps.join(", ")}: shim or fill it.`);
  if (spacers.length) notes.push(`header spacers not in the takeoff: ${spacers.join(", ")}.`);
  return { id: wall.id, length: L, height, stud, members, notes, layout, lapped: !!plan.plateLaps, ...(single ? { singleTopPlate: true, plateTies: ties } : {}), joints: { bottom: bottomJoints, top: topJoints || [], cap: single ? [] : capJoints || [] } };
}


/**
 * A gable (rake) end wall: level bottom plate, studs cut to a sloped top
 * plate that rises from both wall ends (the eaves, where the studs are
 * plan.studLength) to a peak, in the middle unless wall.gable.peak (inches from
 * the wall start) says otherwise. wall.gable.pitch is the rise per 12 inches of
 * run on the start side; an off-centre peak keeps both eaves level, so the far
 * side's pitch is whatever reaches the same peak height. Stud lengths are the long point of the angled cut; plate lengths are
 * along the slope, with joints over studs. Openings are framed as in a level
 * wall (header under the eave-line top plate; kings and cripples run up to the
 * slope). No blocking.
 * @param {Plan} plan
 * @param {Wall} wall
 */
function layoutGable(plan, wall) {
  const L = wall.length;
  const stud = wall.stud || "2x4";
  const s = plan.studSpacing;
  const mid = wall.gable.peak ?? L / 2;
  const slopeL = wall.gable.pitch / 12;
  const slopeR = (slopeL * mid) / (L - mid);
  const secL = Math.sqrt(1 + slopeL * slopeL);
  const secR = Math.sqrt(1 + slopeR * slopeR);
  const rise = (x) => (x <= mid ? slopeL * x : slopeR * (L - x));
  const base = THICK + plan.studLength; // underside of the top plate at the eaves
  const maxRise = rise(mid);
  /** @type {Member[]} */
  const members = [];
  const notes = ["gable wall: stud lengths are the long point of the angled cut, plates are measured along the slope, and the plate ends at the peak are mitred by hand."];
  const add = (kind, x, y, w, h, size, orient, label, length) =>
    members.push({ kind, x, y, w, h, size, length: length ?? (orient === "v" ? h : w), orient, label, ...(orient === "h" && kind === "plate" && label !== "bottom plate" ? { sloped: true } : {}) });
  const layout = [0];
  for (let k = 1; k * s + THICK / 2 <= L - THICK - EPS; k++) {
    const x = k * s - THICK / 2;
    if (x + THICK <= L - THICK + EPS) layout.push(x);
  }
  if (L - THICK > layout[layout.length - 1] + EPS) layout.push(L - THICK);
  const studAt = (x, kind, label) => {
    // A stud straddling the peak reaches the peak itself, higher than either of its edges.
    const len = plan.studLength + Math.max(rise(x), rise(x + THICK), x < mid && x + THICK > mid ? maxRise : 0);
    add(kind, x, THICK, THICK, len, stud, "v", label);
  };
  const overlaps = (x, a, b) => x < b - EPS && x + THICK > a + EPS;
  const inside = (x, a, b) => x >= a - EPS && x + THICK <= b + EPS;
  const ops = [...(wall.openings || [])].sort((a, b) => a.offset - b.offset);
  const zones = framingZones(ops, wall.length).map((z, i) => ({ op: ops[i], ...z, g: openingGeometry(plan, wall, ops[i]) }));
  for (const z of zones) if (z.sharedWith && z.sharedWith.offset > z.op.offset) notes.push(`${z.op.label || z.op.kind} and ${z.sharedWith.label || z.sharedWith.kind} are ${formatInches(z.sharedWith.offset - (z.op.offset + z.op.width))} apart: they share ${z.rightKings} king stud${z.rightKings > 1 ? "s" : ""}${z.sharedGap > EPS ? ` (${formatInches(z.sharedGap)} left open beside the second opening's jack: block it)` : ""}.`);
  const fullStudX = [];
  for (const x of layout) {
    if (zones.some((zz) => overlaps(x, zz.start, zz.end))) continue;
    fullStudX.push(x);
    studAt(x, "stud", x === 0 || x === L - THICK ? "end stud" : "stud");
  }
  const spacers = [];
  const shimGaps = [];
  for (const z of zones) {
    const { op, g } = z;
    const name = op.label || op.kind;
    const hStart = op.offset - THICK * z.jacks;
    const hEnd = op.offset + op.width + THICK * z.jacks;
    const kingLabel = z.sharedWith && z.sharedWith.offset > op.offset ? `shared king, ${name} and ${z.sharedWith.label || z.sharedWith.kind}` : `king, ${name}`;
    for (let i = 0; i < z.leftKings; i++) {
      const xl = z.start + i * THICK;
      fullStudX.push(xl);
      studAt(xl, "king", `king, ${name}`);
    }
    for (let i = 0; i < z.rightKings; i++) {
      const xr = z.end - (i + 1) * THICK;
      fullStudX.push(xr);
      studAt(xr, "king", kingLabel);
    }
    for (let i = 0; i < z.jacks; i++) {
      add("jack", hStart + i * THICK, THICK, THICK, g.jack, stud, "v", `jack, ${name}`);
      add("jack", hEnd - (i + 1) * THICK, THICK, THICK, g.jack, stud, "v", `jack, ${name}`);
    }
    const plies = op.headerPlies ?? (stud === "2x6" ? 3 : 2);
    for (let i = 0; i < plies; i++) add("header", hStart, g.headerHeight, hEnd - hStart, g.depth, op.header, "h", `header ply, ${name}`);
    if (plies * THICK < DEPTH[stud] - EPS && DEPTH[op.header] > DEPTH["2x4"]) spacers.push(`${name} (${formatInches(DEPTH[stud] - plies * THICK)})`);
    // Each cripple runs to the long point of the sloped plate above it; a header that rises above the
    // eave line gets cripples only where the roof has climbed clear of it (and none if it never does).
    const crippleXs = layout.filter((x) => inside(x, hStart, hEnd));
    const lens = crippleXs.map((x) => g.topCripple + Math.max(rise(x), rise(x + THICK)));
    const tall = lens.filter((l) => l > 0.5);
    if (tall.length) {
      crippleXs.forEach((x, i) => { if (lens[i] > 0.5) add("cripple", x, g.headerHeight + g.depth, THICK, lens[i], stud, "v", `top cripple, ${name}`); });
      if (lens.some((l) => l > EPS && l <= 0.5)) shimGaps.push(`${name} (${formatInches(Math.min(...lens.filter((l) => l > EPS && l <= 0.5)))})`);
    } else if (lens.some((l) => l > EPS)) {
      shimGaps.push(`${name} (${formatInches(Math.max(...lens))})`);
    }
    if (g.topCripple < -EPS) notes.push(`${name}: the header tops out ${formatInches(-g.topCripple)} above the eave line, in the triangle; check its size for the roof load above it.`);
    if (op.kind === "window") {
      for (let i = 0; i < g.sillPlies; i++) add("sill", op.offset, g.roBottom - (i + 1) * THICK, op.width, THICK, stud, "h", `rough sill, ${name}`);
      if (g.bottomCripple > 0.5) {
        const xs = [op.offset, op.offset + op.width - THICK];
        for (const x of layout) {
          if (inside(x, op.offset, op.offset + op.width) && !xs.some((e) => overlaps(x, e, e + THICK))) xs.push(x);
        }
        for (const x of xs.sort((a, b) => a - b)) add("cripple", x, THICK, THICK, g.bottomCripple, stud, "v", `bottom cripple, ${name}`);
      }
    }
  }
  const backing = (target, kind, label) => {
    const clear = (x) => x >= -EPS && x + THICK <= L + EPS && !members.some((m) => m.orient === "v" && overlaps(x, m.x, m.x + m.w)) && !zones.some((z) => overlaps(x, z.start, z.end));
    for (let d = 0; d <= 48 * 16; d++) {
      for (const x of d ? [target + d / 16, target - d / 16] : [target]) {
        if (clear(x)) { fullStudX.push(x); return studAt(x, kind, label); }
      }
    }
    notes.push(`No room for ${label} near ${formatLength(target)}; add it by hand.`);
  };
  if (wall.corner) for (let i = 0; i < plan.cornerExtraStuds; i++) backing(THICK * (i + 1), "corner", "corner backing");
  for (const t of wall.tees || []) {
    for (let i = 0; i < plan.teeExtraStuds; i++) backing(t - (plan.teeExtraStuds * THICK) / 2 + i * THICK, "tee", `tee backing at ${formatLength(t)}`);
  }
  const centres = [...new Set(fullStudX.map((x) => Math.round((x + THICK / 2) * 16) / 16))].sort((a, b) => a - b);
  const pSize = plateSize(wall);
  const stockFor = (size) => (plan.stock || []).filter((st) => st.size === size && st.length > 0 && !st.label);
  // The bottom plate is cut out across each door.
  const bottomSegs = [];
  let segAt = 0;
  for (const o of ops.filter((o) => o.kind === "door")) {
    if (o.offset > segAt + EPS) bottomSegs.push([segAt, o.offset]);
    segAt = o.offset + o.width;
  }
  if (L > segAt + EPS) bottomSegs.push([segAt, L]);
  const bottomJoints = [];
  for (const [a, b] of bottomSegs) {
    const cut = splitPlate(a, b, centres, stockFor(pSize), []);
    if (!cut) notes.push(`Bottom plate ${formatLength(a)} to ${formatLength(b)}: no way to splice it over studs with the boards listed; shown as one piece.`);
    bottomJoints.push(...(cut || []));
    let p = a;
    for (const j of [...(cut || []), b]) {
      add("plate", p, 0, j - p, THICK, pSize, "h", "bottom plate");
      p = j;
    }
  }
  // Sloped plates: a board of length B covers B / sec of run, so split with the stock shortened to match.
  const flatL = stockFor(stud).map((st) => ({ ...st, length: st.length / secL }));
  const flatR = stockFor(stud).map((st) => ({ ...st, length: st.length / secR }));
  const side = (a, b, flat) => ({ a, b, flat });
  const topJoints = [];
  const capJoints = [];
  const forbidden = [];
  for (const { a, b, flat } of [side(0, mid, flatL), side(mid, L, flatR)]) {
    const j = splitPlate(a, b, centres, flat, []);
    if (!j) { notes.push("Top plate: no way to splice it over studs with the boards listed; shown as one piece per slope."); continue; }
    topJoints.push(...j);
    forbidden.push(...j.map((x) => [x - plan.topPlateLap, x + plan.topPlateLap]));
  }
  for (const { a, b, flat } of [side(0, mid, flatL), side(mid, L, flatR)]) {
    const j = splitPlate(a, b, centres, flat, forbidden);
    if (!j) { notes.push(`Cap plate: no way to splice it over studs with joints ${formatInches(plan.topPlateLap)} from the top plate's; shown as one piece per slope.`); continue; }
    capJoints.push(...j);
  }
  const vtL = THICK * secL; // vertical thickness of a plate lying on the slope
  const vtR = THICK * secR;
  for (const [label, offL, offR, joints] of /** @type {[string, number, number, number[]][]} */ ([["top plate", 0, 0, topJoints], ["cap plate", vtL, vtR, capJoints]])) {
    for (const [a, b, sec, vt, off] of [[0, mid, secL, vtL, offL], [mid, L, secR, vtR, offR]]) {
      const js = joints.filter((x) => x > a + EPS && x < b - EPS).sort((x, y) => x - y);
      let q = a;
      for (const j of [...js, b]) {
        const lo = Math.min(rise(q), rise(j));
        const hi = Math.max(rise(q), rise(j));
        add("plate", q, base + lo + off, j - q, hi - lo + vt, stud, "h", label, (j - q) * sec);
        q = j;
      }
    }
  }
  if (shimGaps.length) notes.push(`a gap too small for cripples between header and top plate over ${shimGaps.join(", ")}: shim or fill it.`);
  if (spacers.length) notes.push(`header spacers not in the takeoff: ${spacers.join(", ")}.`);
  return { id: wall.id, length: L, height: base + maxRise + 2 * Math.max(vtL, vtR), stud, members, notes, layout, lapped: false, gable: { pitch: wall.gable.pitch, peak: mid, peakRise: maxRise, eave: base, ...(mid !== L / 2 ? { farPitch: slopeR * 12 } : {}) }, joints: { bottom: bottomJoints, top: topJoints, cap: capJoints } };
}

function wall_studMin(w) {
  return Math.min(...w.members.filter((m) => m.orient === "v").map((m) => m.h));
}

/** Rows of blocking: the asked-for count, or what fire blocking needs so no stud run exceeds 10 ft. */
export function blockingRows(plan) {
  const b = plan.blocking || {};
  // a staggered row can sit THICK off its line either way, so a run can grow by 2 * THICK
  const fire = b.fire ? Math.max(0, Math.ceil((plan.studLength + 2 * THICK + (b.stagger ? 2 * THICK : 0)) / 120 - EPS) - 1) : 0;
  return Math.max(Math.floor(b.rows || 0), fire);
}

/**
 * Corner plate laps (plan.plateLaps). The walls are read as a closed loop in
 * the order listed: a wall with `corner: true` meets the end of the wall
 * before it (the first wall meets the last). At each such corner the top plate
 * of the earlier wall runs through, past its end by the later wall's depth,
 * and the later wall's top plate stops short of its start by the earlier
 * wall's depth; the cap plate laps the other way. Lengths shift, totals do not.
 * A wall with `tee: {wall, at, end}` is a partition whose `end` ("start" or "end") butts the face of
 * wall `wall` at offset `at` along it: its cap plate runs over the through wall by that wall's depth,
 * and the through wall's cap plate is cut for the partition's depth (the cap total grows by the
 * through wall's depth minus the partition's depth).
 * Offsets are signed inches from the wall's start and end (end offsets are
 * added to the wall length).
 */
export function plateLaps(plan, wall) {
  const none = { topStart: 0, topEnd: 0, capStart: 0, capEnd: 0, capGaps: [] };
  const walls = plan.walls || [];
  const i = walls.indexOf(wall);
  if (!plan.plateLaps || i < 0 || walls.length < 2) return none;
  const depthOf = (w) => DEPTH[w.stud || "2x4"] ?? 3.5;
  const prev = walls[(i - 1 + walls.length) % walls.length];
  const next = walls[(i + 1) % walls.length];
  const lap = { ...none };
  if (wall.corner) {
    lap.topStart = depthOf(prev);
    lap.capStart = -depthOf(prev);
  }
  if (next.corner) {
    lap.topEnd = depthOf(next);
    lap.capEnd = -depthOf(next);
  }
  // Tee laps: a partition (wall.tee) butts the face of a through wall; its cap plate runs over the
  // through wall's top plate by that wall's depth, and the through wall's cap plate is cut for it.
  if (wall.tee) {
    const through = walls.find((w) => w.id === wall.tee.wall);
    if (through) lap[wall.tee.end === "start" ? "capStart" : "capEnd"] = (wall.tee.end === "start" ? -1 : 1) * depthOf(through);
  }
  for (const w of walls) {
    if (w !== wall && w.tee && w.tee.wall === wall.id) lap.capGaps.push([w.tee.at - depthOf(w) / 2, w.tee.at + depthOf(w) / 2]);
  }
  return lap;
}

/**
 * Choose splice points for a plate from a to b at stud centres so every
 * piece fits a board, minimising the price of buying each piece on its own
 * board and then the number of pieces. Joints inside a forbidden interval
 * are not allowed. Returns the joint positions, or null when no split works.
 */
function splitPlate(a, b, centres, stock, forbidden) {
  if (!stock.length) return null;
  const fits = (len) => {
    let best = Infinity;
    for (const st of stock) if (st.length + EPS >= len) best = Math.min(best, st.price);
    return best;
  };
  if (Number.isFinite(fits(b - a))) return [];
  const pts = [a, ...centres.filter((c) => c > a + EPS && c < b - EPS && !forbidden.some(([lo, hi]) => c > lo + EPS && c < hi - EPS)), b];
  const n = pts.length;
  const cost = new Array(n).fill(Infinity);
  const pieces = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  cost[0] = 0;
  pieces[0] = 0;
  for (let j = 1; j < n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const len = pts[j] - pts[i];
      const c = fits(len);
      if (!Number.isFinite(c)) {
        if (len > Math.max(...stock.map((st) => st.length)) + EPS) break;
        continue;
      }
      const tc = cost[i] + c;
      const tp = pieces[i] + 1;
      if (tc < cost[j] - 1e-9 || (Math.abs(tc - cost[j]) <= 1e-9 && tp < pieces[j])) {
        cost[j] = tc;
        pieces[j] = tp;
        prev[j] = i;
      }
    }
  }
  if (!Number.isFinite(cost[n - 1])) return null;
  const joints = [];
  for (let j = prev[n - 1]; j > 0; j = prev[j]) joints.push(pts[j]);
  return joints.reverse();
}

/**
 * Check a laid-out wall the way a framer would eyeball it: every member
 * inside the wall, no two members in the same space, every rough opening
 * clear, every opening with a header over it and a stud at each end of the
 * wall. Returns a list of problems (empty when the layout is sound).
 * @param {ReturnType<typeof layoutWall>} w
 * @param {Wall} wall
 */
export function verifyWall(/** @type {any} */ w, wall) {
  const problems = [];
  const ms = w.members;
  for (const m of ms) {
    const lapOK = m.kind === "plate" && w.lapped; // laid-out plates may pass the wall ends at a lapped corner
    if ((!lapOK && (m.x < -EPS || m.x + m.w > w.length + EPS)) || m.y < -EPS || m.y + m.h > w.height + EPS) problems.push(`${m.label} at ${formatLength(m.x)} leaves the wall`);
    if (!(m.length > 0)) problems.push(`${m.label} at ${formatLength(m.x)} has no length`);
  }
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i];
      const b = ms[j];
      if (a.kind === "header" && b.kind === "header") continue; // plies stack through the wall's depth
      if (a.kind === "plate" && b.kind === "plate" && a.label !== b.label) continue;
      if (a.sloped || b.sloped) continue; // a sloped plate's box overlaps the studs it sits on
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1e-6 && oy > 1e-6) problems.push(`${a.label} at ${formatLength(a.x)} overlaps ${b.label} at ${formatLength(b.x)}`);
    }
  }
  for (const op of wall.openings || []) {
    const name = op.label || op.kind;
    const x0 = op.offset;
    const x1 = op.offset + op.width;
    const top = ms.find((m) => m.kind === "header" && m.label.endsWith(`, ${name}`));
    if (!top) { problems.push(`${name} has no header`); continue; }
    const y1 = top.y;
    const y0 = y1 - op.height;
    for (const m of ms) {
      if (m.sloped) continue; // a sloped plate's box spans the triangle, and its underside clearing the header is checked when the plan is validated
      const ox = Math.min(m.x + m.w, x1) - Math.max(m.x, x0);
      const oy = Math.min(m.y + m.h, y1) - Math.max(m.y, Math.max(y0, op.kind === "door" ? 0 : y0));
      if (ox > 1e-6 && oy > 1e-6) problems.push(`${m.label} at ${formatLength(m.x)} sits in the ${name} opening`);
    }
    if (top.x > x0 + EPS || top.x + top.w < x1 - EPS) problems.push(`the ${name} header does not span its opening`);
  }
  const full = ms.filter((m) => m.orient === "v" && Math.abs(m.y - THICK) < EPS && (w.gable ? m.h >= wall_studMin(w) - EPS : Math.abs(m.y + m.h - (w.height - (w.singleTopPlate ? 1 : 2) * THICK)) < EPS));
  if (!full.some((m) => m.x < EPS)) problems.push("no stud at the wall start");
  if (!full.some((m) => m.x + m.w > w.length - EPS)) problems.push("no stud at the wall end");
  const centres = full.map((m) => m.x + THICK / 2);
  for (const [k, list] of Object.entries(w.joints)) {
    for (const j of list) if (!centres.some((c) => Math.abs(c - j) < 1 / 32)) problems.push(`${k} plate joint at ${formatLength(j)} is not over a full stud`);
  }
  return problems;
}

/**
 * Collect every piece to cut from a laid-out house, grouped by lumber size
 * and length (to 1/16 in).
 * @param {ReturnType<typeof layoutWall>[]} walls
 */
export function cutList(walls) {
  const map = new Map();
  for (const w of walls) {
    for (const m of w.members) {
      const len = Math.round(m.length * 16) / 16;
      const kind = m.kind === "plate" ? m.label : m.kind;
      const key = `${m.size}|${len}|${kind}`;
      const row = map.get(key) || { size: m.size, length: len, kind, qty: 0, walls: new Set() };
      row.qty++;
      row.walls.add(w.id);
      map.set(key, row);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, walls: [...r.walls] }))
    .sort((a, b) => a.size.localeCompare(b.size) || b.length - a.length || a.kind.localeCompare(b.kind));
}

/** Add extra pieces to a cut list, joining rows of the same size, length and kind. */
export function mergeCuts(cuts, extra) {
  const map = new Map(cuts.map((c) => [`${c.size}|${c.length}|${c.kind}`, { ...c, walls: [...c.walls] }]));
  for (const e of extra) {
    const key = `${e.size}|${e.length}|${e.kind}`;
    const row = map.get(key) || { size: e.size, length: e.length, kind: e.kind, qty: 0, walls: [] };
    row.qty += e.qty;
    for (const w of e.walls) if (!row.walls.includes(w)) row.walls.push(w);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.size.localeCompare(b.size) || b.length - a.length || a.kind.localeCompare(b.kind));
}

// ---------------------------------------------------------------- cutting stock

/**
 * Bounded knapsack on integer weights: maximise sum(value*count) with
 * sum(weight*count) <= cap and count <= bound. Returns { value, counts }.
 */
export function boundedKnapsack(weights, values, bounds, cap) {
  const chunks = [];
  weights.forEach((w, i) => {
    let left = Math.min(bounds[i], Math.floor(cap / w));
    for (let k = 1; left > 0; k *= 2) {
      const take = Math.min(k, left);
      chunks.push({ i, n: take, w: w * take, v: values[i] * take });
      left -= take;
    }
  });
  const best = new Float64Array(cap + 1);
  const keep = chunks.map(() => new Uint8Array(cap + 1));
  chunks.forEach((ch, k) => {
    if (ch.v <= 0) return;
    for (let c = cap; c >= ch.w; c--) {
      const cand = best[c - ch.w] + ch.v;
      if (cand > best[c] + 1e-12) {
        best[c] = cand;
        keep[k][c] = 1;
      }
    }
  });
  const counts = new Array(weights.length).fill(0);
  let c = cap;
  for (let k = chunks.length - 1; k >= 0; k--) {
    if (keep[k][c]) {
      counts[chunks[k].i] += chunks[k].n;
      c -= chunks[k].w;
    }
  }
  return { value: best[cap], counts };
}

/**
 * Maximise b.y subject to A y <= c, y >= 0, with c >= 0 (so the origin is
 * feasible). A is rows x cols. Dense tableau simplex with Bland's rule; on more than 150 rows (Bland's
 * rule crawls on the degenerate LPs of a pooled panel order) the most negative
 * reduced cost enters (Dantzig), with Bland's rule back after a run of
 * degenerate pivots so it cannot cycle.
 * Returns { value, y, x }, where x are the duals of the rows: the optimal
 * solution of min c.x subject to A^T x >= b, x >= 0.
 */
export function simplexMaxLE(A, b, c) {
  const m = A.length;
  const n = b.length;
  const W = n + m + 1;
  const T = [];
  for (let r = 0; r < m; r++) {
    const row = new Float64Array(W);
    for (let j = 0; j < n; j++) row[j] = A[r][j];
    row[n + r] = 1;
    row[W - 1] = c[r];
    T.push(row);
  }
  const z = new Float64Array(W);
  for (let j = 0; j < n; j++) z[j] = -b[j];
  const basis = Array.from({ length: m }, (_, r) => n + r);
  let stall = 0;
  for (let iter = 0; iter < 50000; iter++) {
    let enter = -1;
    if (m <= 150 || stall > 20) {
      for (let j = 0; j < W - 1; j++) if (z[j] < -1e-10) { enter = j; break; }
    } else {
      let low = -1e-10;
      for (let j = 0; j < W - 1; j++) if (z[j] < low) { low = z[j]; enter = j; }
    }
    if (enter < 0) break;
    let leave = -1;
    let ratio = Infinity;
    for (let r = 0; r < m; r++) {
      const a = T[r][enter];
      if (a > 1e-12) {
        const q = T[r][W - 1] / a;
        if (q < ratio - 1e-12 || (Math.abs(q - ratio) <= 1e-12 && basis[r] < basis[leave])) {
          ratio = q;
          leave = r;
        }
      }
    }
    if (leave < 0) throw new Error("LP unbounded: a piece is longer than every board");
    stall = ratio <= 1e-12 ? stall + 1 : 0;
    const pr = T[leave];
    const pv = pr[enter];
    for (let j = 0; j < W; j++) pr[j] /= pv;
    for (let r = 0; r < m; r++) {
      if (r === leave) continue;
      const f = T[r][enter];
      if (f !== 0) for (let j = 0; j < W; j++) T[r][j] -= f * pr[j];
    }
    const f = z[enter];
    for (let j = 0; j < W; j++) z[j] -= f * pr[j];
    basis[leave] = enter;
  }
  const y = new Array(n).fill(0);
  basis.forEach((v, r) => { if (v < n) y[v] = T[r][W - 1]; });
  const x = Array.from({ length: m }, (_, r) => Math.max(0, z[n + r]));
  return { value: z[W - 1], y, x };
}

/**
 * Gilmore-Gomory column generation for the LP relaxation of cutting stock
 * with several board lengths. Items are integer weights (length + kerf in
 * 1/16 in) with demands; boards have integer capacity (length + kerf) and a
 * price. Returns the LP bound and the patterns with their LP values.
 */
function columnGeneration(items, boards) {
  const n = items.length;
  /** @type {{ board: number, counts: number[] }[]} */
  const patterns = [];
  const seen = new Set();
  const addPattern = (board, counts) => {
    const key = `${board}:${counts.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    patterns.push({ board, counts });
    return true;
  };
  items.forEach((it, i) => {
    let best = -1;
    boards.forEach((bd, k) => {
      if (bd.cap >= it.w && (best < 0 || bd.price / Math.min(it.d, Math.floor(bd.cap / it.w)) < boards[best].price / Math.min(it.d, Math.floor(boards[best].cap / it.w)))) best = k;
    });
    if (best < 0) throw new Error("a piece is longer than every board");
    const counts = new Array(n).fill(0);
    counts[i] = Math.min(it.d, Math.floor(boards[best].cap / it.w));
    addPattern(best, counts);
  });
  let lp = { value: 0, y: [], x: [] };
  for (let round = 0; round < 400; round++) {
    lp = simplexMaxLE(patterns.map((p) => p.counts), items.map((it) => it.d), patterns.map((p) => boards[p.board].price));
    let added = 0;
    boards.forEach((bd, k) => {
      const ks = boundedKnapsack(items.map((it) => it.w), lp.y, items.map((it) => it.d), bd.cap);
      if (ks.value > bd.price * (1 + 1e-9) + 1e-9 && addPattern(k, ks.counts)) added++;
    });
    if (!added) break;
  }
  return { bound: lp.value, patterns, x: lp.x };
}

/** First fit decreasing onto the longest board, then each bar shrunk to the cheapest board that holds it. */
function firstFitDecreasing(items, boards) {
  const longest = boards.reduce((a, b, k) => (b.cap > boards[a].cap || (b.cap === boards[a].cap && b.price < boards[a].price) ? k : a), 0);
  const pieces = [];
  items.forEach((it, i) => { for (let k = 0; k < it.d; k++) pieces.push(i); });
  pieces.sort((a, b) => items[b].w - items[a].w);
  const bars = [];
  for (const i of pieces) {
    const bar = bars.find((bb) => bb.used + items[i].w <= boards[longest].cap);
    if (bar) { bar.used += items[i].w; bar.pieces.push(i); }
    else bars.push({ board: longest, used: items[i].w, pieces: [i] });
  }
  return bars.map((bar) => shrink(bar, boards));
}

function shrink(bar, boards) {
  let best = bar.board;
  boards.forEach((bd, k) => {
    if (bd.cap >= bar.used && (bd.price < boards[best].price - 1e-12 || (Math.abs(bd.price - boards[best].price) <= 1e-12 && bd.cap < boards[best].cap))) best = k;
  });
  return { ...bar, board: best };
}

const costOf = (bars, boards) => bars.reduce((s, b) => s + boards[b.board].price, 0);

/**
 * Cheapest set of boards (of the lengths and prices given) to cut every
 * piece from, for one lumber size.
 * @param {{ length: number, qty: number, ref?: any }[]} pieces
 * @param {{ length: number, price: number, label?: string }[]} stock
 * @param {number} kerf
 */
export function optimizeStock(pieces, stock, kerf = 0.125) {
  const k16 = Math.round(kerf * STEP);
  const byLen = new Map();
  for (const p of pieces) {
    if (!(p.qty > 0)) continue;
    const w = Math.ceil(p.length * STEP - 1e-6);
    const row = byLen.get(w) || { w: w + k16, length: w / STEP, d: 0, refs: [] };
    row.d += p.qty;
    row.refs.push(...Array(p.qty).fill(p.ref));
    byLen.set(w, row);
  }
  const items = [...byLen.values()].sort((a, b) => b.w - a.w);
  const boards = stock.filter((s) => s.length > 0 && s.price >= 0).map((s) => ({ ...s, cap: Math.floor(s.length * STEP + 1e-6) + k16 }));
  if (!items.length) return { bars: [], cost: 0, bound: 0, lpBound: 0, proven: true, method: "none", ffdCost: 0, lpCost: 0 };
  if (!boards.length) throw new Error("no boards listed");
  const tooLong = items.find((it) => !boards.some((b) => b.cap >= it.w));
  if (tooLong) throw new Error(`a ${formatInches(tooLong.length)} piece is longer than every board listed`);

  const first = columnGeneration(items, boards);
  // Sequential rounding: take the whole part of the LP, re-solve what is left.
  const demand = items.map((it) => it.d);
  /** @type {{ board: number, counts: number[] }[]} */
  const chosen = [];
  let cg = first;
  for (let guard = 0; demand.some((d) => d > 0) && guard < 500; guard++) {
    let took = false;
    cg.patterns.forEach((p, j) => {
      const times = Math.floor(cg.x[j] + 1e-9);
      for (let t = 0; t < times; t++) {
        if (!p.counts.some((c, i) => c > 0 && demand[i] > 0)) break;
        chosen.push(p);
        p.counts.forEach((c, i) => { demand[i] = Math.max(0, demand[i] - c); });
        took = true;
      }
    });
    if (!demand.some((d) => d > 0)) break;
    if (!took) {
      let jbest = -1;
      cg.patterns.forEach((p, j) => {
        if (p.counts.some((c, i) => c > 0 && demand[i] > 0) && (jbest < 0 || cg.x[j] > cg.x[jbest])) jbest = j;
      });
      const p = cg.patterns[jbest];
      chosen.push(p);
      p.counts.forEach((c, i) => { demand[i] = Math.max(0, demand[i] - c); });
    }
    const left = items.map((it, i) => ({ ...it, d: demand[i] })).filter((it) => it.d > 0);
    if (!left.length) break;
    const idx = items.map((it, i) => i).filter((i) => demand[i] > 0);
    const sub = columnGeneration(left, boards);
    cg = {
      bound: sub.bound,
      x: sub.x,
      patterns: sub.patterns.map((p) => {
        const counts = new Array(items.length).fill(0);
        p.counts.forEach((c, k) => { counts[idx[k]] = c; });
        return { board: p.board, counts };
      }),
    };
  }
  // Turn patterns into bars, dropping pieces beyond demand, then shrink each bar.
  const need = items.map((it) => it.d);
  let lpBars = chosen.map((p) => {
    const ps = [];
    p.counts.forEach((c, i) => { for (let t = 0; t < c; t++) if (need[i] > 0) { ps.push(i); need[i]--; } });
    return { board: p.board, pieces: ps, used: ps.reduce((s, i) => s + items[i].w, 0) };
  }).filter((b) => b.pieces.length).map((b) => shrink(b, boards));
  const ffd = firstFitDecreasing(items, boards);
  const lpCost = costOf(lpBars, boards);
  const ffdCost = costOf(ffd, boards);
  const exact = exactStock(items, boards);
  let bars = lpCost <= ffdCost + 1e-9 ? lpBars : ffd;
  let method = lpCost <= ffdCost + 1e-9 ? "column generation" : "first fit decreasing";
  if (exact && exact.cost < costOf(bars, boards) - 1e-9) {
    bars = exact.bars.map((b) => shrink(b, boards));
    method = "exact";
  }
  const cost = costOf(bars, boards);
  // Ceiling of the LP bound when every price is a whole number: a real order cannot cost less.
  const bound = boards.every((b) => Number.isInteger(b.price)) ? Math.ceil(first.bound - 1e-6) : first.bound;
  const refsLeft = items.map((it) => [...it.refs]);
  const out = bars.map((b) => {
    const bd = boards[b.board];
    const cuts = b.pieces.map((i) => ({ length: items[i].length, ref: refsLeft[i].shift() })).sort((x, y) => y.length - x.length);
    const used = cuts.reduce((s, c) => s + c.length + kerf, 0);
    return { length: bd.length, price: bd.price, label: bd.label, cuts, offcut: Math.max(0, bd.length - used) };
  });
  out.sort((a, b) => b.length - a.length || b.cuts.length - a.cuts.length);
  return { bars: out, cost, bound: exact ? exact.cost : bound, lpBound: first.bound, proven: Boolean(exact) || cost <= bound + 1e-9, method, ffdCost, lpCost };
}

/**
 * Exact cheapest cover for small groups, by dynamic programming over the
 * vector of pieces still to cut: f(d) = min over patterns p <= d of
 * price(p) + f(d - p). Returns null when the instance is too big to finish
 * quickly (the work limit is states x patterns).
 */
export function exactStock(items, boards, workLimit = 3e7) {
  const n = items.length;
  const radix = items.map((it) => it.d + 1);
  let states = 1;
  for (const r of radix) { states *= r; if (states > 2e5) return null; }
  const pats = [];
  for (let k = 0; k < boards.length; k++) {
    const c = new Array(n).fill(0);
    const rec = (i, room) => {
      if (pats.length * states > workLimit) return;
      if (i === n) {
        if (c.some((v) => v)) pats.push({ board: k, counts: [...c], price: boards[k].price });
        return;
      }
      for (let v = 0; v <= items[i].d && v * items[i].w <= room; v++) {
        c[i] = v;
        rec(i + 1, room - v * items[i].w);
      }
      c[i] = 0;
    };
    rec(0, boards[k].cap);
  }
  if (pats.length * states > workLimit) return null;
  const mult = [];
  let m = 1;
  for (const r of radix) { mult.push(m); m *= r; }
  const patIdx = pats.map((p) => p.counts.reduce((s, v, i) => s + v * mult[i], 0));
  const f = new Float64Array(states).fill(Infinity);
  const how = new Int32Array(states).fill(-1);
  f[0] = 0;
  const d = new Array(n).fill(0);
  for (let idx = 1; idx < states; idx++) {
    let r = idx;
    for (let i = 0; i < n; i++) { d[i] = r % radix[i]; r = Math.floor(r / radix[i]); }
    let best = Infinity;
    let arg = -1;
    for (let j = 0; j < pats.length; j++) {
      const pc = pats[j].counts;
      let ok = true;
      for (let i = 0; i < n; i++) if (pc[i] > d[i]) { ok = false; break; }
      if (!ok) continue;
      const v = pats[j].price + f[idx - patIdx[j]];
      if (v < best - 1e-12) { best = v; arg = j; }
    }
    f[idx] = best;
    how[idx] = arg;
  }
  const bars = [];
  for (let idx = states - 1; idx > 0; idx -= patIdx[how[idx]]) {
    const p = pats[how[idx]];
    const pieces = [];
    p.counts.forEach((v, i) => { for (let t = 0; t < v; t++) pieces.push(i); });
    bars.push({ board: p.board, pieces, used: pieces.reduce((s, i) => s + items[i].w, 0) });
  }
  return { cost: f[states - 1], bars };
}

// ---------------------------------------------------------------- whole house

/**
 * Lay out every wall and buy the lumber for it.
 * @param {Plan} plan
 * @param {{size: string, length: number, kind: string, qty: number, walls: string[]}[]} [extraCuts] pieces that are not wall members (sheathing nailers), bought with the rest
 */
export function takeoff(plan, extraCuts = []) {
  const errors = validatePlan(plan);
  if (errors.length) return { ok: false, errors };
  const walls = plan.walls.map((w) => layoutWall(plan, w));
  const cuts = mergeCuts(cutList(walls), extraCuts);
  const sizes = [...new Set(cuts.map((c) => c.size))];
  const orders = [];
  for (const size of sizes) {
    const stock = plan.stock.filter((s) => s.size === size);
    const pieces = cuts.filter((c) => c.size === size).map((c) => ({ length: c.length, qty: c.qty, ref: c.kind }));
    const res = optimizeStock(pieces, stock, plan.kerf);
    const lines = new Map();
    for (const b of res.bars) {
      const key = `${b.length}|${b.label || ""}`;
      const row = lines.get(key) || { size, length: b.length, label: b.label || "", price: b.price, qty: 0 };
      row.qty++;
      lines.set(key, row);
    }
    const bought = res.bars.reduce((s, b) => s + b.length, 0);
    const needed = pieces.reduce((s, p) => s + p.length * p.qty, 0);
    orders.push({ size, ...res, lines: [...lines.values()].sort((a, b) => b.length - a.length), bought, needed, naive: naiveCost(pieces, stock) });
  }
  const cost = orders.reduce((s, o) => s + o.cost, 0);
  const bound = orders.reduce((s, o) => s + o.bound, 0);
  const bought = orders.reduce((s, o) => s + o.bought, 0);
  const needed = orders.reduce((s, o) => s + o.needed, 0);
  const naive = orders.reduce((s, o) => s + o.naive, 0);
  const lf = plan.walls.reduce((s, w) => s + w.length, 0) / 12;
  const verticals = walls.reduce((s, w) => s + w.members.filter((m) => m.orient === "v" && m.kind !== "cripple" && m.kind !== "jack").length, 0);
  return {
    ok: true,
    walls,
    cuts,
    orders,
    summary: {
      walls: walls.length,
      wallFeet: lf,
      pieces: cuts.reduce((s, c) => s + c.qty, 0),
      boards: orders.reduce((s, o) => s + o.bars.length, 0),
      fullHeightMembers: verticals,
      cost,
      bound,
      gap: bound > 0 ? (cost - bound) / bound : 0,
      naiveCost: naive,
      waste: bought > 0 ? (bought - needed) / bought : 0,
      boughtFeet: bought / 12,
      neededFeet: needed / 12,
    },
    notes: walls.flatMap((w) => w.notes.map((n) => `${w.id}: ${n}`)),
  };
}

/** Buying every piece on its own cheapest board that fits: the no-planning baseline. */
function naiveCost(pieces, stock) {
  let total = 0;
  for (const p of pieces) {
    let best = Infinity;
    for (const s of stock) if (s.length + 1e-9 >= p.length && s.price < best) best = s.price;
    total += best * p.qty;
  }
  return total;
}

/** CSV of the order and the cut list, for a lumberyard or a spreadsheet. */
export function toCsv(result) {
  if (!result.ok) return "";
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["section", "size", "length_in", "length", "qty", "detail"]];
  for (const o of result.orders) for (const l of o.lines) rows.push(["order", o.size, String(l.length), formatLength(l.length), String(l.qty), l.label || `price ${l.price}`]);
  for (const c of result.cuts) rows.push(["cut", c.size, String(c.length), formatInches(c.length), String(c.qty), `${c.kind} (${c.walls.join("; ")})`]);
  for (const o of result.orders) {
    o.bars.forEach((b, i) => rows.push(["board", o.size, String(b.length), formatLength(b.length), "1", `#${i + 1}: ${b.cuts.map((c) => `${formatInches(c.length)} ${c.ref}`).join(" + ")}; offcut ${formatInches(b.offcut)}`]));
  }
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
