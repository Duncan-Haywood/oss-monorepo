/**
 * Time-and-action (TNA) calendar for a small clothing line: from the date you
 * want stock on your shelf, work backwards through the steps a factory run
 * needs (tech pack, quotes, sample rounds, approval, fabric, labels, bulk
 * production, QC, freight, customs, receiving) to the date you must start,
 * and forwards from today to the date you would really have stock.
 *
 * The steps and default durations are typical small-run figures, an
 * assumption to replace with your factory's own times. Steps marked `factory`
 * do not progress on days the factory is closed: type those days in
 * `closures` (Lunar New Year, a mill holiday). We do not know your factory's
 * closure dates, so none are assumed. Calendar days; no weekends modelled.
 * A step that slips and sits on the longest chain moves the in-stock date by
 * the same number of days; `slipDays` shows that for each step.
 */
const DAY = 86400000;
const toDay = iso => {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Dates must look like 2027-03-15.");
  const t = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== iso) throw new Error(`${iso} is not a real date.`);
  return Math.round(t / DAY);
};
const toIso = d => new Date(d * DAY).toISOString().slice(0, 10);
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/** Default chain. `needs` lists steps that must finish first. */
export function defaultSteps(o = {}) {
  const rounds = Math.round(num(o.sampleRounds ?? 2, "Sample rounds", 1, 5));
  const d = { techpack: 7, quotes: 10, sample: 14, review: 3, fabric: 21, trims: 14, production: 25, qc: 3, freight: 21, customs: 5, receiving: 3, ...(o.days || {}) };
  const steps = [
    { id: "techpack", name: "Finish the tech pack", days: d.techpack, needs: [] },
    { id: "quotes", name: "Get and compare factory quotes, choose one", days: d.quotes, needs: ["techpack"] },
  ];
  let prev = "quotes";
  for (let i = 1; i <= rounds; i++) {
    steps.push({ id: `sample${i}`, name: `Sample round ${i} made and shipped`, days: d.sample, needs: [prev], factory: true });
    steps.push({ id: `review${i}`, name: `Review sample ${i}, fit comments sent`, days: d.review, needs: [`sample${i}`] });
    prev = `review${i}`;
  }
  steps.push(
    { id: "fabric", name: "Fabric bought and delivered to the factory", days: d.fabric, needs: [prev], factory: true },
    { id: "trims", name: "Labels, packaging and trims ready", days: d.trims, needs: [prev] },
    { id: "production", name: "Bulk production", days: d.production, needs: ["fabric", "trims"], factory: true },
    { id: "qc", name: "Quality check before shipping", days: d.qc, needs: ["production"] },
    { id: "freight", name: "Freight to you", days: d.freight, needs: ["qc"] },
    { id: "customs", name: "Customs clearance", days: d.customs, needs: ["freight"] },
    { id: "receiving", name: "Receive, count, put on the shelf", days: d.receiving, needs: ["customs"] },
  );
  return steps;
}

const closedSet = list => {
  const s = new Set();
  for (const c of list) {
    const a = toDay(c.from), b = toDay(c.to);
    if (b < a) throw new Error("A closure must end on or after the day it starts.");
    if (b - a > 120) throw new Error("A closure of more than 120 days is probably a typo.");
    for (let x = a; x <= b; x++) s.add(x);
  }
  return s;
};
/** Latest start for a step that must be finished by the end of day `end`. */
function backStart(end, days, factory, closed) {
  let d = end, left = days;
  while (left > 0) { if (!(factory && closed.has(d))) left--; d--; }
  return d + 1;
}
/** Finish day of a step that starts on day `start`. */
function fwdEnd(start, days, factory, closed) {
  let d = start, left = days;
  while (left > 0) { if (!(factory && closed.has(d))) left--; d++; }
  return d - 1;
}

/**
 * @param {{inStock:string, today:string, sampleRounds?:number, days?:object, closures?:{from:string,to:string,label?:string}[],
 *   bufferDays?:number, steps?:object[]}} o
 */
