// Deductions the bank feed cannot see: business miles and a home office.
//
// Books keep `books.mileage` ([{ id, date, miles, purpose, from?, to? }]) and
// `books.homeOffice` ({ sqft, from?, to? } with optional YYYY-MM-DD bounds). Neither is a
// journal entry: they feed the Schedule C worksheet (line 9 and line 30) and nothing else,
// so the ledger stays what the bank saw. Pure functions except the add/set ones, which
// return new books.
//
// Standard mileage rates in tenths of a cent per mile: 2024 67.0, 2025 70.0 (IRS notices),
// 2026 72.5 (Notice 2026-10), raised to 76.0 for travel on or after 2026-07-01 (Announcement
// 2026-11, 2026-29 I.R.B.; confirmed from several secondary sources, irs.gov itself was not
// reachable from the build sandbox). A year with dated steps is priced trip by trip.
// Pass `rate` to override (one flat rate for the whole year). Home office is the simplified method: $5 a square foot, up to 300
// square feet ($1,500 a year), prorated by the months used, and never more than the
// business profit before it (no loss, no carryover). Whether a space qualifies (regular and
// exclusive business use) is for you or your preparer.

import { parseDate } from "./bank.mjs";

export const MILEAGE_RATES = { 2024: 670, 2025: 700, 2026: 725 };
// Mid-year changes: trips dated on or after `from` use `rate` instead of the year's opening rate.
export const MILEAGE_STEPS = { 2026: [{ from: "2026-07-01", rate: 760 }] };
const rateOn = (year, date) => (MILEAGE_STEPS[year] ?? []).filter((x) => date >= x.from).at(-1)?.rate ?? MILEAGE_RATES[year];
export const HOME_RATE_CENTS = 500, HOME_MAX_SQFT = 300;

export function addTrip(books, { date, miles, purpose, from = "", to = "" }) {
  const d = parseDate(date);
  if (!d) throw new Error("trip needs a date, e.g. --date 2026-03-14");
  const m = Number(miles);
  if (!(m > 0) || m > 5000) throw new Error("miles must be more than 0 and at most 5000 for one trip");
  if (!purpose || !String(purpose).trim()) throw new Error("a business purpose is needed; the IRS asks for one with the miles");
  const list = books.mileage ?? [];
  const n = list.reduce((a, t) => Math.max(a, +t.id.slice(3) || 0), 0) + 1;
  const trip = { id: `MI-${n}`, date: d, miles: Math.round(m * 10) / 10, purpose: String(purpose).trim(), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  return { books: { ...books, mileage: [...list, trip] }, trip };
}

export function removeTrip(books, id) {
  if (!(books.mileage ?? []).some((t) => t.id === id)) throw new Error(`no trip ${id}`);
  return { ...books, mileage: books.mileage.filter((t) => t.id !== id) };
}

export function setHomeOffice(books, { sqft, from = null, to = null }) {
  const s = Number(sqft);
  if (s === 0) { const { homeOffice, ...rest } = books; return rest; }
  if (!(s > 0) || s > 100000) throw new Error("square feet must be a positive number, or 0 to remove");
  return { ...books, homeOffice: { sqft: s, ...(from ? { from: parseDate(from) } : {}), ...(to ? { to: parseDate(to) } : {}) } };
}

export function mileageDeduction(books, year, { rate } = {}) {
  const r = rate ?? MILEAGE_RATES[year];
  const trips = (books.mileage ?? []).filter((t) => t.date.startsWith(`${year}-`));
  const miles = Math.round(trips.reduce((a, t) => a + t.miles, 0) * 10) / 10;
  const warnings = [];
  if (!trips.length) return { year, trips, miles: 0, rate: r ?? null, cents: 0, warnings };
  if (r === undefined) { warnings.push(`No standard mileage rate on file for ${year}; pass one (tenths of a cent per mile).`); return { year, trips, miles, rate: null, cents: 0, warnings }; }
  if (!MILEAGE_RATES[year]) warnings.push(`The ${year} rate is not checked against irs.gov. Confirm it before you rely on this.`);
  if (rate === undefined && MILEAGE_STEPS[year]) {
    const by = new Map();
    for (const t of trips) { const x = rateOn(year, t.date); by.set(x, (by.get(x) ?? 0) + t.miles); }
    const segments = [...by].sort((a, b) => a[0] - b[0]).map(([rt, mi]) => ({ rate: rt, miles: Math.round(mi * 10) / 10, cents: Math.round((mi * rt) / 10) }));
    const cents = segments.reduce((a, x) => a + x.cents, 0);
    if (segments.length > 1) {
      warnings.push(`${year} has two IRS rates; each trip is priced at the rate for its date (${segments.map((x) => `${x.miles} miles at ${x.rate / 10} cents`).join(", ")}).`);
      return { year, trips, miles, rate: Math.round((cents * 10) / miles), cents, segments, label: segments.map((x) => `${x.miles} at ${x.rate / 10} cents`).join(", "), warnings };
    }
    const only = segments[0].rate;
    return { year, trips, miles, rate: only, cents, segments, label: `${miles} at ${only / 10} cents`, warnings };
  }
  return { year, trips, miles, rate: r, cents: Math.round((miles * r) / 10), label: `${miles} at ${r / 10} cents`, warnings };
}

const monthsUsed = (ho, year) => {
  const lo = ho.from && ho.from > `${year}-01-01` ? ho.from : `${year}-01-01`, hi = ho.to && ho.to < `${year}-12-31` ? ho.to : `${year}-12-31`;
  if (lo > hi) return 0;
  // a month counts when the space was in use for any of it: the IRS averages monthly
  return (+hi.slice(5, 7) - +lo.slice(5, 7)) + 1;
};

// profit: business profit before the home office (cents), the cap. Null skips the cap.
export function homeOfficeDeduction(books, year, { profit = null } = {}) {
  const ho = books.homeOffice;
  const warnings = [];
  if (!ho) return { year, sqft: 0, months: 0, cents: 0, capped: false, warnings };
  const months = monthsUsed(ho, year);
  const sqft = Math.min(ho.sqft, HOME_MAX_SQFT);
  if (ho.sqft > HOME_MAX_SQFT) warnings.push(`Only the first ${HOME_MAX_SQFT} square feet count under the simplified method; ${ho.sqft} entered.`);
  const full = Math.round((sqft * HOME_RATE_CENTS * months) / 12);
  const limit = profit === null ? full : Math.max(0, profit);
  const cents = Math.min(full, limit);
  if (cents < full) warnings.push("The home office deduction is limited to business profit and does not create a loss; the rest is not carried forward under the simplified method.");
  return { year, sqft, months, cents, uncapped: full, capped: cents < full, warnings };
}

// Both for a calendar year, for scheduleC's `extras`.
export function deductionExtras(books, year, { profit = null, rate } = {}) {
  const mileage = mileageDeduction(books, year, { rate });
  const home = homeOfficeDeduction(books, year, { profit });
  return { year, mileage, home, warnings: [...mileage.warnings, ...home.warnings] };
}
