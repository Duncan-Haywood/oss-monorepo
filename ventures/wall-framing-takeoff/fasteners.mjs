// @ts-check
// Nail counts by connection, measured from the members the takeoff placed.
//
// Every number of nails per connection is a typed input with a default that is
// common framing practice (two end nails per stud end, plates face-nailed at
// 16 in, sheathing at 6 in on edges and 12 in in the field). The defaults are
// not read from a code table: check them against your code edition and
// engineer's nailing schedule. The tool counts connections; it does not size
// nails, pick a nail type or check shear capacity.

const DEFAULTS = {
  studEndNails: 2, // per stud, king, jack, cripple, backing end
  plateSpacing: 16, // in: bottom plate to floor, cap plate to top plate (face nails)
  jackSpacing: 12, // in: jack to king, face nails in one row
  backingSpacing: 24, // in: corner and tee backing studs to the stud beside
  headerEndNails: 2, // per header ply end, through the king
  headerRows: 2, // rows of face nails joining header plies
  headerSpacing: 16, // in
  sillEndNails: 2, // per rough sill end
  edgeSpacing: 6, // in: sheathing nails on panel edges
  fieldSpacing: 12, // in: sheathing nails on intermediate studs
  waste: 0.1,
};

/**
 * holdDowns counts hardware pieces only: `wallEnds` puts one at each end of every wall, `openingMinWidth` (in) puts one on each side of
 * every opening at least that wide. Which walls and openings need them is the engineer's call; this multiplies the typed rule.
 * @typedef {{ wallEnds?: boolean, openingMinWidth?: number | null, price?: number }} HoldDowns
 * rafterTies counts one tie per rafter or jack rafter at its eave bearing (two per truss, one at each wall) when the roof is in the takeoff;
 * `perBearing` (1 to 2) is how many ties the engineer's schedule puts on each bearing.
 * @typedef {{ perBearing?: number, price?: number }} RafterTies
 * plateStraps counts steel straps across wall plate joints: `topJoints` one per top-plate joint and `capJoints` one per cap-plate joint (both default on),
 * `plateTies` adds the single-top-plate ties the walls already note (default on); `perJoint` is how many straps the engineer's schedule puts on each.
 * @typedef {{ topJoints?: boolean, capJoints?: boolean, plateTies?: boolean, perJoint?: number, price?: number }} PlateStraps
 * @typedef {Partial<typeof DEFAULTS> & { nailsPerBox?: number, price?: number, sheathing?: boolean, holdDowns?: HoldDowns, rafterTies?: RafterTies | boolean, plateStraps?: PlateStraps | boolean }} Fasteners
 */

/** @param {Fasteners} d */
export function validateFasteners(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Fastener settings are an object."];
  /** @param {string} k @param {number} lo @param {number} hi @param {string} what */
  const rng = (k, lo, hi, what) => { const v = /** @type {any} */ (d)[k]; if (v != null && !(v >= lo && v <= hi)) e.push(`${what} must be between ${lo} and ${hi}.`); };
  rng("studEndNails", 1, 6, "Nails per stud end");
  rng("headerEndNails", 1, 6, "Nails per header ply end");
  rng("sillEndNails", 1, 6, "Nails per sill end");
  rng("headerRows", 1, 4, "Header nail rows");
  for (const k of ["plateSpacing", "jackSpacing", "backingSpacing", "headerSpacing", "fieldSpacing"]) rng(k, 3, 48, `Spacing ${k}`);
  rng("edgeSpacing", 2, 12, "Sheathing edge spacing");
  rng("waste", 0, 0.5, "Fastener waste");
  rng("nailsPerBox", 50, 20000, "Nails per box");
  rng("price", 0, 1e6, "Box price");
  const h = d.holdDowns;
  if (h != null) {
    if (typeof h !== "object") e.push("holdDowns must be an object with wallEnds, openingMinWidth and price.");
    else {
      const hv = /** @type {any} */ (h);
      if (hv.openingMinWidth != null && !(hv.openingMinWidth >= 6 && hv.openingMinWidth <= 600)) e.push("Hold-down opening width must be between 6 and 600.");
      if (hv.price != null && !(hv.price >= 0 && hv.price <= 1e6)) e.push("Hold-down price must be between 0 and 1000000.");
    }
  }
  const rt = d.rafterTies;
  if (rt != null && typeof rt === "object") {
    if (rt.perBearing != null && ![1, 2].includes(rt.perBearing)) e.push("Ties per bearing must be 1 or 2.");
    if (rt.price != null && !(rt.price >= 0 && rt.price <= 1e6)) e.push("Rafter tie price must be between 0 and 1000000.");
  } else if (rt != null && typeof rt !== "boolean") e.push("rafterTies must be true or an object with perBearing and price.");
  const ps = d.plateStraps;
  if (ps != null && typeof ps === "object") {
    if (ps.perJoint != null && ![1, 2].includes(ps.perJoint)) e.push("Straps per joint must be 1 or 2.");
    if (ps.price != null && !(ps.price >= 0 && ps.price <= 1e6)) e.push("Plate strap price must be between 0 and 1000000.");
  } else if (ps != null && typeof ps !== "boolean") e.push("plateStraps must be true or an object with topJoints, capJoints, plateTies, perJoint and price.");
  return e;
}

