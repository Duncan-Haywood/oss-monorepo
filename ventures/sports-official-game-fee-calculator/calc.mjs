// Sports-official (referee / umpire) game-fee arithmetic. One "trip" = one drive to a site and back, working n games there.
// Cash view: fees minus assignor cut, real driving cost and trip expenses. Tax view: the IRS standard mileage deduction
// (a different, usually larger, rate than what driving really costs you) and self-employment tax on the profit.

const num = (v, fallback = NaN) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const usd = (n) => (n < 0 ? "-" : "") + "$" + (Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ceilCent = (n) => Math.ceil(n * 100 - 1e-9) / 100;
export const SE_RATE = 0.153;
export const SE_BASE = 0.9235;

export function validate(input) {
  const v = {
    fee: num(input.fee), assignorPct: num(input.assignorPct, 0) / 100, gamesPerTrip: Math.round(num(input.gamesPerTrip, 1)),
    miles: num(input.miles, 0), mph: num(input.mph, 35), costPerMile: num(input.costPerMile, 0), irsRate: num(input.irsRate, 0),
    tripExpense: num(input.tripExpense, 0), hoursFirst: num(input.hoursFirst), hoursExtra: num(input.hoursExtra, 0),
    games: Math.round(num(input.games, 0)), annualCosts: num(input.annualCosts, 0), taxPct: num(input.taxPct, 0) / 100,
    targetHourly: num(input.targetHourly, 0), targetTakeHome: num(input.targetTakeHome, 0),
  };
  if (!(v.fee > 0 && v.fee <= 5000)) return { error: "Enter the fee you are paid per game ($1–$5,000)." };
  if (!(v.assignorPct >= 0 && v.assignorPct < 0.5)) return { error: "Assignor or booking fee should be 0–49% of the game fee." };
  if (!(v.gamesPerTrip >= 1 && v.gamesPerTrip <= 12)) return { error: "Games worked per trip should be 1–12." };
  if (!(v.hoursFirst > 0 && v.hoursFirst <= 24)) return { error: "Enter hours on site for the first game, arrival to departure (more than 0)." };
  if (!(v.mph >= 5 && v.mph <= 80)) return { error: "Average driving speed should be 5–80 mph." };
  if (!(v.games >= 1 && v.games <= 2000)) return { error: "Enter how many games you work in a season (1–2,000)." };
  if (!(v.taxPct >= 0 && v.taxPct < 0.6)) return { error: "Income tax rate should be 0–59%." };
  for (const k of ["miles", "costPerMile", "irsRate", "tripExpense", "hoursExtra", "annualCosts", "targetHourly", "targetTakeHome"]) {
    if (!(v[k] >= 0)) return { error: "Distances, costs and targets cannot be negative." };
  }
  return v;
}

// One trip working `n` games at `miles` round-trip.
export function trip(v, n = v.gamesPerTrip, miles = v.miles) {
  const gross = n * v.fee;
  const assignor = gross * v.assignorPct;
  const driving = miles * v.costPerMile;
  const net = gross - assignor - driving - v.tripExpense;
  const driveHours = miles / v.mph;
  const hours = v.hoursFirst + (n - 1) * v.hoursExtra + driveHours;
  return { n, miles, gross, assignor, driving, expense: v.tripExpense, net, driveHours, hours, hourly: net / hours, perGame: net / n };
}

// Full-year view. Games are worked n per trip; a final partial trip is rounded up.
export function season(v, games = v.games) {
  const t = trip(v);
  const trips = Math.ceil(games / v.gamesPerTrip - 1e-9);
  const worked = Math.min(games, trips * v.gamesPerTrip);
  const gross = games * v.fee;
  const assignor = gross * v.assignorPct;
  const driving = trips * t.miles * v.costPerMile;
  const expenses = trips * v.tripExpense;
  const cashBeforeTax = gross - assignor - driving - expenses - v.annualCosts;
  const mileageDeduction = trips * t.miles * v.irsRate;
  const profit = gross - assignor - mileageDeduction - expenses - v.annualCosts;
  const se = Math.max(0, profit) * SE_BASE * SE_RATE;
  const incomeTax = Math.max(0, profit - se / 2) * v.taxPct;
  const takeHome = cashBeforeTax - se - incomeTax;
  const hours = trips * t.hours;
  return { games, worked, trips, gross, assignor, driving, expenses, annualCosts: v.annualCosts, cashBeforeTax, mileageDeduction, profit, se, incomeTax, takeHome, hours, takeHomeHourly: hours > 0 ? takeHome / hours : 0 };
}

// Smallest season game count that reaches the take-home target, or null within the 2,000-game cap.
export function gamesForTarget(v, target) {
  if (!(target > 0)) return null;
  if (season(v, 2000).takeHome < target) return null;
  let lo = 1, hi = 2000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (season(v, mid).takeHome >= target) hi = mid; else lo = mid + 1;
  }
  let g = lo;
  while (g > 1 && season(v, g - 1).takeHome >= target) g--;
  return g;
}

