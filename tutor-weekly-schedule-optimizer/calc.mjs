// Tutor weekly schedule optimizer. Pure functions, no DOM, no network.
// A private tutor, music teacher or coach has a handful of weekly hours and more students than slots. Each student can only
// come in a window (after school, evenings, certain days). This finds the exact set of students and start times that earns
// the most per week after per-lesson costs and the cost of opening a day (room hire, travel), with a gap between lessons.
// Method: per day, a subset DP gives the earliest finish of every feasible group of students (release times, deadlines,
// buffers); a second DP over the seven days picks one group per day with no student used twice. Exact, not a heuristic.

export const MAX_STUDENTS = 12;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SHARED_DEFAULTS = { bufferMin: 10, maxLessonsPerDay: 6, maxHoursPerDay: 6, weeksPerYear: 40 };
export const DAY_DEFAULTS = { open: "", close: "", dayCost: 0 };
export const STUDENT_DEFAULTS = {
  name: "", fee: 0, durationMin: 0, earliest: "", latest: "", days: "", costPerLesson: 0, mustKeep: "",
};

// Placeholder example figures, not any business's rates or availability.
export const EXAMPLE_DAYS = [
  { open: "16:00", close: "19:00", dayCost: 0 },
  { open: "16:00", close: "19:00", dayCost: 0 },
  { open: "", close: "", dayCost: 0 },
  { open: "16:00", close: "19:00", dayCost: 25 },
  { open: "", close: "", dayCost: 0 },
  { open: "09:00", close: "12:00", dayCost: 25 },
  { open: "", close: "", dayCost: 0 },
];
export const EXAMPLE_STUDENTS = [
  { name: "Ava (piano)", fee: 45, durationMin: 45, earliest: "16:00", latest: "19:00", days: "Mon Tue Thu", costPerLesson: 0, mustKeep: "yes" },
  { name: "Ben (piano)", fee: 40, durationMin: 30, earliest: "15:00", latest: "17:30", days: "Mon Tue Thu", costPerLesson: 0, mustKeep: "" },
  { name: "Chloe (theory)", fee: 35, durationMin: 60, earliest: "17:00", latest: "20:00", days: "Tue Thu", costPerLesson: 0, mustKeep: "" },
  { name: "Dev (guitar)", fee: 40, durationMin: 45, earliest: "15:30", latest: "19:30", days: "Mon Thu", costPerLesson: 0, mustKeep: "" },
  { name: "Esme (adult beginner)", fee: 55, durationMin: 60, earliest: "17:30", latest: "20:00", days: "Mon Tue", costPerLesson: 0, mustKeep: "" },
  { name: "Finn (exam prep)", fee: 60, durationMin: 60, earliest: "09:00", latest: "13:00", days: "Sat", costPerLesson: 0, mustKeep: "" },
  { name: "Gia (piano)", fee: 40, durationMin: 30, earliest: "09:00", latest: "11:00", days: "Sat", costPerLesson: 0, mustKeep: "" },
  { name: "Hal (guitar)", fee: 40, durationMin: 45, earliest: "16:30", latest: "18:30", days: "Mon Tue Thu", costPerLesson: 0, mustKeep: "" },
  { name: "Ivy (violin, waitlist)", fee: 50, durationMin: 60, earliest: "17:00", latest: "19:00", days: "Mon Tue", costPerLesson: 0, mustKeep: "" },
  { name: "Jon (drums, waitlist)", fee: 45, durationMin: 60, earliest: "16:30", latest: "18:30", days: "Thu", costPerLesson: 0, mustKeep: "" },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

// "15:30", "3:30pm", "3pm", "15" -> minutes after midnight, or null when blank/unreadable.
export function parseTime(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith("p") ? 12 : 0);
  }
  if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}
export function fmtTime(min) {
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

// "Mon Tue", "MTh", "mon,wed", "weekdays", "all" -> boolean[7]. Unknown words are reported by the caller.
export function parseDays(v) {
  const s = String(v ?? "").toLowerCase().trim();
  const out = [false, false, false, false, false, false, false];
  if (!s) return { days: out, bad: [] , blank: true };
  const bad = [];
  for (const tok of s.split(/[\s,;/]+/).filter(Boolean)) {
    if (tok === "all" || tok === "any" || tok === "daily") { out.fill(true); continue; }
    if (tok === "weekdays") { for (let i = 0; i < 5; i++) out[i] = true; continue; }
    if (tok === "weekends" || tok === "weekend") { out[5] = out[6] = true; continue; }
    const i = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].findIndex((d) => tok.startsWith(d) || (tok.length >= 3 && d.startsWith(tok.slice(0, 3)) && tok.slice(0, 3) === d));
    if (i >= 0) out[i] = true; else bad.push(tok);
  }
  return { days: out, bad, blank: false };
}

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  return {
    bufferMin: Math.min(120, Math.max(0, Math.round(num(s.bufferMin, d.bufferMin)))),
    maxLessonsPerDay: Math.min(MAX_STUDENTS, Math.max(1, Math.round(num(s.maxLessonsPerDay, d.maxLessonsPerDay)))),
    maxMinutesPerDay: Math.min(24 * 60, Math.max(15, num(s.maxHoursPerDay, d.maxHoursPerDay) * 60)),
    weeksPerYear: Math.min(52, Math.max(1, Math.round(num(s.weeksPerYear, d.weeksPerYear)))),
  };
}

