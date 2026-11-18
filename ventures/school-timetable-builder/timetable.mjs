// School timetable builder: parser, feasibility checks, solver and an
// independent validator. Browser and Node, no dependencies.
//
// Model
//   days x periods time grid; classes (student groups); teachers; rooms with
//   an optional type ("lab", "gym"). A lesson line says which class(es) meet
//   which teacher for a subject how many periods a week, optionally as double
//   periods and in a room of a type. Lessons without a room requirement are
//   taught in the class's own base room and get no room.
//
// Hard constraints (must hold for a usable timetable)
//   no class, teacher or room in two places at once; nobody scheduled in a
//   period marked off; a double never crosses the end of a day or a declared
//   break; every lesson placed.
// Soft constraints (weighted, lower is better)
//   class gaps (free periods between lessons in a class's day), teacher gaps,
//   the same subject twice in one class day, teacher over a daily maximum,
//   class days that start late.

export const DEFAULT_WEIGHTS = Object.freeze({
  classGap: 10,
  teacherGap: 3,
  repeat: 20,
  teacherMax: 30,
  lateStart: 2,
});

const HARD = 1000;

// ---------------------------------------------------------------- parsing

const DAY_WORDS = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4,
  sat: 5, saturday: 5, sun: 6, sunday: 6,
};

function clean(s) {
  return s.replace(/\s+/g, " ").trim();
}

function parseSlots(text, days, periods, where, errors) {
  // "Mon 1, Fri 5-6, Wed" -> [[day, period], ...] (0-based)
  const out = [];
  for (const raw of text.split(",")) {
    const part = clean(raw);
    if (!part) continue;
    const m = part.match(/^([A-Za-z][A-Za-z.]*)\s*(?:(\d+)\s*(?:-|–|to)?\s*(\d+)?)?$/);
    if (!m) {
      errors.push(`${where}: could not read "${part}" (write e.g. "Mon 1", "Fri 5-6" or "Wed")`);
      continue;
    }
    const d = dayIndex(m[1], days);
    if (d < 0) {
      errors.push(`${where}: "${m[1]}" is not one of the days (${days.join(", ")})`);
      continue;
    }
    let a = 1;
    let b = periods;
    if (m[2]) {
      a = Number(m[2]);
      b = m[3] ? Number(m[3]) : a;
    }
    if (a < 1 || b > periods || a > b) {
      errors.push(`${where}: periods ${a}-${b} are outside 1-${periods}`);
      continue;
    }
    for (let p = a; p <= b; p++) out.push([d, p - 1]);
  }
  return out;
}

function dayIndex(word, days) {
  const w = word.toLowerCase().replace(/\.$/, "");
  const exact = days.findIndex((d) => d.toLowerCase() === w);
  if (exact >= 0) return exact;
  const prefix = days.findIndex((d) => d.toLowerCase().startsWith(w) && w.length >= 2);
  if (prefix >= 0) return prefix;
  if (w in DAY_WORDS) {
    const target = DAY_WORDS[w];
    return days.findIndex((d) => DAY_WORDS[d.toLowerCase()] === target);
  }
  return -1;
}

/**
 * Parse the plain-text school description.
 * Returns { problem, errors, warnings }. `problem` is null when errors exist.
 */
