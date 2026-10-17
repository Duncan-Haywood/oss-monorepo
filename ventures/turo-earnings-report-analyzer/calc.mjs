// Per-vehicle and per-trip profit analysis from a Turo host earnings or trip
// history CSV. Column names are matched by alias from memory of Turo exports;
// no real export was available when this was written. Pure functions, no DOM,
// no network.

const ALIASES = {
  id: ["reservation id", "trip id", "reservation", "reservation #", "trip", "id", "booking id"],
  vehicle: ["vehicle", "car", "vehicle name", "car name", "listing", "vehicle listing", "vehicle name / plate", "listing name"],
  year: ["year", "vehicle year", "car year"],
  make: ["make", "vehicle make", "car make"],
  model: ["model", "vehicle model", "car model"],
  plate: ["license plate", "plate", "license plate number", "plate number"],
  start: ["trip start", "start date", "start", "trip start date", "pickup", "pickup date", "start time", "trip start time", "date", "trip date", "begin"],
  end: ["trip end", "end date", "end", "trip end date", "return", "return date", "dropoff", "end time", "trip end time"],
  days: ["trip days", "days", "rental days", "number of days", "duration (days)", "total days", "booked days"],
  status: ["status", "trip status", "reservation status", "state"],
  gross: ["trip price", "price", "trip total", "gross", "gross earnings", "reservation total", "total price", "guest paid", "gross trip price", "gross amount", "total trip price"],
  fee: ["turo fee", "host fee", "turo fees", "platform fee", "service fee", "turo service fee", "fees", "turo commission", "commission"],
  payout: ["earnings", "host earnings", "net earnings", "payout", "total earnings", "your earnings", "host payout", "net payout", "net", "trip earnings", "earnings (usd)", "total payout"],
  cleaning: ["cleaning cost", "cleaning", "cleaning expense", "cleaning fee paid"],
  fuel: ["fuel cost", "fuel", "fuel expense", "charging cost", "gas cost", "gas"],
  delivery: ["delivery cost", "delivery expense", "delivery", "delivery cost paid"],
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

const DAY = 86400000;
const MONTH_DAYS = 30.4375;
export const MIN_TRIPS = 5;
export const FEE_MODES = ["auto", "gross", "net"];

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const carKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Whole rental days from start and end timestamps: Turo prices per 24 hours, so
// 26 hours is two days. A small tolerance stops "10:00 to 10:05" adding a day.
export function daysBetween(startT, endT) {
  const diff = (endT - startT) / DAY;
  if (!(diff > 0)) return 1;
  return Math.max(1, Math.ceil(diff - 0.05));
}

// Returns { trips, skipped, cancelled, currency, columns, dmy, feeSource, error }.
// A trip is { line, id, vehicle, key, t, end, days, cancelled, gross, fee,
// payout, cleaning, fuel, delivery } where cleaning/fuel/delivery are null when
// the file does not say. feeMode: "auto" uses a fee column, or price minus
// earnings, and otherwise treats a lone amount by its header; "gross" reads the
// amount as before Turo's fee and applies feePct; "net" reads it as the payout.
export function normalizeRows(table, { decimalComma = false, feeMode = "auto", feePct = 25 } = {}) {
  const empty = { trips: [], skipped: [], cancelledCount: 0, currency: "", columns: {}, dmy: false, feeSource: "none" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.start !== undefined && (c.gross !== undefined || c.payout !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Trip start” (or “Start date”), “Vehicle”, and “Earnings” or “Trip price”, plus ideally “Trip end”, “Status” and “Turo fee”. Export your earnings or trip history from the Turo host app or website, or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "start")));
  const pct = Math.min(Math.max(Number(feePct) || 0, 0), 100) / 100;
  const hasGross = cols.gross !== undefined, hasPayout = cols.payout !== undefined, hasFee = cols.fee !== undefined;
  let feeSource;
  if (feeMode === "gross") feeSource = "percent";
  else if (feeMode === "net") feeSource = hasGross && hasPayout ? "difference" : "none";
  else if (hasFee && (hasGross || hasPayout)) feeSource = "column";
  else if (hasGross && hasPayout) feeSource = "difference";
  else if (hasGross) feeSource = "percent";
  else feeSource = "none";

  const trips = [], skipped = [];
  let currency = "", cancelledCount = 0;
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const start = parseWhen(get(line, "start"), dmy);
    if (!start) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const grossRaw = hasGross && !isBlank(get(line, "gross")) ? parseNumber(get(line, "gross"), decimalComma) : null;
    const payRaw = hasPayout && !isBlank(get(line, "payout")) ? parseNumber(get(line, "payout"), decimalComma) : null;
    const feeRaw = hasFee && !isBlank(get(line, "fee")) ? parseNumber(get(line, "fee"), decimalComma) : null;
    if ((grossRaw !== null && Number.isNaN(grossRaw)) || (payRaw !== null && Number.isNaN(payRaw)) || (feeRaw !== null && Number.isNaN(feeRaw))) { skipped.push({ line: lineNo, reason: "amount not a number" }); continue; }
    if (grossRaw === null && payRaw === null) { skipped.push({ line: lineNo, reason: "no amount" }); continue; }

    let gross, fee, payout;
    if (feeSource === "percent") {
      gross = grossRaw ?? payRaw;
      fee = gross * pct; payout = gross - fee;
    } else if (feeSource === "column") {
      const f = Math.abs(feeRaw ?? 0);
      if (grossRaw !== null) { gross = grossRaw; payout = payRaw ?? gross - f; }
      else { payout = payRaw; gross = payout + f; }
      fee = gross - payout;
    } else if (feeSource === "difference") {
      payout = payRaw ?? grossRaw; gross = grossRaw ?? payRaw;
      // A payout above the price (extras, reimbursements) is not a negative fee.
      if (gross < payout) gross = payout;
      fee = gross - payout;
    } else {
      payout = payRaw ?? grossRaw; gross = payout; fee = 0;
    }

    const status = get(line, "status");
    const cancelled = /cancel|declin|reject|expire/i.test(status);
    let end = parseWhen(get(line, "end"), dmy);
    if (end && end.t < start.t) end = null;
    let days = null;
    if (cols.days !== undefined && !isBlank(get(line, "days"))) {
      const dv = parseNumber(get(line, "days"), decimalComma);
      if (Number.isFinite(dv) && dv > 0) days = dv;
    }
    if (days === null && end) days = daysBetween(start.t, end.t);
    if (days === null) days = 1;
    const money = (f) => {
      if (cols[f] === undefined || isBlank(get(line, f))) return null;
      const v = parseNumber(get(line, f), decimalComma);
      return Number.isFinite(v) ? Math.abs(v) : null;
    };
    const vehicleRaw = get(line, "vehicle") || [get(line, "year"), get(line, "make"), get(line, "model")].filter(Boolean).join(" ") || get(line, "plate");
    const vehicle = vehicleRaw.replace(/\s+/g, " ").trim() || "All vehicles";
    const cur = get(line, "currency");
    if (cur && !currency) currency = cur;
    if (cancelled) cancelledCount += 1;
    trips.push({
      line: lineNo, id: get(line, "id"), vehicle, key: carKey(vehicle) || "all vehicles",
      t: start.t, end: end ? end.t : start.t + days * DAY, days, cancelled,
      gross, fee, payout, cleaning: money("cleaning"), fuel: money("fuel"), delivery: money("delivery"),
    });
  }
  if (!trips.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { trips, skipped, cancelledCount, currency, columns: cols, dmy, feeSource };
}

