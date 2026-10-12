// Tax season client picker: one independent tax preparer (EA, bookkeeper
// or small-practice CPA) has a queue of late-season client engagements,
// each with a fee, a number of work hours and a due date (the filing or
// extension deadline). Which should be accepted, and in what order should
// they be worked?
//
// Capacity is the scarce thing: the preparer has `hoursPerDay` of real work
// per business day, work is divisible (prepare one day, review the
// next) and some hours may already be committed. A set of jobs is
// feasible exactly when, for every due day d, the hours of all accepted
// jobs due on or before d fit in hoursPerDay x d (earliest-due-date
// scheduling is optimal for divisible work, so this is also the test for
// "can every file be delivered on time"). The best set is found exactly by a
// depth-first search over jobs sorted by due date, pruned the moment a
// partial set misses a deadline. The tests check it against trying every
// subset. Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Net per job = fee - direct costs. Capacity per business day is the hours you enter; work is treated as divisible across days, so a set is feasible when, for every due day, the hours of the accepted jobs due by then fit in the hours available by then (earliest-due-date order). " +
  "Your own time is not charged because capacity, not cost, is the limit: the plan maximises total net across the jobs it accepts. Every figure is your estimate; the plan is the exact best answer for the numbers you supply, not a forecast.";

export const INPUT_NOTES = [
  { what: "1040 with Schedule C,525,5.5,3,40", detail: "One client engagement per row: name,fee,hours,due_day,direct_cost[,note]. Fee and cost as plain dollars; hours as a decimal number of work hours." },
  { what: "Fee", detail: "What the client pays for the engagement, after any software, white-label or referral split. If you charge a late-season or rush surcharge, put the total you would actually collect." },
  { what: "Hours", detail: "All the work the engagement takes you: organizing documents, preparation, research, review, client questions and e-file or notice follow-up. Be honest here, the plan is only as good as this number." },
  { what: "Due day", detail: "The business day the return must be done by, the filing deadline or the extension deadline you are working to: 1 means today, 2 means tomorrow, and so on. Count business days yourself; weekends and holidays are not modelled." },
  { what: "Direct cost", detail: "Out-of-pocket cost for the file: per-return software or e-file fees, a reviewer's pay, state filing and transcript fees you absorb. Not your own time." },
  { what: "Hours per day and hours already booked", detail: "Real working hours you can give to this queue each business day, and hours already committed to returns not in the list (and the day they are due)." },
  { what: "Header row and # comments", detail: "A first row starting with name, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

export const MAX_JOBS = 16;
const EPS = 1e-9;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

function nonNeg(cell, what, where, errors) {
  const v = Number(String(cell ?? "").replace(/[$,\s]/g, ""));
  if (cell === undefined || String(cell).trim() === "" || !Number.isFinite(v) || v < 0) {
    errors.push(`${where}: ${what} must be a number, zero or more`);
    return null;
  }
  return v;
}

export function parseJobs(text) {
  const jobs = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    if (cells.length < 5) {
      errors.push(`${where}: expected name,fee,hours,due_day,direct_cost`);
      return;
    }
    const before = errors.length;
    const fee = nonNeg(cells[1], "fee", where, errors);
    const hours = nonNeg(cells[2], "hours", where, errors);
    const due = nonNeg(cells[3], "due day", where, errors);
    const cost = nonNeg(cells[4], "direct cost", where, errors);
    if (errors.length > before) return;
    if (hours <= 0) errors.push(`${where}: hours must be above zero`);
    else if (!Number.isInteger(due) || due < 1) errors.push(`${where}: due day must be a whole business day, 1 or more (1 = today)`);
    else jobs.push({ name: cells[0] || `File ${jobs.length + 1}`, fee, hours, due, cost, note: cells.slice(5).join(",") });
  });
  return { jobs, errors };
}

const DEFAULTS = { hoursPerDay: 7, booked: 0, bookedDue: 1 };

