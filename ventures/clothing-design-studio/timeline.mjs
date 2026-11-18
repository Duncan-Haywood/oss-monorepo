/**
 * Production timeline planner.
 *
 * "When do I have to start to have stock on sale by a date, and if I start
 * today, when is it on sale?" A first clothing run is a chain of waits: sample
 * rounds, the factory's making time, freight, customs. Designers who have not
 * done it before miss the date by months, usually through a second sample
 * round or a factory closure they did not count.
 *
 * Each stage has a number of days and an owner of the clock:
 *   - "factory": the factory's working time. It stops during a closure window
 *     (Lunar New Year, a summer shutdown), and resumes after it.
 *   - "calendar": freight, couriers, customs, QC: runs through closures.
 *   - "you": your own work and decisions: runs through closures.
 * A delay allowance (percent, rounded up) pads factory and calendar stages, because
 * they slip more often than they finish early. Your own stages are not padded:
 * you control them.
 *
 * Everything is typed by the designer. The defaults are a rough first-run
 * shape for a cut-and-sew tee or hoodie, not a quote: replace them with the
 * factory's and forwarder's own numbers. Closure dates are likewise typed; the
 * default is a typical Lunar New Year shutdown and must be checked with the factory.
 */

const DAY = 86400000;

/** @param {string} s ISO date YYYY-MM-DD -> UTC day number, or NaN */
export function dayNumber(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN;
  return t / DAY;
}
export const isoDate = n => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);

export const FREIGHT_DAYS = {
  sea: { transit: 35, clearance: 7, label: "Sea freight" },
  air: { transit: 7, clearance: 4, label: "Air freight" },
  express: { transit: 4, clearance: 3, label: "Express courier" },
};

/** A typical Lunar New Year shutdown for 2027, as a starting point only (dates must be checked with the factory). */
export const DEFAULT_CLOSURES = [{ name: "Lunar New Year (typical window; confirm with factory)", from: "2027-02-01", to: "2027-02-21" }];

/**
 * Build the stage list for a first run.
 * @param {object} [o]
 * @param {number} [o.sampleRounds=2]    sample rounds before you approve (1 to 5)
 * @param {boolean} [o.preProduction=true] a pre-production sample from the real bulk cloth
 * @param {"sea"|"air"|"express"} [o.freight="sea"]
 * @param {number} [o.productionDays=30]
 */
export function defaultStages(o = {}) {
  const rounds = Math.min(5, Math.max(1, Math.round(o.sampleRounds ?? 2)));
  const f = FREIGHT_DAYS[o.freight || "sea"] || FREIGHT_DAYS.sea;
  const st = [{ name: "Tech pack, fabric choice and factory quotes", days: 14, clock: "you" }];
  for (let r = 1; r <= rounds; r++) {
    st.push({ name: `Sample ${r}: factory makes it`, days: r === 1 ? 12 : 8, clock: "factory" });
    st.push({ name: `Sample ${r}: courier to you`, days: 5, clock: "calendar" });
    st.push({ name: `Sample ${r}: you fit it and write comments`, days: 4, clock: "you" });
  }
  if (o.preProduction !== false) {
    st.push({ name: "Pre-production sample from bulk cloth: making", days: 8, clock: "factory" });
    st.push({ name: "Pre-production sample: courier and sign-off", days: 8, clock: "calendar" });
  }
  st.push({ name: "Bulk cloth and trims in", days: 14, clock: "factory" });
  st.push({ name: "Production", days: Math.max(1, Math.round(o.productionDays ?? 30)), clock: "factory" });
  st.push({ name: "Quality inspection and fixes", days: 4, clock: "calendar" });
  st.push({ name: `${f.label}: transit`, days: f.transit, clock: "calendar" });
  st.push({ name: "Customs clearance and delivery to you", days: f.clearance, clock: "calendar" });
  st.push({ name: "Unpack, count, photograph and list", days: 3, clock: "you" });
  return st;
}

const inClosure = (d, closures) => closures.find(c => d >= c.from && d <= c.to);

/** Finish day (exclusive end) of `days` days of a stage starting at `start`. */
function runStage(start, days, clock, closures) {
  if (clock !== "factory") return { end: start + days, paused: 0, pauses: [] };
  let d = start, left = days, paused = 0;
  const pauses = [];
  while (left > 0) {
    const c = inClosure(d, closures);
    if (c) { paused++; if (!pauses.includes(c.name)) pauses.push(c.name); d++; continue; }
    d++; left--;
  }
  return { end: d, paused, pauses };
}