export function parseSchool(text) {
  const errors = [];
  const warnings = [];
  let days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  let periods = 6;
  let breaksAfter = [];
  const rooms = [];
  const teacherLines = [];
  const classLines = [];
  const lessonLines = [];
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((line, i) => {
    const n = i + 1;
    const body = clean(line.replace(/#.*$/, ""));
    if (!body) return;
    let m;
    if ((m = body.match(/^days\s*:\s*(.+)$/i))) {
      days = m[1].split(/[,\s]+/).filter(Boolean);
      if (days.length < 1 || days.length > 7) errors.push(`line ${n}: give 1 to 7 days`);
    } else if ((m = body.match(/^periods\s*:\s*(\d+)$/i))) {
      periods = Number(m[1]);
      if (periods < 1 || periods > 16) errors.push(`line ${n}: periods must be 1 to 16`);
    } else if ((m = body.match(/^breaks?\s*(?:after)?\s*:\s*(.+)$/i))) {
      // period numbers (at most 16), never thousands
      breaksAfter = m[1].trim().split(/\s*[,;]\s*|\s+/).filter(Boolean).map(Number);
      if (breaksAfter.some((x) => !Number.isInteger(x) || x < 1)) {
        errors.push(`line ${n}: breaks are period numbers, e.g. "breaks after: 2, 4"`);
        breaksAfter = [];
      }
    } else if ((m = body.match(/^rooms?\s*:\s*(.+)$/i))) {
      for (const r of m[1].split(",")) {
        const rm = clean(r).match(/^(.+?)\s*(?:\(([^)]+)\))?$/);
        if (!rm || !rm[1]) continue;
        rooms.push({ name: clean(rm[1]), type: rm[2] ? clean(rm[2]).toLowerCase() : "", line: n });
      }
    } else if ((m = body.match(/^teacher\s+([^:]+):\s*(.*)$/i))) {
      teacherLines.push({ name: clean(m[1]), rest: m[2], n });
    } else if ((m = body.match(/^class\s+([^:]+):\s*(.*)$/i))) {
      classLines.push({ name: clean(m[1]), rest: m[2], n });
    } else if ((m = body.match(/^([^:]+):\s*(.+)$/))) {
      lessonLines.push({ classes: m[1], rest: m[2], n });
    } else {
      errors.push(`line ${n}: could not read "${body}"`);
    }
  });

  const classes = [];
  const classIx = new Map();
  const teachers = [];
  const teacherIx = new Map();
  const getClass = (name) => {
    const key = name.toLowerCase();
    if (!classIx.has(key)) {
      classIx.set(key, classes.length);
      classes.push({ name, off: [] });
    }
    return classIx.get(key);
  };
  const getTeacher = (name) => {
    const key = name.toLowerCase();
    if (!teacherIx.has(key)) {
      teacherIx.set(key, teachers.length);
      teachers.push({ name, off: [], maxPerDay: 0 });
    }
    return teacherIx.get(key);
  };

  const roomTypes = new Set(rooms.map((r) => r.type).filter(Boolean));
  const roomByName = new Map(rooms.map((r, i) => [r.name.toLowerCase(), i]));
  if (roomByName.size !== rooms.length) errors.push("two rooms share a name");

  const lessons = [];
  for (const L of lessonLines) {
    const where = `line ${L.n}`;
    const names = L.classes.split(/[+&]/).map(clean).filter(Boolean);
    if (!names.length) {
      errors.push(`${where}: no class before ":"`);
      continue;
    }
    const parts = L.rest.split("/").map(clean);
    if (parts.length < 3) {
      errors.push(`${where}: write "Class: Subject / Teacher / periods per week", e.g. "7A: Maths / Smith / 5"`);
      continue;
    }
    const [subject, teacherNames, countText, ...opts] = parts;
    const perWeek = Number(countText);
    if (!subject) errors.push(`${where}: missing subject`);
    if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > 60) {
      errors.push(`${where}: "${countText}" is not a number of periods per week`);
      continue;
    }
    const tnames = teacherNames.split(/[+&]/).map(clean).filter(Boolean);
    if (!tnames.length) {
      errors.push(`${where}: missing teacher`);
      continue;
    }
    let doubles = 0;
    let roomType = "";
    let room = -1;
    for (const o of opts) {
      if (!o) continue;
      let om;
      if ((om = o.match(/^(?:(\d+)\s*)?doubles?$/i))) {
        doubles = om[1] ? Number(om[1]) : Math.floor(perWeek / 2);
        if (!om[1] && perWeek % 2) warnings.push(`${where}: ${perWeek} periods as doubles leaves one single period`);
      } else if ((om = o.match(/^room\s+(.+)$/i)) && roomByName.has(om[1].toLowerCase())) {
        room = roomByName.get(om[1].toLowerCase());
      } else if (roomTypes.has(o.toLowerCase())) {
        // a type wins over a room of the same name ("gym" = any gym room);
        // write "room Gym" to pin the one room
        roomType = o.toLowerCase();
      } else if (roomByName.has(o.toLowerCase())) {
        room = roomByName.get(o.toLowerCase());
      } else {
        errors.push(`${where}: "${o}" is not "double", "N doubles", a room name or a room type from the rooms line`);
      }
    }
    if (doubles * 2 > perWeek) {
      errors.push(`${where}: ${doubles} doubles need ${doubles * 2} periods but the lesson has ${perWeek}`);
      continue;
    }
    lessons.push({
      classes: names.map(getClass),
      subject: subject || "?",
      teachers: tnames.map(getTeacher),
      perWeek,
      doubles,
      roomType,
      room,
      line: L.n,
    });
  }

  for (const T of teacherLines) {
    const t = teacherIx.get(T.name.toLowerCase());
    if (t === undefined) {
      warnings.push(`line ${T.n}: teacher "${T.name}" has no lessons`);
      continue;
    }
    applyRules(T.rest, teachers[t], `line ${T.n}`, true);
  }
  for (const C of classLines) {
    const c = classIx.get(C.name.toLowerCase());
    if (c === undefined) {
      warnings.push(`line ${C.n}: class "${C.name}" has no lessons`);
      continue;
    }
    applyRules(C.rest, classes[c], `line ${C.n}`, false);
  }

  function applyRules(rest, who, where, isTeacher) {
    for (const rule of rest.split(";").map(clean).filter(Boolean)) {
      let m;
      if ((m = rule.match(/^(?:off|unavailable|not)\s*:?\s*(.+)$/i))) {
        who.off.push(...parseSlots(m[1], days, periods, where, errors));
      } else if (isTeacher && (m = rule.match(/^max\s+(\d+)(?:\s*(?:periods?|lessons?))?\s*(?:a|per)\s*day$/i))) {
        who.maxPerDay = Number(m[1]);
      } else {
        errors.push(`${where}: could not read "${rule}" (write "off Mon 1, Fri 5-6"${isTeacher ? ' or "max 5 per day"' : ""})`);
      }
    }
  }

  for (const b of breaksAfter) {
    if (b >= periods) warnings.push(`break after period ${b} is at or past the end of the day`);
  }
  if (!lessons.length && !errors.length) errors.push("no lessons: add lines like \"7A: Maths / Smith / 5\"");
  for (const L of lessons) {
    if (L.roomType && !rooms.some((r) => r.type === L.roomType)) {
      errors.push(`line ${L.line}: no room of type "${L.roomType}"`);
    }
  }

  if (errors.length) return { problem: null, errors, warnings };
  return {
    problem: {
      days,
      periods,
      breaksAfter: breaksAfter.filter((b) => b < periods),
      classes,
      teachers,
      rooms: rooms.map(({ name, type }) => ({ name, type })),
      lessons,
    },
    errors,
    warnings,
  };
}