/** nails along a run of `len` inches at `sp` spacing, one at each end: ceil(len/sp) + 1 */
const along = (/** @type {number} */ len, /** @type {number} */ sp) => Math.ceil(len / sp - 1e-9) + 1;

/**
 * @param {Fasteners} d
 * @param {{ studSpacing?: number, walls?: any[] }} plan
 * @param {{ walls: any[], sheathing?: any }} result the takeoff result (members placed per wall)
 */
export function layoutFasteners(d, plan, result) {
  const errors = validateFasteners(d);
  if (errors.length) return { ok: false, errors };
  const c = { ...DEFAULTS, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) };
  /** @type {Map<string, { nails: number, rule: string }>} */
  const conn = new Map();
  /** @type {{ id: string, nails: number }[]} */
  const walls = [];
  /** @param {string} name @param {number} n @param {string} rule */
  const add = (name, n, rule) => { const o = conn.get(name) || { nails: 0, rule }; o.nails += n; conn.set(name, o); return n; };
  for (const w of result.walls) {
    let total = 0;
    /** @type {Map<string, number>} */
    const plies = new Map();
    for (const m of w.members) {
      const len = m.orient === "v" ? m.h : m.w;
      if (m.kind === "stud" || m.kind === "cripple" || m.kind === "king") total += add("Stud, king and cripple ends", 2 * c.studEndNails, `${c.studEndNails} end nails at each end`);
      else if (m.kind === "jack") {
        total += add("Stud, king and cripple ends", 2 * c.studEndNails, `${c.studEndNails} end nails at each end`);
        total += add("Jack to king", along(len, c.jackSpacing), `face nails at ${c.jackSpacing} in, one row`);
      } else if (m.kind === "corner" || m.kind === "tee") total += add("Corner and tee backing", along(len, c.backingSpacing), `face nails at ${c.backingSpacing} in`);
      else if (m.kind === "sill") total += add("Rough sills", 2 * c.sillEndNails, `${c.sillEndNails} end nails at each end`);
      else if (m.kind === "header") {
        total += add("Header ends", 2 * c.headerEndNails, `${c.headerEndNails} nails per ply end, through the king`);
        plies.set(m.label, (plies.get(m.label) || 0) + 1);
        if ((plies.get(m.label) || 0) > 1) total += add("Header plies together", c.headerRows * along(len, c.headerSpacing), `${c.headerRows} rows at ${c.headerSpacing} in`);
      } else if (m.kind === "plate") {
        if (m.label === "bottom plate") total += add("Bottom plate to floor", along(len, c.plateSpacing), `face nails at ${c.plateSpacing} in`);
        else if (m.label === "cap plate") total += add("Cap plate to top plate", along(len, c.plateSpacing), `face nails at ${c.plateSpacing} in`);
      }
    }
    walls.push({ id: w.id, nails: total });
  }
  const sh = d.sheathing === false ? null : result.sheathing;
  if (sh?.walls) {
    const sp = plan.studSpacing ?? 16, eps = 1e-6;
    for (const sw of sh.walls) {
      let n = 0;
      for (const p of sw.panels) {
        const edge = Math.ceil((2 * (p.width + p.height)) / c.edgeSpacing - 1e-9);
        let lines = 0;
        for (let k = Math.floor(p.x0 / sp) + 1; k * sp < p.x1 - eps; k++) if (k * sp > p.x0 + eps) lines++;
        n += edge + lines * Math.ceil(p.height / c.fieldSpacing - 1e-9);
      }
      add("Sheathing nails", n, `edges at ${c.edgeSpacing} in, intermediate studs at ${c.fieldSpacing} in`);
      const row = walls.find((x) => x.id === sw.id);
      if (row) row.nails += n; else walls.push({ id: sw.id, nails: n });
    }
  }
  /** @type {any} */
  let holdDowns = null;
  const hd = d.holdDowns;
  if (hd && (hd.wallEnds || hd.openingMinWidth != null)) {
    const planWalls = /** @type {any[]} */ ((/** @type {any} */ (plan)).walls || []);
    let ends = 0, openings = 0;
    for (const w of result.walls) {
      if (hd.wallEnds) ends += 2;
      if (hd.openingMinWidth != null) openings += 2 * (planWalls.find((x) => x.id === w.id)?.openings || []).filter((o) => o.width >= /** @type {number} */ (hd.openingMinWidth)).length;
    }
    const count = ends + openings;
    holdDowns = { wallEnds: ends, openingSides: openings, count, price: hd.price ?? null, cost: hd.price != null ? count * hd.price : null };
  }
  /** @type {any} */
  let rafterTies = null;
  if (d.rafterTies && /** @type {any} */ (result).roof?.ok !== false && /** @type {any} */ (result).roof) {
    const rt = typeof d.rafterTies === "object" ? d.rafterTies : {};
    const roof = /** @type {any} */ (result).roof, per = rt.perBearing ?? 1;
    const trusses = roof.trusses?.count ?? 0;
    const rafters = trusses ? 0 : (roof.rafters?.length || 0) + (roof.jacks?.length || 0) + (roof.wingRafters?.length || 0) + (roof.wingJacks?.length || 0);
    const bearings = trusses * 2 + rafters;
    const count = bearings * per;
    rafterTies = { trusses, rafters, bearings, perBearing: per, count, price: rt.price ?? null, cost: rt.price != null ? count * rt.price : null };
  }
  /** @type {any} */
  let plateStraps = null;
  if (d.plateStraps) {
    const ps = typeof d.plateStraps === "object" ? d.plateStraps : {}, per = ps.perJoint ?? 1;
    let top = 0, cap = 0, ties = 0;
    for (const w of result.walls) {
      if (ps.topJoints !== false) top += w.joints?.top?.length || 0;
      if (ps.capJoints !== false) cap += w.joints?.cap?.length || 0;
      if (ps.plateTies !== false) ties += w.plateTies || 0;
    }
    const count = (top + cap) * per + ties;
    plateStraps = { topJoints: top, capJoints: cap, plateTies: ties, perJoint: per, count, price: ps.price ?? null, cost: ps.price != null ? count * ps.price : null };
  }
  const connections = [...conn.entries()].map(([name, v]) => ({ name, ...v }));
  const total = connections.reduce((s, x) => s + x.nails, 0);
  const order = Math.ceil(total * (1 + c.waste) - 1e-9);
  const boxes = d.nailsPerBox ? Math.ceil(order / d.nailsPerBox - 1e-9) : null;
  const assumed = Object.keys(DEFAULTS).filter((k) => /** @type {any} */ (d)[k] == null);
  return {
    ok: true, errors: [], connections, walls, total, waste: c.waste, order,
    nailsPerBox: d.nailsPerBox ?? null, boxes, price: d.price ?? null,
    cost: boxes != null && d.price != null ? boxes * d.price : null,
    sheathingCounted: !!sh?.walls, assumed, holdDowns, rafterTies, plateStraps,
  };
}

