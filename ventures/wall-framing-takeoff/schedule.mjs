// @ts-check
// A new-home schedule: critical path over the builder's own activity list.
// The tool ships no durations. Every activity, duration (working days),
// predecessor and optional crew comes from the plan's `schedule` object:
//   { start: "2026-03-02", activities: [{ id, name, days, after: [ids], crew?, lag? }],
//     crews: { framing: 1 }, slips: [{ id, days }] }
// `lag` is working days of waiting after predecessors finish (cure time, an
// inspection booking). Weekends are skipped (Mon-Fri working days); `holidays` is
// an optional list of YYYY-MM-DD dates (yours; none are shipped) that are skipped
// too, as are `weatherDays` (dates the crew will not work, same format). `weatherLoss` (0 to 1) adds
// ceil(days * loss) to activities marked `exposed: true`. Weather itself is not forecast. Crew levelling is a serial greedy pass (earliest start, ties by
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
    const s = Math.max(/** @type {any} */ (a).nb || 0, ...(a.after || []).map((p) => /** @type {number} */ (ef.get(p)) + (a.lag || 0)));
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
    return { id, name: a.name || id, derived: /** @type {any} */ (a).derived, days: a.days, crew: a.crew || null, es: es.get(id), ef: ef.get(id), ls: ls.get(id), lf: lf.get(id), slack, critical: slack === 0 };
  });
  return { errors: [], rows, end };
}

/** Serial crew levelling: push activities later until their crew has a free slot. */
function level(/** @type {Activity[]} */ acts, /** @type {Record<string, number>} */ crews, /** @type {any[]} */ rows, /** @type {Map<string, Set<number>>} */ crewOff = new Map()) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  const slack = new Map(rows.map((r) => [r.id, r.slack]));
  const start = new Map(), finish = new Map();
  /** @type {Map<string, [number, number][]>} */ const busy = new Map();
  const left = new Set(acts.map((a) => a.id));
  while (left.size) {
    const ready = [...left].map((id) => /** @type {Activity} */ (byId.get(id))).filter((a) => (a.after || []).every((p) => finish.has(p)));
    const earliest = (/** @type {Activity} */ a) => Math.max(/** @type {any} */ (a).nb || 0, ...(a.after || []).map((p) => finish.get(p) + (a.lag || 0)));
    ready.sort((a, b) => earliest(a) - earliest(b) || slack.get(a.id) - slack.get(b.id));
    const a = ready[0];
    let s = earliest(a);
    let len = a.days;
    const cap = a.crew ? crews[a.crew] : undefined;
    const co = (a.crew && crewOff.get(a.crew)) || new Set();
    // Resource calendar: the crew's own days off. Work pauses on them, so the span grows.
    const span = (/** @type {number} */ from) => { let f = from, left = a.days; while (co.has(f)) f++; const st = f; while (left > 0) { if (!co.has(f)) left--; f++; } return [st, f]; };
    if (co.size && a.days > 0) { const [st, f] = span(s); s = st; len = f - st; }
    if (a.crew && cap != null && a.days > 0) {
      const iv = busy.get(a.crew) || [];
      for (;;) {
        const clash = iv.filter(([x, y]) => x < s + len && y > s).length;
        if (clash < cap) break;
        s = Math.min(...iv.filter(([x, y]) => x < s + len && y > s).map(([, y]) => y));
        if (co.size) { const [st, f] = span(s); s = st; len = f - st; }
      }
      iv.push([s, s + len]); busy.set(a.crew, iv);
    }
    start.set(a.id, s); finish.set(a.id, s + len); left.delete(a.id);
  }
  return { start, finish, end: Math.max(0, ...[...finish.values()]) };
}

/**
 * Quantities the takeoff already counted, by the key a schedule activity can name in `per`.
 * @param {any} result takeoff result with optional sheathing, floor, roof, drywall, siding attached
 * @returns {Record<string, number>}
 */
export function quantities(result) {
  /** @type {Record<string, number | undefined>} */
  const q = {
    wallFeet: result?.summary?.wallFeet, pieces: result?.summary?.pieces, boards: result?.summary?.boards,
    wallSheathingSheets: result?.sheathing?.summary?.sheets, subfloorSheets: result?.floor?.sheets?.count,
    roofSheets: result?.roof?.sheets?.count, roofSquares: result?.roof?.roofing?.squares,
    shingleBundles: result?.roof?.roofing?.shingleBundles, trusses: result?.roof?.trusses?.count,
    drywallSheets: result?.drywall?.sheets?.count, sidingBoards: result?.siding?.boards,
    nails: result?.fasteners?.total ?? result?.fasteners?.nails?.total,
  };
  return Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v === "number" && v >= 0));
}

