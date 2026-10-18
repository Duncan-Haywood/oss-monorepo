// Restaurant labor-cost analyzer: reads an hourly (or per-check) sales export and
// a POS time-entry export (Toast, Square, Clover, 7shifts style), spreads every
// shift across the clock hours it covers, and reports labor % of sales and sales
// per labor hour by daypart, weekday and weekday-by-hour cell, plus a
// conservative estimate of the labor above a target that could be trimmed
// without dropping under a minimum crew. Column names are matched by alias and
// no real export was available when this was written. Pure functions, no DOM,
// no network.

export const DEFAULT_TARGET_PCT = 30;
export const DEFAULT_BURDEN_PCT = 12;
export const DEFAULT_MIN_CREW = 2;
export const DEFAULT_DAY_START = 4;
export const DEFAULT_DAYPARTS = "Breakfast 6-11, Lunch 11-14, Afternoon 14-17, Dinner 17-22, Late 22-6";
export const MIN_DAYS = 3;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

const SALES_ALIASES = {
  when: ["date time", "datetime", "date/time", "timestamp", "opened", "opened at", "order time", "created at", "time opened", "order date", "business date", "date", "day"],
  hour: ["hour", "hour of day", "time of day", "hour start", "hour beginning", "time"],
  sales: ["net sales", "net amount", "net revenue", "net total", "net", "sales", "revenue", "total sales", "amount", "gross sales"],
};
const LABOR_ALIASES = {
  employee: ["employee", "employee name", "team member", "staff", "name"],
  role: ["job", "job title", "role", "position", "job name", "department"],
  inAt: ["clock in", "clocked in", "in date", "in time", "time in", "clock-in", "start time", "start", "in"],
  outAt: ["clock out", "clocked out", "out date", "out time", "time out", "clock-out", "end time", "end", "out"],
  date: ["shift date", "work date", "business date", "date"],
  hours: ["total hours", "paid hours", "regular hours", "hours worked", "hours", "duration"],
  rate: ["hourly rate", "pay rate", "wage rate", "regular rate", "wage", "rate"],
  pay: ["total pay", "gross pay", "labor cost", "total wages", "regular pay", "wages", "pay"],
};

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^\$?\s*[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

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

const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
export const money = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);

export function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

function findHeader(table, aliases, need) {
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cols = findColumns(table[i], aliases);
    if (need(cols)) return { h: i, cols };
  }
  return null;
}

// "2026-09-01 14:30", "2026-09-01T14:30:00", "9/1/2026 2:30 PM", "01/09/2026" (a
// first number above 12 is read as the day). Returns { day, min } where day is
// whole days since 1970-01-01 and min is minutes into that day, or null when the
// text carries no clock time. Returns undefined when it is not a date at all.
export function parseDateTime(text) {
  const s = String(text ?? "").trim();
  let y, mo, d, rest;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/))) {
    let a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (a > 12) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  } else return undefined;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const ms = Date.UTC(y, mo - 1, d);
  if (new Date(ms).getUTCDate() !== d) return undefined;
  const day = Math.round(ms / 86400000);
  const t = parseClock(rest.replace(/^[T,\s]+/, ""));
  return { day, min: t === undefined ? null : t };
}

// "14", "14:30", "2 PM", "2:30:00 PM", "14:00-15:00" (the start is used).
export function parseClock(text) {
  const m = String(text ?? "").trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d])/i);
  if (!m) return undefined;
  let h = +m[1];
  const min = m[2] === undefined ? 0 : +m[2];
  const ap = m[3] ? m[3][0].toLowerCase() : "";
  if (ap) { if (h < 1 || h > 12) return undefined; if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0; }
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return undefined;
  return h * 60 + min;
}

const isTotal = (s) => /^(total|totals|subtotal|grand total|summary|all)\b/i.test(s.trim());