/** @param {any} d */
export function fastenerText(d) {
  const l = [];
  l.push(`  ${d.total} nails counted; ${d.order} to buy with ${(100 * d.waste).toFixed(0)}% waste${d.boxes != null ? `, ${d.boxes} box(es) of ${d.nailsPerBox}${d.cost != null ? `, ${d.cost.toFixed(2)} at ${d.price} each` : ""}` : " (add nailsPerBox from the label for a box count)"}`);
  for (const x of d.connections) l.push(`    ${String(x.nails).padStart(6)}  ${x.name} (${x.rule})`);
  if (d.holdDowns) l.push(`  ${d.holdDowns.count} hold-down(s): ${d.holdDowns.wallEnds} at wall ends, ${d.holdDowns.openingSides} beside wide openings${d.holdDowns.cost != null ? `, ${d.holdDowns.cost.toFixed(2)} at ${d.holdDowns.price} each` : ""}`);
  if (d.rafterTies) l.push(`  ${d.rafterTies.count} rafter tie(s): ${d.rafterTies.perBearing} on each of ${d.rafterTies.bearings} bearing(s) (${d.rafterTies.trusses ? `${d.rafterTies.trusses} trusses, 2 bearings each` : `${d.rafterTies.rafters} rafters, 1 eave bearing each`})${d.rafterTies.cost != null ? `, ${d.rafterTies.cost.toFixed(2)} at ${d.rafterTies.price} each` : ""}`);
  if (d.plateStraps) l.push(`  ${d.plateStraps.count} plate strap(s): ${d.plateStraps.perJoint} on each of ${d.plateStraps.topJoints} top-plate and ${d.plateStraps.capJoints} cap-plate joint(s)${d.plateStraps.plateTies ? `, plus ${d.plateStraps.plateTies} single-top-plate tie(s)` : ""}${d.plateStraps.cost != null ? `, ${d.plateStraps.cost.toFixed(2)} at ${d.plateStraps.price} each` : ""}`);
  if (!d.sheathingCounted) l.push("  Sheathing nails are left out: add --sheathing to count them.");
  l.push("  Nail counts follow typed schedule defaults (common practice, not a code table); nail size and type, hardware other than the hold-downs, rafter ties and plate straps you typed, and anchors are not counted here.");
  return l;
}