export function normalizeOptions(raw = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && v !== null && v !== "") o[k] = v;
  const out = {};
  for (const k of ["hoursPerDay", "booked", "bookedDue"]) {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number, zero or more`);
    out[k] = v;
  }
  if (out.hoursPerDay <= 0 || out.hoursPerDay > 24) throw new Error("hoursPerDay must be above zero and at most 24");
  if (!Number.isInteger(out.bookedDue) || out.bookedDue < 1) throw new Error("bookedDue must be a whole business day, 1 or more");
  return out;
}

export const netOf = (j) => j.fee - j.cost;
export const netPerHour = (j) => netOf(j) / j.hours;

// Are the given jobs (indices into `jobs`) deliverable on time with the
// hours already booked? Divisible work: for each due day, hours due by then
// must not exceed hoursPerDay x day.
export function feasible(indices, jobs, o) {
  const items = indices.map((i) => ({ due: jobs[i].due, hours: jobs[i].hours }));
  if (o.booked > 0) items.push({ due: o.bookedDue, hours: o.booked });
  items.sort((a, b) => a.due - b.due);
  let cum = 0;
  for (const it of items) {
    cum += it.hours;
    if (cum > o.hoursPerDay * it.due + EPS) return false;
  }
  return true;
}

// Earliest-due-date schedule for a feasible set: the order to work the files
// and, for each, the business day it finishes and the hours to spare.
export function schedule(indices, jobs, o) {
  const items = indices.map((i) => ({ index: i, name: jobs[i].name, due: jobs[i].due, hours: jobs[i].hours, booked: false }));
  if (o.booked > 0) items.push({ index: -1, name: "Hours already booked", due: o.bookedDue, hours: o.booked, booked: true });
  items.sort((a, b) => a.due - b.due || (a.booked ? -1 : b.booked ? 1 : a.index - b.index));
  let cum = 0;
  return items.map((it) => {
    const startCum = cum;
    cum += it.hours;
    const finishDay = Math.max(1, Math.ceil(cum / o.hoursPerDay - EPS));
    return { ...it, startDay: Math.floor(startCum / o.hoursPerDay + EPS) + 1, finishDay, spare: o.hoursPerDay * it.due - cum };
  });
}

// Exact search. Depth-first include/exclude over the jobs sorted by due
// date, with the already-booked block as a forced item at its own due day. A
// partial set that misses a deadline is abandoned (later-due files can never
// repair an earlier violation). Returns the best set, and for each job
// the best total net among feasible sets that contain it (used to price a
// declined file exactly). Ties go to the set that needs fewer hours.
export function optimize(jobs, o) {
  const n = jobs.length;
  if (n > MAX_JOBS) throw new Error(`at most ${MAX_JOBS} jobs at a time; decide the nearest due dates first`);
  const seq = jobs.map((j, i) => ({ i, due: j.due, hours: j.hours })).sort((a, b) => a.due - b.due || a.i - b.i);
  if (o.booked > 0) {
    let at = seq.findIndex((s) => s.due > o.bookedDue);
    if (at < 0) at = seq.length;
    seq.splice(at, 0, { i: -1, due: o.bookedDue, hours: o.booked });
  }
  const best = { net: 0, hours: 0, set: [] };
  const bestWith = jobs.map(() => ({ net: -Infinity, hours: Infinity, set: null }));
  const chosen = [];
  const better = (net, hours, cur) => net > cur.net + EPS || (Math.abs(net - cur.net) <= EPS && hours < cur.hours - EPS);
  let anyFeasible = false;

  const rec = (k, cum, net) => {
    if (k === seq.length) {
      anyFeasible = true;
      const hours = cum - o.booked;
      if (better(net, hours, best)) Object.assign(best, { net, hours, set: [...chosen] });
      for (const j of chosen) if (better(net, hours, bestWith[j])) Object.assign(bestWith[j], { net, hours, set: [...chosen] });
      return;
    }
    const s = seq[k];
    if (s.i === -1) {
      if (cum + s.hours <= o.hoursPerDay * s.due + EPS) rec(k + 1, cum + s.hours, net);
      return;
    }
    rec(k + 1, cum, net);
    if (cum + s.hours <= o.hoursPerDay * s.due + EPS) {
      chosen.push(s.i);
      rec(k + 1, cum + s.hours, net + netOf(jobs[s.i]));
      chosen.pop();
    }
  };
  rec(0, 0, 0);
  return { best, bestWith, overbooked: !anyFeasible };
}

// Baseline rules a preparer might follow without an optimiser: accept
// requests in the order they arrived, biggest fee first, or best net per hour
// first, taking each one that still fits behind the ones already accepted.
function greedy(sequence, jobs, o) {
  const taken = [];
  for (const idx of sequence) if (feasible([...taken, idx], jobs, o)) taken.push(idx);
  return taken;
}

const totalNet = (set, jobs) => set.reduce((s, i) => s + netOf(jobs[i]), 0);
const totalHours = (set, jobs) => set.reduce((s, i) => s + jobs[i].hours, 0);

export function plan(parsed, rawOptions = {}) {
  const o = normalizeOptions(rawOptions);
  const jobs = parsed.jobs;
  const opt = optimize(jobs, o);
  const set = opt.best.set;
  const sched = schedule(set, jobs, o);
  const chosen = new Set(set);

  const baseline = (label, seq) => {
    const taken = greedy(seq, jobs, o);
    return { label, order: taken, jobs: taken.length, net: totalNet(taken, jobs), hours: totalHours(taken, jobs) };
  };
  const indices = jobs.map((_, i) => i);
  const baselines = [
    baseline("Accept requests in the order they arrived", indices),
    baseline("Biggest fee first", [...indices].sort((a, b) => jobs[b].fee - jobs[a].fee || a - b)),
    baseline("Best net per hour first", [...indices].sort((a, b) => netPerHour(jobs[b]) - netPerHour(jobs[a]) || a - b)),
  ];
  const bestBaseline = baselines.reduce((m, b) => (b.net > m.net ? b : m), baselines[0]);

  const declined = [];
  const findings = [];
  if (opt.overbooked) {
    findings.push({ severity: "warn", rule: "overbooked", message: `The ${o.booked} hours already booked cannot be finished by day ${o.bookedDue} at ${o.hoursPerDay} hours a day, so no new file fits and any plan is late. Fix the booked hours or the capacity first.` });
  }
  jobs.forEach((j, i) => {
    if (chosen.has(i)) return;
    const alone = feasible([i], jobs, o);
    const forced = opt.bestWith[i];
    let reason;
    let minFee = null;
    if (opt.overbooked) reason = "no job can be delivered on time while the booked hours are overdue";
    else if (!alone) reason = `cannot be finished by day ${j.due} even as the only new file (${j.hours} hours against the hours available by then)`;
    else if (netOf(j) <= 0) reason = "pays less than its direct costs";
    else reason = "its hours are worth more to the files the plan accepts instead";
    if (forced.set) minFee = j.fee + (opt.best.net - forced.net);
    declined.push({ index: i, name: j.name, reason, fee: j.fee, minFee, net: netOf(j), netPerHour: netPerHour(j) });
    findings.push({ severity: "warn", rule: "decline", message: `${j.name}: ${reason}.${minFee !== null ? ` It would earn a place at a fee of about ${money(minFee)} or more.` : ""}` });
  });

  const hoursUsed = opt.best.hours;
  const horizon = sched.length ? Math.max(...sched.map((s) => s.due)) : 0;
  const capacity = horizon * o.hoursPerDay - o.booked;
  const result = {
    options: o,
    jobs,
    order: set.length ? sched.filter((s) => !s.booked).map((s) => s.index) : [],
    schedule: sched,
    net: opt.best.net,
    hours: hoursUsed,
    netPerHour: hoursUsed > 0 ? opt.best.net / hoursUsed : 0,
    spareHours: capacity > 0 ? Math.max(0, capacity - hoursUsed) : 0,
    accepted: set.length,
    declined,
    baselines,
    upliftVsBest: opt.best.net - bestBaseline.net,
    overbooked: opt.overbooked,
    findings,
  };
  if (set.length && result.spareHours >= o.hoursPerDay) {
    findings.push({ severity: "info", rule: "spare", message: `The plan leaves about ${result.spareHours.toFixed(1)} hours unused before the last due date. That time is free in this model: a quick file that fits it adds net with nothing displaced.` });
  }
  return result;
}

export function summarize(p) {
  if (!p.jobs.length) return { status: "none", text: "No jobs entered." };
  if (p.overbooked) return { status: "none", text: "The hours already booked cannot be finished on time, so no new file fits." };
  if (!p.accepted) return { status: "none", text: `No job is worth accepting: each pays less than it costs or cannot be delivered on time. Best net ${money(0)}.` };
  const gain = p.upliftVsBest;
  const text =
    `Accept ${p.accepted} of ${p.jobs.length} jobs for ${money(p.net)} net over ${p.hours.toFixed(1)} hours (${money(p.netPerHour)} an hour). ` +
    (gain > 0.005 ? `That is ${money(gain)} more than the best of first-come, biggest-fee and best-per-hour acceptance.` : "First-come, biggest-fee and best-per-hour rules do as well on this queue.");
  return { status: gain > 0.005 ? "gain" : "ok", text };
}
