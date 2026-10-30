// @ts-check
// A new-home schedule: critical path over the builder's own activity list.
// The tool ships no durations. Every activity, duration (working days),
// predecessor and optional crew comes from the plan's `schedule` object:
//   { start: "2026-03-02", activities: [{ id, name, days, after: [ids], crew?, lag? }],
//     crews: { framing: 1 }, slips: [{ id, days }] }
// `lag` is working days of waiting after predecessors finish (cure time, an
// inspection booking). Weekends are skipped (Mon-Fri working days); `holidays` is
// an optional list of YYYY-MM-DD dates (yours; none are shipped) that are skipped
// too, as are `weatherDays` (dates the crew will not work, same format). Weather
// itself is not forecast. Crew levelling is a serial greedy pass (earliest start, ties by
// least slack); it is a heuristic, not an optimal resource schedule.

/** @typedef {{ id: string, name?: string, days: number, after?: string[], crew?: string, lag?: number }} Activity */

/** @param {Set<string>} off dates that are not worked besides weekends */
const isWork = (/** @type {Date} */ d, off = new Set()) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !off.has(d.toISOString().slice(0, 10));
/** Date of working day index n (0 = start, rolled forward to a working day). */
function dateOf(/** @type {Date} */ start, /** @type {number} */ n, /** @type {Set<string>} */ off = new Set()) {
  const d = new Date(start);
  while (!isWork(d, off)) d.setUTCDate(d.getUTCDate() + 1);
  let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (isWork(d, off)) left--; }
  return d.toISOString().slice(0, 10);
}

/**
 * Forward and backward pass. Returns per-activity early/late times in working-day offsets.
 * @param {Activity[]} acts
 */
function cpm(acts) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  /** @type {string[]} */ const order = [];
  const state = new Map();
  /** @type {string[]} */ const errors = [];
  const visit = (/** @type {string} */ id, /** @type {string[]} */ path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { errors.push(`Circular dependency: ${[...path, id].join(" -> ")}`); return; }
    state.set(id, 1);
    for (const p of byId.get(id)?.after || []) visit(p, [...path, id]);
    state.set(id, 2); order.push(id);
  };
  for (const a of acts) visit(a.id, []);
  if (errors.length) return { errors: [...new Set(errors)], rows: [] };
  const es = new Map(), ef = new Map();
  for (const id of order) {
    const a = /** @type {Activity} */ (byId.get(id));
    const s = Math.max(0, ...(a.after || []).map((p) => /** @type {number} */ (ef.get(p)) + (a.lag || 0)));
    es.set(id, s); ef.set(id, s + a.days);
  }
  const end = Math.max(0, ...[...ef.values()]);
  const succ = new Map(acts.map((a) => [a.id, /** @type {Activity[]} */ ([])]));
  for (const a of acts) for (const p of a.after || []) succ.get(p)?.push(a);
  const ls = new Map(), lf = new Map();
  for (const id of [...order].reverse()) {
    const a = /** @type {Activity} */ (byId.get(id));
    const f = Math.min(end, ...(succ.get(id) || []).map((s) => /** @type {number} */ (ls.get(s.id)) - (s.lag || 0)));
    lf.set(id, f); ls.set(id, f - a.days);
  }
  const rows = order.map((id) => {
    const a = /** @type {Activity} */ (byId.get(id));
    const slack = /** @type {number} */ (ls.get(id)) - /** @type {number} */ (es.get(id));
    return { id, name: a.name || id, days: a.days, crew: a.crew || null, es: es.get(id), ef: ef.get(id), ls: ls.get(id), lf: lf.get(id), slack, critical: slack === 0 };
  });
  return { errors: [], rows, end };
}

/** Serial crew levelling: push activities later until their crew has a free slot. */
function level(/** @type {Activity[]} */ acts, /** @type {Record<string, number>} */ crews, /** @type {any[]} */ rows) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  const slack = new Map(rows.map((r) => [r.id, r.slack]));
  const start = new Map(), finish = new Map();
  /** @type {Map<string, [number, number][]>} */ const busy = new Map();
  const left = new Set(acts.map((a) => a.id));
  while (left.size) {
    const ready = [...left].map((id) => /** @type {Activity} */ (byId.get(id))).filter((a) => (a.after || []).every((p) => finish.has(p)));
    const earliest = (/** @type {Activity} */ a) => Math.max(0, ...(a.after || []).map((p) => finish.get(p) + (a.lag || 0)));
    ready.sort((a, b) => earliest(a) - earliest(b) || slack.get(a.id) - slack.get(b.id));
    const a = ready[0];
    let s = earliest(a);
    const cap = a.crew ? crews[a.crew] : undefined;
    if (a.crew && cap != null && a.days > 0) {
      const iv = busy.get(a.crew) || [];
      for (;;) {
        const clash = iv.filter(([x, y]) => x < s + a.days && y > s).length;
        if (clash < cap) break;
        s = Math.min(...iv.filter(([x, y]) => x < s + a.days && y > s).map(([, y]) => y));
      }
      iv.push([s, s + a.days]); busy.set(a.crew, iv);
    }
    start.set(a.id, s); finish.set(a.id, s + a.days); left.delete(a.id);
  }
  return { start, finish, end: Math.max(0, ...[...finish.values()]) };
}

