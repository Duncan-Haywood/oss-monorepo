// Earnings analysis from a gig-driver trip/delivery CSV (Uber, Lyft, DoorDash,
// Instacart, Grubhub, Gridwise, Everlance, or a hand-kept sheet): any CSV with a
// date, an amount, and ideally miles and minutes. Pure functions, no DOM, no
// network.

const ALIASES = {
  when: ["date", "start time", "start", "pickup time", "request time", "trip date", "date/time", "datetime", "timestamp", "completed at", "date & time", "time", "begin trip time"],
  end: ["end time", "dropoff time", "drop-off time", "end", "dropoff", "end trip time"],
  time: ["clock time", "trip time of day"],
  platform: ["platform", "app", "service", "company", "source", "provider"],
  pay: ["earnings", "fare", "pay", "base pay", "driver pay", "net earnings", "amount", "payout", "your earnings", "trip earnings", "delivery pay"],
  tip: ["tip", "tips", "customer tip", "tip amount", "rider tip"],
  total: ["total", "total earnings", "total pay", "total amount", "total payout"],
  miles: ["distance", "miles", "trip distance", "distance (mi)", "distance (miles)", "mileage", "trip miles", "distance (km)", "km", "kilometers"],
  minutes: ["duration", "minutes", "duration (min)", "duration (minutes)", "time (min)", "trip duration", "trip minutes", "active time"],
  hours: ["hours", "duration (hours)", "duration (hrs)"],
  currency: ["currency"],
};

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// "1,234.56", "$12", "(5.00)", "-5" and blanks (0). NaN only for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Durations: "23" (minutes), "1:05:30", "12:40" (mm:ss when it has two parts and
// the caller says so is ambiguous, so two parts are read as h:mm), "25 min",
// "1h 5m". Returns minutes or NaN. Blank is NaN: an unknown duration is not zero.
export function parseMinutes(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return NaN;
  let m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2] + +m[3] / 60;
  m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
  if (m && (m[1] || m[2])) return (m[1] ? +m[1] * 60 : 0) + (m[2] ? +m[2] : 0);
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// Wall-clock timestamps only: the file's own clock is the driver's clock, so no
// time zone conversion is attempted. Returns { t (UTC ms of the wall clock),
// hasTime } or null. `dmy` is decided once per file (see detectDmy).
export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d, rest = "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, hasTime = false;
  const tm = rest.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (tm) {
    hh = +tm[1]; mm = +tm[2]; hasTime = true;
    const ap = tm[3] ? tm[3][0].toLowerCase() : "";
    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  const t = Date.UTC(y, mo - 1, d, hh, mm);
  return new Date(t).getUTCDate() === d ? { t, hasTime } : null;
}

// Day-first only when unambiguous: some first part above 12, no second above 12.
export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

const KM = 0.621371;