export function cleanDays(days = []) {
  return DAYS.map((name, i) => {
    const raw = days[i] || {};
    const open = parseTime(raw.open), close = parseTime(raw.close);
    const usable = open !== null && close !== null && close > open;
    return { name, open, close, usable, cost: Math.max(0, num(raw.dayCost)) };
  });
}

export function cleanStudents(list = []) {
  const out = [];
  const warnings = [];
  list.slice(0, MAX_STUDENTS).forEach((raw, i) => {
    const t = raw || {};
    const name = String(t.name ?? "").trim() || `Student ${i + 1}`;
    const fee = num(t.fee), dur = Math.round(num(t.durationMin));
    const touched = fee > 0 || dur > 0 || String(t.name ?? "").trim() || String(t.days ?? "").trim();
    if (!touched) return;
    if (fee <= 0 || dur <= 0) { warnings.push(`${name}: enter the fee and the lesson length in minutes; the student was left out.`); return; }
    const pd = parseDays(t.days);
    if (pd.bad.length) warnings.push(`${name}: could not read the day "${pd.bad.join(", ")}". Use Mon Tue Wed Thu Fri Sat Sun, weekdays or all.`);
    const days = pd.blank ? [true, true, true, true, true, true, true] : pd.days;
    const earliest = parseTime(t.earliest), latest = parseTime(t.latest);
    if (String(t.earliest ?? "").trim() && earliest === null) warnings.push(`${name}: could not read the earliest time "${t.earliest}". Try 15:30 or 3:30pm.`);
    if (String(t.latest ?? "").trim() && latest === null) warnings.push(`${name}: could not read the latest time "${t.latest}". Try 19:00 or 7pm.`);
    out.push({
      name, fee, dur,
      earliest: earliest ?? 0, latest: latest ?? 24 * 60,
      days,
      cost: Math.max(0, num(t.costPerLesson)),
      must: /^(y|yes|true|1|keep|x)/i.test(String(t.mustKeep ?? "").trim()),
    });
  });
  return { students: out, warnings };
}

// Earliest-finish subset DP for one day. cands: [{idx, r, d, dur}] (release, deadline, duration), buffer in minutes.
// Returns Map mask -> {finish, order} for every feasible subset (masks are over positions in cands).
function feasibleSubsets(cands, buffer, maxLessons, maxMinutes) {
  const n = cands.length;
  const finish = new Float64Array(1 << n).fill(Infinity);
  const last = new Int8Array(1 << n).fill(-1);
  const minutes = new Float64Array(1 << n);
  const count = new Uint8Array(1 << n);
  finish[0] = -Infinity;
  const feasible = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const low = mask & -mask;
    const j0 = 31 - Math.clz32(low);
    minutes[mask] = minutes[mask & (mask - 1)] + cands[j0].dur;
    count[mask] = count[mask & (mask - 1)] + 1;
    if (count[mask] > maxLessons || minutes[mask] > maxMinutes) continue;
    let best = Infinity, bj = -1;
    for (let j = 0; j < n; j++) {
      if (!(mask & (1 << j))) continue;
      const prev = mask & ~(1 << j);
      const pf = finish[prev];
      if (pf === Infinity) continue;
      const start = Math.max(cands[j].r, prev === 0 ? -Infinity : pf + buffer);
      const end = start + cands[j].dur;
      if (end <= cands[j].d && end < best) { best = end; bj = j; }
    }
    if (bj >= 0) { finish[mask] = best; last[mask] = bj; feasible.push(mask); }
  }
  return { feasible, finish, last };
}

function orderOf(mask, sub, cands, buffer) {
  const seq = [];
  let m = mask;
  while (m) { const j = sub.last[m]; seq.push(j); m &= ~(1 << j); }
  seq.reverse();
  const out = [];
  let t = -Infinity;
  for (const j of seq) {
    const start = Math.max(cands[j].r, out.length ? t + buffer : -Infinity);
    out.push({ idx: cands[j].idx, start, end: start + cands[j].dur });
    t = start + cands[j].dur;
  }
  return out;
}