// Sales table -> { rows: [{ line, t, sales }], skipped, columns, error }. t is
// minutes since the epoch (naive local time, no time zone applied).
export function normalizeSales(table, { decimalComma = false } = {}) {
  const empty = { rows: [], skipped: [], columns: {} };
  if (!table.length) return { ...empty, error: "The sales file is empty." };
  const found = findHeader(table, SALES_ALIASES, (c) => c.when !== undefined && c.sales !== undefined);
  if (!found) return { ...empty, error: "No header row found in the sales file. Expected a date or date-time column and a net sales column (for example “Date”, “Hour”, “Net Sales”), as in a Toast, Square or Clover sales-by-hour report." };
  const { h, cols } = found;
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = table[h][at].trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    const w = (line[cols.when] ?? "").trim();
    if (!w) { skipped.push({ line: lineNo, reason: "no date" }); continue; }
    if (isTotal(w)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const dt = parseDateTime(w);
    if (!dt) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    let min = dt.min;
    if (min === null && cols.hour !== undefined) { const c = parseClock((line[cols.hour] ?? "").trim()); if (c !== undefined) min = c; }
    if (min === null) { skipped.push({ line: lineNo, reason: "no hour of day" }); continue; }
    const sales = parseNumber(line[cols.sales] ?? "", decimalComma);
    if (!Number.isFinite(sales)) { skipped.push({ line: lineNo, reason: "sales not readable" }); continue; }
    rows.push({ line: lineNo, t: dt.day * 1440 + min, sales });
  }
  return { rows, skipped, columns };
}

// Time entries -> { shifts: [{ line, employee, role, t0, t1, cost, costFrom }],
// dayOnly: [{ line, day, hours, cost, role }], skipped, columns, error }. cost is
// the wage cost before payroll burden, null when the row carries none (the
// default wage is applied later and flagged). Shifts with only a date and hours
// cannot be placed on the clock and are kept as dayOnly.
export function normalizeLabor(table, { decimalComma = false } = {}) {
  const empty = { shifts: [], dayOnly: [], skipped: [], columns: {} };
  if (!table.length) return { ...empty, error: "The time-entry file is empty." };
  const found = findHeader(table, LABOR_ALIASES, (c) => (c.inAt !== undefined && c.outAt !== undefined) || (c.date !== undefined && c.hours !== undefined));
  if (!found) return { ...empty, error: "No header row found in the time-entry file. Expected clock-in and clock-out columns (for example “In Date”, “Out Date”, “Hourly Rate”), or a date and hours worked, as in a Toast, Square, Clover or 7shifts time-entry report." };
  const { h, cols } = found;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = table[h][at].trim();
  const shifts = [], dayOnly = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    const first = line.find((c) => c.trim() !== "") ?? "";
    if (isTotal(first) || isTotal(get(line, "employee"))) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const employee = get(line, "employee"), role = get(line, "role");
    const rate = isBlank(get(line, "rate")) ? null : parseNumber(get(line, "rate"), decimalComma);
    const pay = isBlank(get(line, "pay")) ? null : parseNumber(get(line, "pay"), decimalComma);
    if ((rate !== null && !Number.isFinite(rate)) || (pay !== null && !Number.isFinite(pay))) { skipped.push({ line: lineNo, reason: "pay or rate not readable" }); continue; }
    if (cols.inAt !== undefined && cols.outAt !== undefined) {
      const a = parseDateTime(get(line, "inAt")), b = parseDateTime(get(line, "outAt"));
      if (!a || !b || a.min === null || b.min === null) {
        if (cols.date !== undefined && cols.hours !== undefined && !isBlank(get(line, "hours"))) { /* fall through to date and hours below */ }
        else { skipped.push({ line: lineNo, reason: get(line, "outAt") === "" ? "still clocked in (no clock-out)" : "clock-in or clock-out not readable" }); continue; }
      } else {
        const t0 = a.day * 1440 + a.min;
        let t1 = b.day * 1440 + b.min;
        if (t1 <= t0 && b.day === a.day) t1 += 1440;
        if (t1 <= t0) { skipped.push({ line: lineNo, reason: "clock-out before clock-in" }); continue; }
        if (t1 - t0 > 1440) { skipped.push({ line: lineNo, reason: "shift longer than 24 hours" }); continue; }
        const hrs = (t1 - t0) / 60;
        let cost = null, costFrom = "default";
        if (pay !== null && pay !== 0) { cost = Math.abs(pay); costFrom = "pay"; }
        else if (rate !== null && rate !== 0) { cost = Math.abs(rate) * hrs; costFrom = "rate"; }
        shifts.push({ line: lineNo, employee, role, t0, t1, cost, costFrom });
        continue;
      }
    }
    const dt = parseDateTime(get(line, "date"));
    const hrs = parseNumber(get(line, "hours"), decimalComma);
    if (!dt || !Number.isFinite(hrs) || hrs <= 0) { skipped.push({ line: lineNo, reason: "date or hours not readable" }); continue; }
    let cost = null;
    if (pay !== null && pay !== 0) cost = Math.abs(pay); else if (rate !== null && rate !== 0) cost = Math.abs(rate) * hrs;
    dayOnly.push({ line: lineNo, day: dt.day, hours: hrs, cost, role, employee });
  }
  return { shifts, dayOnly, skipped, columns };
}

