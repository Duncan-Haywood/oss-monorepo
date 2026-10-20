// What does an ocean container cost you in demurrage (at the port or terminal) and detention
// (outside it, until the empty goes back), and what is each extra day or an earlier pickup worth?
// Pure functions, no dependencies, nothing leaves the browser. Every default is a placeholder
// tariff, not any carrier's: replace the free days and the per-day tiers with the ones on your
// carrier's invoice or tariff.
//
// Convention (one, stated on the page): the day of discharge or gate-out is day 0 and is not
// counted; every later day up to and including the pickup or return day is. Carriers differ.

export const DEFAULTS = {
  containers: 2,
  dischargeDate: "2026-03-02",
  pickupDate: "2026-03-13",
  returnDate: "2026-03-24",
  demFree: 4,
  demCountWeekends: 1,
  demExempt: 0,
  dem1Days: 5,
  dem1Rate: 175,
  dem2Days: 5,
  dem2Rate: 275,
  dem3Rate: 375,
  detFree: 4,
  detCountWeekends: 1,
  detExempt: 0,
  det1Days: 5,
  det1Rate: 150,
  det2Days: 5,
  det2Rate: 250,
  det3Rate: 350,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

const DAY_MS = 86400000;

// "2026-03-02" -> whole days since 1970-01-01 (UTC), NaN if it is not a real calendar date.
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN;
  return t / DAY_MS;
}

export function fmtDay(n) {
  return Number.isFinite(n) ? new Date(n * DAY_MS).toISOString().slice(0, 10) : "";
}

// 0 = Sunday. Day 0 of the epoch was a Thursday.
export const weekday = (n) => (((n + 4) % 7) + 7) % 7;
const isWeekend = (n) => weekday(n) === 0 || weekday(n) === 6;

// Days in (start, end] that count against the clock.
export function countDays(start, end, countWeekends) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let n = 0;
  for (let d = start + 1; d <= end; d++) if (countWeekends || !isWeekend(d)) n++;
  return n;
}

// The last day on which the container can still leave without a charge.
export function lastFreeDay(start, freeDays, countWeekends) {
  if (!Number.isFinite(start)) return NaN;
  let d = start;
  let n = 0;
  const free = Math.floor(nz(freeDays));
  while (n < free) {
    d++;
    if (countWeekends || !isWeekend(d)) n++;
  }
  return d;
}

// Per-container charge for `days` chargeable days: tier 1, then tier 2, then tier 3 forever.
export function tiered(days, d1, r1, d2, r2, r3) {
  const n = nz(days);
  const a = Math.min(n, nz(d1));
  const b = Math.min(Math.max(n - nz(d1), 0), nz(d2));
  const c = Math.max(n - nz(d1) - nz(d2), 0);
  return a * nz(r1) + b * nz(r2) + c * nz(r3);
}

// The rate the next chargeable day (day chargeable + 1) would be billed at.
export function nextDayRate(chargeable, d1, r1, d2, r2, r3) {
  const k = nz(chargeable) + 1;
  if (k <= nz(d1)) return nz(r1);
  if (k <= nz(d1) + nz(d2)) return nz(r2);
  return nz(r3);
}

function clock(o, kind, start, end) {
  const p = kind === "dem" ? "dem" : "det";
  const countWeekends = Number(o[p + "CountWeekends"]) !== 0;
  const counted = countDays(start, end, countWeekends);
  const free = Math.floor(nz(o[p + "Free"])) + Math.floor(nz(o[p + "Exempt"]));
  const chargeable = Math.max(0, counted - free);
  const args = [o[p + "1Days"], o[p + "1Rate"], o[p + "2Days"], o[p + "2Rate"], o[p + "3Rate"]];
  const perContainer = tiered(chargeable, ...args);
  return {
    counted,
    free,
    chargeable,
    perContainer,
    total: perContainer * Math.max(1, Math.floor(nz(o.containers))),
    nextDay: nextDayRate(chargeable, ...args) * Math.max(1, Math.floor(nz(o.containers))),
    lastFree: lastFreeDay(start, nz(o[p + "Free"]) + nz(o[p + "Exempt"]), countWeekends),
  };
}

export function datesOf(o) {
  return { discharge: parseDay(o.dischargeDate), pickup: parseDay(o.pickupDate), ret: parseDay(o.returnDate) };
}

// Demurrage runs discharge -> pickup, detention runs pickup -> empty return.
export function compare(o) {
  const { discharge, pickup, ret } = datesOf(o);
  const dem = clock(o, "dem", discharge, pickup);
  const det = clock(o, "det", pickup, ret);
  return { dem, det, total: dem.total + det.total, dates: { discharge, pickup, ret } };
}

// The same bill with pickup moved by `pickupShift` days and the empty return by `returnShift`.
export function totalWithShift(o, pickupShift, returnShift) {
  const { discharge, pickup, ret } = datesOf(o);
  return clock(o, "dem", discharge, pickup + pickupShift).total + clock(o, "det", pickup + pickupShift, ret + returnShift).total;
}

// Grid of the total bill: pickup earlier/later (rows) x empty returned earlier/later (columns).
export function sensitivity(o, shifts = [-4, -2, 0, 2, 4]) {
  return shifts.map((p) => ({ shift: p, cells: shifts.map((r) => ({ shift: r, total: totalWithShift(o, p, r) })) }));
}

// What does pulling the whole chain (pickup AND return) forward N days save? The empty goes back
// N days sooner too, so only the port-side clock changes. This is the ceiling on a rush fee
// (earlier trucker slot, expedited drayage, appointment fee) that is worth paying.
export function rushTable(o, maxDays = 5) {
  const base = compare(o);
  const boxes = Math.max(1, Math.floor(nz(o.containers)));
  const rows = [];
  for (let n = 1; n <= maxDays; n++) {
    const saving = base.total - totalWithShift(o, -n, -n);
    rows.push({ days: n, saving, perContainer: saving / boxes });
  }
  return rows;
}