/**
 * Activities written as `{ id, per: "wallFeet", rate: 40 }` take their duration from the takeoff:
 * days = ceil(quantity / rate), with `rate` a figure you type (units per crew-day; none is shipped).
 * `minDays` floors it (mobilisation). An activity with a typed `days` and no `per` is left alone.
 * @param {any} input the plan's `schedule` object
 * @param {any} result the takeoff result
 */
export function resolveRates(input, result) {
  if (!input?.activities) return input;
  const q = quantities(result);
  /** @type {string[]} */ const errors = [];
  const activities = input.activities.map((/** @type {any} */ a) => {
    if (a.per == null) return a;
    if (!(a.rate > 0)) { errors.push(`${a.id}: "per" needs a positive "rate" (units per crew-day, your figure).`); return a; }
    if (!(a.per in q)) { errors.push(`${a.id}: the takeoff has no quantity "${a.per}" here (have: ${Object.keys(q).join(", ") || "none"}).`); return a; }
    const days = Math.max(a.minDays || 0, Math.ceil(q[a.per] / a.rate - 1e-9));
    return { ...a, days, derived: `${q[a.per]} ${a.per} / ${a.rate} per crew-day` };
  });
  return { ...input, activities, rateErrors: errors };
}

/** @param {any} input the plan's `schedule` object */
export function schedule(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["The schedule must be an object with `activities`."] };
  if (input.activities != null && !Array.isArray(input.activities)) return { ok: false, errors: ["`activities` must be a list."] };
  // Shape checks before anything reads the activities: a null entry, a text `after` or a crew count of 0 used to throw or loop forever.
  const shape = [];
  (input.activities || []).forEach((a, i) => {
    if (!a || typeof a !== "object" || Array.isArray(a)) { shape.push(`Activity ${i + 1} is not an object.`); return; }
    if (a.after != null && !Array.isArray(a.after)) shape.push(`${a.id ?? "Activity " + (i + 1)}: after must be a list of activity ids.`);
    if (a.days != null && typeof a.days !== "number") shape.push(`${a.id ?? "Activity " + (i + 1)}: days must be a number.`);
  });
  if (input.crews != null && (typeof input.crews !== "object" || Array.isArray(input.crews))) shape.push("`crews` must be an object of crew name to head count.");
  else for (const [c, n] of Object.entries(input.crews || {})) if (n != null && !(typeof n === "number" && Number.isFinite(n) && n >= 1)) shape.push(`crews.${c} must be a number of 1 or more (it is ${JSON.stringify(n)}); a crew of 0 could never start work.`);
  if (shape.length) return { ok: false, errors: shape };
  const errors = [...(input?.rateErrors || [])];
  // weatherLoss: a fraction (your figure, 0 to 1) of working days lost to weather on activities marked `exposed: true`;
  // each such activity grows by ceil(days * weatherLoss). It is an allowance you type, not a forecast.
  const wl = input?.weatherLoss;
  if (wl != null && !(typeof wl === "number" && wl >= 0 && wl <= 1)) return { ok: false, errors: ["weatherLoss must be a number from 0 to 1 (fraction of exposed working days lost)."] };
  const start = new Date((input.start || "2026-01-05") + "T00:00:00Z");
  if (isNaN(start.getTime())) return { ok: false, errors: [`start "${input.start}" is not a date (YYYY-MM-DD).`] };
  const offList = [...(input.holidays || []), ...(input.weatherDays || [])];
  const badOff = offList.filter((/** @type {string} */ h) => isNaN(new Date(h + "T00:00:00Z").getTime()));
  if (badOff.length) return { ok: false, errors: [`holidays and weatherDays must be YYYY-MM-DD dates; not: ${badOff.join(", ")}.`] };
  const off = new Set(offList.map((/** @type {string} */ h) => new Date(h + "T00:00:00Z").toISOString().slice(0, 10)));
  const date = (/** @type {number} */ n) => dateOf(start, n, off);
  // notBefore: "YYYY-MM-DD" on an activity = start no earlier than that date (a delivery, a permit, a long-lead window order). Your date, not a forecast.
  const nbErrors = [];
  const toIndex = (/** @type {Date} */ t) => { let n = 0; const d = new Date(start); while (!isWork(d, off)) d.setUTCDate(d.getUTCDate() + 1); while (d < t) { d.setUTCDate(d.getUTCDate() + 1); if (isWork(d, off)) n++; } return n; };
  const withNb = (/** @type {any} */ a) => {
    if (a.notBefore == null) return a;
    const t = new Date(a.notBefore + "T00:00:00Z");
    if (typeof a.notBefore !== "string" || isNaN(t.getTime())) { nbErrors.push(`${a.id}: notBefore "${a.notBefore}" is not a date (YYYY-MM-DD).`); return a; }
    if (t <= start) return a;
    // first working day on or after t
    const d = new Date(t); while (!isWork(d, off)) d.setUTCDate(d.getUTCDate() + 1);
    return { ...a, nb: toIndex(d), derived: `${a.derived ? a.derived + "; " : ""}not before ${a.notBefore}` };
  };
  const rawActs = /** @type {Activity[]} */ ((input?.activities || []).map(withNb));
  if (nbErrors.length) return { ok: false, errors: nbErrors };
  const hasMonthly = Object.keys(input?.weatherRate || {}).length > 0;
  let acts = /** @type {Activity[]} */ (rawActs.map((/** @type {any} */ a) => !hasMonthly && wl && a.exposed && a.days > 0 ? { ...a, days: a.days + Math.ceil(a.days * wl - 1e-9), derived: `${a.derived ? a.derived + "; " : ""}+${Math.ceil(a.days * wl - 1e-9)}d weather allowance (${wl * 100}% of ${a.days}d)` } : a));
  if (input?.rateErrors?.length) return { ok: false, errors };
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
  let base = cpm(acts);
  if (base.errors.length) return { ok: false, errors: base.errors };
  // weatherRate: { "YYYY-MM": fraction } share of working days lost that month (your figure; none shipped). It replaces the flat
  // `weatherLoss` for exposed activities: days become ceil(days / (1 - rate)) by the month the activity starts in (months not
  // listed use `weatherLoss`, else 0). A few passes settle the months, since longer activities push later ones into other months.
  const wr = input.weatherRate || {};
  for (const [k, v] of Object.entries(wr)) if (!/^\d{4}-\d{2}$/.test(k) || typeof v !== "number" || !(v >= 0 && v <= 0.9)) return { ok: false, errors: [`weatherRate.${k} must be a fraction from 0 to 0.9 under a YYYY-MM key.`] };
  if (hasMonthly && rawActs.some((a) => a.exposed)) {
    for (let pass = 0; pass < 6; pass++) {
      const next = rawActs.map((a) => {
        if (!a.exposed) return a;
        const r = base.rows.find((x) => x.id === a.id);
        const rate = wr[date(r ? r.es : 0).slice(0, 7)] ?? wl ?? 0;
        const days = rate > 0 ? Math.ceil(a.days / (1 - rate) - 1e-9) : a.days;
        return rate > 0 ? { ...a, days, derived: `${a.derived ? a.derived + "; " : ""}${a.days}d + weather at ${Math.round(rate * 100)}% lost days` } : a;
      });
      const nb = cpm(next.map((a) => ({ ...a })));
      const same = nb.rows.length === base.rows.length && nb.rows.every((r, i) => r.days === base.rows[i].days);
      acts = next; base = nb;
      if (same) break;
    }
  }
  // crewOff: { crew: [YYYY-MM-DD] } days that crew is unavailable (another job, vacation); converted to project working-day indices.
  const crewOff = new Map();
  for (const [c, list] of Object.entries(input.crewOff || {})) {
    if (!Array.isArray(list) || list.some((h) => typeof h !== "string" || isNaN(new Date(h + "T00:00:00Z").getTime()))) return { ok: false, errors: [`crewOff.${c} must be a list of YYYY-MM-DD dates.`] };
    if (crews[c] == null) warn.push(`crewOff names crew "${c}", which has no count in \`crews\`; it is ignored.`);
    const set = new Set();
    for (const h of list) { const t = new Date(h + "T00:00:00Z"); if (!isWork(t, off) || t < start) continue; let n = 0; const d = new Date(start); while (!isWork(d, off)) d.setUTCDate(d.getUTCDate() + 1); while (d < t) { d.setUTCDate(d.getUTCDate() + 1); if (isWork(d, off)) n++; } set.add(n); }
    crewOff.set(c, set);
  }
  const lv = level(acts, crews, base.rows, crewOff);
  const rows = base.rows.map((r) => ({ ...r, leveledStart: lv.start.get(r.id), leveledFinish: lv.finish.get(r.id), startDate: date(lv.start.get(r.id)), finishDate: r.days ? date(lv.finish.get(r.id) - 1) : date(lv.start.get(r.id)) }));
  // carryPerDay: your cost of one more working day on the job (loan interest, insurance, site costs), a figure you type; none shipped.
  const carry = input.carryPerDay ?? null;
  if (carry != null && !(typeof carry === "number" && carry >= 0)) return { ok: false, errors: ["carryPerDay must be a number of dollars per working day, zero or more."] };
  // deadline: "YYYY-MM-DD", your contract completion date. Reported as working days late (positive) or early (negative) against the
  // finish with your crews; a weekend or holiday deadline counts as the working day before it. Your date, not a forecast.
  let deadline = null;
  if (input.deadline != null) {
    const t = new Date(input.deadline + "T00:00:00Z");
    if (typeof input.deadline !== "string" || isNaN(t.getTime())) return { ok: false, errors: [`deadline "${input.deadline}" is not a date (YYYY-MM-DD).`] };
    const d = new Date(t); while (!isWork(d, off)) d.setUTCDate(d.getUTCDate() - 1);
    const idx = d < start ? -1 : toIndex(d);
    const daysLate = (lv.end - 1) - idx;
    deadline = { deadline: input.deadline, daysLate, ...(carry != null && daysLate > 0 ? { lateCost: daysLate * carry } : {}) };
  }
  // cost: dollars you type on an activity (quote, labor + material). Spread evenly over its levelled working days and summed by
  // calendar month, so a lender's draw schedule or cash-flow need can be read off. Nothing is priced by this tool.
  let cashFlow = null;
  const costed = acts.filter((/** @type {any} */ a) => a.cost != null);
  const badCost = costed.filter((/** @type {any} */ a) => !(typeof a.cost === "number" && Number.isFinite(a.cost) && a.cost >= 0));
  if (badCost.length) return { ok: false, errors: badCost.map((/** @type {any} */ a) => `${a.id}: cost must be a number of dollars, zero or more.`) };
  if (costed.length) {
    /** @type {Map<string, number>} */ const byMonth = new Map();
    /** @type {Map<string, number>} */ const byWeek = new Map();
    const weekOf = (/** @type {string} */ ds) => { const d = new Date(ds + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    for (const a of /** @type {any[]} */ (costed)) {
      const st = /** @type {number} */ (lv.start.get(a.id)), fin = /** @type {number} */ (lv.finish.get(a.id));
      const n = Math.max(1, fin - st);
      for (let i = st; i < st + n; i++) { const ds = date(i), m = ds.slice(0, 7), w = weekOf(ds); byMonth.set(m, (byMonth.get(m) || 0) + a.cost / n); byWeek.set(w, (byWeek.get(w) || 0) + a.cost / n); }
    }
    let cum = 0;
    const months = [...byMonth.keys()].sort().map((m) => { const spend = Math.round(/** @type {number} */ (byMonth.get(m)) * 100) / 100; cum = Math.round((cum + spend) * 100) / 100; return { month: m, spend, cumulative: cum }; });
    const total = Math.round(costed.reduce((t, /** @type {any} */ a) => t + a.cost, 0) * 100) / 100;
    if (months.length) months[months.length - 1].cumulative = total;
    // Weeks start Monday; the weekly figures show the peak funding week a month total hides.
    let wcum = 0;
    const weeks = [...byWeek.keys()].sort().map((w) => { const spend = Math.round(/** @type {number} */ (byWeek.get(w)) * 100) / 100; wcum = Math.round((wcum + spend) * 100) / 100; return { week: w, spend, cumulative: wcum }; });
    if (weeks.length) weeks[weeks.length - 1].cumulative = total;
    cashFlow = { total, weeks, peakWeek: weeks.reduce((b, x) => (x.spend > b.spend ? x : b), weeks[0]).week, months, peakMonth: months.reduce((b, x) => (x.spend > b.spend ? x : b), months[0]).month };
  }
  // What a slip does: re-run with the extra days added and compare the finish.
  const slips = (input.slips || []).map((/** @type {{ id: string, days: number }} */ sl) => {
    if (!ids.has(sl.id)) return { id: sl.id, days: sl.days, error: "not an activity" };
    const a2 = acts.map((a) => (a.id === sl.id ? { ...a, days: a.days + sl.days } : a));
    const c2 = cpm(a2);
    const l2 = level(a2, crews, c2.rows, crewOff);
    const leveledFinishShift = l2.end - lv.end;
    return { id: sl.id, days: sl.days, finishShift: c2.end - (base.end ?? 0), leveledFinishShift, newFinishDate: date(Math.max(0, l2.end - 1)), ...(carry != null ? { carryCost: leveledFinishShift * carry } : {}) };
  });
  return {
    ok: true, warnings: warn, start: date(0), workingDays: base.end, finishDate: date(Math.max(0, (base.end ?? 0) - 1)),
    leveledDays: lv.end, leveledFinishDate: date(Math.max(0, lv.end - 1)),
    criticalPath: rows.filter((r) => r.critical).sort((a, b) => a.es - b.es).map((r) => r.id),
    rows, slips,
    ...(deadline ? { deadline } : {}),
    ...(cashFlow ? { cashFlow } : {}),
    ...(carry != null ? { carryPerDay: carry, carryTotal: lv.end * carry } : {}),
  };
}

/** @param {any} s */
export function scheduleText(s) {
  if (!s.ok) return s.errors.map((/** @type {string} */ e) => `  - ${e}`);
  const out = [`  ${s.workingDays} working days from ${s.start}, finishing ${s.finishDate} with unlimited crews; ${s.leveledDays} days (${s.leveledFinishDate}) with the crews you typed.`];
  out.push(`  Critical path: ${s.criticalPath.join(" -> ")}`);
  for (const r of s.rows.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.leveledStart - b.leveledStart)) out.push(`  ${r.critical ? "*" : " "} ${r.id.padEnd(12)} ${String(r.days).padStart(3)}d  ${r.startDate} to ${r.finishDate}  slack ${r.slack}${r.crew ? `  [${r.crew}]` : ""}  ${r.name}${r.derived ? `  (${r.derived})` : ""}`);
  for (const sl of s.slips) out.push(sl.error ? `  Slip ${sl.id}: ${sl.error}` : `  A ${sl.days}-day slip on ${sl.id} moves the finish ${sl.finishShift} day(s) (${sl.leveledFinishShift} with crews), to ${sl.newFinishDate}${sl.carryCost != null ? `, which costs $${sl.carryCost.toLocaleString("en-US")} at your $${s.carryPerDay.toLocaleString("en-US")} per day` : ""}.`);
  if (s.cashFlow) { out.push(`  Spend by month (your activity costs, spread over each activity's days): total $${s.cashFlow.total.toLocaleString("en-US")}, heaviest month ${s.cashFlow.peakMonth}, heaviest week (from Monday) ${s.cashFlow.peakWeek} at $${s.cashFlow.weeks.reduce((b, /** @type {any} */ x) => Math.max(b, x.spend), 0).toLocaleString("en-US")}.`); for (const m of s.cashFlow.months) out.push(`    ${m.month}  $${m.spend.toLocaleString("en-US")}  (to date $${m.cumulative.toLocaleString("en-US")})`); }
  if (s.carryTotal != null) out.push(`  Carrying cost: $${s.carryTotal.toLocaleString("en-US")} for ${s.leveledDays} working days at your $${s.carryPerDay.toLocaleString("en-US")} per day.`);
  if (s.deadline) { const d = s.deadline; out.push(`  Deadline ${d.deadline}: ${d.daysLate > 0 ? `${d.daysLate} working day(s) late with your crews${d.lateCost != null ? `, ${"$" + d.lateCost.toLocaleString("en-US")} at your carrying cost` : ""}` : d.daysLate < 0 ? `${-d.daysLate} working day(s) to spare` : "met with no spare day"}.`); }
  for (const w of s.warnings) out.push(`  note: ${w}`);
  out.push("  * = critical. Durations, order and crews are your inputs; weekends and any holidays or weather days you list are skipped; weather is not forecast.");
  return out;
}