export function tnaPlan(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the date you want stock and today's date." };
  try {
    const target = toDay(o.inStock), today = toDay(o.today);
    const buffer = Math.round(num(o.bufferDays ?? 14, "Buffer", 0, 120));
    const closed = closedSet(o.closures ?? []);
    const steps = (o.steps ?? defaultSteps(o)).map(s => ({ ...s }));
    const byId = new Map(steps.map(s => [s.id, s]));
    if (byId.size !== steps.length) throw new Error("Step ids must be different.");
    for (const s of steps) {
      num(s.days, `${s.name} days`, 0, 400);
      for (const n of s.needs) if (!byId.has(n)) throw new Error(`${s.name} needs an unknown step ${n}.`);
    }
    // topological order
    const order = [], seen = new Set(), stack = new Set();
    const visit = s => {
      if (seen.has(s.id)) return;
      if (stack.has(s.id)) throw new Error("Steps depend on each other in a circle.");
      stack.add(s.id);
      for (const n of s.needs) visit(byId.get(n));
      stack.delete(s.id); seen.add(s.id); order.push(s);
    };
    steps.forEach(visit);
    const succ = new Map(steps.map(s => [s.id, []]));
    for (const s of steps) for (const n of s.needs) succ.get(n).push(s.id);
    // Backward: the last day stock may arrive is the target minus the buffer.
    const deadline = target - buffer;
    for (const s of [...order].reverse()) {
      const nexts = succ.get(s.id);
      s.lateEnd = nexts.length ? Math.min(...nexts.map(n => byId.get(n).lateStart - 1)) : deadline;
      s.lateStart = backStart(s.lateEnd, s.days, !!s.factory, closed);
    }
    // Forward from today: the in-stock date if every step starts as soon as it can.
    const run = (extra = {}) => {
      for (const s of order) {
        const start = s.needs.length ? Math.max(...s.needs.map(n => byId.get(n).fEnd + 1)) : today;
        s.fStart = start; s.fEnd = fwdEnd(start, s.days + (extra[s.id] || 0), !!s.factory, closed);
      }
      return Math.max(...order.map(s => s.fEnd));
    };
    const arrive = run();
    const startBy = Math.min(...order.filter(s => !s.needs.length).map(s => s.lateStart));
    const real = order.map(s => ({ id: s.id, name: s.name, days: s.days, factory: !!s.factory, needs: s.needs, start: toIso(s.fStart), end: toIso(s.fEnd), startBy: toIso(s.lateStart), finishBy: toIso(s.lateEnd), slackDays: s.lateStart - s.fStart }));
    const minSlack = Math.min(...real.map(r => r.slackDays));
    const critical = real.filter(r => r.slackDays === minSlack).map(r => r.id);
    const slip = {};
    const base = arrive;
    for (const s of order) slip[s.id] = Math.max(0, run({ [s.id]: 7 }) - base);
    run();
    const lateBy = arrive - deadline; // > 0 means stock arrives after the buffered deadline
    const notes = [];
    if (lateBy > 0) notes.push(`Starting today, stock reaches your shelf about ${toIso(arrive)}, ${lateBy} day${lateBy === 1 ? "" : "s"} after the date you need it (${toIso(deadline)}, which keeps ${buffer} days of buffer). Cut a sample round, ask the factory for a faster time, pay for air freight or move the date.`);
    else notes.push(`Starting today you would have stock about ${toIso(arrive)}, ${-lateBy} day${lateBy === -1 ? "" : "s"} before the buffered date ${toIso(deadline)}. Start by ${toIso(startBy)} at the latest.`);
    if (startBy < today) notes.push(`The latest safe start (${toIso(startBy)}) is already behind you.`);
    const crit7 = Object.entries(slip).filter(([, v]) => v >= 7).map(([k]) => byId.get(k).name);
    if (crit7.length) notes.push(`A week of delay in any of these pushes your projected shelf date back by a week: ${crit7.join("; ")}.`);
    if (closed.size && real.some(r => r.factory)) notes.push("Factory steps skip the closure days you typed. Check the days with your factory, and ask when its staff return and how fast the line restarts: the first weeks after a closure are often slower.");
    notes.push("Default step lengths are typical small-run assumptions. Replace them with the times your factory quotes.");
    return { inStock: toIso(target), deadline: toIso(deadline), bufferDays: buffer, startBy: toIso(startBy), projectedInStock: toIso(arrive), lateByDays: Math.max(0, lateBy), steps: real, critical, slipDaysPerWeekLate: slip, notes };
  } catch (e) { return { error: e.message }; }
}
