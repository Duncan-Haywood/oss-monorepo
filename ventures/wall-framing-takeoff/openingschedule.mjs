// @ts-check
// Door and window schedule: the plan's openings grouped into marks (D1, W1,
// ...), the table a permit set, a window order and a framer's walk-through all
// start from. Nothing here is a new measurement: the width, height, header and
// sill height are the ones the framing already used.
//
// Two openings share a mark when their kind, framed width and height, header
// size, header plies and header height all match. Width and height in a plan
// are the framed (rough) opening. The unit size is the rough opening less an
// allowance you type (`unitAllowance`, inches off width and height; default
// 0.5 in, a common clearance for shimming, not a rule: the manufacturer's
// rough-opening sheet governs, and a sliding or pre-hung door differs).
// Sill height is the header height less the opening's height; a door's is 0.

/** @typedef {{ unitAllowance?: number, doorPrefix?: string, windowPrefix?: string }} OpeningSchedule */

/** @param {any} d */
export function validateOpeningSchedule(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Opening schedule settings are an object."];
  if (d.unitAllowance != null && !(typeof d.unitAllowance === "number" && d.unitAllowance >= 0 && d.unitAllowance <= 3)) e.push("unitAllowance must be between 0 and 3 inches.");
  for (const k of ["doorPrefix", "windowPrefix"]) if (d[k] != null && !(typeof d[k] === "string" && /^[A-Za-z]{1,4}$/.test(d[k]))) e.push(`${k} must be one to four letters.`);
  return e;
}

/**
 * The plan shape this schedule reads: walls that are objects, openings that are
 * objects with a finite positive framed width and height (numbers, not text).
 * @param {any} plan
 */
export function validateSchedulePlan(plan) {
  const e = [];
  if (plan == null || typeof plan !== "object" || !Array.isArray(plan.walls)) return ["The plan needs a walls list."];
  plan.walls.forEach((/** @type {any} */ w, /** @type {number} */ i) => {
    if (w == null || typeof w !== "object" || Array.isArray(w)) { e.push(`Wall ${i + 1} is not an object.`); return; }
    if (w.openings != null && !Array.isArray(w.openings)) { e.push(`Wall ${w.id ?? i + 1}: openings must be a list.`); return; }
    (w.openings || []).forEach((/** @type {any} */ op, /** @type {number} */ j) => {
      const at = `Wall ${w.id ?? i + 1}, opening ${j + 1}`;
      if (op == null || typeof op !== "object" || Array.isArray(op)) { e.push(`${at}: not an object.`); return; }
      for (const k of ["width", "height"]) if (!(typeof op[k] === "number" && Number.isFinite(op[k]) && op[k] > 0)) e.push(`${at}: ${k} must be a positive number of inches.`);
      if (op.headerHeight != null) {
        if (!(typeof op.headerHeight === "number" && Number.isFinite(op.headerHeight) && op.headerHeight > 0)) e.push(`${at}: headerHeight must be a positive number of inches.`);
        else if (op.kind !== "door" && typeof op.height === "number" && op.headerHeight < op.height) e.push(`${at}: headerHeight (${op.headerHeight}) is below the opening's height (${op.height}), so the sill would be negative.`);
      }
    });
  });
  return e;
}

const fmt = (/** @type {number} */ n) => String(Math.round(n * 1000) / 1000);

/**
 * @param {OpeningSchedule} d
 * @param {{ defaultHeaderHeight?: number, walls: { id: string, stud?: string, openings?: any[] }[] }} plan
 */