// Returns { trips, skipped, currency, columns, dmy, unit, hasMinutes, hasMiles,
// error }. A trip is one row: { line, platform, t, hasTime, pay, tip, miles,
// minutes } where miles/minutes are null when the file does not say.
export function normalizeRows(table, { decimalComma = false, unit } = {}) {
  const empty = { trips: [], skipped: [], currency: "", columns: {}, dmy: false, unit: "mi", hasMinutes: false, hasMiles: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.when !== undefined && (c.pay !== undefined || c.total !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Date”, “Earnings” (or “Fare” / “Pay” / “Total”), and ideally “Miles” and “Minutes”. Export a trip or delivery history from your driver app, or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const headerNames = table[h].map((x) => x.trim().toLowerCase());
  const kmHeader = cols.miles !== undefined && /\bkm\b|kilomet/.test(headerNames[cols.miles]);
  const useUnit = unit || (kmHeader ? "km" : "mi");
  const factor = useUnit === "km" ? KM : 1;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "when")));
  const trips = [], skipped = [];
  let currency = "";
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    let when = parseWhen(get(line, "when"), dmy);
    if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    if (!when.hasTime && cols.time !== undefined) {
      const t2 = parseWhen("2000-01-01 " + get(line, "time"), false);
      if (t2 && t2.hasTime) when = { t: when.t + (t2.t - Date.UTC(2000, 0, 1)), hasTime: true };
    }
    const payRaw = cols.pay !== undefined ? parseNumber(get(line, "pay"), decimalComma) : NaN;
    const tipRaw = cols.tip !== undefined ? parseNumber(get(line, "tip"), decimalComma) : 0;
    const totalRaw = cols.total !== undefined ? parseNumber(get(line, "total"), decimalComma) : NaN;
    let pay, tip = Number.isNaN(tipRaw) ? 0 : tipRaw;
    if (cols.pay !== undefined && Number.isNaN(payRaw) && Number.isNaN(totalRaw)) { skipped.push({ line: lineNo, reason: "amount not a number" }); continue; }
    if (cols.pay === undefined) { pay = totalRaw - tip; }
    else if (Number.isNaN(payRaw)) { pay = totalRaw - tip; }
    else pay = payRaw;
    if (!Number.isFinite(pay)) { skipped.push({ line: lineNo, reason: "amount not a number" }); continue; }
    let miles = null;
    if (cols.miles !== undefined && get(line, "miles") !== "") {
      const mv = parseNumber(get(line, "miles"), decimalComma);
      if (Number.isFinite(mv) && mv >= 0) miles = mv * factor;
    }
    let minutes = null;
    if (cols.minutes !== undefined && get(line, "minutes") !== "") {
      const mv = parseMinutes(get(line, "minutes"));
      if (Number.isFinite(mv) && mv >= 0) minutes = mv;
    } else if (cols.hours !== undefined && get(line, "hours") !== "") {
      const hv = parseNumber(get(line, "hours"), decimalComma);
      if (Number.isFinite(hv) && hv >= 0) minutes = hv * 60;
    } else if (cols.end !== undefined && when.hasTime) {
      let e = parseWhen(get(line, "end"), dmy);
      if (!e) {
        // Time-only end ("00:10", "6:45 PM") borrows the start's date.
        const day = Math.floor(when.t / 86400000);
        const t2 = parseWhen("2000-01-01 " + get(line, "end"), false);
        if (t2 && t2.hasTime) e = { t: day * 86400000 + (t2.t - Date.UTC(2000, 0, 1)), hasTime: true };
      }
      if (e && e.hasTime) {
        let diff = (e.t - when.t) / 60000;
        if (diff < 0 && !/\d{4}|[/.-]\d{1,2}[/.-]/.test(get(line, "end"))) diff += 1440;
        if (diff >= 0 && diff < 1440) minutes = diff;
      }
    }
    const cur = get(line, "currency");
    if (cur && !currency) currency = cur;
    trips.push({ line: lineNo, platform: get(line, "platform") || "All trips", t: when.t, hasTime: when.hasTime, pay, tip, miles, minutes });
  }
  if (!trips.length) return { ...empty, columns: cols, dmy, unit: useUnit, skipped, error: "No usable rows: every row was skipped." };
  return {
    trips, skipped, currency, columns: cols, dmy, unit: useUnit,
    hasMinutes: trips.some((x) => x.minutes !== null),
    hasMiles: trips.some((x) => x.miles !== null),
  };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYPARTS = [
  { key: "late", label: "Late night (12am-5am)", from: 0, to: 5 },
  { key: "morning", label: "Morning (5am-10am)", from: 5, to: 10 },
  { key: "midday", label: "Midday (10am-2pm)", from: 10, to: 14 },
  { key: "afternoon", label: "Afternoon (2pm-5pm)", from: 14, to: 17 },
  { key: "evening", label: "Evening (5pm-9pm)", from: 17, to: 21 },
  { key: "night", label: "Night (9pm-12am)", from: 21, to: 24 },
];
const daypartOf = (hour) => DAYPARTS.find((d) => hour >= d.from && hour < d.to);
export const MIN_TRIPS = 5;

function blank(key, label) {
  return { key, label: label ?? key, trips: 0, gross: 0, tips: 0, miles: 0, milesTrips: 0, minutes: 0, minutesTrips: 0, cost: 0, net: 0 };
}

function finish(b) {
  const hours = b.minutes / 60;
  return {
    ...b,
    hours,
    grossPerTrip: b.trips ? b.gross / b.trips : 0,
    netPerTrip: b.trips ? b.net / b.trips : 0,
    tipShare: b.gross > 0 ? b.tips / b.gross : 0,
    // Hourly and per-mile figures use only trips that report the field, so a
    // partly blank column cannot pull a rate toward zero.
    grossPerHour: b.minutesTrips && hours > 0 ? b.grossMin / hours : null,
    netPerHour: b.minutesTrips && hours > 0 ? b.netMin / hours : null,
    grossPerMile: b.milesTrips && b.miles > 0 ? b.grossMi / b.miles : null,
    netPerMile: b.milesTrips && b.miles > 0 ? b.netMi / b.miles : null,
  };
}

