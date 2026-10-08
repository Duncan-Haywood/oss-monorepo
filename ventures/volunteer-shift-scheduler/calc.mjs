// Volunteer shift scheduler: pure functions, no I/O, no network, no imports.
// Deterministic: the same text in always gives the same roster out. Ties are
// broken by input order, never by a random number.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD_WORDS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
export const LIMITS = { volunteers: 300, shifts: 400, headcount: 200, expand: 370 };

// ---------- dates and times ----------

export function toDay(y, m, d) {
  if (!Number.isInteger(y) || y < 1970 || y > 2200) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}
export function dayIso(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}
export function dayOfWeek(day) {
  return new Date(day * 86400000).getUTCDay();
}
export function dayLabel(day) {
  const dt = new Date(day * 86400000);
  return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}
export function parseDate(text) {
  const s = String(text ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toDay(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}
export function weekdayIndex(word) {
  const w = String(word ?? "").trim().toLowerCase();
  if (w in WD_WORDS) return WD_WORDS[w];
  if (w.endsWith("s") && w.slice(0, -1) in WD_WORDS) return WD_WORDS[w.slice(0, -1)];
  return null;
}
// "9am", "9:30 pm", "18:00", "noon" -> minutes after midnight, or null.
export function parseTime(text) {
  const s = String(text ?? "").trim().toLowerCase().replace(/\./g, "");
  if (s === "noon") return 720;
  if (s === "midnight") return 0;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}
export function timeLabel(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// Named time slots: "AM=9am-12pm, PM=1pm-4pm". Slot names are one word.
export function parseSlots(text) {
  const slots = {};
  const errors = [];
  for (const raw of String(text ?? "").split(/[,\n]/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const [name, times] = entry.split("=").map((x) => x.trim());
    if (!name || /\s/.test(name)) { errors.push(`Slot "${entry}": use a one-word name like AM=9am-12pm.`); continue; }
    if (times === undefined || times === "") { slots[name.toLowerCase()] = { name, start: null, end: null }; continue; }
    const parts = times.split(/\s*(?:-|–|to)\s*/);
    const a = parseTime(parts[0]);
    const b = parts.length === 2 ? parseTime(parts[1]) : null;
    if (a === null || b === null || b <= a) { errors.push(`Slot "${entry}": times should look like 9am-12pm, with the end after the start.`); continue; }
    slots[name.toLowerCase()] = { name, start: a, end: b };
  }
  return { slots, errors };
}

// ---------- shifts ----------

// One shift per line: "date, slot, role, headcount". Role and headcount are optional.
// The date may be "Saturdays 2026-10-10 to 2026-11-07" to repeat a weekday.
export function parseShifts(text, slots = {}) {
  const shifts = [];
  const errors = [];
  let order = 0;
  const lines = String(text ?? "").split("\n");
  lines.forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(/[,|\t]/).map((x) => x.trim());
    const tag = `Shift line ${ln + 1}`;
    if (f.length < 2 || !f[0] || !f[1]) { errors.push(`${tag}: need at least a date and a slot, like 2026-10-10, AM, Greeter, 2.`); return; }
    if (f.length > 4) { errors.push(`${tag}: too many commas. Use date, slot, role, headcount.`); return; }
    let role = "Volunteer";
    let need = 1;
    if (f.length === 3) { if (/^\d+$/.test(f[2])) need = Number(f[2]); else if (f[2]) role = f[2]; }
    if (f.length === 4) {
      if (f[2]) role = f[2];
      if (f[3]) { if (!/^\d+$/.test(f[3])) { errors.push(`${tag}: headcount "${f[3]}" is not a whole number.`); return; } need = Number(f[3]); }
    }
    if (need < 1 || need > LIMITS.headcount) { errors.push(`${tag}: headcount must be 1 to ${LIMITS.headcount}.`); return; }
    if (/\s/.test(f[1])) { errors.push(`${tag}: slot "${f[1]}" should be one word, like AM or Setup.`); return; }
    let days = [];
    const rep = f[0].match(/^([A-Za-z]+)\s+(\S+)\s+to\s+(\S+)$/i);
    if (rep) {
      const wd = weekdayIndex(rep[1]);
      const a = parseDate(rep[2]);
      const b = parseDate(rep[3]);
      if (wd === null || a === null || b === null || b < a) { errors.push(`${tag}: could not read "${f[0]}". Try Saturdays 2026-10-10 to 2026-11-07.`); return; }
      if (b - a > LIMITS.expand) { errors.push(`${tag}: that range is longer than a year.`); return; }
      for (let d = a; d <= b; d++) if (dayOfWeek(d) === wd) days.push(d);
      if (!days.length) { errors.push(`${tag}: no ${rep[1]} falls between those dates.`); return; }
    } else {
      const d = parseDate(f[0]);
      if (d === null) { errors.push(`${tag}: "${f[0]}" is not a date. Use 2026-10-10 or 10/10/2026.`); return; }
      days = [d];
    }
    const key = f[1].toLowerCase();
    const def = slots[key];
    for (const day of days) {
      shifts.push({ day, date: dayIso(day), slot: def ? def.name : f[1], slotKey: key, start: def ? def.start : null, end: def ? def.end : null, role, need, order: order++ });
    }
  });
  if (shifts.length > LIMITS.shifts) errors.push(`That is ${shifts.length} shifts; the limit is ${LIMITS.shifts}. Split it into two rosters.`);
  shifts.sort((a, b) => a.day - b.day || (a.start ?? -1) - (b.start ?? -1) || a.slotKey.localeCompare(b.slotKey) || a.order - b.order);
  shifts.forEach((s, i) => { s.id = i; delete s.order; });
  return { shifts, errors };
}

// ---------- volunteers ----------

function compileToken(text, slotKeys) {
  const t = text.trim().toLowerCase();
  if (!t) return { skip: true };
  if (/^(any|all|anytime|always|everything|flexible)$/.test(t)) return { any: true };
  const out = { wd: null, slots: null, ranges: null };
  const range = t.match(/^(\S+)\s+to\s+(\S+)$/);
  if (range) {
    const a = parseDate(range[1]);
    const b = parseDate(range[2]);
    if (a === null || b === null || b < a) return { error: `"${text.trim()}" is not a date range` };
    out.ranges = [[a, b]];
    return { token: out };
  }
  for (const w of t.split(/\s+/)) {
    if (w === "weekends" || w === "weekend") { out.wd = [...(out.wd || []), 0, 6]; continue; }
    if (w === "weekdays" || w === "weekday") { out.wd = [...(out.wd || []), 1, 2, 3, 4, 5]; continue; }
    const wd = weekdayIndex(w);
    if (wd !== null) { out.wd = [...(out.wd || []), wd]; continue; }
    const d = parseDate(w);
    if (d !== null) { out.ranges = [...(out.ranges || []), [d, d]]; continue; }
    if (slotKeys.includes(w)) { out.slots = [...(out.slots || []), w]; continue; }
    return { error: `"${w}" is not a weekday, a date or one of your slots (${slotKeys.join(", ") || "none yet"})` };
  }
  return { token: out };
}

// "Name: Sat AM, Sun; max 3; not: Nursery, Kitchen"
export function parseVolunteers(text, { slotKeys = [], defaultMax = null } = {}) {
  const volunteers = [];
  const errors = [];
  const seen = new Set();
  String(text ?? "").split("\n").forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const i = line.indexOf(":");
    const name = (i < 0 ? line : line.slice(0, i)).trim().replace(/\s+/g, " ");
    const rest = i < 0 ? "" : line.slice(i + 1);
    const tag = `Volunteer line ${ln + 1}${name ? ` (${name})` : ""}`;
    if (!name) { errors.push(`${tag}: no name before the colon.`); return; }
    if (seen.has(name.toLowerCase())) { errors.push(`${tag}: ${name} is listed twice. Merge the two lines.`); return; }
    seen.add(name.toLowerCase());
    let max = defaultMax;
    const noRoles = [];
    const tokens = [];
    let any = false;
    let sawAvail = false;
    let bad = false;
    for (const seg of rest.split(";")) {
      const s = seg.trim();
      if (!s) continue;
      let m = s.match(/^max(?:imum)?\s*(?:shifts?)?\s*[:=]?\s*(\d+)\s*(?:shifts?)?$/i);
      if (m) { max = Number(m[1]); if (max < 1) { errors.push(`${tag}: max must be at least 1. Leave the person off the list instead.`); bad = true; } continue; }
      m = s.match(/^(?:no|not|cannot|can't|cant|except|avoid)\b\s*:?\s*(.*)$/i);
      if (m) { for (const r of m[1].split(",")) if (r.trim()) noRoles.push(r.trim().toLowerCase()); continue; }
      sawAvail = true;
      for (const part of s.replace(/^(?:avail(?:able|ability)?|can do)\s*:?\s*/i, "").split(",")) {
        const c = compileToken(part, slotKeys);
        if (c.skip) continue;
        if (c.error) { errors.push(`${tag}: ${c.error}.`); bad = true; continue; }
        if (c.any) any = true; else tokens.push(c.token);
      }
    }
    if (bad) return;
    if (!sawAvail || (!tokens.length && !any)) any = true;
    volunteers.push({ name, max, avail: { any, tokens }, noRoles });
  });
  if (volunteers.length > LIMITS.volunteers) errors.push(`That is ${volunteers.length} volunteers; the limit is ${LIMITS.volunteers}.`);
  return { volunteers, errors };
}

function tokenMatches(t, s) {
  if (t.wd && !t.wd.includes(dayOfWeek(s.day))) return false;
  if (t.slots && !t.slots.includes(s.slotKey)) return false;
  if (t.ranges && !t.ranges.some(([a, b]) => s.day >= a && s.day <= b)) return false;
  return true;
}
export function canDo(v, s) {
  if (v.noRoles.includes(s.role.toLowerCase())) return false;
  return v.avail.any || v.avail.tokens.some((t) => tokenMatches(t, s));
}
// Two shifts clash when they are the same slot on the same day, or their times overlap.
export function clash(a, b) {
  if (a.day !== b.day) return false;
  if (a.slotKey === b.slotKey) return true;
  return a.start !== null && b.start !== null && a.start < b.end && b.start < a.end;
}

export function readSpec(fields) {
  const errors = [];
  const sl = parseSlots(fields.slots);
  errors.push(...sl.errors);
  const sh = parseShifts(fields.shifts, sl.slots);
  errors.push(...sh.errors);
  let defaultMax = null;
  const dm = String(fields.defaultMax ?? "").trim();
  if (dm) {
    if (!/^\d+$/.test(dm) || Number(dm) < 1) errors.push("Default max shifts should be a whole number of 1 or more, or blank for no limit.");
    else defaultMax = Number(dm);
  }
  const slotKeys = [...new Set([...Object.keys(sl.slots), ...sh.shifts.map((s) => s.slotKey)])];
  const vo = parseVolunteers(fields.volunteers, { slotKeys, defaultMax });
  errors.push(...vo.errors);
  if (!sh.shifts.length && !sh.errors.length) errors.push("Add at least one shift.");
  if (!vo.volunteers.length && !vo.errors.length) errors.push("Add at least one volunteer.");
  const warnings = [];
  const roles = new Set(sh.shifts.map((s) => s.role.toLowerCase()));
  for (const v of vo.volunteers) for (const r of v.noRoles) if (!roles.has(r)) warnings.push(`${v.name} cannot do "${r}", but no shift has that role. Check the spelling.`);
  return { spec: { org: String(fields.org ?? "").trim(), volunteers: vo.volunteers, shifts: sh.shifts, slots: sl.slots }, errors, warnings };
}

// ---------- the assignment algorithm ----------

export function buildRoster(spec, { repair = true, balance = true } = {}) {
  const V = spec.volunteers;
  const S = spec.shifts;
  const cap = V.map((v) => (v.max == null ? Infinity : v.max));
  const elig = S.map((s) => V.map((v, i) => (canDo(v, s) ? i : -1)).filter((i) => i >= 0));
  const flex = V.map((_, i) => elig.reduce((n, list) => n + (list.includes(i) ? 1 : 0), 0));
  const assigned = S.map(() => []);
  const mine = V.map(() => []);

  const free = (v, s, ignore = -1) => !mine[v].some((t) => t !== ignore && clash(S[t], S[s]));
  const better = (a, b) => (mine[a].length - mine[b].length) || (flex[a] - flex[b]) || (a - b);
  const give = (v, s) => { assigned[s].push(v); mine[v].push(s); };
  const take = (v, s) => { assigned[s].splice(assigned[s].indexOf(v), 1); mine[v].splice(mine[v].indexOf(s), 1); };
  const pick = (s, exclude = -1) => elig[s]
    .filter((v) => v !== exclude && !assigned[s].includes(v) && mine[v].length < cap[v] && free(v, s))
    .sort(better)[0];

  // 1. Scarcest shifts first: fewest available volunteers per seat needed.
  const order = S.map((_, i) => i).sort((a, b) => (elig[a].length / S[a].need) - (elig[b].length / S[b].need) || S[a].day - S[b].day || a - b);
  for (const s of order) {
    for (let k = 0; k < S[s].need; k++) {
      const v = pick(s);
      if (v === undefined) break;
      give(v, s);
    }
  }

  // 2. Repair: for a seat still empty, bump one of a candidate's shifts to someone else.
  let repaired = 0;
  if (repair) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const s of order) {
        while (assigned[s].length < S[s].need) {
          let done = false;
          const cands = elig[s].filter((v) => !assigned[s].includes(v)).sort(better);
          for (const v of cands) {
            const blockers = mine[v].filter((t) => clash(S[t], S[s]));
            if (blockers.length > 1) continue;
            const movable = blockers.length ? blockers : mine[v].length >= cap[v] ? [...mine[v]].sort((a, b) => elig[b].length - elig[a].length || a - b) : [];
            for (const t of movable) {
              const w = pick(t, v);
              if (w === undefined) continue;
              take(v, t); give(w, t); give(v, s);
              repaired++; done = true; progress = true;
              break;
            }
            if (done) break;
          }
          if (!done) break;
        }
      }
    }
  }

  // 3. Balance: move a shift from the busiest person to someone with at least two fewer.
  let moved = 0;
  if (balance) {
    for (let guard = 0; guard < 5000; guard++) {
      let best = null;
      for (let v = 0; v < V.length; v++) {
        for (const t of mine[v]) {
          for (const w of elig[t]) {
            if (w === v || assigned[t].includes(w) || mine[w].length >= cap[w] || !free(w, t)) continue;
            const gap = mine[v].length - mine[w].length;
            if (gap < 2) continue;
            if (!best || gap > best.gap || (gap === best.gap && (v < best.v || (v === best.v && (t < best.t || (t === best.t && w < best.w)))))) best = { v, t, w, gap };
          }
        }
      }
      if (!best) break;
      take(best.v, best.t); give(best.w, best.t); moved++;
    }
  }

  return finish(spec, assigned, mine, elig, cap, { repaired, moved });
}