// ------------------------------------------------------------ model setup

/** Expand lessons into schedulable units (one per single or double period). */
export function expandUnits(problem) {
  const units = [];
  const subjectIx = new Map();
  problem.lessons.forEach((L, li) => {
    const key = L.subject.toLowerCase();
    if (!subjectIx.has(key)) subjectIx.set(key, subjectIx.size);
    const subj = subjectIx.get(key);
    const singles = L.perWeek - 2 * L.doubles;
    const lens = [...Array(L.doubles).fill(2), ...Array(singles).fill(1)];
    lens.forEach((len, k) => {
      units.push({
        id: units.length,
        lesson: li,
        part: k,
        len,
        classes: L.classes,
        teachers: L.teachers,
        subject: L.subject,
        subj,
        roomType: L.roomType,
        room: L.room,
        needsRoom: L.room >= 0 || Boolean(L.roomType),
      });
    });
  });
  return { units, subjectCount: subjectIx.size };
}

function candidateRooms(problem, u) {
  if (u.room >= 0) return [u.room];
  if (!u.roomType) return [];
  const out = [];
  problem.rooms.forEach((r, i) => {
    if (r.type === u.roomType) out.push(i);
  });
  return out;
}

/** Start periods a unit of this length may use within one day. */
function validStarts(problem, len) {
  const out = [];
  const breaks = new Set(problem.breaksAfter || []);
  for (let p = 0; p + len <= problem.periods; p++) {
    let ok = true;
    for (let k = 0; k < len - 1; k++) if (breaks.has(p + k + 1)) ok = false; // break after period p+k+1 (1-based)
    if (ok) out.push(p);
  }
  return out;
}

// --------------------------------------------------------------- checks

/**
 * Quick counting checks that prove a timetable cannot fit, before solving.
 * Each finding names who is over and by how much.
 */