/** @param {any} input the plan's `schedule` object */
export function schedule(input) {
  const errors = [];
  const acts = /** @type {Activity[]} */ (input?.activities || []);
  if (!acts.length) return { ok: false, errors: ["The schedule has no activities."] };
  const ids = new Set();
  for (const a of acts) {
    if (!a.id) errors.push("An activity has no id.");
    else if (ids.has(a.id)) errors.push(`Duplicate activity id ${a.id}.`);
    ids.add(a.id);
    if (!(a.days >= 0)) errors.push(`${a.id}: days must be zero or more.`);
    if ((a.lag ?? 0) < 0) errors.push(`${a.id}: lag cannot be negative.`);
  }
  for (const a of acts) for (const p of a.after || []) if (!ids.has(p)) errors.push(`${a.id} comes after "${p}", which is not an activity.`);
  const crews = input.crews || {};
  for (const a of acts) if (a.crew && crews[a.crew] == null) errors.push(`${a.id}: crew "${a.crew}" has no count in \`crews\`; it is left unlimited.`);
  if (errors.some((e) => !e.includes("left unlimited"))) return { ok: false, errors };
  const warn = errors;
  const base = cpm(acts);
  if (base.errors.length) return { ok: false, errors: base.errors };
  const start = new Date((input.start || "2026-01-05") + "T00:00:00Z");
  if (isNaN(start.getTime())) return { ok: false, errors: [`start "${input.start}" is not a date (YYYY-MM-DD).`] };
  const offList = [...(input.holidays || []), ...(input.weatherDays || [])];
  const badOff = offList.filter((/** @type {string} */ h) => isNaN(new Date(h + "T00:00:00Z").getTime()));
  if (badOff.length) return { ok: false, errors: [`holidays and weatherDays must be YYYY-MM-DD dates; not: ${badOff.join(", ")}.`] };
  const off = new Set(offList.map((/** @type {string} */ h) => new Date(h + "T00:00:00Z").toISOString().slice(0, 10)));
  const date = (/** @type {number} */ n) => dateOf(start, n, off);
  const lv = level(acts, crews, base.rows);
  const rows = base.rows.map((r) => ({ ...r, leveledStart: lv.start.get(r.id), leveledFinish: lv.finish.get(r.id), startDate: date(lv.start.get(r.id)), finishDate: r.days ? date(lv.finish.get(r.id) - 1) : date(lv.start.get(r.id)) }));
  // What a slip does: re-run with the extra days added and compare the finish.
  const slips = (input.slips || []).map((/** @type {{ id: string, days: number }} */ sl) => {
    if (!ids.has(sl.id)) return { id: sl.id, days: sl.days, error: "not an activity" };
    const a2 = acts.map((a) => (a.id === sl.id ? { ...a, days: a.days + sl.days } : a));
    const c2 = cpm(a2);
    const l2 = level(a2, crews, c2.rows);
    return { id: sl.id, days: sl.days, finishShift: c2.end - (base.end ?? 0), leveledFinishShift: l2.end - lv.end, newFinishDate: date(Math.max(0, l2.end - 1)) };
  });
  return {
    ok: true, warnings: warn, start: date(0), workingDays: base.end, finishDate: date(Math.max(0, (base.end ?? 0) - 1)),
    leveledDays: lv.end, leveledFinishDate: date(Math.max(0, lv.end - 1)),
    criticalPath: rows.filter((r) => r.critical).sort((a, b) => a.es - b.es).map((r) => r.id),
    rows, slips,
  };
}

/** @param {any} s */
export function scheduleText(s) {
  if (!s.ok) return s.errors.map((/** @type {string} */ e) => `  - ${e}`);
  const out = [`  ${s.workingDays} working days from ${s.start}, finishing ${s.finishDate} with unlimited crews; ${s.leveledDays} days (${s.leveledFinishDate}) with the crews you typed.`];
  out.push(`  Critical path: ${s.criticalPath.join(" -> ")}`);
  for (const r of s.rows.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.leveledStart - b.leveledStart)) out.push(`  ${r.critical ? "*" : " "} ${r.id.padEnd(12)} ${String(r.days).padStart(3)}d  ${r.startDate} to ${r.finishDate}  slack ${r.slack}${r.crew ? `  [${r.crew}]` : ""}  ${r.name}`);
  for (const sl of s.slips) out.push(sl.error ? `  Slip ${sl.id}: ${sl.error}` : `  A ${sl.days}-day slip on ${sl.id} moves the finish ${sl.finishShift} day(s) (${sl.leveledFinishShift} with crews), to ${sl.newFinishDate}.`);
  for (const w of s.warnings) out.push(`  note: ${w}`);
  out.push("  * = critical. Durations, order and crews are your inputs; weekends and any holidays or weather days you list are skipped; weather is not forecast.");
  return out;
}

export function sampleSchedule() {
  return {
    start: "2026-03-02",
    crews: { framing: 1, concrete: 1 },
    activities: [
      { id: "footings", name: "Footings", days: 3, crew: "concrete" },
      { id: "stem", name: "Stem walls", days: 4, after: ["footings"], crew: "concrete" },
      { id: "cure", name: "Stem cure", days: 0, after: ["stem"], lag: 5 },
      { id: "slab", name: "Slab", days: 2, after: ["cure"], crew: "concrete" },
      { id: "walls", name: "Wall framing", days: 8, after: ["slab"], crew: "framing" },
      { id: "roof", name: "Roof framing", days: 5, after: ["walls"], crew: "framing" },
      { id: "plumb", name: "Rough plumbing", days: 3, after: ["walls"] },
      { id: "insp", name: "Framing inspection", days: 1, after: ["roof", "plumb"], lag: 2 },
      { id: "drywall", name: "Drywall", days: 6, after: ["insp"] },
    ],
    slips: [{ id: "insp", days: 3 }],
  };
}