function finish(spec, assigned, mine, elig, cap, work) {
  const V = spec.volunteers;
  const S = spec.shifts;
  const seats = assigned.map((list) => [...list].sort((a, b) => a - b));
  const unfilled = [];
  S.forEach((s, i) => {
    const missing = s.need - seats[i].length;
    if (missing <= 0) return;
    const pool = elig[i].filter((v) => !seats[i].includes(v));
    const atMax = pool.filter((v) => mine[v].length >= cap[v]).length;
    const booked = pool.filter((v) => mine[v].length < cap[v] && mine[v].some((t) => clash(S[t], s))).length;
    let reason;
    if (!elig[i].length) reason = "nobody listed is available for this slot and role";
    else if (!pool.length) reason = `only ${elig[i].length} available and all are already on it`;
    else reason = `${elig[i].length} available: ${atMax} at their max, ${booked} already booked at that time`;
    unfilled.push({ shift: i, missing, reason });
  });
  const loads = V.map((_, i) => mine[i].length);
  const total = loads.reduce((a, b) => a + b, 0);
  const n = V.length || 1;
  const mean = total / n;
  const variance = loads.reduce((a, l) => a + (l - mean) ** 2, 0) / n;
  const needed = S.reduce((a, s) => a + s.need, 0);
  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const over = V.map((_, i) => i).filter((i) => loads[i] > Math.ceil(mean));
  // Under-loaded only counts people who could have taken more: below the floor of the mean
  // and still under their own max.
  const under = V.map((_, i) => i).filter((i) => loads[i] < Math.floor(mean) && loads[i] < cap[i]);
  const idle = V.map((_, i) => i).filter((i) => loads[i] === 0);
  const noOptions = V.map((_, i) => i).filter((i) => !elig.some((l) => l.includes(i)));
  const volunteers = V.map((v, i) => ({
    index: i, name: v.name, max: v.max, load: loads[i],
    shifts: [...mine[i]].sort((a, b) => a - b),
  }));
  return {
    spec, seats, unfilled, volunteers,
    stats: {
      needed, filled: total, unfilledSeats: needed - total, fillPct: needed ? Math.round((1000 * total) / needed) / 10 : 100,
      min, max, spread: max - min, mean: Math.round(mean * 100) / 100, stdev: Math.round(Math.sqrt(variance) * 100) / 100,
      over, under, idle, noOptions, repaired: work.repaired, moved: work.moved,
    },
  };
}