function normClosures(list) {
  const out = [];
  for (const c of list || []) {
    const from = dayNumber(c.from), to = dayNumber(c.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    out.push({ name: c.name || "Closure", from, to });
  }
  return out;
}

/** Run the chain forward from `start` (day number). */
function forward(stages, start, delayPct, closures) {
  let d = start;
  const rows = [];
  for (const s of stages) {
    const pad = s.clock === "you" ? 0 : Math.ceil(s.days * delayPct / 100 - 1e-9);
    const total = s.days + pad;
    const r = runStage(d, total, s.clock, closures);
    rows.push({ name: s.name, clock: s.clock, days: s.days, padDays: pad, closureDays: r.paused, closures: r.pauses, start: d, end: r.end });
    d = r.end;
  }
  return { rows, finish: d };
}

/**
 * @param {object} i
 * @param {Array<{name:string, days:number, clock:"you"|"factory"|"calendar"}>} [i.stages] defaults to defaultStages(i)
 * @param {string} [i.startDate]  ISO date you could begin; gives the earliest on-sale date
 * @param {string} [i.onSaleDate] ISO date stock must be ready to ship; gives the latest start
 * @param {number} [i.delayPct=15]
 * @param {Array<{name?:string, from:string, to:string}>} [i.closures] defaults to DEFAULT_CLOSURES
 */
export function planTimeline(i = {}) {
  const delayPct = Number.isFinite(+i.delayPct) ? +i.delayPct : 15;
  if (delayPct < 0 || delayPct > 200) return { error: "Delay allowance must be between 0 and 200 percent." };
  const stages = (i.stages || defaultStages(i)).map(s => ({ name: String(s.name), days: Math.round(+s.days), clock: s.clock }));
  for (const s of stages) {
    if (!Number.isFinite(s.days) || s.days < 0 || s.days > 400) return { error: `Stage "${s.name}": days must be 0 to 400.` };
    if (!["you", "factory", "calendar"].includes(s.clock)) return { error: `Stage "${s.name}": clock must be you, factory or calendar.` };
  }
  const closures = normClosures(i.closures ?? DEFAULT_CLOSURES);
  const start = i.startDate ? dayNumber(i.startDate) : NaN;
  const target = i.onSaleDate ? dayNumber(i.onSaleDate) : NaN;
  if (i.startDate && !Number.isFinite(start)) return { error: "Start date must look like 2027-01-15." };
  if (i.onSaleDate && !Number.isFinite(target)) return { error: "On-sale date must look like 2027-09-01." };
  if (!Number.isFinite(start) && !Number.isFinite(target)) return { error: "Give a start date, an on-sale date or both." };

  const out = { delayPct, stages: stages.length, notes: [] };
  const fmt = rows => rows.map(r => ({ ...r, start: isoDate(r.start), end: isoDate(r.end) }));
  const dry = forward(stages, 0, 0, []);
  out.totalDaysNoDelay = dry.finish;

  if (Number.isFinite(start)) {
    const f = forward(stages, start, delayPct, closures);
    out.earliest = { start: isoDate(start), onSale: isoDate(f.finish), totalDays: f.finish - start, rows: fmt(f.rows) };
    const lost = f.rows.reduce((a, r) => a + r.closureDays, 0);
    out.earliest.closureDaysLost = lost;
    if (lost > 0) out.notes.push(`${lost} factory days fall inside a closure window; the clock stops for them. A start that dodges the closure may finish sooner.`);
  }
  if (Number.isFinite(target)) {
    // finish() never decreases as start moves later, so the latest start is found by walking back.
    let s = target - dry.finish, guard = 0;
    while (forward(stages, s, delayPct, closures).finish > target && guard++ < 3000) s--;
    while (forward(stages, s + 1, delayPct, closures).finish <= target && guard++ < 6000) s++;
    const f = forward(stages, s, delayPct, closures);
    out.latest = { start: isoDate(s), onSale: isoDate(f.finish), totalDays: f.finish - s, rows: fmt(f.rows) };
    if (Number.isFinite(start)) {
      const late = out.earliest.onSale > isoDate(target) ? dayNumber(out.earliest.onSale) - target : 0;
      out.slackDays = start <= s ? s - start : -(start - s);
      out.lateDays = late;
      out.verdict = start <= s ? "on-track" : "late";
      out.notes.push(start <= s
        ? `Starting ${isoDate(start)} leaves ${s - start} days before the latest start.`
        : `Starting ${isoDate(start)} is ${start - s} days after the latest start; stock would be on sale about ${late} days after ${isoDate(target)}.`);
    }
  }
  const sampleRows = stages.filter(s => /^Sample \d/.test(s.name)).length / 3;
  if (sampleRows === 1) out.notes.push("One sample round is optimistic: a first sample almost always needs a change. Each extra round adds about 17 days here.");
  if (stages.some(s => s.days === 0)) out.notes.push("A stage with 0 days is a step you are skipping; skipped samples are where most first-run faults come from.");
  out.criticalAdds = stages.filter(s => s.clock === "factory").reduce((a, s) => a + s.days, 0);
  return out;
}

/** Bars drawn to scale for one schedule (`rows` as returned in earliest/latest). */
export function timelineSvg(rows, width = 760) {
  if (!rows?.length) return "";
  const a = dayNumber(rows[0].start), b = dayNumber(rows[rows.length - 1].end);
  const span = Math.max(1, b - a), lab = 250, h = 22, W = width, plot = W - lab - 10;
  const color = { you: "#6b1e2c", factory: "#b98a2e", calendar: "#6a8a9a" };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let g = "";
  rows.forEach((r, k) => {
    const x = lab + (dayNumber(r.start) - a) / span * plot;
    const w = Math.max(2, (dayNumber(r.end) - dayNumber(r.start)) / span * plot);
    const y = k * h + 4;
    g += `<text x="0" y="${y + 13}" font-size="11">${esc(r.name.length > 42 ? r.name.slice(0, 41) + "…" : r.name)}</text>`;
    g += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h - 8}" rx="3" fill="${color[r.clock]}"><title>${esc(r.name)}: ${r.start} to ${r.end}</title></rect>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${rows.length * h + 8}" role="img" aria-label="Production schedule, one bar per stage" width="100%">${g}</svg>`;
}

/** CSV of one schedule, for a spreadsheet or the factory. */
export function timelineCsv(rows) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  return ["stage,clock,days,delay_days,closure_days,start,end", ...rows.map(r => [q(r.name), r.clock, r.days, r.padDays, r.closureDays, r.start, r.end].join(","))].join("\n");
}