/** The schedule as a spreadsheet file: one row per activity in start order, then the slips. Text only; no figures beyond the schedule's own.
 * @param {any} s */
export function scheduleCsv(s) {
  const q = (/** @type {any} */ v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  if (!s.ok) return s.errors.map((/** @type {string} */ e) => q("error: " + e)).join("\n") + "\n";
  const rows = [["id", "name", "crew", "days", "start", "finish", "slack", "critical", "note"],
    ...s.rows.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.leveledStart - b.leveledStart || a.es - b.es).map((/** @type {any} */ r) => [r.id, r.name ?? "", r.crew ?? "", r.days, r.startDate, r.finishDate, r.slack, r.critical ? "yes" : "no", r.derived ?? ""])];
  for (const sl of s.slips) rows.push(["slip:" + sl.id, "", "", sl.days, "", sl.newFinishDate ?? "", "", "", sl.error ?? `finish moves ${sl.leveledFinishShift} day(s) with crews${sl.carryCost != null ? `, carry $${sl.carryCost}` : ""}`]);
  if (s.cashFlow) for (const w of s.cashFlow.weeks) rows.push(["week:" + w.week, "", "", "", "", "", "", "", `spend ${w.spend}; to date ${w.cumulative}`]);
  if (s.cashFlow) for (const m of s.cashFlow.months) rows.push(["spend:" + m.month, "", "", "", "", "", "", "", `spend ${m.spend}; to date ${m.cumulative}`]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
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
      { id: "plumb", name: "Rough plumbing", days: 3, after: ["walls"], notBefore: "2026-04-03" },
      { id: "insp", name: "Framing inspection", days: 1, after: ["roof", "plumb"], lag: 2 },
      { id: "drywall", name: "Drywall", days: 6, after: ["insp"] },
    ],
    slips: [{ id: "insp", days: 3 }],
  };
}

