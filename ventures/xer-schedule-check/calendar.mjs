// P6 work calendars and working-time arithmetic.
//
// CALENDAR.clndr_data is P6's nested record format, for example
//   (0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|16:00)())))...))
//    (0||Exceptions()((0||0(d|41519)())(0||1(d|41520)((0||0(s|08:00|f|12:00)()))))))
// Days of week run 1 = Sunday to 7 = Saturday; an exception day is a serial
// day number counted from 1899-12-30 (the spreadsheet epoch), with no work
// periods for a holiday or its own periods for a changed day.
//
// Times are minutes since 1970-01-01 00:00 read as wall-clock time (xer.mjs
// parseDate), so a day is exactly 1440 minutes and there is no daylight saving.

const DAY = 1440;
const SERIAL_EPOCH_DAY = Date.UTC(1899, 11, 30) / 86400000; // in days since 1970

// Tokenise "(0||key(params)(children))" into a tree of { key, params, children }.
export function parseClndrData(s) {
  // P6 writes line breaks inside a field as 0x7F; some exports quote the field.
  let i = 0;
  const n = s.length;
  const skipWs = () => { while (i < n && /[\s\x7f"]/.test(s[i])) i++; };
  function node() {
    skipWs();
    if (s[i] !== "(") throw new Error(`calendar data: '(' expected at ${i}`);
    i++;
    // "0||"
    const bar = s.indexOf("||", i);
    if (bar < 0) throw new Error(`calendar data: '||' expected at ${i}`);
    i = bar + 2;
    const open = s.indexOf("(", i);
    const key = s.slice(i, open).trim();
    i = open + 1;
    const close = s.indexOf(")", i);
    const params = s.slice(i, close);
    i = close + 1;
    skipWs();
    const children = [];
    if (s[i] !== "(") throw new Error(`calendar data: children expected at ${i}`);
    i++;
    skipWs();
    while (s[i] === "(") {
      children.push(node());
      skipWs();
    }
    if (s[i] !== ")") throw new Error(`calendar data: ')' expected at ${i}`);
    i++;
    skipWs();
    if (s[i] !== ")") throw new Error(`calendar data: ')' expected at ${i}`);
    i++;
    return { key, params, children };
  }
  return node();
}

function hm(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  // 00:00 to 24:00 only: a time past the day's end (25:00, 17:60) would put
  // working periods into the next day and silently shift every date
  const v = m ? +m[1] * 60 + +m[2] : NaN;
  if (!m || +m[2] > 59 || v > 24 * 60) throw new Error(`calendar data: bad time '${t}'`);
  return v;
}

function periodOf(params) {
  const p = params.split("|");
  let s = null, f = null;
  for (let k = 0; k + 1 < p.length; k += 2) {
    if (p[k] === "s") s = hm(p[k + 1]);
    else if (p[k] === "f") f = hm(p[k + 1]);
  }
  if (s === null || f === null) return null;
  if (f <= s) f += DAY; // "f|00:00" ends at midnight
  return [s, Math.min(f, DAY)];
}

function periods(children) {
  const out = [];
  for (const c of children) {
    const p = periodOf(c.params);
    if (p && p[1] > p[0]) out.push(p);
  }
  out.sort((a, b) => a[0] - b[0]);
  // merge touching or overlapping periods
  const merged = [];
  for (const p of out) {
    const last = merged[merged.length - 1];
    if (last && p[0] <= last[1]) last[1] = Math.max(last[1], p[1]);
    else merged.push([p[0], p[1]]);
  }
  return merged;
}

const findChild = (node, key) => node.children.find((c) => c.key === key);

export class Calendar {
  // week[0..6] = periods for Sunday..Saturday; exceptions: Map(dayNumber -> periods)
  constructor({ id = null, name = "", week, exceptions = new Map(), hoursPerDay = null }) {
    this.id = id;
    this.name = name;
    this.week = week;
    this.exceptions = exceptions;
    this.hoursPerDay = hoursPerDay;
    this.weekMinutes = week.reduce((a, d) => a + d.reduce((b, p) => b + p[1] - p[0], 0), 0);
  }

  static fromXer(row) {
    const tree = parseClndrData(row.clndr_data || "");
    const dow = findChild(tree, "DaysOfWeek");
    const week = [[], [], [], [], [], [], []];
    if (dow) for (const d of dow.children) {
      const k = Number(d.key);
      if (k >= 1 && k <= 7) week[k - 1] = periods(d.children);
    }
    const exceptions = new Map();
    const exc = findChild(tree, "Exceptions");
    if (exc) for (const e of exc.children) {
      const m = /d\|(\d+)/.exec(e.params);
      if (!m) continue;
      exceptions.set(Number(m[1]) + SERIAL_EPOCH_DAY, periods(e.children));
    }
    const hpd = row.day_hr_cnt === "" || row.day_hr_cnt === undefined ? null : Number(row.day_hr_cnt);
    return new Calendar({ id: row.clndr_id, name: row.clndr_name || "", week, exceptions, hoursPerDay: hpd });
  }

  // Monday to Friday (or the first `days` days from Monday: 6 adds
  // Saturday, 7 is every day), `hours` a day from 08:00 with an hour's break
  // at 12:00 once the day runs past noon (P6's own default pattern for 8 h)
  static weekdays(hours = 8, id = "weekdays", name = "", days = 5) {
    const m = Math.round(hours * 60);
    const start = 8 * 60;
    let d;
    if (start + m <= 12 * 60) d = [[start, start + m]];
    else if (13 * 60 + (m - 240) <= DAY) d = [[start, 12 * 60], [13 * 60, 13 * 60 + (m - 240)]];
    else d = [[Math.max(0, DAY - m), DAY]];
    const week = [days >= 7 ? d : [], d, d, d, d, d, days >= 6 ? d : []];
    return new Calendar({ id, name, week, hoursPerDay: hours });
  }

  static allDay() {
    const d = [[0, DAY]];
    return new Calendar({ id: "24h", name: "24 hour", week: [d, d, d, d, d, d, d], hoursPerDay: 24 });
  }

  // periods of one day, as [start, end] minutes within the day
  day(dayNumber) {
    const ex = this.exceptions.get(dayNumber);
    if (ex) return ex;
    // 1970-01-01 was a Thursday (index 4)
    return this.week[(((dayNumber + 4) % 7) + 7) % 7];
  }

  get works() {
    return this.weekMinutes > 0 || [...this.exceptions.values()].some((p) => p.length);
  }

  // Move forward from t through `minutes` of working time. 0 returns t.
  addWork(t, minutes) {
    if (minutes < 0) return this.subWork(t, -minutes);
    if (minutes === 0) return t;
    if (!this.works) throw new Error(`calendar ${this.id} has no working time`);
    let rem = minutes;
    let d = Math.floor(t / DAY);
    for (let guard = 0; guard < 400000; guard++, d++) {
      const base = d * DAY;
      for (const [a, b] of this.day(d)) {
        const end = base + b;
        if (end <= t) continue;
        const s = Math.max(base + a, t);
        const avail = end - s;
        if (avail >= rem) return s + rem;
        rem -= avail;
      }
    }
    throw new Error("addWork: ran past 1,000 years");
  }

  // Move backward from t through `minutes` of working time.
  subWork(t, minutes) {
    if (minutes < 0) return this.addWork(t, -minutes);
    if (minutes === 0) return t;
    if (!this.works) throw new Error(`calendar ${this.id} has no working time`);
    let rem = minutes;
    let d = Math.floor((t - 1) / DAY);
    for (let guard = 0; guard < 400000; guard++, d--) {
      const base = d * DAY;
      const ps = this.day(d);
      for (let k = ps.length - 1; k >= 0; k--) {
        const [a, b] = ps[k];
        const start = base + a;
        if (start >= t) continue;
        const e = Math.min(base + b, t);
        const avail = e - start;
        if (avail >= rem) return e - rem;
        rem -= avail;
      }
    }
    throw new Error("subWork: ran past 1,000 years");
  }

  // Earliest working instant at or after t from which work can proceed
  // (the end of a period snaps to the next period's start).
  nextStart(t) {
    if (!this.works || !Number.isFinite(t)) return t; // no instant to snap
    let d = Math.floor(t / DAY);
    for (let guard = 0; guard < 400000; guard++, d++) {
      const base = d * DAY;
      for (const [a, b] of this.day(d)) {
        if (base + b <= t) continue;
        return Math.max(base + a, t);
      }
    }
    return t;
  }

  // Latest working instant at or before t at which work can end
  // (the start of a period snaps back to the previous period's end).
  prevEnd(t) {
    if (!this.works || !Number.isFinite(t)) return t; // no instant to snap
    let d = Math.floor((t - 1) / DAY);
    for (let guard = 0; guard < 400000; guard++, d--) {
      const base = d * DAY;
      const ps = this.day(d);
      for (let k = ps.length - 1; k >= 0; k--) {
        const [a, b] = ps[k];
        if (base + a >= t) continue;
        return Math.min(base + b, t);
      }
    }
    return t;
  }

  // Working minutes from t1 to t2 (negative when t2 < t1).
  workBetween(t1, t2) {
    if (t2 < t1) return -this.workBetween(t2, t1);
    let total = 0;
    const d1 = Math.floor(t1 / DAY);
    const d2 = Math.floor(t2 / DAY);
    for (let d = d1; d <= d2; d++) {
      const base = d * DAY;
      for (const [a, b] of this.day(d)) {
        const s = Math.max(base + a, t1);
        const e = Math.min(base + b, t2);
        if (e > s) total += e - s;
      }
    }
    return total;
  }
}