// An independent re-check of a finished roster, written without the solver's helpers.
export function validateRoster(roster) {
  const { spec, seats } = roster;
  const errors = [];
  const byVol = spec.volunteers.map(() => []);
  seats.forEach((list, s) => {
    const sh = spec.shifts[s];
    if (new Set(list).size !== list.length) errors.push(`${dayIso(sh.day)} ${sh.slot} ${sh.role}: same person twice.`);
    if (list.length > sh.need) errors.push(`${dayIso(sh.day)} ${sh.slot} ${sh.role}: more people than seats.`);
    for (const v of list) {
      const vol = spec.volunteers[v];
      if (!canDo(vol, sh)) errors.push(`${vol.name} is not available or excluded for ${dayIso(sh.day)} ${sh.slot} ${sh.role}.`);
      byVol[v].push(s);
    }
  });
  byVol.forEach((list, v) => {
    const vol = spec.volunteers[v];
    if (vol.max != null && list.length > vol.max) errors.push(`${vol.name} has ${list.length} shifts but a max of ${vol.max}.`);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (clash(spec.shifts[list[i]], spec.shifts[list[j]])) errors.push(`${vol.name} is double-booked on ${dayIso(spec.shifts[list[i]].day)}.`);
    }
  });
  return { ok: errors.length === 0, errors };
}