export function feasibility(problem) {
  const { days, periods } = problem;
  const S = days.length * periods;
  const issues = [];
  const classLoad = problem.classes.map(() => 0);
  const teacherLoad = problem.teachers.map(() => 0);
  const typeLoad = new Map();
  const roomLoad = problem.rooms.map(() => 0);
  for (const L of problem.lessons) {
    for (const c of L.classes) classLoad[c] += L.perWeek;
    for (const t of L.teachers) teacherLoad[t] += L.perWeek;
    if (L.room >= 0) roomLoad[L.room] += L.perWeek;
    else if (L.roomType) typeLoad.set(L.roomType, (typeLoad.get(L.roomType) || 0) + L.perWeek);
  }
  const offCount = (who) => new Set(who.off.map(([d, p]) => d * periods + p)).size;
  problem.classes.forEach((c, i) => {
    const free = S - offCount(c);
    if (classLoad[i] > free) issues.push({ kind: "class", name: c.name, need: classLoad[i], have: free, text: `${c.name} has ${classLoad[i]} periods of lessons but only ${free} periods in the week it can be taught` });
  });
  problem.teachers.forEach((t, i) => {
    const free = S - offCount(t);
    let have = free;
    if (t.maxPerDay) {
      // per day cap
      let capped = 0;
      for (let d = 0; d < days.length; d++) {
        let dayFree = 0;
        for (let p = 0; p < periods; p++) if (!t.off.some(([a, b]) => a === d && b === p)) dayFree++;
        capped += Math.min(dayFree, t.maxPerDay);
      }
      have = capped;
    }
    if (teacherLoad[i] > have) issues.push({ kind: "teacher", name: t.name, need: teacherLoad[i], have, text: `${t.name} teaches ${teacherLoad[i]} periods but can only teach ${have} (periods off${t.maxPerDay ? " and the daily maximum" : ""} included)` });
  });
  for (const [type, need] of typeLoad) {
    const rs = problem.rooms.map((r, i) => (r.type === type ? i : -1)).filter((i) => i >= 0);
    const have = rs.length * S - rs.reduce((a, i) => a + roomLoad[i], 0);
    if (need > have) issues.push({ kind: "room", name: type, need, have, text: `lessons needing a ${type} room take ${need} periods but the ${rs.length} ${type} room(s) have ${have} free` });
  }
  problem.rooms.forEach((r, i) => {
    if (roomLoad[i] > S) issues.push({ kind: "room", name: r.name, need: roomLoad[i], have: S, text: `${r.name} is booked for ${roomLoad[i]} periods but the week has ${S}` });
  });
  // doubles need a day with two adjacent free periods: if no valid start, impossible
  if (problem.lessons.some((L) => L.doubles > 0) && validStarts(problem, 2).length === 0) {
    issues.push({ kind: "grid", name: "doubles", need: 1, have: 0, text: "double lessons cannot fit: no two adjacent periods without a break between them" });
  }
  // Soft notes: a lesson with more units than days its teacher(s) and
  // class(es) are all available must repeat a subject on some day.
  for (const L of problem.lessons) {
    const units = L.perWeek - L.doubles;
    let open = 0;
    for (let d = 0; d < days.length; d++) {
      const dayFree = (who) => who.off.filter(([a]) => a === d).length < periods;
      if (L.teachers.every((t) => dayFree(problem.teachers[t])) && L.classes.every((c) => dayFree(problem.classes[c]))) open++;
    }
    if (units > open) {
      const cls = L.classes.map((c) => problem.classes[c].name).join("+");
      issues.push({ kind: "repeat", soft: true, name: `${cls} ${L.subject}`, need: units, have: open, text: `${cls} ${L.subject} has ${units} lessons but only ${open} days when everyone is in, so it must appear twice on at least one day` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------- solver

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * State: start slot and room per unit, with occupancy counters so moves are
 * scored incrementally.
 */
class State {
  constructor(problem, units, subjectCount, weights) {
    this.p = problem;
    this.units = units;
    this.w = weights;
    this.D = problem.days.length;
    this.P = problem.periods;
    this.S = this.D * this.P;
    this.C = problem.classes.length;
    this.T = problem.teachers.length;
    this.R = problem.rooms.length;
    this.NS = subjectCount;
    this.start = new Int32Array(units.length).fill(-1);
    this.room = new Int32Array(units.length).fill(-1);
    this.classOcc = new Int16Array(this.C * this.S);
    this.teacherOcc = new Int16Array(this.T * this.S);
    this.roomOcc = new Int16Array(Math.max(1, this.R * this.S));
    this.subjDay = new Int16Array(this.C * this.D * Math.max(1, this.NS));
    this.classOff = new Uint8Array(this.C * this.S);
    this.teacherOff = new Uint8Array(this.T * this.S);
    problem.classes.forEach((c, i) => c.off.forEach(([d, p]) => (this.classOff[i * this.S + d * this.P + p] = 1)));
    problem.teachers.forEach((t, i) => t.off.forEach(([d, p]) => (this.teacherOff[i * this.S + d * this.P + p] = 1)));
    this.hard = 0; // overlaps + off-period hits, in periods
    this.unplacedPeriods = units.reduce((a, u) => a + u.len, 0);
    this.rooms = units.map((u) => candidateRooms(problem, u));
    this.starts = [null, validStarts(problem, 1), validStarts(problem, 2)];
    this.classUnits = problem.classes.map(() => []);
    this.teacherUnits = problem.teachers.map(() => []);
    units.forEach((u) => {
      u.classes.forEach((c) => this.classUnits[c].push(u.id));
      u.teachers.forEach((t) => this.teacherUnits[t].push(u.id));
    });
  }

  startsFor(len) {
    if (!this.starts[len]) this.starts[len] = validStarts(this.p, len);
    return this.starts[len];
  }

  // add (+1) or remove (-1) unit u at slot s / room r, maintaining hard count
  touch(u, s, r, sign) {
    const U = this.units[u];
    const S = this.S;
    for (let k = 0; k < U.len; k++) {
      const slot = s + k;
      for (const c of U.classes) {
        const i = c * S + slot;
        if (sign > 0) {
          if (this.classOcc[i] > 0) this.hard++;
          if (this.classOff[i]) this.hard++;
          this.classOcc[i]++;
        } else {
          this.classOcc[i]--;
          if (this.classOcc[i] > 0) this.hard--;
          if (this.classOff[i]) this.hard--;
        }
      }
      for (const t of U.teachers) {
        const i = t * S + slot;
        if (sign > 0) {
          if (this.teacherOcc[i] > 0) this.hard++;
          if (this.teacherOff[i]) this.hard++;
          this.teacherOcc[i]++;
        } else {
          this.teacherOcc[i]--;
          if (this.teacherOcc[i] > 0) this.hard--;
          if (this.teacherOff[i]) this.hard--;
        }
      }
      if (r >= 0) {
        const i = r * S + slot;
        if (sign > 0) {
          if (this.roomOcc[i] > 0) this.hard++;
          this.roomOcc[i]++;
        } else {
          this.roomOcc[i]--;
          if (this.roomOcc[i] > 0) this.hard--;
        }
      }
    }
    const d = Math.floor(s / this.P);
    for (const c of U.classes) this.subjDay[(c * this.D + d) * this.NS + U.subj] += sign;
    this.unplacedPeriods -= sign * U.len;
  }

  place(u, s, r) {
    this.start[u] = s;
    this.room[u] = r;
    this.touch(u, s, r, +1);
  }

  unplace(u) {
    const s = this.start[u];
    if (s < 0) return;
    this.touch(u, s, this.room[u], -1);
    this.start[u] = -1;
    this.room[u] = -1;
  }

  classDayCost(c, d) {
    const w = this.w;
    const base = c * this.S + d * this.P;
    let first = -1;
    let last = -1;
    let busy = 0;
    for (let p = 0; p < this.P; p++) {
      if (this.classOcc[base + p] > 0) {
        if (first < 0) first = p;
        last = p;
        busy++;
      }
    }
    let cost = 0;
    if (first >= 0) {
      cost += w.classGap * (last - first + 1 - busy);
      // late start: leading empty periods that are not marked off
      let lead = 0;
      for (let p = 0; p < first; p++) if (!this.classOff[base + p]) lead++;
      cost += w.lateStart * lead;
    }
    const sb = (c * this.D + d) * this.NS;
    for (let k = 0; k < this.NS; k++) {
      const n = this.subjDay[sb + k];
      if (n > 1) cost += w.repeat * (n - 1);
    }
    return cost;
  }

  teacherDayCost(t, d) {
    const w = this.w;
    const base = t * this.S + d * this.P;
    let first = -1;
    let last = -1;
    let busy = 0;
    for (let p = 0; p < this.P; p++) {
      if (this.teacherOcc[base + p] > 0) {
        if (first < 0) first = p;
        last = p;
        busy++;
      }
    }
    let cost = 0;
    if (first >= 0) cost += w.teacherGap * (last - first + 1 - busy);
    const max = this.p.teachers[t].maxPerDay;
    if (max && busy > max) cost += w.teacherMax * (busy - max);
    return cost;
  }

  soft() {
    let s = 0;
    for (let c = 0; c < this.C; c++) for (let d = 0; d < this.D; d++) s += this.classDayCost(c, d);
    for (let t = 0; t < this.T; t++) for (let d = 0; d < this.D; d++) s += this.teacherDayCost(t, d);
    return s;
  }

  // the subjDay repeat term double counts a double lesson only once by
  // construction (a unit adds one per day), so a double is "one lesson".

  localSoft(us, days) {
    // soft cost of the classes/teachers of units `us` on day set `days`
    let s = 0;
    const seenC = new Set();
    const seenT = new Set();
    for (const u of us) {
      for (const c of this.units[u].classes) seenC.add(c);
      for (const t of this.units[u].teachers) seenT.add(t);
    }
    for (const d of days) {
      for (const c of seenC) s += this.classDayCost(c, d);
      for (const t of seenT) s += this.teacherDayCost(t, d);
    }
    return s;
  }

  total() {
    return HARD * (this.hard + this.unplacedPeriods) + this.soft();
  }

  bestRoom(u, s, rand) {
    const cands = this.rooms[u];
    if (!cands.length) return -1;
    const U = this.units[u];
    let best = -1;
    let bestClash = Infinity;
    let ties = 0;
    for (const r of cands) {
      let clash = 0;
      for (let k = 0; k < U.len; k++) clash += this.roomOcc[r * this.S + s + k];
      if (clash < bestClash) {
        bestClash = clash;
        best = r;
        ties = 1;
      } else if (clash === bestClash && rand) {
        ties++;
        if (rand() * ties < 1) best = r;
      }
    }
    return best;
  }
}

function dayOf(st, s) {
  return Math.floor(s / st.P);
}

function moveDelta(st, u, s, r) {
  // cost change of moving unit u to slot s, room r (s = -1 unplaces)
  const old = st.start[u];
  const oldR = st.room[u];
  const days = new Set();
  if (old >= 0) days.add(dayOf(st, old));
  if (s >= 0) days.add(dayOf(st, s));
  const before = HARD * (st.hard + st.unplacedPeriods) + st.localSoft([u], days);
  st.unplace(u);
  if (s >= 0) st.place(u, s, r);
  const after = HARD * (st.hard + st.unplacedPeriods) + st.localSoft([u], days);
  // restore
  st.unplace(u);
  if (old >= 0) st.place(u, old, oldR);
  return after - before;
}

function construct(st, rand) {
  const order = st.units.map((u) => u.id);
  const load = (ids) => ids.reduce((a, i) => a + st.units[i].len, 0);
  const tLoad = st.teacherUnits.map(load);
  const difficulty = (u) => {
    const U = st.units[u];
    let off = 0;
    for (const t of U.teachers) for (let s = 0; s < st.S; s++) off += st.teacherOff[t * st.S + s];
    return U.len * 100 + (U.needsRoom ? 50 : 0) + U.classes.length * 40 + U.teachers.reduce((a, t) => a + tLoad[t], 0) + off;
  };
  const diff = new Map(order.map((u) => [u, difficulty(u) + rand()]));
  order.sort((a, b) => diff.get(b) - diff.get(a));
  for (const u of order) {
    const U = st.units[u];
    let best = null;
    let bestDelta = Infinity;
    for (let d = 0; d < st.D; d++) {
      for (const p of st.startsFor(U.len)) {
        const s = d * st.P + p;
        const r = st.bestRoom(u, s, rand);
        const delta = moveDelta(st, u, s, r) + rand() * 0.5;
        if (delta < bestDelta) {
          bestDelta = delta;
          best = [s, r];
        }
      }
    }
    if (best) st.place(u, best[0], best[1]);
  }
}

function conflictedUnits(st) {
  const out = [];
  for (const U of st.units) {
    const s = st.start[U.id];
    if (s < 0) {
      out.push(U.id);
      continue;
    }
    let bad = false;
    for (let k = 0; k < U.len && !bad; k++) {
      for (const c of U.classes) {
        const i = c * st.S + s + k;
        if (st.classOcc[i] > 1 || st.classOff[i]) bad = true;
      }
      for (const t of U.teachers) {
        const i = t * st.S + s + k;
        if (st.teacherOcc[i] > 1 || st.teacherOff[i]) bad = true;
      }
      const r = st.room[U.id];
      if (r >= 0 && st.roomOcc[r * st.S + s + k] > 1) bad = true;
    }
    if (bad) out.push(U.id);
  }
  return out;
}

/**
 * Build a timetable.
 * options: seed, iterations (default scales with size), weights,
 *          initial (a previous result's placements to continue from),
 *          onProgress(fraction, bestCost) called about 50 times.
 * Returns { placements: [{unit, start, room}], cost, hard, soft, stats, units }
 */
export function solve(problem, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const rand = mulberry32(options.seed ?? 1);
  const { units, subjectCount } = expandUnits(problem);
  const st = new State(problem, units, subjectCount, weights);
  if (options.initial && options.initial.length === units.length) {
    for (const pl of options.initial) if (pl.start >= 0) st.place(pl.unit, pl.start, pl.room);
    for (const U of units) if (st.start[U.id] < 0) {
      const p0 = st.startsFor(U.len)[0];
      st.place(U.id, p0, st.bestRoom(U.id, p0, rand));
    }
  } else {
    construct(st, rand);
  }
  const n = units.length;
  const iterations = options.iterations ?? Math.max(20000, Math.min(2_000_000, n * 4000));
  let cost = st.total();
  let best = cost;
  let bestStart = Int32Array.from(st.start);
  let bestRoom = Int32Array.from(st.room);
  // temperature: start where a typical soft move is accepted half the time
  let T = options.temperature ?? 20;
  const Tend = 0.05;
  const cool = Math.pow(Tend / T, 1 / Math.max(1, iterations));
  let conflicted = conflictedUnits(st);
  let refresh = 0;
  const progressEvery = Math.max(1, Math.floor(iterations / 50));
  const classUnitsOfLen = (c, len) => st.classUnits[c].filter((v) => st.units[v].len === len);
  for (let it = 0; it < iterations; it++) {
    if (best === 0) break;
    if (++refresh >= 200) {
      refresh = 0;
      if (st.hard + st.unplacedPeriods > 0) conflicted = conflictedUnits(st);
      else conflicted = [];
    }
    let u;
    if (conflicted.length && rand() < 0.6) u = conflicted[Math.floor(rand() * conflicted.length)];
    else u = Math.floor(rand() * n);
    const U = st.units[u];
    const r0 = rand();
    if (r0 < 0.55 || st.start[u] < 0) {
      // move to a random start
      const starts = st.startsFor(U.len);
      const s = Math.floor(rand() * st.D) * st.P + starts[Math.floor(rand() * starts.length)];
      if (s === st.start[u] && st.rooms[u].length < 2) continue;
      const r = rand() < 0.8 ? st.bestRoom(u, s, rand) : (st.rooms[u].length ? st.rooms[u][Math.floor(rand() * st.rooms[u].length)] : -1);
      const delta = moveDelta(st, u, s, r);
      if (delta <= 0 || rand() < Math.exp(-delta / T)) {
        st.unplace(u);
        st.place(u, s, r);
        cost += delta;
      }
    } else {
      // swap start times with another unit of the same class and length
      const c = U.classes[Math.floor(rand() * U.classes.length)];
      const peers = classUnitsOfLen(c, U.len);
      if (peers.length < 2) continue;
      const v = peers[Math.floor(rand() * peers.length)];
      if (v === u || st.start[v] < 0) continue;
      const su = st.start[u];
      const sv = st.start[v];
      if (su === sv) continue;
      const ru = st.room[u];
      const rv = st.room[v];
      const days = new Set([dayOf(st, su), dayOf(st, sv)]);
      const before = HARD * (st.hard + st.unplacedPeriods) + st.localSoft([u, v], days);
      st.unplace(u);
      st.unplace(v);
      const nru = st.rooms[u].length ? st.bestRoom(u, sv, rand) : -1;
      st.place(u, sv, nru);
      const nrv = st.rooms[v].length ? st.bestRoom(v, su, rand) : -1;
      st.place(v, su, nrv);
      const after = HARD * (st.hard + st.unplacedPeriods) + st.localSoft([u, v], days);
      const delta = after - before;
      if (delta <= 0 || rand() < Math.exp(-delta / T)) {
        cost += delta;
      } else {
        st.unplace(u);
        st.unplace(v);
        st.place(u, su, ru);
        st.place(v, sv, rv);
      }
    }
    if (cost < best) {
      best = cost;
      bestStart = Int32Array.from(st.start);
      bestRoom = Int32Array.from(st.room);
    }
    T *= cool;
    if (options.onProgress && it % progressEvery === 0) options.onProgress(it / iterations, best);
  }
  // restore best
  for (const U of units) st.unplace(U.id);
  for (const U of units) if (bestStart[U.id] >= 0) st.place(U.id, bestStart[U.id], bestRoom[U.id]);
  const placements = units.map((U) => ({ unit: U.id, start: st.start[U.id], room: st.room[U.id] }));
  const soft = st.soft();
  return {
    placements,
    units,
    hard: st.hard + st.unplacedPeriods,
    soft,
    cost: HARD * (st.hard + st.unplacedPeriods) + soft,
    iterations,
    stats: softBreakdown(problem, units, placements, weights),
  };
}

// ------------------------------------------------------------- validator

/**
 * Independent re-check of a finished timetable. Shares no state with the
 * solver: it rebuilds occupancy from the placements alone.
 */
export function validate(problem, units, placements, weights = DEFAULT_WEIGHTS) {
  const D = problem.days.length;
  const P = problem.periods;
  const problems = [];
  const key = (kind, i, d, p) => `${kind}${i}@${d},${p}`;
  const occ = new Map();
  const breaks = new Set(problem.breaksAfter || []);
  const name = (U) => `${U.classes.map((c) => problem.classes[c].name).join("+")} ${U.subject}`;
  const offSet = (who) => new Set(who.off.map(([d, p]) => d * P + p));
  const classOff = problem.classes.map(offSet);
  const teacherOff = problem.teachers.map(offSet);
  for (const pl of placements) {
    const U = units[pl.unit];
    if (pl.start < 0) {
      problems.push({ kind: "unplaced", text: `${name(U)} (${U.len === 2 ? "double" : "single"}) is not placed` });
      continue;
    }
    const d = Math.floor(pl.start / P);
    const p = pl.start % P;
    if (p + U.len > P) problems.push({ kind: "overrun", text: `${name(U)} runs past the end of ${problem.days[d]}` });
    for (let k = 0; k < U.len - 1; k++) if (breaks.has(p + k + 1)) problems.push({ kind: "break", text: `${name(U)} double spans the break after period ${p + k + 1} on ${problem.days[d]}` });
    if (U.needsRoom) {
      if (pl.room < 0) problems.push({ kind: "room", text: `${name(U)} has no room` });
      else if (U.room >= 0 && pl.room !== U.room) problems.push({ kind: "room", text: `${name(U)} is not in ${problem.rooms[U.room].name}` });
      else if (U.roomType && problem.rooms[pl.room].type !== U.roomType) problems.push({ kind: "room", text: `${name(U)} is in ${problem.rooms[pl.room].name}, not a ${U.roomType} room` });
    }
    for (let k = 0; k < U.len; k++) {
      const pp = p + k;
      const where = `${problem.days[d]} period ${pp + 1}`;
      for (const c of U.classes) {
        const kk = key("c", c, d, pp);
        if (occ.has(kk)) problems.push({ kind: "class", text: `${problem.classes[c].name} has ${occ.get(kk)} and ${U.subject} at once on ${where}` });
        else occ.set(kk, U.subject);
        if (classOff[c].has(d * P + pp)) problems.push({ kind: "off", text: `${problem.classes[c].name} is off on ${where} but has ${U.subject}` });
      }
      for (const t of U.teachers) {
        const kk = key("t", t, d, pp);
        if (occ.has(kk)) problems.push({ kind: "teacher", text: `${problem.teachers[t].name} has ${occ.get(kk)} and ${name(U)} at once on ${where}` });
        else occ.set(kk, name(U));
        if (teacherOff[t].has(d * P + pp)) problems.push({ kind: "off", text: `${problem.teachers[t].name} is off on ${where} but teaches ${name(U)}` });
      }
      if (pl.room >= 0) {
        const kk = key("r", pl.room, d, pp);
        if (occ.has(kk)) problems.push({ kind: "room", text: `${problem.rooms[pl.room].name} has ${occ.get(kk)} and ${name(U)} at once on ${where}` });
        else occ.set(kk, name(U));
      }
    }
  }
  return { ok: problems.length === 0, problems, stats: softBreakdown(problem, units, placements, weights) };
}

/** Counts behind the soft score, for people rather than the optimiser. */
export function softBreakdown(problem, units, placements, weights = DEFAULT_WEIGHTS) {
  const D = problem.days.length;
  const P = problem.periods;
  const classBusy = problem.classes.map(() => Array.from({ length: D }, () => new Array(P).fill(false)));
  const teacherBusy = problem.teachers.map(() => Array.from({ length: D }, () => new Array(P).fill(false)));
  const subj = new Map();
  for (const pl of placements) {
    if (pl.start < 0) continue;
    const U = units[pl.unit];
    const d = Math.floor(pl.start / P);
    const p = pl.start % P;
    for (let k = 0; k < U.len && p + k < P; k++) {
      for (const c of U.classes) classBusy[c][d][p + k] = true;
      for (const t of U.teachers) teacherBusy[t][d][p + k] = true;
    }
    for (const c of U.classes) {
      const kk = `${c}|${d}|${U.subj}`;
      subj.set(kk, (subj.get(kk) || 0) + 1);
    }
  }
  const gaps = (row) => {
    const first = row.indexOf(true);
    if (first < 0) return 0;
    const last = row.lastIndexOf(true);
    return row.slice(first, last + 1).filter((x) => !x).length;
  };
  let classGaps = 0;
  let teacherGaps = 0;
  let repeats = 0;
  let overMax = 0;
  let lateStarts = 0;
  const classOff = problem.classes.map((c) => new Set(c.off.map(([d, p]) => d * P + p)));
  classBusy.forEach((days, c) => days.forEach((row, d) => {
    classGaps += gaps(row);
    const first = row.indexOf(true);
    if (first > 0) for (let p = 0; p < first; p++) if (!classOff[c].has(d * P + p)) lateStarts++;
  }));
  teacherBusy.forEach((days, t) => days.forEach((row) => {
    teacherGaps += gaps(row);
    const max = problem.teachers[t].maxPerDay;
    const busy = row.filter(Boolean).length;
    if (max && busy > max) overMax += busy - max;
  }));
  for (const n of subj.values()) if (n > 1) repeats += n - 1;
  const w = weights;
  return {
    classGaps,
    teacherGaps,
    repeats,
    overMax,
    lateStarts,
    soft: w.classGap * classGaps + w.teacherGap * teacherGaps + w.repeat * repeats + w.teacherMax * overMax + w.lateStart * lateStarts,
  };
}

// --------------------------------------------------------------- views

/** Grid for one class, teacher or room: rows = periods, cols = days. */
export function grid(problem, units, placements, kind, index) {
  const D = problem.days.length;
  const P = problem.periods;
  const cells = Array.from({ length: P }, () => new Array(D).fill(null).map(() => []));
  for (const pl of placements) {
    if (pl.start < 0) continue;
    const U = units[pl.unit];
    const match =
      (kind === "class" && U.classes.includes(index)) ||
      (kind === "teacher" && U.teachers.includes(index)) ||
      (kind === "room" && pl.room === index);
    if (!match) continue;
    const d = Math.floor(pl.start / P);
    const p = pl.start % P;
    for (let k = 0; k < U.len && p + k < P; k++) {
      cells[p + k][d].push({
        subject: U.subject,
        classes: U.classes.map((c) => problem.classes[c].name).join("+"),
        teachers: U.teachers.map((t) => problem.teachers[t].name).join("+"),
        room: pl.room >= 0 ? problem.rooms[pl.room].name : "",
        double: U.len === 2,
        unit: U.id,
      });
    }
  }
  return cells;
}

function csvCell(v) {
  let s = String(v ?? "");
  // spreadsheet formula-injection guard: a subject or name typed as
  // "=HYPERLINK(...)" must open as text, not run
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per class-period: Class,Day,Period,Subject,Teacher,Room. */
export function toCsv(problem, units, placements) {
  const rows = [["Class", "Day", "Period", "Subject", "Teacher", "Room"]];
  const P = problem.periods;
  const list = [];
  for (const pl of placements) {
    if (pl.start < 0) continue;
    const U = units[pl.unit];
    const d = Math.floor(pl.start / P);
    const p = pl.start % P;
    for (let k = 0; k < U.len; k++) {
      for (const c of U.classes) {
        list.push([c, d, p + k, U.subject, U.teachers.map((t) => problem.teachers[t].name).join("+"), pl.room >= 0 ? problem.rooms[pl.room].name : ""]);
      }
    }
  }
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [c, d, p, subject, teacher, room] of list) rows.push([problem.classes[c].name, problem.days[d], p + 1, subject, teacher, room]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