/**
 * A starting activity list for a one-storey slab-on-grade new home: the usual order of trades and the
 * predecessors, with every duration 0. Order is common practice; durations are yours to type (none shipped).
 * Activities with a `per` hint can take their days from the takeoff: add a `rate` and they resolve.
 */
export function templateSchedule() {
  const A = (/** @type {string} */ id, /** @type {string} */ name, /** @type {string[]} */ after = [], /** @type {any} */ extra = {}) => ({ id, name, days: 0, after, ...extra });
  return {
    start: "YYYY-MM-DD",
    crews: { framing: 1 },
    note: "Order only. Type your own days (or per + rate); an activity left at 0 days takes no time.",
    activities: [
      A("site", "Clear, grade and stake"),
      A("footings", "Footings", ["site"]),
      A("footinsp", "Footing inspection", ["footings"], { lag: 1 }),
      A("stem", "Stem walls or foundation walls", ["footinsp"]),
      A("underslab", "Under-slab plumbing and electrical", ["stem"]),
      A("slab", "Slab pour", ["underslab"]),
      A("slabcure", "Slab cure", ["slab"], { lag: 0 }),
      A("walls", "Wall framing", ["slabcure"], { crew: "framing", per: "wallFeet", exposed: true }),
      A("roof", "Roof framing and sheathing", ["walls"], { crew: "framing", per: "roofSheets", exposed: true }),
      A("dry", "Windows, doors and weather barrier", ["roof"], { exposed: true }),
      A("roofing", "Roofing", ["roof"], { per: "roofSquares", exposed: true }),
      A("mep", "Rough plumbing, electrical and HVAC", ["dry"]),
      A("framinsp", "Framing and rough-in inspections", ["mep"], { lag: 1 }),
      A("insul", "Insulation", ["framinsp"]),
      A("insulinsp", "Insulation inspection", ["insul"], { lag: 1 }),
      A("drywall", "Drywall hang, tape and finish", ["insulinsp"], { per: "drywallSheets" }),
      A("siding", "Siding and exterior trim", ["dry"], { per: "sidingBoards", exposed: true }),
      A("paint", "Paint and interior trim", ["drywall"]),
      A("finish", "Cabinets, flooring, fixtures", ["paint"]),
      A("final", "Final inspection and certificate of occupancy", ["finish", "siding", "roofing"], { lag: 1 }),
    ],
  };
}