// opts: { costPerMile, extraMilesPct, onlineHours, floorPerHour, from, to }
// Trip income is pay + tip. Vehicle cost = miles * (1 + extraMilesPct/100) *
// costPerMile, charged to every trip that reports miles. Nothing else is
// subtracted.
export function analyze(trips, opts = {}) {
  const costPerMile = Number(opts.costPerMile) || 0;
  const extra = Math.max(0, Number(opts.extraMilesPct) || 0) / 100;
  const onlineHours = Number(opts.onlineHours) > 0 ? Number(opts.onlineHours) : null;
  const floor = Number(opts.floorPerHour) > 0 ? Number(opts.floorPerHour) : null;
  if (costPerMile < 0 || !Number.isFinite(costPerMile)) return { invalid: "Cost per mile must be zero or more." };
  const list = trips.filter((x) => (opts.from == null || x.t >= opts.from) && (opts.to == null || x.t < opts.to + 86400000));
  if (!list.length) return { invalid: "No trips fall inside that date range." };

  const groups = { platform: new Map(), weekday: new Map(), daypart: new Map(), slot: new Map(), month: new Map() };
  const total = blank("all", "All trips");
  total.grossMin = total.netMin = total.grossMi = total.netMi = 0;
  const rows = [];
  let from = Infinity, to = -Infinity;

  const add = (b, r) => {
    b.trips += 1; b.gross += r.gross; b.tips += r.tip; b.net += r.net; b.cost += r.cost;
    if (r.miles !== null) { b.miles += r.miles; b.milesTrips += 1; b.grossMi += r.gross; b.netMi += r.net; }
    if (r.minutes !== null) { b.minutes += r.minutes; b.minutesTrips += 1; b.grossMin += r.gross; b.netMin += r.net; }
  };
  const bucket = (map, key, label) => {
    if (!map.has(key)) { const b = blank(key, label); b.grossMin = b.netMin = b.grossMi = b.netMi = 0; map.set(key, b); }
    return map.get(key);
  };

  for (const x of list) {
    const gross = x.pay + x.tip;
    const cost = x.miles === null ? 0 : x.miles * (1 + extra) * costPerMile;
    const r = { ...x, gross, cost, net: gross - cost };
    rows.push(r);
    from = Math.min(from, x.t); to = Math.max(to, x.t);
    const d = new Date(x.t);
    add(total, r);
    add(bucket(groups.platform, x.platform), r);
    add(bucket(groups.weekday, d.getUTCDay(), WEEKDAYS[d.getUTCDay()]), r);
    add(bucket(groups.month, d.toISOString().slice(0, 7)), r);
    if (x.hasTime) {
      const dp = daypartOf(d.getUTCHours());
      add(bucket(groups.daypart, dp.key, dp.label), r);
      add(bucket(groups.slot, `${d.getUTCDay()}-${dp.key}`, `${WEEKDAYS[d.getUTCDay()]} ${dp.label.split(" (")[0].toLowerCase()}`), r);
    }
  }

  const fin = (map, sort) => [...map.values()].map(finish).sort(sort);
  const byPlatform = fin(groups.platform, (a, b) => b.net - a.net);
  const byWeekday = fin(groups.weekday, (a, b) => a.key - b.key);
  const byDaypart = fin(groups.daypart, (a, b) => DAYPARTS.findIndex((x) => x.key === a.key) - DAYPARTS.findIndex((x) => x.key === b.key));
  const byMonth = fin(groups.month, (a, b) => (a.key < b.key ? -1 : 1));
  const slots = fin(groups.slot, (a, b) => b.net - a.net);
  const sum = finish(total);
  const days = new Set(rows.map((r) => Math.floor(r.t / 86400000))).size;

  // Online hours are the driver's own number and replace trip minutes for the
  // hourly headline only, because trip minutes leave out waiting time.
  const tripHours = sum.minutesTrips ? sum.hours : null;
  const hourBasis = onlineHours ?? tripHours;
  const summary = {
    ...sum,
    from, to, days,
    costPerMile, extra,
    vehicleShare: sum.gross > 0 ? sum.cost / sum.gross : 0,
    tripHours,
    onlineHours,
    hourBasis,
    hourBasisIsOnline: onlineHours !== null,
    netPerHourHeadline: hourBasis && hourBasis > 0 ? sum.net / hourBasis : null,
    grossPerHourHeadline: hourBasis && hourBasis > 0 ? sum.gross / hourBasis : null,
    losing: rows.filter((r) => r.net < 0).length,
    losingAmount: rows.filter((r) => r.net < 0).reduce((s, r) => s + r.net, 0),
  };
  // A partial hours column makes the headline wrong, so say so instead.
  summary.minutesCoverage = rows.length ? sum.minutesTrips / rows.length : 0;
  summary.milesCoverage = rows.length ? sum.milesTrips / rows.length : 0;

  const worst = rows.filter((r) => r.miles !== null).sort((a, b) => a.net - b.net).slice(0, 10);

  let belowFloor = null;
  if (floor) {
    const timed = rows.filter((r) => r.minutes !== null && r.minutes > 0);
    const low = timed.filter((r) => r.net / (r.minutes / 60) < floor);
    belowFloor = {
      floor, timed: timed.length, count: low.length,
      share: timed.length ? low.length / timed.length : 0,
      net: low.reduce((s, r) => s + r.net, 0),
      minutes: low.reduce((s, r) => s + r.minutes, 0),
    };
  }

  return {
    summary, byPlatform, byWeekday, byDaypart, byMonth, slots, worst, belowFloor,
    findings: findings({ summary, byPlatform, byWeekday, byDaypart, slots, belowFloor, costPerMile }),
  };
}