export function layoutOpeningSchedule(d, plan) {
  const errors = [...validateOpeningSchedule(d), ...validateSchedulePlan(plan)];
  const dh = plan && plan.defaultHeaderHeight;
  if (dh != null && !(typeof dh === "number" && Number.isFinite(dh) && dh > 0)) errors.push("defaultHeaderHeight must be a positive number of inches.");
  if (!errors.length && typeof dh === "number") {
    plan.walls.forEach((/** @type {any} */ w, /** @type {number} */ i) => (w.openings || []).forEach((/** @type {any} */ op, /** @type {number} */ j) => {
      if (op.headerHeight == null && op.kind !== "door" && op.height > dh) errors.push(`Wall ${w.id ?? i + 1}, opening ${j + 1}: defaultHeaderHeight (${dh}) is below the opening's height (${op.height}), so the sill would be negative.`);
    }));
  }
  if (errors.length) return { ok: false, errors };
  const allow = d.unitAllowance ?? 0.5, dp = d.doorPrefix ?? "D", wp = d.windowPrefix ?? "W";
  /** @type {Map<string, any>} */ const groups = new Map();
  for (const w of plan.walls) {
    for (const op of w.openings || []) {
      const hh = op.headerHeight ?? plan.defaultHeaderHeight ?? null;
      const kind = op.kind === "door" ? "door" : "window";
      const header = op.header ?? "2x10", plies = op.headerPlies ?? (w.stud === "2x6" ? 3 : 2);
      const key = [kind, op.width, op.height, header, plies, hh].join("|");
      let g = groups.get(key);
      if (!g) {
        g = { kind, width: op.width, height: op.height, header, headerPlies: plies, headerHeight: hh,
          sillHeight: kind === "door" ? 0 : hh == null ? null : hh - op.height, count: 0, locations: [] };
        groups.set(key, g);
      }
      g.count++;
      g.locations.push({ wall: w.id, label: op.label || kind, offset: op.offset });
    }
  }
  const rows = [...groups.values()].sort((a, b) => (a.kind === b.kind ? b.width * b.height - a.width * a.height : a.kind === "door" ? -1 : 1));
  const n = { door: 0, window: 0 };
  for (const g of rows) {
    g.mark = `${g.kind === "door" ? dp : wp}${++n[g.kind]}`;
    g.unitWidth = Math.max(0, g.width - allow); g.unitHeight = Math.max(0, g.height - allow);
  }
  return {
    ok: true, errors: [], unitAllowance: allow, rows,
    doors: rows.filter((r) => r.kind === "door").reduce((s, r) => s + r.count, 0),
    windows: rows.filter((r) => r.kind === "window").reduce((s, r) => s + r.count, 0),
  };
}

/** @param {any} s */
export function openingScheduleText(s) {
  const l = [`  ${s.doors} door(s) and ${s.windows} window(s) in ${s.rows.length} mark(s). Rough opening is the framed size; unit size is ${fmt(s.unitAllowance)} in less in each direction (confirm against the maker's sheet).`];
  for (const r of s.rows) {
    l.push(`  ${r.mark}  x${r.count}  ${r.kind}  RO ${fmt(r.width)} x ${fmt(r.height)} in  unit ${fmt(r.unitWidth)} x ${fmt(r.unitHeight)} in  header ${r.headerPlies}-${r.header}${r.headerHeight != null ? ` at ${fmt(r.headerHeight)} in` : ""}${r.kind === "window" && r.sillHeight != null ? `, sill ${fmt(r.sillHeight)} in` : ""}`);
    l.push(`      ${r.locations.map((/** @type {any} */ x) => `${x.wall}: ${x.label}`).join("; ")}`);
  }
  return l;
}

/** @param {any} s */
export function openingScheduleCsv(s) {
  const q = (/** @type {any} */ v) => { const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) || /[",\n]/.test(t) ? `"${(/^[=+\-@\t\r]/.test(t) ? "'" : "") + t.replace(/"/g, '""')}"` : t; };
  if (!s || !Array.isArray(s.rows)) throw new TypeError("openingScheduleCsv needs an opening schedule result");
  const out = ["mark,kind,count,ro_width_in,ro_height_in,unit_width_in,unit_height_in,header,header_plies,header_height_in,sill_height_in,locations"];
  for (const r of s.rows) out.push([r.mark, r.kind, r.count, fmt(r.width), fmt(r.height), fmt(r.unitWidth), fmt(r.unitHeight), r.header, r.headerPlies, r.headerHeight ?? "", r.sillHeight ?? "", r.locations.map((/** @type {any} */ x) => `${x.wall}: ${x.label}`).join("; ")].map(q).join(","));
  return out.join("\n");
}