// Exact best weekly plan. Returns { profit, revenue, placed:[{idx, day, start, end}], daysUsed }.
export function solve(students, days, shared) {
  const n = students.length;
  const BONUS = 1e7;
  const perDay = days.map((day, d) => {
    if (!day.usable) return null;
    const cands = [];
    students.forEach((s, idx) => {
      if (!s.days[d]) return;
      const r = Math.max(s.earliest, day.open), dl = Math.min(s.latest, day.close);
      if (r + s.dur <= dl) cands.push({ idx, r, d: dl, dur: s.dur });
    });
    if (!cands.length) return null;
    const sub = feasibleSubsets(cands, shared.bufferMin, shared.maxLessonsPerDay, shared.maxMinutesPerDay);
    const options = sub.feasible.map((m) => {
      let gmask = 0, val = -day.cost - 0.001; // tiny cost per open day so ties prefer fewer days
      for (let j = 0; j < cands.length; j++) if (m & (1 << j)) {
        const s = students[cands[j].idx];
        gmask |= 1 << cands[j].idx;
        val += s.fee - s.cost + (s.must ? BONUS : 0);
      }
      return { m, gmask, val };
    });
    return { cands, sub, options };
  });
  const full = 1 << n;
  let cur = new Float64Array(full).fill(-Infinity);
  cur[0] = 0;
  const choice = [];
  for (let d = 0; d < 7; d++) {
    const pd = perDay[d];
    const next = Float64Array.from(cur);
    const how = new Int32Array(full).fill(-1); // option index used on this day to reach the state (-1: day unused)
    const from = new Int32Array(full).fill(-1);
    if (pd) {
      for (let used = 0; used < full; used++) {
        const base = cur[used];
        if (base === -Infinity) continue;
        for (let k = 0; k < pd.options.length; k++) {
          const o = pd.options[k];
          if (o.gmask & used) continue;
          const nu = used | o.gmask, v = base + o.val;
          if (v > next[nu] + 1e-9) { next[nu] = v; how[nu] = k; from[nu] = used; }
        }
      }
    }
    choice.push({ how, from, startState: null });
    cur = next;
  }
  let bestState = 0;
  for (let u = 0; u < full; u++) if (cur[u] > cur[bestState] + 1e-9) bestState = u;
  // Trace back through the days.
  const placed = [];
  let state = bestState;
  // We stored per-day arrays only for states changed that day; replay forward to recover predecessors safely.
  // Recompute by walking days backwards: a state was reached on day d only if how[d][state] >= 0.
  for (let d = 6; d >= 0; d--) {
    const { how, from } = choice[d];
    if (how[state] >= 0) {
      const pd = perDay[d];
      const o = pd.options[how[state]];
      for (const p of orderOf(o.m, pd.sub, pd.cands, shared.bufferMin)) placed.push({ ...p, day: d });
      state = from[state];
    }
  }
  placed.sort((a, b) => a.day - b.day || a.start - b.start);
  const used = new Set(placed.map((p) => p.day));
  let revenue = 0, profit = 0;
  for (const p of placed) { const s = students[p.idx]; revenue += s.fee; profit += s.fee - s.cost; }
  for (const d of used) profit -= days[d].cost;
  return { profit, revenue, placed, daysUsed: used.size };
}

// First-come greedy for comparison: highest fee per minute first, put each at the earliest slot that fits, no reshuffling.
export function greedy(students, days, shared) {
  const order = students.map((s, i) => i).sort((a, b) => students[b].fee / students[b].dur - students[a].fee / students[a].dur);
  const sched = days.map(() => []);
  const placed = [];
  for (const idx of order) {
    const s = students[idx];
    let done = false;
    for (let d = 0; d < 7 && !done; d++) {
      const day = days[d];
      if (!day.usable || !s.days[d]) continue;
      if (sched[d].length >= shared.maxLessonsPerDay) continue;
      if (sched[d].reduce((a, p) => a + (p.end - p.start), 0) + s.dur > shared.maxMinutesPerDay) continue;
      const lo = Math.max(s.earliest, day.open), hi = Math.min(s.latest, day.close);
      const taken = [...sched[d]].sort((a, b) => a.start - b.start);
      let t = lo;
      for (const p of taken) {
        if (t + s.dur + shared.bufferMin <= p.start) break;
        t = Math.max(t, p.end + shared.bufferMin);
      }
      if (t + s.dur <= hi) {
        // Must also leave the buffer before a following lesson.
        const clash = taken.some((p) => t < p.end + shared.bufferMin && p.start < t + s.dur + shared.bufferMin);
        if (!clash) { sched[d].push({ idx, start: t, end: t + s.dur }); placed.push({ idx, day: d, start: t, end: t + s.dur }); done = true; }
      }
    }
  }
  let revenue = 0, profit = 0;
  for (const p of placed) { const s = students[p.idx]; revenue += s.fee; profit += s.fee - s.cost; }
  const used = new Set(placed.map((p) => p.day));
  for (const d of used) profit -= days[d].cost;
  placed.sort((a, b) => a.day - b.day || a.start - b.start);
  return { profit, revenue, placed, daysUsed: used.size };
}

