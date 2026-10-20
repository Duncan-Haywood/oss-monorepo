// Canada TFSA room and over-contribution check: how much room is left, and what does an excess cost per month?
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled: room accrues from the later of 2009,
// the year you turned 18 and the year you became a Canadian resident; withdrawals are added back to room on 1 January of the
// NEXT year, not the same year; an excess is taxed at 1% of the highest excess amount in each month it exists.
// The CRA's published buffer language for small excesses is NOT applied, so a small excess may be overstated. Every result names its source.

export const VERIFY = "CRA 'TFSA contribution room', 'Tax-Free Savings Account (TFSA), Guide for Individuals' (RC4466) and 'Overcontributions to a TFSA'; Income Tax Act Part XI.01 (s 207.01 to 207.07)";
export const LIMITS = { 2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500, 2014: 5500, 2015: 10000, 2016: 5500, 2017: 5500, 2018: 5500, 2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000, 2023: 6500, 2024: 7000, 2025: 7000, 2026: 7000 };
export const FIRST_YEAR = 2009;
export const LAST_YEAR = 2026;
export const PENALTY_RATE = 0.01;
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const money = (n) => (n < 0 ? "-CAD " : "CAD ") + Math.abs(Math.round(n * 100) / 100).toLocaleString("en-CA");
const round2 = (n) => Math.round(n * 100) / 100;
const blank = (v) => v === undefined || v === null || v === "";

function amount(i, key, label, errors) {
  if (blank(i[key])) return 0;
  const n = Number(i[key]);
  if (!Number.isFinite(n) || n < 0) { errors.push(`Enter an amount of zero or more for ${label}, or leave it blank.`); return 0; }
  return n;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const year = Number(i.year);
  if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) errors.push(`Enter a year from ${FIRST_YEAR} to ${LAST_YEAR}; this tool only holds annual limits through ${LAST_YEAR}.`);
  const birthYear = Number(i.birthYear);
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2100) errors.push("Enter your year of birth, such as 1990.");
  let residentFrom = null;
  if (!blank(i.residentFrom)) {
    residentFrom = Number(i.residentFrom);
    if (!Number.isInteger(residentFrom) || residentFrom < 1900 || residentFrom > 2100) { errors.push("Enter the year you became a Canadian resident, or leave it blank if you have lived in Canada throughout."); residentFrom = null; }
  }
  const month = Number(i.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push("Pick the month you made, or plan to make, the contribution (1 to 12).");
  const contribPrior = amount(i, "contribPrior", "contributions before this year", errors);
  const withdrawPrior = amount(i, "withdrawPrior", "withdrawals before this year", errors);
  const contribYtd = amount(i, "contribYtd", "contributions so far this year", errors);
  const withdrawYtd = amount(i, "withdrawYtd", "withdrawals so far this year", errors);
  const planned = amount(i, "planned", "the contribution you are planning", errors);
  return { errors, year, birthYear, residentFrom, month, contribPrior, withdrawPrior, contribYtd, withdrawYtd, planned };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const turned18 = p.birthYear + 18;
  const startYear = Math.max(FIRST_YEAR, turned18, p.residentFrom ?? 0);
  if (startYear > p.year) return { errors: [`You earn no room in ${p.year}: room starts in ${startYear} (the later of 2009, the year you turn 18 and the year you became a resident).`] };

  const rows = [];
  let cumulative = 0;
  for (let y = startYear; y <= p.year; y++) { cumulative += LIMITS[y]; rows.push({ year: y, limit: LIMITS[y], cumulative }); }

  const roomJan1 = cumulative - p.contribPrior + p.withdrawPrior;
  const roomNow = roomJan1 - p.contribYtd;
  const roomAfter = roomNow - p.planned;
  const excessBefore = Math.max(0, -roomNow);
  const excessAfter = Math.max(0, -roomAfter);
  const monthly = round2(excessAfter * PENALTY_RATE);
  const monthsLeft = 13 - p.month;
  const toYearEnd = round2(monthly * monthsLeft);
  const safeNow = Math.max(0, roomNow);
  const findings = [];

  if (excessAfter > 0) {
    findings.push({ severity: "high", title: `After this contribution you would be over your TFSA room by ${money(excessAfter)}. The CRA taxes the highest excess in each month at 1%: ${money(monthly)} a month, ${money(toYearEnd)} if it stays through December (${monthsLeft} month${monthsLeft === 1 ? "" : "s"} counting ${MONTH_NAMES[p.month - 1]}).` });
    if (excessBefore > 0) findings.push({ severity: "high", title: `Your room was already used up before this contribution: you are ${money(excessBefore)} over on the figures entered. Withdraw the excess; the tax runs every month until you do or new room covers it.` });
    else findings.push({ severity: "medium", title: `You can contribute up to ${money(safeNow)} without going over. Putting in ${money(p.planned)} leaves ${money(excessAfter)} over.` });
    findings.push({ severity: "medium", title: "A withdrawal in the same month does not remove that month's tax: it is charged on the highest excess in the month. Withdraw in a month before the excess appears, or avoid it." });
  } else {
    findings.push({ severity: "info", title: `Within your room: ${money(roomAfter)} left for ${p.year} after the planned contribution (${money(roomNow)} before it).` });
    if (roomAfter < 0.1 * (LIMITS[p.year])) findings.push({ severity: "medium", title: "Almost nothing left. Check the CRA's My Account figure before adding more; it reflects deposits and withdrawals at every institution." });
  }
  if (p.withdrawYtd > 0) findings.push({ severity: "info", title: `Your ${money(p.withdrawYtd)} of withdrawals this year do not give room back until 1 January ${p.year + 1}, when they are added to that year's new annual limit.` });
  findings.push({ severity: "info", title: "Room is counted across all your TFSAs at every institution together. Direct transfers between TFSAs and certain other cases are not contributions; this tool does not model them." });
  findings.push({ severity: "info", title: "Room only accrues while you are a Canadian resident. Time as a non-resident, and any contributions made while one, can change the figures; this tool does not decide that." });

  return { errors: [], startYear, rows, cumulative, roomJan1, roomNow, roomAfter, excessBefore, excessAfter, monthly, monthsLeft, toYearEnd, safeNow, month: p.month, year: p.year, planned: p.planned, withdrawYtd: p.withdrawYtd, findings };
}

export const SAMPLE = { year: 2026, birthYear: 1990, residentFrom: "", contribPrior: 98000, withdrawPrior: 12000, contribYtd: 3000, withdrawYtd: 0, planned: 12000, month: 4 };

export function summaryText(r) {
  const L = [`Canada TFSA room check, ${r.year}`, ""];
  for (const x of r.rows) L.push(`${x.year}: limit ${money(x.limit)}, cumulative ${money(x.cumulative)}`);
  L.push("", `Room on 1 January ${r.year}: ${money(r.roomJan1)}`, `Room now (after contributions so far): ${money(r.roomNow)}`, `Room after planned contribution: ${money(r.roomAfter)}`);
  if (r.excessAfter > 0) L.push(`Over by: ${money(r.excessAfter)}`, `Estimated tax: ${money(r.monthly)} a month, ${money(r.toYearEnd)} to December`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
