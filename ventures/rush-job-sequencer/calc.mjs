// Rush job sequencer. Pure functions, no DOM, no network.
// A small shop (print, machine, sign, repair, bakery, alterations) has more jobs on the bench than hours before they are due.
// Each job has a length in hours, a due time, and a price for being late: a flat fee if it misses (a lost customer, a rush
// penalty, a refund) and/or a cost for every hour after. This finds the order that makes the total lateness cost smallest by
// dynamic programming over every subset of jobs (up to 14 jobs), which is exact. It also compares the exact order with the
// rules of thumb shops actually use (as received, earliest due date, shortest job first, biggest penalty per hour of work
// first), says what one more hour of capacity is worth, which single job costs the queue most, and whether the order holds
// if the hour estimates are 20% off.

export const MAX_JOBS = 14;
export const SHARED_DEFAULTS = { busyHours: 0 };
export const ITEM_DEFAULTS = { name: "", hours: 0, dueIn: "", flatFee: 0, perHour: 0 };

// Placeholder example figures, not any shop's jobs or penalties.
export const EXAMPLE_SHARED = { busyHours: 2 };
export const EXAMPLE_ITEMS = [
  { name: "Banner order A", hours: 6, dueIn: 10, flatFee: 0, perHour: 25 },
  { name: "Wedding signs", hours: 9, dueIn: 12, flatFee: 400, perHour: 20 },
  { name: "Cabinet doors (repeat client)", hours: 4, dueIn: 8, flatFee: 0, perHour: 60 },
  { name: "Trade-show display", hours: 12, dueIn: 30, flatFee: 900, perHour: 0 },
  { name: "Rush decals", hours: 2, dueIn: 4, flatFee: 150, perHour: 40 },
  { name: "Menu boards", hours: 7, dueIn: 20, flatFee: 0, perHour: 15 },
  { name: "Vehicle wrap repair", hours: 5, dueIn: 16, flatFee: 250, perHour: 30 },
  { name: "Shelf labels", hours: 3, dueIn: "", flatFee: 0, perHour: 0 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const hrs = (h) => (Math.round(h * 10) / 10).toLocaleString("en-US") + " h";

export function cleanShared(s = {}) {
  return { busyHours: Math.min(10000, Math.max(0, num(s.busyHours, SHARED_DEFAULTS.busyHours))) };
}

export function cleanItems(items = []) {
  const out = [];
  const warnings = [];
  items.forEach((raw, idx) => {
    const r = raw || {};
    const hours = num(r.hours, 0);
    const name = String(r.name ?? "").trim();
    if (hours <= 0) {
      if (name) warnings.push(`"${name}" has no hours, so it is left out.`);
      return;
    }
    if (out.length >= MAX_JOBS) {
      warnings.push(`Only the first ${MAX_JOBS} jobs are used; "${name || "Job " + (idx + 1)}" is left out.`);
      return;
    }
    const dueRaw = String(r.dueIn ?? "").trim();
    const due = dueRaw === "" ? null : Math.max(0, num(dueRaw, 0));
    out.push({
      name: name || `Job ${idx + 1}`,
      hours: Math.min(10000, hours),
      due,
      flat: Math.max(0, num(r.flatFee, 0)),
      perHour: Math.max(0, num(r.perHour, 0)),
      input: out.length,
    });
  });
  return { items: out, warnings };
}

// Cost of one job finishing at `finish` hours from now.
export function lateCost(job, finish) {
  if (job.due == null) return 0;
  const late = finish - job.due;
  return late > 1e-9 ? job.flat + job.perHour * late : 0;
}

// Run a given order (array of job indexes) and return per-job detail and the total.
export function runOrder(jobs, order, start) {
  let t = start;
  let total = 0;
  const steps = order.map((j) => {
    const job = jobs[j];
    const begin = t;
    t += job.hours;
    const late = job.due == null ? 0 : Math.max(0, t - job.due);
    const cost = lateCost(job, t);
    total += cost;
    return { index: j, name: job.name, begin, finish: t, due: job.due, late: late > 1e-9 ? late : 0, cost };
  });
  return { steps, total, lateJobs: steps.filter((s) => s.cost > 0 || s.late > 0).length };
}

// Exact minimum total lateness cost: f(S) = min over the job j finishing last in S of f(S minus j) + cost(j, start + hours(S)).
// Jobs are visited in earliest-due-date order so that ties resolve to the tidier schedule.
export function solve(jobs, start) {
  const n = jobs.length;
  const idx = jobs.map((_, i) => i).sort((a, b) => (jobs[a].due ?? Infinity) - (jobs[b].due ?? Infinity) || a - b);
  const J = idx.map((i) => jobs[i]);
  const size = 1 << n;
  const sum = new Float64Array(size);
  for (let s = 1; s < size; s++) {
    const low = s & -s;
    sum[s] = sum[s ^ low] + J[31 - Math.clz32(low)].hours;
  }
  const best = new Float64Array(size);
  const pick = new Int8Array(size);
  for (let s = 1; s < size; s++) {
    let bc = Infinity, bj = -1;
    const finish = start + sum[s];
    for (let j = n - 1; j >= 0; j--) {
      if (!(s & (1 << j))) continue;
      const c = best[s ^ (1 << j)] + lateCost(J[j], finish);
      if (c < bc - 1e-9) { bc = c; bj = j; }
    }
    best[s] = bc;
    pick[s] = bj;
  }
  const order = [];
  for (let s = size - 1; s > 0; s ^= 1 << pick[s]) order.push(idx[pick[s]]);
  order.reverse();
  return { cost: best[size - 1], order };
}

const asReceived = (jobs) => jobs.map((_, i) => i);
const byDue = (jobs) => asReceived(jobs).sort((a, b) => (jobs[a].due ?? Infinity) - (jobs[b].due ?? Infinity) || a - b);
const byShortest = (jobs) => asReceived(jobs).sort((a, b) => jobs[a].hours - jobs[b].hours || a - b);
// Penalty per hour of work: the hourly rate plus the flat fee spread over the job's own length, per hour of work.
const density = (j) => (j.due == null ? 0 : (j.perHour + j.flat / j.hours) / j.hours);
const byDensity = (jobs) => asReceived(jobs).sort((a, b) => density(jobs[b]) - density(jobs[a]) || a - b);

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items: jobs, warnings } = cleanItems(rawItems);
  const res = { ok: false, warnings: [...warnings], shared, jobs };
  if (!jobs.length) { res.warnings.push("Enter at least one job with hours."); return res; }
  const start = shared.busyHours;
  const n = jobs.length;
  const total = jobs.reduce((s, j) => s + j.hours, 0);

  const sol = solve(jobs, start);
  const plan = runOrder(jobs, sol.order, start);

  const rules = [
    ["As received", asReceived(jobs)],
    ["Earliest due date first", byDue(jobs)],
    ["Shortest job first", byShortest(jobs)],
    ["Biggest penalty per hour of work first", byDensity(jobs)],
  ].map(([label, order]) => {
    const r = runOrder(jobs, order, start);
    return { label, order: order.map((i) => jobs[i].name), cost: r.total, lateJobs: r.lateJobs, extra: r.total - plan.total };
  });
  const bestRule = rules.reduce((a, b) => (b.cost < a.cost ? b : a));

  // What one more hour of capacity (overtime before the queue starts) is worth.
  const capacity = [1, 4].map((h) => ({ hours: h, saving: Math.max(0, plan.total - solve(jobs, start - h).cost) }));

  // The job whose presence costs the queue most: re-solve without it.
  const without = n > 1 ? jobs.map((job, i) => {
    const rest = jobs.filter((_, k) => k !== i);
    return { name: job.name, saving: Math.max(0, plan.total - solve(rest, start).cost) };
  }).sort((a, b) => b.saving - a.saving) : [];
  const costliest = without.length && without[0].saving > 0.5 ? without[0] : null;

  // Are hour estimates trusted? Re-solve with every job 20% longer and 20% shorter.
  const sens = [0.8, 1.2].map((f) => {
    const scaled = jobs.map((j) => ({ ...j, hours: j.hours * f }));
    const s = solve(scaled, start * f);
    const same = s.order.every((v, k) => v === sol.order[k]);
    return { factor: f, cost: s.cost, same, order: s.order.map((i) => jobs[i].name) };
  });

  res.ok = true;
  res.totalHours = total;
  res.finishAll = start + total;
  res.plan = plan;
  res.cost = plan.total;
  res.rules = rules;
  res.bestRule = bestRule;
  res.ruleLoss = Math.max(0, bestRule.cost - plan.total);
  res.capacity = capacity;
  res.costliest = costliest;
  res.sensitivity = sens;
  res.fragile = sens.some((s) => !s.same);
  return res;
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["position", "job", "starts at hour", "finishes at hour", "due at hour", "hours late", "lateness cost"].join(",")];
  a.plan.steps.forEach((s, i) => {
    lines.push([i + 1, q(s.name), s.begin.toFixed(2), s.finish.toFixed(2), s.due == null ? "" : s.due, s.late.toFixed(2), s.cost.toFixed(2)].join(","));
  });
  return lines.join("\n") + "\n";
}
