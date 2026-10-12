// Weekly staff schedule solver: greedy construction by scarcity, then a seeded
// local search (reassign / swap) over a cost that rewards filled shifts and an
// even spread of hours. A separate validator re-checks any finished schedule.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dayIndex = (t) => DAYS.findIndex((d) => d.toLowerCase() === String(t).slice(0, 3).toLowerCase());

export function rng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hhmm = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

function parseDays(tok) {
  const t = tok.trim();
  if (/^daily$|^every ?day$/i.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^weekdays?$/i.test(t)) return [0, 1, 2, 3, 4];
  if (/^weekends?$/i.test(t)) return [5, 6];
  const out = new Set();
  for (const part of t.split(",")) {
    const r = part.split("-");
    if (r.length === 2) {
      const a = dayIndex(r[0]);
      const b = dayIndex(r[1]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break; }
    } else {
      const a = dayIndex(part);
      if (a < 0 || part.trim().length < 3) return null;
      out.add(a);
    }
  }
  return [...out].sort((x, y) => x - y);
}

// Staff line:  Ana: server, cook; max 32; min 16; rate 18; off Mon Tue
export function parseStaff(text) {
  const staff = [];
  const errors = [];
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [head, ...rest] = line.split(";").map((x) => x.trim());
    const [name, roleText] = head.split(":").map((x) => x.trim());
    if (!name) { errors.push(`Staff line "${line}" has no name.`); continue; }
    const p = { name, roles: (roleText || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean), max: 40, min: 0, rate: null, off: new Set() };
    if (!p.roles.length) { errors.push(`${name}: add at least one role after the colon, e.g. "${name}: server".`); continue; }
    for (const part of rest) {
      const m = /^(max|min|rate|off)\s+(.*)$/i.exec(part);
      if (!m) { errors.push(`${name}: could not read "${part}". Use max 32, min 16, rate 18 or off Mon Tue.`); continue; }
      const key = m[1].toLowerCase();
      if (key === "off") {
        for (const tk of m[2].split(/[\s,]+/).filter(Boolean)) {
          const ds = parseDays(tk);
          if (!ds) errors.push(`${name}: "${tk}" is not a day.`); else ds.forEach((d) => p.off.add(d));
        }
      } else {
        const v = Number(m[2]);
        if (!Number.isFinite(v) || v < 0) errors.push(`${name}: ${key} must be a number.`); else p[key] = v;
      }
    }
    if (p.min > p.max) errors.push(`${name}: min hours ${p.min} is above max hours ${p.max}.`);
    if (staff.some((s) => s.name.toLowerCase() === name.toLowerCase())) errors.push(`${name} is listed twice.`);
    staff.push(p);
  }
  if (!staff.length) errors.push("Add at least one person.");
  return { staff, errors };
}

// Shift line:  Mon-Fri 07:00-15:00 server x2   (optional label before the days: "Open | Mon-Fri ...")
export function parseShifts(text) {
  const shifts = [];
  const errors = [];
  for (const raw of String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    let label = "";
    let line = raw;
    if (line.includes("|")) { const i = line.indexOf("|"); label = line.slice(0, i).trim(); line = line.slice(i + 1).trim(); }
    const m = /^(\S+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.+?)(?:\s+x\s*(\d+))?$/i.exec(line);
    if (!m) { errors.push(`Could not read shift "${raw}". Use: Mon-Fri 07:00-15:00 server x2`); continue; }
    const days = parseDays(m[1]);
    const a = parseTime(m[2]);
    const b = parseTime(m[3]);
    if (!days) { errors.push(`"${m[1]}" in "${raw}" is not a day or range.`); continue; }
    if (a === null || b === null || a === b) { errors.push(`The times in "${raw}" are not valid.`); continue; }
    const count = m[5] ? Number(m[5]) : 1;
    if (count < 1 || count > 20) { errors.push(`The headcount in "${raw}" must be 1 to 20.`); continue; }
    shifts.push({ label, days, start: a, end: b > a ? b : b + 1440, role: m[4].trim().toLowerCase(), count });
  }
  if (!shifts.length) errors.push("Add at least one shift.");
  return { shifts, errors };
}