const usd = (n) => (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);

function findings({ summary: s, byPlatform, byDaypart, slots, belowFloor, costPerMile }) {
  const out = [];
  if (!s.milesTrips) {
    out.push({ severity: "medium", title: "The file has no miles column, so vehicle cost is not counted", detail: "Every figure below is income only. Miles are what turn a busy week into a profitable one: add a Miles column (or use the trip distance your app exports) and this tool subtracts your cost per mile from each trip." });
  } else if (s.milesCoverage < 0.9) {
    out.push({ severity: "medium", title: `Only ${(s.milesCoverage * 100).toFixed(0)}% of trips report miles`, detail: "Trips with no miles are charged no vehicle cost, so net income is overstated by however much those trips really cost. Per-mile rates use only the trips that report miles." });
  }
  if (!s.minutesTrips && !s.onlineHours) {
    out.push({ severity: "medium", title: "No minutes or hours, so hourly pay cannot be computed", detail: "Add a Minutes column (or Start and End times), or enter your total hours online below, to see net per hour: the number that decides whether an app beats other work." });
  } else if (s.minutesTrips && s.minutesCoverage < 0.9 && !s.onlineHours) {
    out.push({ severity: "medium", title: `Only ${(s.minutesCoverage * 100).toFixed(0)}% of trips report a duration`, detail: "Hourly rates use only the trips that report minutes. Enter your total hours online to get an overall hourly figure that includes the gaps." });
  }
  if (s.milesTrips && s.gross > 0) {
    out.push({
      severity: s.vehicleShare >= 0.4 ? "high" : s.vehicleShare >= 0.25 ? "medium" : "info",
      title: `Vehicle cost takes ${(s.vehicleShare * 100).toFixed(0)}% of what the apps paid`,
      detail: `${usd(s.gross)} paid, ${usd(s.cost)} of vehicle cost at ${usd(costPerMile)} per mile${s.extra ? ` (including ${(s.extra * 100).toFixed(0)}% extra unpaid miles)` : ""}, ${usd(s.net)} left. ${s.grossPerMile !== null ? `The apps paid ${usd(s.grossPerMile)} per mile driven with a passenger or order, against ${usd(costPerMile * (1 + s.extra))} it cost you to drive it.` : ""}`,
    });
  }
  if (s.netPerHourHeadline !== null) {
    out.push({
      severity: "info",
      title: `About ${usd(s.netPerHourHeadline)} per hour after vehicle cost (${usd(s.grossPerHourHeadline)} before)`,
      detail: s.hourBasisIsOnline
        ? `Based on the ${s.onlineHours} hours online you entered, which includes waiting time.`
        : `Based on trip minutes only. Waiting between trips is not in the file, so the real hourly figure is lower; enter your hours online to include it.`,
    });
  }
  if (s.losing > 0) {
    out.push({ severity: s.losing / s.trips > 0.1 ? "high" : "medium", title: `${s.losing} trip${s.losing === 1 ? "" : "s"} paid less than they cost to drive`, detail: `Together they lost ${usd(-s.losingAmount)} at ${usd(costPerMile)} per mile. The worst ten are listed below with their miles and pay.` });
  }
  const plat = byPlatform.filter((p) => p.trips >= MIN_TRIPS && p.netPerHour !== null).sort((a, b) => b.netPerHour - a.netPerHour);
  if (plat.length >= 2) {
    const a = plat[0], b = plat[plat.length - 1];
    if (a.netPerHour - b.netPerHour >= 1) out.push({ severity: "info", title: `${a.label} beat ${b.label} by ${usd(a.netPerHour - b.netPerHour)} per trip hour`, detail: `${a.label}: ${usd(a.netPerHour)} net per trip hour over ${a.trips} trips. ${b.label}: ${usd(b.netPerHour)} over ${b.trips}. Trip hours exclude waiting, which differs by app, so treat the gap as a lead to test rather than proof.` });
  }
  const dp = byDaypart.filter((d) => d.trips >= MIN_TRIPS && d.netPerHour !== null).sort((a, b) => b.netPerHour - a.netPerHour);
  if (dp.length >= 2) {
    const a = dp[0], b = dp[dp.length - 1];
    if (a.netPerHour - b.netPerHour >= 1) out.push({ severity: "info", title: `${a.label} paid best; ${b.label} paid least`, detail: `${usd(a.netPerHour)} vs ${usd(b.netPerHour)} net per trip hour (${a.trips} and ${b.trips} trips). Busy hours also have more competing drivers and more waiting that the file cannot see.` });
  }
  const sl = slots.filter((x) => x.trips >= MIN_TRIPS && x.netPerHour !== null).sort((a, b) => b.netPerHour - a.netPerHour);
  if (sl.length >= 4) {
    const best = sl.slice(0, 3).map((x) => `${x.label} (${usd(x.netPerHour)}/hr, ${x.trips} trips)`).join("; ");
    const worstS = sl.slice(-2).map((x) => `${x.label} (${usd(x.netPerHour)}/hr, ${x.trips} trips)`).join("; ");
    out.push({ severity: "info", title: "Best and worst weekday and time slots", detail: `Best: ${best}. Weakest: ${worstS}. Slots with fewer than ${MIN_TRIPS} trips are left out.` });
  }
  if (s.tips > 0 && s.gross > 0 && s.tipShare >= 0.05) {
    out.push({ severity: "info", title: `Tips were ${(s.tipShare * 100).toFixed(0)}% of income`, detail: `${usd(s.tips)} of ${usd(s.gross)}. Tips are included in every figure here; some apps export them in a separate file, in which case check they are in this one.` });
  }
  if (belowFloor && belowFloor.timed) {
    out.push({ severity: belowFloor.share >= 0.3 ? "medium" : "info", title: `${belowFloor.count} of ${belowFloor.timed} timed trips netted under ${usd(belowFloor.floor)} per trip hour`, detail: `That is ${(belowFloor.share * 100).toFixed(0)}% of trips, netting ${usd(belowFloor.net)} over ${(belowFloor.minutes / 60).toFixed(1)} trip hours. Declining such trips would not add their waiting time back, so this is a screening figure, not a forecast.` });
  }
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Deterministic synthetic file for the "Load an example" button: 3 weeks, two
// made-up apps. Not real data.
export function sampleCsv() {
  const lines = ["Date,Platform,Earnings,Tip,Miles,Minutes"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let day = 0; day < 21; day++) {
    const d = new Date(Date.UTC(2026, 8, 1 + day));
    const wd = d.getUTCDay();
    if (wd === 1 && day % 2 === 0) continue;
    const n = wd === 5 || wd === 6 ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const hour = wd === 5 || wd === 6 ? 17 + Math.floor(i * 0.9) : 11 + i * 2;
      const rideshare = rnd() < 0.5;
      const miles = rideshare ? 2 + rnd() * 9 : 1 + rnd() * 6;
      const minutes = Math.round(miles * (rideshare ? 3.2 : 4.5) + 5);
      const pay = rideshare ? 3 + miles * 1.05 + rnd() * 2 : 2.5 + miles * 0.75 + (rnd() < 0.15 ? 0 : 1.5);
      const tip = rideshare ? (rnd() < 0.3 ? 2 : 0) : (rnd() < 0.6 ? 1 + rnd() * 3 : 0);
      const ts = `${d.toISOString().slice(0, 10)} ${String(hour % 24).padStart(2, "0")}:${String(Math.floor(rnd() * 50)).padStart(2, "0")}`;
      lines.push(`${ts},${rideshare ? "Rideshare app" : "Delivery app"},${pay.toFixed(2)},${tip.toFixed(2)},${miles.toFixed(1)},${minutes}`);
    }
  }
  return lines.join("\n") + "\n";
}