// Lowest per-game fee that clears `targetHourly` on one trip like this one.
export function minFee(v, targetHourly = v.targetHourly) {
  const t = trip(v);
  return (targetHourly * t.hours + t.driving + v.tripExpense) / (v.gamesPerTrip * (1 - v.assignorPct));
}

export const MILES = [5, 10, 20, 30, 45, 60, 80];

export function plan(input) {
  const v = validate(input);
  if (v.error) return v;
  const t = trip(v);
  const s = season(v);
  const byDistance = [...new Set([...MILES, v.miles])].sort((a, b) => a - b).map((m) => ({ miles: m, ...trip(v, v.gamesPerTrip, m), isYours: m === v.miles }));
  const byGames = [1, 2, 3, 4].map((n) => ({ ...trip(v, n), isYours: n === v.gamesPerTrip }));
  const out = { input: v, trip: t, season: s, byDistance, byGames, minFee: v.targetHourly > 0 ? ceilCent(minFee(v)) : null, advice: [] };
  if (v.targetTakeHome > 0) out.gamesNeeded = gamesForTarget(v, v.targetTakeHome);
  const best = byGames[3];
  if (v.gamesPerTrip === 1 && best.hourly > t.hourly * 1.15) out.advice.push(`Working 4 games per trip instead of 1 lifts your pay from ${usd(t.hourly)} to ${usd(best.hourly)} an hour, because the drive and setup are paid once. Ask your assignor for doubleheaders and tournaments.`);
  if (t.driving > 0 && t.driving / (t.gross - t.assignor) > 0.25) out.advice.push(`Driving takes ${(t.driving / (t.gross - t.assignor) * 100).toFixed(0)}% of what you keep from this trip. Check the distance ladder for the farthest site that still pays your target.`);
  if (t.hourly < 0) out.advice.push("This trip loses money after the drive. Do not take it at this fee.");
  if (v.targetHourly > 0) out.advice.push(t.hourly >= v.targetHourly
    ? `This trip pays ${usd(t.hourly)} an hour, above your ${usd(v.targetHourly)} target.`
    : `This trip pays ${usd(t.hourly)} an hour, below your ${usd(v.targetHourly)} target. You would need ${usd(out.minFee)} a game to reach it.`);
  if (s.mileageDeduction > s.driving + 0.005) out.advice.push(`The mileage deduction (${usd(s.mileageDeduction)}) is larger than what driving cost you (${usd(s.driving)}), so it shields ${usd(s.mileageDeduction - s.driving)} of fee income from tax. Keep a mileage log.`);
  if (out.gamesNeeded) out.advice.push(`To take home ${usd(v.targetTakeHome)} after tax you need about ${out.gamesNeeded} games a season at this setup.`);
  else if (v.targetTakeHome > 0) out.advice.push(`No season of up to 2,000 games takes home ${usd(v.targetTakeHome)} at this fee and distance.`);
  return out;
}

export function sampleInput() {
  return { fee: 55, assignorPct: 8, gamesPerTrip: 1, miles: 30, mph: 35, costPerMile: 0.45, irsRate: 0.7, tripExpense: 0, hoursFirst: 2.5, hoursExtra: 1.5,
    games: 60, annualCosts: 250, taxPct: 12, targetHourly: 25, targetTakeHome: 3000 };
}

export function toCsv(r) {
  const rows = [["round_trip_miles", "net_per_trip", "hours", "pay_per_hour"]];
  for (const l of r.byDistance) rows.push([l.miles, l.net.toFixed(2), l.hours.toFixed(2), l.hourly.toFixed(2)]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