export function readSpec(f) {
  const a = parseStaff(f.staff);
  const b = parseShifts(f.shifts);
  const errors = [...a.errors, ...b.errors];
  const minRest = f.minRest === "" || f.minRest === undefined ? 10 : Number(f.minRest);
  const maxRun = f.maxRun === "" || f.maxRun === undefined ? 6 : Number(f.maxRun);
  if (!Number.isFinite(minRest) || minRest < 0 || minRest > 24) errors.push("Minimum rest between shifts must be 0 to 24 hours.");
  if (!Number.isFinite(maxRun) || maxRun < 1 || maxRun > 7) errors.push("Longest run of working days must be 1 to 7.");
  let weekStart = null;
  if (String(f.weekStart || "").trim()) {
    const d = new Date(`${f.weekStart.trim()}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(f.weekStart.trim())) errors.push("Week start must look like 2026-10-12.");
    else if (d.getUTCDay() !== 1) errors.push("Week start must be a Monday.");
    else weekStart = d;
  }
  for (const s of b.shifts) if (a.staff.length && !a.staff.some((p) => p.roles.includes(s.role))) errors.push(`Nobody is listed for the role "${s.role}" needed by a shift.`);
  return { spec: { staff: a.staff, shifts: b.shifts, minRest, maxRun, weekStart, seed: Number(f.seed) || 1 }, errors };
}

export function expandSlots(shifts) {
  const slots = [];
  for (const sh of shifts) for (const day of sh.days) for (let k = 0; k < sh.count; k++) {
    slots.push({ id: slots.length, day, label: sh.label, start: sh.start, end: sh.end, role: sh.role, dur: (sh.end - sh.start) / 60 });
  }
  return slots;
}

const abs = (s) => ({ a: s.day * 1440 + s.start, b: s.day * 1440 + s.end });

function feasible(spec, p, slot, mine) {
  const person = spec.staff[p];
  if (!person.roles.includes(slot.role)) return false;
  if (person.off.has(slot.day)) return false;
  let hours = slot.dur;
  const days = new Set([slot.day]);
  const x = abs(slot);
  for (const o of mine) {
    if (o.day === slot.day) return false;
    hours += o.dur;
    days.add(o.day);
    const y = abs(o);
    const gap = x.a >= y.b ? x.a - y.b : y.a >= x.b ? y.a - x.b : -1;
    if (gap < spec.minRest * 60) return false;
  }
  // wrap-around: Sunday night into Monday morning counts against next week's start
  for (const o of mine) {
    const y = abs(o);
    const wrap = Math.min(x.a + 7 * 1440 - y.b, y.a + 7 * 1440 - x.b);
    if (wrap >= 0 && wrap < spec.minRest * 60 && x.a !== y.a) return false;
  }
  if (hours > person.max + 1e-9) return false;
  let run = 0;
  let best = 0;
  for (let d = 0; d < 7; d++) { if (days.has(d)) { run++; best = Math.max(best, run); } else run = 0; }
  if (best > spec.maxRun) return false;
  return true;
}

function cost(spec, slots, assign) {
  const n = spec.staff.length;
  const hours = new Array(n).fill(0);
  const wk = new Array(n).fill(0);
  let unfilled = 0;
  slots.forEach((s, i) => {
    const p = assign[i];
    if (p < 0) { unfilled++; return; }
    hours[p] += s.dur;
    if (s.day >= 5) wk[p]++;
  });
  let c = unfilled * 10000;
  const util = hours.map((h, p) => (spec.staff[p].max > 0 ? h / spec.staff[p].max : 0));
  const mean = util.reduce((a, b) => a + b, 0) / n;
  for (let p = 0; p < n; p++) {
    c += (util[p] - mean) ** 2 * 400;
    if (hours[p] < spec.staff[p].min) c += (spec.staff[p].min - hours[p]) * 30;
  }
  const wm = wk.reduce((a, b) => a + b, 0) / n;
  for (let p = 0; p < n; p++) c += (wk[p] - wm) ** 2 * 6;
  return c;
}

function minesOf(slots, assign, p, skip) {
  const out = [];
  for (let i = 0; i < slots.length; i++) if (assign[i] === p && !skip.includes(i)) out.push(slots[i]);
  return out;
}

function solveOnce(spec, slots, rand, iters) {
  const n = spec.staff.length;
  const assign = new Array(slots.length).fill(-1);
  const eligible = slots.map((s) => spec.staff.reduce((c, p) => c + (p.roles.includes(s.role) && !p.off.has(s.day) ? 1 : 0), 0));
  const order = slots.map((_, i) => i).sort((a, b) => eligible[a] - eligible[b] || rand() - 0.5);
  for (const i of order) {
    let bestP = -1;
    let bestV = Infinity;
    for (let p = 0; p < n; p++) {
      if (!feasible(spec, p, slots[i], minesOf(slots, assign, p, []))) continue;
      const h = minesOf(slots, assign, p, []).reduce((a, s) => a + s.dur, 0) + slots[i].dur;
      const v = h / Math.max(spec.staff[p].max, 1) + rand() * 0.05;
      if (v < bestV) { bestV = v; bestP = p; }
    }
    assign[i] = bestP;
  }
  let cur = cost(spec, slots, assign);
  for (let it = 0; it < iters; it++) {
    const i = Math.floor(rand() * slots.length);
    const move = rand();
    if (move < 0.55) {
      const p = Math.floor(rand() * (n + 1)) - 1; // -1 leaves it open
      if (p === assign[i]) continue;
      if (p >= 0 && !feasible(spec, p, slots[i], minesOf(slots, assign, p, [i]))) continue;
      const old = assign[i];
      assign[i] = p;
      const c = cost(spec, slots, assign);
      if (c <= cur) cur = c; else assign[i] = old;
    } else {
      const j = Math.floor(rand() * slots.length);
      const p = assign[i];
      const q = assign[j];
      if (i === j || p === q || p < 0 || q < 0) continue;
      if (!feasible(spec, p, slots[j], minesOf(slots, assign, p, [i, j]))) continue;
      if (!feasible(spec, q, slots[i], minesOf(slots, assign, q, [i, j]))) continue;
      assign[i] = q; assign[j] = p;
      const c = cost(spec, slots, assign);
      if (c <= cur) cur = c; else { assign[i] = p; assign[j] = q; }
    }
  }
  return { assign, cost: cur };
}

export function buildSchedule(spec, opts = {}) {
  const slots = expandSlots(spec.shifts);
  if (slots.length > 600) throw new Error("That is more than 600 shift slots for one week. Trim the headcounts.");
  const rand = rng(spec.seed);
  const restarts = opts.restarts ?? 6;
  const iters = opts.iters ?? 2500;
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const res = solveOnce(spec, slots, rand, iters);
    if (!best || res.cost < best.cost) best = res;
  }
  const n = spec.staff.length;
  const hours = new Array(n).fill(0);
  slots.forEach((s, i) => { if (best.assign[i] >= 0) hours[best.assign[i]] += s.dur; });
  const gaps = slots.filter((_, i) => best.assign[i] < 0);
  const notices = [];
  for (const g of gaps) {
    const elig = spec.staff.filter((p) => p.roles.includes(g.role) && !p.off.has(g.day)).length;
    notices.push(`${FULL_DAYS[g.day]} ${hhmm(g.start)}-${hhmm(g.end)} ${g.role} is open: ${elig === 0 ? "nobody with that role is available that day" : `${elig} eligible, but each is at their hour limit, rest rule or run limit`}.`);
  }
  const people = spec.staff.map((p, i) => ({
    name: p.name, hours: hours[i], max: p.max, min: p.min, rate: p.rate,
    cost: p.rate === null ? null : hours[i] * p.rate,
    overMin: hours[i] < p.min,
    over40: hours[i] > 40,
    shifts: slots.filter((_, k) => best.assign[k] === i).map((s) => s.id),
  }));
  const totalCost = people.every((p) => p.cost !== null) ? people.reduce((a, p) => a + p.cost, 0) : null;
  return { spec, slots, assign: best.assign, gaps, notices, people, stats: { slots: slots.length, filled: slots.length - gaps.length, hours: hours.reduce((a, b) => a + b, 0), totalCost } };
}

// Independent re-check of a finished schedule against the rules.
export function validateSchedule(s) {
  const errors = [];
  const { spec, slots, assign } = s;
  const by = spec.staff.map(() => []);
  slots.forEach((sl, i) => { if (assign[i] >= 0) by[assign[i]].push(sl); });
  by.forEach((list, p) => {
    const person = spec.staff[p];
    let total = 0;
    const seen = new Set();
    list.forEach((sl) => {
      total += sl.dur;
      if (!person.roles.includes(sl.role)) errors.push(`${person.name} is on a ${sl.role} shift without that role.`);
      if (person.off.has(sl.day)) errors.push(`${person.name} is scheduled on a day off (${DAYS[sl.day]}).`);
      if (seen.has(sl.day)) errors.push(`${person.name} has two shifts on ${DAYS[sl.day]}.`);
      seen.add(sl.day);
    });
    if (total > person.max + 1e-9) errors.push(`${person.name} is over their ${person.max}-hour limit.`);
    const sorted = [...list].sort((x, y) => abs(x).a - abs(y).a);
    for (let k = 1; k < sorted.length; k++) {
      if (abs(sorted[k]).a - abs(sorted[k - 1]).b < spec.minRest * 60) errors.push(`${person.name} has less than ${spec.minRest} hours of rest before ${DAYS[sorted[k].day]}.`);
    }
    let run = 0;
    for (let d = 0; d < 7; d++) { run = seen.has(d) ? run + 1 : 0; if (run > spec.maxRun) { errors.push(`${person.name} works more than ${spec.maxRun} days in a row.`); break; } }
  });
  return { ok: errors.length === 0, errors };
}

export function dateLabel(spec, day) {
  if (!spec.weekStart) return DAYS[day];
  const d = new Date(spec.weekStart.getTime() + day * 86400000);
  return `${DAYS[day]} ${d.toISOString().slice(5, 10)}`;
}

export function gridRows(s) {
  const { spec, slots, assign } = s;
  return spec.staff.map((p, pi) => {
    const cells = DAYS.map((_, d) => {
      const sl = slots.find((x, i) => assign[i] === pi && x.day === d);
      return sl ? { text: `${hhmm(sl.start)}-${hhmm(sl.end)} ${sl.role}`, role: sl.role } : p.off.has(d) ? { text: "off", off: true } : { text: "" };
    });
    return { name: p.name, cells };
  });
}

const csvCell = (v) => { const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) ? `"'${t.replace(/"/g, '""')}"` : /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export function scheduleCsv(s) {
  const rows = [["Day", "Start", "End", "Role", "Person", "Hours"]];
  const order = s.slots.map((_, i) => i).sort((a, b) => abs(s.slots[a]).a - abs(s.slots[b]).a || a - b);
  for (const i of order) {
    const sl = s.slots[i];
    rows.push([dateLabel(s.spec, sl.day), hhmm(sl.start), hhmm(sl.end), sl.role, assign_name(s, i), sl.dur]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
const assign_name = (s, i) => (s.assign[i] >= 0 ? s.spec.staff[s.assign[i]].name : "OPEN");

export function gridCsv(s) {
  const head = ["Name", ...DAYS.map((_, d) => dateLabel(s.spec, d)), "Hours"];
  const rows = [head, ...gridRows(s).map((r, i) => [r.name, ...r.cells.map((c) => c.text), s.people[i].hours])];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function scheduleText(s) {
  const lines = ["WEEKLY SCHEDULE", ""];
  for (let d = 0; d < 7; d++) {
    const idx = s.slots.map((_, i) => i).filter((i) => s.slots[i].day === d).sort((a, b) => s.slots[a].start - s.slots[b].start);
    if (!idx.length) continue;
    lines.push(dateLabel(s.spec, d));
    for (const i of idx) lines.push(`  ${hhmm(s.slots[i].start)}-${hhmm(s.slots[i].end)}  ${s.slots[i].role.padEnd(10)} ${assign_name(s, i)}`);
    lines.push("");
  }
  lines.push("HOURS");
  for (const p of s.people) lines.push(`  ${p.name}: ${p.hours} h`);
  if (s.gaps.length) { lines.push("", "OPEN SHIFTS", ...s.notices.map((n) => `  ${n}`)); }
  return lines.join("\n") + "\n";
}

export function sampleFields() {
  return {
    staff: "Ana: server, host; max 32; rate 17\nBen: server; max 40; rate 16; off Sun\nCara: cook; max 40; rate 21\nDev: cook, prep; max 40; rate 19; off Mon\nEli: server, bartender; max 24; rate 18; off Tue Wed\nFay: host, server; max 20; rate 15; off Mon Tue Wed\nGus: bartender, server; max 32; rate 18",
    shifts: "Lunch | Mon-Sun 10:30-16:00 server\nDinner | Mon-Thu 16:00-22:00 server\nDinner | Fri-Sun 16:00-22:00 server x2\nLine lunch | Tue-Sat 10:00-16:00 cook\nLine dinner | Mon-Sun 16:00-22:30 cook\nBar | Thu-Sun 17:00-23:00 bartender\nHost | Fri-Sat 17:00-21:00 host",
    minRest: "10", maxRun: "6", weekStart: "", seed: "1",
  };
}