// "Breakfast 6-11, Lunch 11-14, Late 22-6" -> [{ name, from, to }] with hours
// 0-24; a range that wraps midnight is allowed. Every hour must belong to exactly
// one daypart, otherwise { error }.
export function parseDayparts(text) {
  const parts = String(text ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { error: "Type at least one daypart, for example “Lunch 11-14, Dinner 17-22”." };
  const list = [], owner = new Array(24).fill(null);
  for (const p of parts) {
    const m = p.match(/^(.*?)\s*(\d{1,2})\s*[-–to]+\s*(\d{1,2})$/i);
    if (!m || !m[1]) return { error: `Could not read daypart “${p}”. Use the form “Lunch 11-14”.` };
    const from = +m[2], to = +m[3];
    if (from > 24 || to > 24 || from === to) return { error: `Daypart “${p}” needs two different hours between 0 and 24.` };
    list.push({ name: m[1].trim(), from, to });
    for (let x = from % 24; x !== to % 24; x = (x + 1) % 24) {
      if (owner[x] !== null) return { error: `Hour ${x} is in both “${owner[x]}” and “${m[1].trim()}”.` };
      owner[x] = m[1].trim();
    }
  }
  const gap = owner.findIndex((o) => o === null);
  if (gap !== -1) return { error: `Hour ${gap} belongs to no daypart. Dayparts must cover all 24 hours, for example “Late 22-6”.` };
  return { list, owner };
}

export function parseRoleList(text) {
  return String(text ?? "").split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

// Sales rows + labor -> the report. Every figure is arithmetic on the two files
// and the typed assumptions.
export function analyze(sales, labor, opts = {}) {
  const o = {
    targetPct: DEFAULT_TARGET_PCT, burdenPct: DEFAULT_BURDEN_PCT, minCrew: DEFAULT_MIN_CREW,
    dayStartHour: DEFAULT_DAY_START, defaultWage: NaN, excludeRoles: [], dayparts: DEFAULT_DAYPARTS, ...opts,
  };
  if (!(o.targetPct > 0 && o.targetPct < 100)) return { invalid: "Target labor % must be between 0 and 100." };
  if (!(o.burdenPct >= 0 && o.burdenPct < 100)) return { invalid: "Payroll burden % must be between 0 and 99." };
  if (!(o.minCrew >= 0 && o.minCrew <= 100)) return { invalid: "Minimum crew must be between 0 and 100." };
  if (!(o.dayStartHour >= 0 && o.dayStartHour <= 12)) return { invalid: "The business day start must be an hour between 0 and 12." };
  const dp = parseDayparts(o.dayparts);
  if (dp.error) return { invalid: dp.error };
  const excluded = (r) => o.excludeRoles.length > 0 && o.excludeRoles.some((x) => r.toLowerCase().includes(x));

  const shift = o.dayStartHour * 60;
  const bizDay = (t) => Math.floor((t - shift) / 1440);
  const cells = new Map(); // "bizDay|hour" -> { day, hour, sales, min, cost }
  const cell = (day, hour) => {
    const k = day * 24 + hour;
    let c = cells.get(k);
    if (!c) { c = { day, hour, sales: 0, min: 0, cost: 0 }; cells.set(k, c); }
    return c;
  };
  const flags = { placeholderShifts: 0, noCostShifts: 0, excludedShifts: 0, excludedHours: 0, dayOnlyHours: 0, dayOnlyCost: 0, salesRows: sales.length };
  let totalSales = 0;
  for (const r of sales) {
    const hour = Math.floor((((r.t % 1440) + 1440) % 1440) / 60);
    cell(bizDay(r.t), hour).sales += r.sales;
    totalSales += r.sales;
  }
  const wageFor = (cost, hrs) => {
    if (cost !== null) return cost;
    if (Number.isFinite(o.defaultWage) && o.defaultWage > 0) { flags.placeholderShifts++; return o.defaultWage * hrs; }
    flags.noCostShifts++; return 0;
  };
  let laborHoursIn = 0, wageIn = 0;
  for (const s of labor.shifts) {
    const hrs = (s.t1 - s.t0) / 60;
    if (excluded(s.role)) { flags.excludedShifts++; flags.excludedHours += hrs; continue; }
    const cost = wageFor(s.cost, hrs) * (1 + o.burdenPct / 100);
    laborHoursIn += hrs; wageIn += cost;
    const perMin = cost / (s.t1 - s.t0);
    for (let t = Math.floor(s.t0 / 60) * 60; t < s.t1; t += 60) {
      const ov = Math.min(t + 60, s.t1) - Math.max(t, s.t0);
      if (ov <= 0) continue;
      const c = cell(bizDay(t), Math.floor((t % 1440) / 60));
      c.min += ov; c.cost += perMin * ov;
    }
  }
  const dayOnlyDays = new Map(); // bizDay -> { hours, cost }
  for (const d of labor.dayOnly) {
    if (excluded(d.role)) { flags.excludedShifts++; flags.excludedHours += d.hours; continue; }
    const cost = wageFor(d.cost, d.hours) * (1 + o.burdenPct / 100);
    flags.dayOnlyHours += d.hours; flags.dayOnlyCost += cost;
    const e = dayOnlyDays.get(d.day) ?? { hours: 0, cost: 0 };
    e.hours += d.hours; e.cost += cost; dayOnlyDays.set(d.day, e);
  }
  if (!cells.size) return { invalid: "Nothing to analyze: no sales or shifts were read." };

  const salesDays = new Set(), laborDays = new Set();
  for (const c of cells.values()) { if (c.sales !== 0) salesDays.add(c.day); if (c.min > 0) laborDays.add(c.day); }
  for (const d of dayOnlyDays.keys()) laborDays.add(d);
  const allDays = new Set([...salesDays, ...laborDays]);
  if (allDays.size < MIN_DAYS) return { invalid: `Only ${allDays.size} business day(s) were found. Use at least ${MIN_DAYS} days, ideally two to four weeks, or the weekday figures mean little.` };
  const dowOf = (day) => ((day % 7) + 11) % 7; // 1970-01-01 was a Thursday
  const daysPerDow = new Array(7).fill(0);
  for (const d of allDays) daysPerDow[dowOf(d)]++;
  const dayCount = allDays.size;
  const weeks = dayCount / 7;

  const totalMin = [...cells.values()].reduce((a, c) => a + c.min, 0);
  const totalCost = [...cells.values()].reduce((a, c) => a + c.cost, 0) + flags.dayOnlyCost;
  const totalHours = totalMin / 60 + flags.dayOnlyHours;
  const pctOf = (cost, sl) => (sl > 0 ? (cost / sl) * 100 : null);
  const splhOf = (sl, hrs) => (hrs > 0 ? sl / hrs : null);
  const mk = (name) => ({ name, sales: 0, hours: 0, cost: 0, trim: 0, trimHours: 0 });

  // Weekday-by-hour cells, averaged over how many of that weekday were in the data.
  const grid = new Map();
  for (const c of cells.values()) {
    const dow = dowOf(c.day), k = dow * 24 + c.hour;
    let g = grid.get(k);
    if (!g) { g = { dow, hour: c.hour, n: daysPerDow[dow], sales: 0, hours: 0, cost: 0 }; grid.set(k, g); }
    g.sales += c.sales; g.hours += c.min / 60; g.cost += c.cost;
  }
  const t = o.targetPct / 100;
  let noSalesCost = 0, noSalesHours = 0;
  const gridRows = [];
  for (const g of grid.values()) {
    const avgHours = g.hours / g.n;
    let trim = 0, trimHours = 0;
    if (g.sales > 0 && g.hours > 0 && g.cost > t * g.sales) {
      const wage = g.cost / g.hours;
      trimHours = Math.max(0, avgHours - o.minCrew) * g.n;
      trim = Math.min(g.cost - t * g.sales, trimHours * wage);
      trimHours = trim / wage;
    }
    if (g.sales <= 0 && g.cost > 0) { noSalesCost += g.cost; noSalesHours += g.hours; }
    gridRows.push({ ...g, dowName: DOW[g.dow], avgSales: g.sales / g.n, avgHours, pct: pctOf(g.cost, g.sales), splh: splhOf(g.sales, g.hours), trim, trimHours });
  }
  gridRows.sort((a, b) => DOW_ORDER.indexOf(a.dow) - DOW_ORDER.indexOf(b.dow) || a.hour - b.hour);

  const byPart = new Map(dp.list.map((p) => [p.name, mk(p.name)]));
  const byDow = DOW_ORDER.map((d) => ({ ...mk(DOW[d]), dow: d, days: daysPerDow[d] }));
  for (const g of gridRows) {
    for (const bucket of [byPart.get(dp.owner[g.hour]), byDow[DOW_ORDER.indexOf(g.dow)]]) {
      bucket.sales += g.sales; bucket.hours += g.hours; bucket.cost += g.cost; bucket.trim += g.trim; bucket.trimHours += g.trimHours;
    }
  }
  for (const [day, e] of dayOnlyDays) { const b = byDow[DOW_ORDER.indexOf(dowOf(day))]; b.hours += e.hours; b.cost += e.cost; }
  const fin = (b) => ({ ...b, pct: pctOf(b.cost, b.sales), splh: splhOf(b.sales, b.hours), excess: Math.max(0, b.cost - t * b.sales) });
  const dayparts = [...byPart.values()].filter((b) => b.sales !== 0 || b.hours > 0).map(fin);
  const weekdays = byDow.filter((b) => b.days > 0).map(fin);

  const trimTotal = gridRows.reduce((a, g) => a + g.trim, 0);
  const trimHoursTotal = gridRows.reduce((a, g) => a + g.trimHours, 0);
  const summary = {
    days: dayCount, weeks: r1(weeks), sales: totalSales, laborCost: totalCost, laborHours: totalHours,
    laborPct: pctOf(totalCost, totalSales), splh: splhOf(totalSales, totalHours), targetPct: o.targetPct,
    trim: trimTotal, trimHours: trimHoursTotal, trimPerWeek: trimTotal / weeks, trimPerYear: (trimTotal / weeks) * 52,
    noSalesCost, noSalesHours,
  };

  const worst = gridRows.filter((g) => g.trim > 0).sort((a, b) => b.trim - a.trim).slice(0, 8);
  const thin = summary.splh === null ? [] : gridRows.filter((g) => g.splh !== null && g.n >= 2 && g.hours / g.n >= 0.5 && g.splh > 2 * summary.splh).sort((a, b) => b.splh - a.splh).slice(0, 5);

  const findings = [];
  if (summary.laborPct !== null && summary.laborPct > o.targetPct) findings.push({ severity: summary.laborPct > o.targetPct + 3 ? "high" : "medium", title: `Labor is ${summary.laborPct.toFixed(1)}% of sales against a ${o.targetPct}% target`, detail: `${usd(totalCost)} of labor on ${usd(totalSales)} of sales over ${dayCount} days. That is ${usd(totalCost - t * totalSales)} above the target for the period.` });
  const badPart = dayparts.filter((d) => d.excess > 0).sort((a, b) => b.excess - a.excess)[0];
  if (badPart) findings.push({ severity: "medium", title: `${badPart.name} is the daypart furthest over target`, detail: `${badPart.pct === null ? "No sales" : badPart.pct.toFixed(1) + "% labor"} on ${usd(badPart.sales)} of sales and ${r1(badPart.hours)} labor hours (${badPart.splh === null ? "n/a" : "$" + badPart.splh.toFixed(0)} per labor hour). ${usd(badPart.excess)} above target.` });
  if (trimTotal > 0) findings.push({ severity: "info", title: `About ${usd(trimTotal)} could be trimmed without going under ${o.minCrew} on the clock`, detail: `That is roughly ${r1(trimHoursTotal)} labor hours over the period, ${usd(summary.trimPerWeek)} a week, from ${worst.length} weekday-and-hour slot(s) where labor runs above target. It is an upper-bound screen on your past schedule, not a schedule: it ignores prep, side work, service standards and whether the sales would have held.` });
  if (noSalesHours > 0) findings.push({ severity: "info", title: `${r1(noSalesHours)} labor hours fall in hours with no sales`, detail: `${usd(noSalesCost)} of labor in slots where nothing was sold. Usually prep, opening and close; worth checking if it is more than that.` });
  if (thin.length) findings.push({ severity: "info", title: "Some slots run very lean", detail: "Sales per labor hour is more than double the overall figure in " + thin.map((g) => `${g.dowName} ${hourLabel(g.hour)}`).join(", ") + ". Cheap on paper, but check ticket times and walkouts before treating it as a model." });
  const salesOnly = [...salesDays].filter((d) => !laborDays.has(d)).length, laborOnly = [...laborDays].filter((d) => !salesDays.has(d)).length;
  if (salesOnly + laborOnly > 0) findings.push({ severity: "medium", title: "The two files do not cover the same days", detail: `${salesOnly} day(s) have sales but no labor and ${laborOnly} have labor but no sales. Those days distort the percentages; trim both files to the same dates.` });
  if (flags.placeholderShifts > 0) findings.push({ severity: "medium", title: `${flags.placeholderShifts} shift(s) used the default wage`, detail: `They carried no pay or rate, so the typed default of $${o.defaultWage}/hour was applied. That is a placeholder, not a measurement; the percentages for the hours they cover are only as good as that guess.` });
  if (flags.noCostShifts > 0) findings.push({ severity: "high", title: `${flags.noCostShifts} shift(s) have no pay and no default wage`, detail: "They were counted as hours worked at zero cost, which understates labor. Type a default wage or add a rate column." });
  if (flags.dayOnlyHours > 0) findings.push({ severity: "info", title: `${r1(flags.dayOnlyHours)} labor hours had a date but no clock times`, detail: "They count in the totals and the weekday table but cannot be placed in a daypart or an hour, so the daypart rows add up to less than the total." });
  if (flags.excludedShifts > 0) findings.push({ severity: "info", title: `${flags.excludedShifts} shift(s) excluded by role`, detail: `${r1(flags.excludedHours)} hours were left out (roles matching ${o.excludeRoles.join(", ")}). Salaried labor left out this way is not in the percentages.` });

  return { summary, dayparts, weekdays, grid: gridRows, worst, thin, findings, flags, options: o, daypartList: dp.list };
}

export function reportCsv(a) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const out = [["weekday", "hour", "days_in_data", "avg_sales", "avg_labor_hours", "labor_cost_total", "labor_pct", "sales_per_labor_hour", "trimmable_cost"]];
  for (const g of a.grid) out.push([g.dowName, g.hour, g.n, r2(g.avgSales), r2(g.avgHours), r2(g.cost), g.pct === null ? "" : r1(g.pct), g.splh === null ? "" : r2(g.splh), r2(g.trim)]);
  return out.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

export function summaryText(a) {
  const s = a.summary, L = [];
  L.push(`Labor ${s.laborPct === null ? "n/a" : s.laborPct.toFixed(1) + "%"} of sales (target ${s.targetPct}%): ${usd(s.laborCost)} on ${usd(s.sales)} over ${s.days} days; ${r1(s.laborHours)} labor hours, ${s.splh === null ? "n/a" : "$" + s.splh.toFixed(0)} sales per labor hour.`);
  for (const d of a.dayparts) L.push(`${d.name}: ${d.pct === null ? "no sales" : d.pct.toFixed(1) + "%"}, ${usd(d.sales)} sales, ${r1(d.hours)} h`);
  if (s.trim > 0) L.push(`Trimmable above target (min crew ${a.options.minCrew}): about ${usd(s.trim)} in the period, ${usd(s.trimPerWeek)} a week.`);
  L.push("Estimate from the supplied files and typed assumptions; not advice.");
  return L.join("\n");
}

// Two invented weeks of a small cafe: 7am-10pm, a flat four-person floor through
// the dead afternoon. Deterministic, not a real business.
export function sampleCsv() {
  const profile = { 7: 90, 8: 260, 9: 300, 10: 220, 11: 380, 12: 640, 13: 520, 14: 200, 15: 130, 16: 150, 17: 330, 18: 600, 19: 640, 20: 420, 21: 150 };
  const dayMul = [1.25, 0.8, 0.85, 0.9, 1.0, 1.35, 1.5]; // Mon..Sun
  const sales = ["Date,Hour,Net Sales"], labor = ["Employee,Job,In Date,Out Date,Hourly Rate"];
  const staff = [["Ana", "Server", 7, 15, 15], ["Ben", "Cook", 7, 15, 19], ["Cy", "Server", 10, 16, 15], ["Di", "Cook", 15, 22, 19], ["Eli", "Server", 15, 22, 15], ["Fay", "Server", 16, 22, 15], ["Gus", "Dish", 11, 21, 16]];
  const pad = (n) => String(n).padStart(2, "0");
  for (let d = 0; d < 14; d++) {
    const date = new Date(Date.UTC(2026, 7, 3 + d)), ds = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    const mul = 0.55 * dayMul[d % 7] * (1 + ((d * 7) % 5 - 2) * 0.03);
    for (const [h, v] of Object.entries(profile)) sales.push(`${ds},${pad(h)}:00,${(v * mul).toFixed(2)}`);
    for (const [n, job, a, b, rate] of staff) {
      if (d % 7 < 5 && n === "Fay") continue; // Fay works weekends only
      labor.push(`${n},${job},${ds} ${pad(a)}:00,${ds} ${pad(b)}:00,${rate.toFixed(2)}`);
    }
  }
  return { sales: sales.join("\n"), labor: labor.join("\n") };
}