// "Vehicle, monthly cost[, months]" per line. Returns { list, bad } where bad
// holds the lines that could not be read, with a reason.
export function parseFixedList(text) {
  const list = [], bad = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const f = line.split(/[,\t;]/).map((x) => x.trim());
    if (f.length < 2) { bad.push({ line: i + 1, reason: "expected “vehicle, monthly cost”" }); return; }
    const amount = parseNumber(f[1]);
    if (!Number.isFinite(amount) || amount < 0 || isBlank(f[1])) { bad.push({ line: i + 1, reason: "monthly cost not a number" }); return; }
    let months = null;
    if (f[2] !== undefined && f[2] !== "") {
      months = parseNumber(f[2]);
      if (!Number.isFinite(months) || months < 0) { bad.push({ line: i + 1, reason: "months not a number" }); return; }
    }
    list.push({ name: f[0], key: carKey(f[0]), monthly: amount, months });
  });
  return { list, bad };
}

function blank(key, label) {
  return { key, label, trips: 0, days: 0, gross: 0, fee: 0, payout: 0, variable: 0, contribution: 0 };
}

function finishGroup(b) {
  return {
    ...b,
    revenuePerDay: b.days > 0 ? b.payout / b.days : null,
    contributionPerDay: b.days > 0 ? b.contribution / b.days : null,
    contributionPerTrip: b.trips ? b.contribution / b.trips : 0,
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export { WEEKDAYS };
export const LENGTHS = [
  { key: "1", label: "1 day", from: 0, to: 1.5 },
  { key: "2-3", label: "2-3 days", from: 1.5, to: 3.5 },
  { key: "4-6", label: "4-6 days", from: 3.5, to: 6.5 },
  { key: "7+", label: "7+ days", from: 6.5, to: Infinity },
];

// opts: { cleaning, fuel, delivery (default cost per completed trip, used when
// the file has no such column or the cell is blank), loan, insurance,
// depreciation (default monthly fixed cost per car, summed), fixedList (text),
// from, to (day timestamps) }.
// Payout = what Turo pays the host after its fee. Contribution = payout minus
// per-trip costs. Net = contribution minus fixed cost for the months in the
// period. Cancelled trips with a payout count as revenue with no days and no
// per-trip costs; cancelled trips with no payout are dropped and counted.
export function analyze(trips, opts = {}) {
  const dflt = { cleaning: Number(opts.cleaning) || 0, fuel: Number(opts.fuel) || 0, delivery: Number(opts.delivery) || 0 };
  for (const [k, v] of Object.entries(dflt)) if (v < 0) return { invalid: `Default ${k} cost must be zero or more.` };
  const defaultMonthly = (Number(opts.loan) || 0) + (Number(opts.insurance) || 0) + (Number(opts.depreciation) || 0);
  if (defaultMonthly < 0) return { invalid: "Monthly fixed costs must be zero or more." };
  const fixed = parseFixedList(opts.fixedList);
  const inRange = trips.filter((x) => (opts.from == null || x.t >= opts.from) && (opts.to == null || x.t < opts.to + DAY));
  if (!inRange.length) return { invalid: "No trips fall inside that date range." };
  let dropped = 0;
  const list = inRange.filter((x) => { if (x.cancelled && !(x.payout > 0)) { dropped += 1; return false; } return true; });
  if (!list.length) return { invalid: "Every trip in that range was cancelled with no payout." };

  const fromDay = opts.from != null ? Math.floor(opts.from / DAY) : Math.min(...list.map((x) => Math.floor(x.t / DAY)));
  const toDay = opts.to != null ? Math.floor(opts.to / DAY) : Math.max(...list.map((x) => Math.floor((x.cancelled ? x.t : Math.max(x.t, x.end - 1)) / DAY)));
  const periodDays = Math.max(1, toDay - fromDay + 1);
  const periodMonths = periodDays / MONTH_DAYS;

  const rows = [];
  const cars = new Map(), weekdays = new Map(), lengths = new Map(), months = new Map();
  const get = (map, key, label) => { if (!map.has(key)) map.set(key, blank(key, label)); return map.get(key); };
  const add = (b, r) => { b.trips += 1; b.days += r.days; b.gross += r.gross; b.fee += r.fee; b.payout += r.payout; b.variable += r.variable; b.contribution += r.contribution; };
  let cleaningFromFile = 0;
  for (const x of list) {
    const rented = !x.cancelled;
    const cleaning = rented ? (x.cleaning ?? dflt.cleaning) : 0;
    const fuel = rented ? (x.fuel ?? dflt.fuel) : 0;
    const delivery = rented ? (x.delivery ?? dflt.delivery) : 0;
    if (rented && x.cleaning !== null) cleaningFromFile += 1;
    const variable = cleaning + fuel + delivery;
    const r = { ...x, days: rented ? x.days : 0, cleaning, fuel, delivery, variable, contribution: x.payout - variable };
    r.contributionPerDay = r.days > 0 ? r.contribution / r.days : null;
    rows.push(r);
    add(get(cars, x.key, x.vehicle), r);
    const d = new Date(x.t);
    if (rented) {
      add(get(weekdays, d.getUTCDay(), WEEKDAYS[d.getUTCDay()]), r);
      const len = LENGTHS.find((l) => x.days >= l.from && x.days < l.to) || LENGTHS[3];
      add(get(lengths, len.key, len.label), r);
    }
    add(get(months, d.toISOString().slice(0, 7), d.toISOString().slice(0, 7)), r);
  }

  const matchedFixed = new Set();
  const perCar = [...cars.values()].map((b) => {
    const g = finishGroup(b);
    // Exact name match first, then one name containing the other ("Civic" in
    // "2019 Honda Civic"), so a short label still finds its car.
    let hit = fixed.list.find((f) => f.key === b.key) || fixed.list.find((f) => f.key && (b.key.includes(f.key) || f.key.includes(b.key)));
    if (hit) matchedFixed.add(hit);
    const monthly = hit ? hit.monthly : defaultMonthly;
    const monthsCharged = hit && hit.months !== null ? hit.months : periodMonths;
    const fixedCost = monthly * monthsCharged;
    const net = g.contribution - fixedCost;
    const utilization = g.days / periodDays;
    const cpd = g.contributionPerDay;
    return {
      ...g, monthly, monthsCharged, fixedCost, net, utilization,
      netPerDay: g.days > 0 ? net / g.days : null,
      fixedFromList: Boolean(hit),
      // Share of the period the car must be rented for contribution to cover its
      // fixed cost, at the contribution per rented day it actually earned.
      breakEvenUtilization: cpd !== null && cpd > 0 ? fixedCost / (cpd * periodDays) : null,
      idleDays: Math.max(0, periodDays - g.days),
    };
  });
  const byCar = perCar.sort((a, b) => b.net - a.net);
  const unmatchedFixed = fixed.list.filter((f) => !matchedFixed.has(f));

  const total = blank("all", "All vehicles");
  for (const r of rows) add(total, r);
  Object.assign(total, finishGroup(total));
  const fixedTotal = byCar.reduce((s, c) => s + c.fixedCost, 0);
  const summary = {
    ...total, fixedCost: fixedTotal, net: total.contribution - fixedTotal,
    cars: byCar.length, periodDays, periodMonths, from: fromDay * DAY, to: toDay * DAY,
    utilization: byCar.length ? total.days / (periodDays * byCar.length) : 0,
    feeShare: total.gross > 0 ? total.fee / total.gross : 0,
    cancelledDropped: dropped,
    cancelledKept: rows.filter((r) => r.cancelled).length,
    fixedEntered: defaultMonthly > 0 || fixed.list.length > 0,
    perTripCostsEntered: dflt.cleaning + dflt.fuel + dflt.delivery > 0 || rows.some((r) => r.cleaning || r.fuel || r.delivery),
    losingCars: byCar.filter((c) => c.net < 0).length,
    losingTrips: rows.filter((r) => !r.cancelled && r.contribution < 0).length,
  };

  const byWeekday = [...weekdays.values()].map(finishGroup).sort((a, b) => a.key - b.key);
  const byLength = LENGTHS.map((l) => lengths.get(l.key)).filter(Boolean).map(finishGroup);
  const byMonth = [...months.values()].map(finishGroup).sort((a, b) => (a.key < b.key ? -1 : 1));
  const tripRows = rows.filter((r) => !r.cancelled);
  const worstTrips = [...tripRows].sort((a, b) => a.contribution - b.contribution).slice(0, 10);
  const bestTrips = [...tripRows].sort((a, b) => b.contribution - a.contribution).slice(0, 5);

  return {
    summary, byCar, byWeekday, byLength, byMonth, worstTrips, bestTrips, fixedBad: fixed.bad, unmatchedFixed,
    findings: findings({ summary, byCar, byWeekday, byLength, unmatchedFixed, fixedBad: fixed.bad }),
  };
}

const usd = (n) => (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);

function findings({ summary: s, byCar, byWeekday, byLength, unmatchedFixed, fixedBad }) {
  const out = [];
  if (!s.fixedEntered) {
    out.push({ severity: "high", title: "No fixed monthly costs entered, so every car looks better than it is", detail: "Net below is payout minus per-trip costs only. A car with a loan, insurance and depreciation can earn a positive figure here and still lose money each month. Enter loan, insurance and depreciation per car in step 2." });
  }
  if (!s.perTripCostsEntered) {
    out.push({ severity: "medium", title: "No cleaning, fuel or delivery costs entered", detail: "Per-trip costs are counted as zero. Enter a typical cost per trip in step 2, or add Cleaning, Fuel and Delivery cost columns to the file." });
  }
  if (s.gross > 0 && s.fee > 0) {
    out.push({ severity: s.feeShare >= 0.3 ? "medium" : "info", title: `Turo kept ${(s.feeShare * 100).toFixed(0)}% of trip price`, detail: `${usd(s.fee)} of ${usd(s.gross)}. You were paid ${usd(s.payout)} across ${s.trips} trip${s.trips === 1 ? "" : "s"}. The share depends on your plan and booking window; this figure is what the file shows, not a rate the tool assumes.` });
  }
  const losing = byCar.filter((c) => c.net < 0);
  if (losing.length) {
    out.push({ severity: "high", title: `${losing.length} of ${byCar.length} vehicle${byCar.length === 1 ? "" : "s"} lost money after fixed costs`, detail: losing.map((c) => `${c.label}: ${usd(c.net)} (${(c.utilization * 100).toFixed(0)}% utilization${c.breakEvenUtilization !== null ? `, needs ${(c.breakEvenUtilization * 100).toFixed(0)}% to break even at its rate` : ""})`).join("; ") + "." });
  } else if (s.fixedEntered && byCar.length) {
    out.push({ severity: "info", title: "Every vehicle covered its fixed costs in this period", detail: "That says nothing about future months or seasons; utilization moves a great deal through the year." });
  }
  const ranked = byCar.filter((c) => c.days > 0 && c.netPerDay !== null);
  if (ranked.length >= 2) {
    const a = [...ranked].sort((x, y) => y.netPerDay - x.netPerDay)[0], b = [...ranked].sort((x, y) => x.netPerDay - y.netPerDay)[0];
    if (a !== b) out.push({ severity: "info", title: `${a.label} earned the most per rented day; ${b.label} the least`, detail: `${usd(a.netPerDay)} vs ${usd(b.netPerDay)} net per rented day after fixed costs (${a.days} and ${b.days} rented days). A car with a low rate per day can still win on utilization, so read both columns.` });
  }
  const idle = byCar.filter((c) => c.utilization < 0.4 && c.fixedCost > 0).sort((a, b) => a.utilization - b.utilization);
  if (idle.length) {
    out.push({ severity: "medium", title: `${idle.length} vehicle${idle.length === 1 ? " was" : "s were"} rented under 40% of the period`, detail: idle.slice(0, 4).map((c) => `${c.label}: ${(c.utilization * 100).toFixed(0)}% (${c.idleDays.toFixed(0)} idle days, about ${usd(c.fixedCost / s.periodDays)} of fixed cost per day it sits)`).join("; ") + "." });
  }
  const over = byCar.filter((c) => c.utilization > 1.02);
  if (over.length) {
    out.push({ severity: "medium", title: "A car shows more than 100% utilization", detail: `${over.map((c) => c.label).join(", ")}. Trip days in the file exceed the days in the period, usually because trips run past the date range or the file lists the same trip twice. Utilization counts each trip's full length on the day it starts.` });
  }
  if (s.losingTrips > 0) {
    out.push({ severity: "medium", title: `${s.losingTrips} trip${s.losingTrips === 1 ? "" : "s"} paid less than their own cleaning, fuel and delivery cost`, detail: "These lost money before any fixed cost. The worst ten are listed below." });
  }
  const wd = byWeekday.filter((d) => d.trips >= MIN_TRIPS && d.contributionPerDay !== null).sort((a, b) => b.contributionPerDay - a.contributionPerDay);
  if (wd.length >= 2) {
    const a = wd[0], b = wd[wd.length - 1];
    if (a.contributionPerDay - b.contributionPerDay >= 1) out.push({ severity: "info", title: `Trips starting ${a.label} paid most per day; ${b.label} least`, detail: `${usd(a.contributionPerDay)} vs ${usd(b.contributionPerDay)} per rented day after per-trip costs, before fixed costs (${a.trips} and ${b.trips} trips). Weekday is the start day only; weekend trips run into other days.` });
  }
  const ln = byLength.filter((l) => l.trips >= MIN_TRIPS && l.contributionPerDay !== null).sort((a, b) => b.contributionPerDay - a.contributionPerDay);
  if (ln.length >= 2) {
    const a = ln[0], b = ln[ln.length - 1];
    if (a.contributionPerDay - b.contributionPerDay >= 1) out.push({ severity: "info", title: `${a.label} bookings earned most per day; ${b.label} least`, detail: `${usd(a.contributionPerDay)} vs ${usd(b.contributionPerDay)} per rented day after per-trip costs (${a.trips} and ${b.trips} trips). Per-trip cleaning and delivery costs weigh most on short bookings; long ones often carry discounts.` });
  }
  if (s.cancelledDropped || s.cancelledKept) {
    out.push({ severity: "info", title: `${s.cancelledDropped + s.cancelledKept} cancelled trip${s.cancelledDropped + s.cancelledKept === 1 ? "" : "s"} found`, detail: `${s.cancelledDropped} with no payout were left out. ${s.cancelledKept} with a payout are counted as revenue with no rented days and no per-trip costs.` });
  }
  if (unmatchedFixed.length) {
    out.push({ severity: "medium", title: `${unmatchedFixed.length} fixed-cost line${unmatchedFixed.length === 1 ? "" : "s"} matched no vehicle`, detail: `${unmatchedFixed.map((f) => f.name).join(", ")}. Names must match the file's vehicle names, or be contained in them (“Civic” matches “2019 Honda Civic”). Those cars used your default monthly figures instead.` });
  }
  if (fixedBad.length) {
    out.push({ severity: "medium", title: `${fixedBad.length} fixed-cost line${fixedBad.length === 1 ? "" : "s"} could not be read`, detail: fixedBad.map((b) => `line ${b.line}: ${b.reason}`).join("; ") + "." });
  }
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Deterministic synthetic file for the "Load an example" button: three made-up
// cars over three months, one of them a low-earning old truck. Not real data.
export function sampleCsv() {
  const lines = ["Reservation ID,Vehicle,Trip start,Trip end,Status,Trip price,Earnings"];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cars = [
    { name: "2021 Honda Civic", rate: 58, gap: 1.4 },
    { name: "2019 Tesla Model 3", rate: 88, gap: 2.2 },
    { name: "2008 Ford F-150", rate: 46, gap: 6.5 },
  ];
  let id = 4100;
  for (const car of cars) {
    let day = Math.floor(rnd() * 3);
    while (day < 90) {
      const len = rnd() < 0.5 ? 1 + Math.floor(rnd() * 2) : rnd() < 0.7 ? 3 + Math.floor(rnd() * 3) : 7;
      const start = new Date(Date.UTC(2026, 5, 1 + day, 9 + Math.floor(rnd() * 8), 0));
      const end = new Date(start.getTime() + len * 86400000);
      const price = len * car.rate * (0.85 + rnd() * 0.4);
      const cancelled = rnd() < 0.06;
      const earn = cancelled ? 0 : price * 0.75;
      const f = (d) => d.toISOString().slice(0, 16).replace("T", " ");
      lines.push(`RES${id++},${car.name},${f(start)},${f(end)},${cancelled ? "Cancelled" : "Completed"},${cancelled ? "0.00" : price.toFixed(2)},${earn.toFixed(2)}`);
      day += len + Math.floor(rnd() * car.gap * 2);
    }
  }
  return lines.join("\n") + "\n";
}