function whyNot(s, days, shared) {
  const reasons = [];
  let anyDay = false, anyFit = false;
  for (let d = 0; d < 7; d++) {
    if (!s.days[d]) continue;
    anyDay = true;
    if (!days[d].usable) continue;
    const r = Math.max(s.earliest, days[d].open), dl = Math.min(s.latest, days[d].close);
    if (r + s.dur <= dl) anyFit = true;
  }
  if (!anyDay) return "no day selected";
  if (!anyFit) return "their times never overlap your open hours";
  reasons.push("every slot they could use is better used by other students");
  return reasons[0];
}

// Opportunities: widen one thing by an hour and re-solve. Returns the best few, each with the weekly profit gained.
function opportunities(students, days, shared, base, unplaced) {
  const out = [];
  const tryPlan = (label, st, dy) => {
    const r = solve(st, dy, shared);
    const gain = r.profit - base.profit;
    if (gain > 0.5) out.push({ label, gain });
  };
  for (let d = 0; d < 7; d++) {
    if (!days[d].usable) continue;
    const later = days.map((x, i) => (i === d ? { ...x, close: x.close + 60 } : x));
    tryPlan(`Stay open an hour later on ${DAYS[d]} (until ${fmtTime(days[d].close + 60)})`, students, later);
    const earlier = days.map((x, i) => (i === d && x.open >= 60 ? { ...x, open: x.open - 60 } : x));
    if (days[d].open >= 60) tryPlan(`Open an hour earlier on ${DAYS[d]} (from ${fmtTime(days[d].open - 60)})`, students, earlier);
  }
  for (const idx of unplaced) {
    const s = students[idx];
    const widerLate = students.map((x, i) => (i === idx ? { ...x, latest: Math.min(24 * 60, x.latest + 60) } : x));
    tryPlan(`Ask ${s.name} whether ${fmtTime(Math.min(24 * 60, s.latest + 60))} works as a finish time`, widerLate, days);
    const widerDays = students.map((x, i) => (i === idx ? { ...x, days: [true, true, true, true, true, true, true] } : x));
    tryPlan(`Ask ${s.name} whether any other day works`, widerDays, days);
  }
  // Closed days: opening a whole closed day with the typical window.
  const typical = days.find((x) => x.usable);
  if (typical) for (let d = 0; d < 7; d++) {
    if (days[d].usable) continue;
    const opened = days.map((x, i) => (i === d ? { ...typical, name: x.name } : x));
    tryPlan(`Open on ${DAYS[d]} (${fmtTime(typical.open)} to ${fmtTime(typical.close)})`, students, opened);
  }
  out.sort((a, b) => b.gain - a.gain);
  return out.slice(0, 4);
}

export function analyze(studentRows, dayRows, sharedIn) {
  const shared = cleanShared(sharedIn);
  const days = cleanDays(dayRows);
  const { students, warnings } = cleanStudents(studentRows);
  if (!days.some((d) => d.usable)) { warnings.push("Enter the hours you teach (open and close time) for at least one day."); }
  if (!students.length) { warnings.push("Enter at least one student with a fee and a lesson length."); }
  if (!students.length || !days.some((d) => d.usable)) return { ok: false, warnings };
  const best = solve(students, days, shared);
  const base = greedy(students, days, shared);
  const placedIdx = new Set(best.placed.map((p) => p.idx));
  const unplaced = students.map((s, i) => i).filter((i) => !placedIdx.has(i));
  const droppedMust = unplaced.filter((i) => students[i].must);
  const rows = unplaced.map((i) => ({ name: students[i].name, fee: students[i].fee, why: whyNot(students[i], days, shared), must: students[i].must }));
  const opps = unplaced.length || days.some((d) => !d.usable) ? opportunities(students, days, shared, best, unplaced) : [];
  const minutes = best.placed.reduce((a, p) => a + (p.end - p.start), 0);
  return {
    ok: true, warnings, shared, days, students, best, base, rows, droppedMust, opps,
    gain: best.profit - base.profit,
    hours: minutes / 60,
    profitPerHour: minutes ? best.profit / (minutes / 60) : 0,
    yearly: best.profit * shared.weeksPerYear,
    schedule: DAYS.map((name, d) => ({
      name,
      lessons: best.placed.filter((p) => p.day === d).map((p) => ({ ...p, student: students[p.idx] })),
    })),
  };
}

export function toCsv(a) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Day", "Start", "End", "Student", "Fee"].map(q).join(",")];
  for (const d of a.schedule) for (const l of d.lessons) lines.push([d.name, fmtTime(l.start), fmtTime(l.end), l.student.name, l.student.fee].map(q).join(","));
  return lines.join("\n") + "\n";
}