// ---------- exports ----------

const shiftWhen = (s) => (s.start !== null ? `${s.slot} ${timeLabel(s.start)}-${timeLabel(s.end)}` : s.slot);

function csvCell(v) {
  let t = String(v ?? "");
  // A volunteer name starting with = + - @ would run as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
export function rosterCsv(roster) {
  const { spec, seats } = roster;
  const rows = [["Date", "Weekday", "Slot", "Start", "End", "Role", "Volunteer", "Status"]];
  spec.shifts.forEach((s, i) => {
    const base = [s.date, WEEKDAYS[dayOfWeek(s.day)], s.slot, s.start !== null ? timeLabel(s.start) : "", s.end !== null ? timeLabel(s.end) : "", s.role];
    for (const v of seats[i]) rows.push([...base, spec.volunteers[v].name, "Assigned"]);
    for (let k = seats[i].length; k < s.need; k++) rows.push([...base, "", "UNFILLED"]);
  });
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function volunteerCsv(roster) {
  const rows = [["Volunteer", "Shifts", "Max", "Date", "Slot", "Role"]];
  for (const v of roster.volunteers) {
    if (!v.shifts.length) rows.push([v.name, 0, v.max ?? "", "", "", ""]);
    for (const s of v.shifts) {
      const sh = roster.spec.shifts[s];
      rows.push([v.name, v.load, v.max ?? "", sh.date, sh.slot, sh.role]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const icsEscape = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function icsFold(line) {
  const out = [];
  let cur = line;
  while (cur.length > 74) { out.push(cur.slice(0, 74)); cur = " " + cur.slice(74); }
  out.push(cur);
  return out.join("\r\n");
}
const compact = (day) => dayIso(day).replace(/-/g, "");
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;

// One calendar for one volunteer (index), or for the whole roster when index is null.
export function rosterIcs(roster, volunteerIdx = null, stamp = null) {
  const { spec, seats } = roster;
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const org = spec.org || "Volunteer roster";
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//volunteer-shift-scheduler//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(volunteerIdx === null ? org : `${org}: ${spec.volunteers[volunteerIdx].name}`)}`];
  spec.shifts.forEach((s, i) => {
    if (volunteerIdx !== null && !seats[i].includes(volunteerIdx)) return;
    if (volunteerIdx === null && !seats[i].length) return;
    const who = seats[i].map((v) => spec.volunteers[v].name).join(", ");
    out.push("BEGIN:VEVENT", `UID:${s.id}-${volunteerIdx === null ? "all" : volunteerIdx}-${compact(s.day)}@volunteer-shift-scheduler`, `DTSTAMP:${dtstamp}`);
    if (s.start !== null) out.push(`DTSTART:${compact(s.day)}T${hhmm(s.start)}`, `DTEND:${compact(s.day)}T${hhmm(s.end)}`);
    else out.push(`DTSTART;VALUE=DATE:${compact(s.day)}`, `DTEND;VALUE=DATE:${compact(s.day + 1)}`);
    out.push(`SUMMARY:${icsEscape(volunteerIdx === null ? `${s.role}: ${who}` : `${org}: ${s.role}`)}`,
      `DESCRIPTION:${icsEscape(volunteerIdx === null ? `${s.slot} shift` : `${s.slot} shift. With: ${seats[i].filter((v) => v !== volunteerIdx).map((v) => spec.volunteers[v].name).join(", ") || "no one else listed"}`)}`,
      "END:VEVENT");
  });
  out.push("END:VCALENDAR");
  return out.map(icsFold).join("\r\n") + "\r\n";
}

export function reminderFor(roster, volunteerIdx, note = "") {
  const { spec } = roster;
  const v = roster.volunteers[volunteerIdx];
  const org = spec.org ? ` for ${spec.org}` : "";
  const lines = [];
  if (!v.shifts.length) {
    lines.push(`Hi ${v.name}, thank you for offering to help${org}. We have not put you on a shift this round; we will be in touch if something opens up.`);
  } else {
    lines.push(`Hi ${v.name}, thank you for volunteering${org}! You are down for ${v.shifts.length === 1 ? "1 shift" : `${v.shifts.length} shifts`}:`);
    for (const s of v.shifts) {
      const sh = spec.shifts[s];
      const others = roster.seats[s].filter((x) => x !== volunteerIdx).map((x) => spec.volunteers[x].name);
      lines.push(`- ${dayLabel(sh.day)}, ${shiftWhen(sh)}: ${sh.role}${others.length ? ` (with ${others.join(", ")})` : ""}`);
    }
    lines.push("If you can no longer make one, please tell us as early as you can so we can find cover.");
  }
  if (note.trim()) lines.push(note.trim());
  return lines.join("\n");
}
export function remindersText(roster, note = "") {
  return roster.volunteers.map((v) => reminderFor(roster, v.index, note)).join("\n\n---\n\n") + "\n";
}

export function rosterText(roster) {
  const { spec, seats } = roster;
  const lines = [`${spec.org || "Volunteer roster"}`, ""];
  let lastDay = null;
  spec.shifts.forEach((s, i) => {
    if (s.day !== lastDay) { if (lastDay !== null) lines.push(""); lines.push(dayLabel(s.day)); lastDay = s.day; }
    const names = seats[i].map((v) => spec.volunteers[v].name);
    for (let k = seats[i].length; k < s.need; k++) names.push("(NEEDED)");
    lines.push(`  ${shiftWhen(s)} ${s.role}: ${names.join(", ")}`);
  });
  lines.push("", `Filled ${roster.stats.filled} of ${roster.stats.needed} places. Check names and dates before sending.`);
  return lines.join("\n") + "\n";
}

// ---------- share link: the fields, encoded into the part of the URL after # ----------

export function encodeShare(fields) {
  const json = JSON.stringify(fields);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeShare(text) {
  try {
    const b64 = String(text).replace(/^#?s=/, "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out = {};
    for (const k of ["org", "volunteers", "shifts", "slots", "defaultMax"]) out[k] = typeof obj[k] === "string" ? obj[k].slice(0, 60000) : "";
    return out;
  } catch {
    return null;
  }
}

// ---------- sample ----------

export function sampleFields() {
  return {
    org: "Riverside Food Pantry (invented example)",
    slots: "AM=9am-12pm, PM=1pm-4pm",
    defaultMax: "",
    shifts: [
      "Saturdays 2026-10-10 to 2026-10-24, AM, Greeter, 2",
      "Saturdays 2026-10-10 to 2026-10-24, AM, Packer, 3",
      "Saturdays 2026-10-10 to 2026-10-24, PM, Driver, 1",
      "2026-10-17, PM, Setup",
    ].join("\n"),
    volunteers: [
      "Ana Ruiz: Sat; max 3",
      "Ben Okafor: Sat AM; max 2; not: Driver",
      "Carla Meyer: Sat PM, 2026-10-10; max 2",
      "Dev Patel: Sat; max 3; not: Greeter",
      "Elena Rossi: Sat AM; max 3",
      "Frank Lee: any; max 2",
      "Grace Kim: Sat AM, Sat PM; max 3; not: Driver",
      "Hugo Silva: Sat; max 1",
      "Ines Costa: Sat AM; max 3; not: Packer",
      "Jonas Weber: Sat PM; max 2",
    ].join("\n"),
  };
}
