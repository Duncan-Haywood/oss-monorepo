// Medicaid look-back penalty worksheet. Pure functions, no network, no DOM.
// Federal rule (Deficit Reduction Act of 2005): transfers for less than fair market value inside the look-back
// window (60 months in most states) create a penalty period of ineligibility for nursing-home Medicaid, equal to the
// uncompensated amount divided by the state's "penalty divisor" (average monthly private-pay nursing-home cost). The
// divisor, the window, partial-month handling and the exemptions are state-specific, so every one is an input.

export const EXEMPT_WORDS = /\b(exempt|spouse|wife|husband|disabled|blind|caregiver|care\s*giver|sibling|trust)\b/i;

export const SAMPLE = {
  applicationDate: "2026-10-01",
  lookbackMonths: 60,
  divisor: 10500,
  monthlyCost: 11500,
  monthlyIncome: 2800,
  partialMonths: "yes",
  returned: 0,
  gifts: [
    "2020-12-01, 25000, niece",
    "2022-06-10, 20000, grandson tuition",
    "2023-01-20, 150000, spouse, exempt",
    "2024-03-15, 45000, daughter",
    "2025-11-02, 30000, son",
  ].join("\n"),
};

export const dollars = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

const num = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  return Number(String(v).replace(/[$,\s]/g, ""));
};

export function parseDate(text) {
  const s = String(text ?? "").trim();
  let y, m, d;
  let t = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (t) [y, m, d] = [t[1], t[2], t[3]];
  else if ((t = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [t[1], t[2], t[3]];
  else return null;
  y = +y; m = +m; d = +d;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export const iso = (dt) => dt.toISOString().slice(0, 10);

export function addMonths(dt, n) {
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + n, d = dt.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last)));
}

export const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);

export function parseGifts(text) {
  const gifts = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(",").map((p) => p.trim());
    const date = parseDate(parts[0]);
    const amount = num(parts[1]);
    if (!date) return errors.push(`Gift line ${i + 1}: the date "${parts[0]}" is not YYYY-MM-DD or M/D/YYYY.`);
    if (!Number.isFinite(amount) || amount <= 0) return errors.push(`Gift line ${i + 1}: the amount "${parts[1] ?? ""}" is not a positive number.`);
    const note = parts.slice(2).join(", ");
    gifts.push({ line: i + 1, date, amount, note, exempt: EXEMPT_WORDS.test(note) });
  });
  return { gifts, errors };
}

export function parse(raw) {
  const errors = [];
  const applicationDate = parseDate(raw.applicationDate);
  if (!applicationDate) errors.push("Enter the date the person applied and would otherwise qualify (YYYY-MM-DD).");
  const lookbackMonths = num(raw.lookbackMonths);
  if (!(Number.isInteger(lookbackMonths) && lookbackMonths >= 1 && lookbackMonths <= 120)) errors.push("The look-back window must be whole number between 1 and 120 months (most states use 60).");
  const divisor = num(raw.divisor);
  if (!(Number.isFinite(divisor) && divisor > 0)) errors.push("Enter your state's penalty divisor (the monthly figure the state uses), more than zero.");
  const monthlyCost = raw.monthlyCost === "" || raw.monthlyCost == null ? divisor : num(raw.monthlyCost);
  if (!(Number.isFinite(monthlyCost) && monthlyCost >= 0)) errors.push("Monthly cost of care must be zero or more.");
  const monthlyIncome = raw.monthlyIncome === "" || raw.monthlyIncome == null ? 0 : num(raw.monthlyIncome);
  if (!(Number.isFinite(monthlyIncome) && monthlyIncome >= 0)) errors.push("Monthly income must be zero or more.");
  const returned = raw.returned === "" || raw.returned == null ? 0 : num(raw.returned);
  if (!(Number.isFinite(returned) && returned >= 0)) errors.push("Amount returned must be zero or more.");
  const g = parseGifts(raw.gifts);
  errors.push(...g.errors);
  if (!g.gifts.length && !g.errors.length) errors.push("Add at least one gift or transfer, one per line: date, amount, who or what.");
  if (applicationDate) for (const x of g.gifts) if (x.date > applicationDate) errors.push(`Gift line ${x.line} is dated after the application date.`);
  return {
    errors,
    input: { applicationDate, lookbackMonths, divisor, monthlyCost, monthlyIncome, partialMonths: raw.partialMonths !== "no", returned, gifts: g.gifts },
  };
}

function penaltyFor(total, divisor, partial) {
  const months = total / divisor;
  const whole = Math.floor(months + 1e-9);
  const days = partial ? Math.floor((months - whole) * 30 + 1e-9) : 0;
  return { months, whole, days };
}

export function scenario(input, appDate = input.applicationDate) {
  const start = addMonths(appDate, -input.lookbackMonths);
  const rows = input.gifts.map((x) => {
    const inWindow = x.date >= start && x.date <= appDate;
    const counts = inWindow && !x.exempt;
    return { ...x, inWindow, counts, agesOut: addMonths(x.date, input.lookbackMonths) };
  });
  const gross = rows.filter((r) => r.counts).reduce((a, r) => a + r.amount, 0);
  const total = Math.max(0, gross - input.returned);
  const p = penaltyFor(total, input.divisor, input.partialMonths);
  const end = addDays(addMonths(appDate, p.whole), p.days);
  return { start, rows, gross, total, ...p, penaltyStart: appDate, penaltyEnd: end };
}

export function compute(raw) {
  const { errors, input } = parse(raw);
  if (errors.length) return { errors, findings: [], s: null, sweep: [] };
  const s = scenario(input);
  const monthsOfPenalty = s.whole + s.days / 30;
  const gap = Math.max(0, input.monthlyCost - input.monthlyIncome) * monthsOfPenalty;
  const grossCare = input.monthlyCost * monthsOfPenalty;
  const sweep = [0, 6, 12, 24, 36, 48, 60].map((k) => {
    const d = addMonths(input.applicationDate, k);
    const sc = scenario(input, d);
    return { months: k, date: d, counted: sc.total, penaltyMonths: sc.months };
  });
  const countable = s.rows.filter((r) => r.counts);
  const lastAge = countable.length ? new Date(Math.max(...countable.map((r) => r.agesOut.getTime()))) : null;

  const findings = [];
  if (s.total > 0) findings.push({ severity: "high", title: `${dollars(s.total)} of transfers count, which is a penalty of about ${s.whole} month(s)${s.days ? ` and ${s.days} day(s)` : ""} without Medicaid nursing-home coverage from ${iso(s.penaltyStart)}.` });
  else findings.push({ severity: "info", title: "Nothing in the window counts, on these figures. That depends on every transfer being listed and every exemption being provable." });
  if (s.rows.some((r) => r.exempt && r.inWindow)) findings.push({ severity: "medium", title: "Some transfers are marked exempt (spouse, disabled child, caregiver child and similar). The state decides whether each one qualifies; keep the paperwork that proves it." });
  const near = s.rows.filter((r) => !r.inWindow && r.date < s.start && addMonths(r.date, input.lookbackMonths + 6) >= input.applicationDate);
  if (near.length) findings.push({ severity: "medium", title: `${near.length} transfer(s) fall just outside the window (within six months of the edge). A different application date or a longer state window would bring them in.` });
  if (input.returned > 0 && s.gross > 0) findings.push({ severity: "info", title: `Returning ${dollars(Math.min(input.returned, s.gross))} reduces the penalty by about ${(Math.min(input.returned, s.gross) / input.divisor).toFixed(1)} month(s). States differ on whether a partial return is accepted.` });
  else if (s.total > 0) findings.push({ severity: "info", title: "Returning transferred money can shorten or cancel a penalty in many states. Enter the amount returned to see the effect." });
  if (s.total > 0 && gap > 0) findings.push({ severity: "high", title: `The penalty months need about ${dollars(gap)} from other money after income (${dollars(grossCare)} of care at ${dollars(input.monthlyCost)} a month).` });
  if (input.lookbackMonths !== 60) findings.push({ severity: "info", title: `A ${input.lookbackMonths}-month window is in use; the federal default is 60. Confirm it for your state.` });

  return { errors: [], input, s, gap, grossCare, sweep, lastAge, findings };
}

export function summaryText(r) {
  const { s, input } = r;
  const L = [];
  L.push("MEDICAID LOOK-BACK PENALTY WORKSHEET (arithmetic on the figures entered; not legal advice)");
  L.push(`Application / otherwise-eligible date: ${iso(input.applicationDate)}`);
  L.push(`Look-back window: ${input.lookbackMonths} months, from ${iso(s.start)}`);
  L.push(`Penalty divisor: ${dollars(input.divisor)} a month; partial months ${input.partialMonths ? "counted" : "not counted"}`);
  L.push("");
  for (const x of s.rows) L.push(`${iso(x.date)}  ${dollars(x.amount).padStart(10)}  ${x.counts ? "COUNTS    " : x.exempt && x.inWindow ? "exempt?   " : "outside   "} ${x.note}`);
  L.push("");
  L.push(`Countable transfers: ${dollars(s.gross)}${input.returned ? `, less ${dollars(input.returned)} returned = ${dollars(s.total)}` : ""}`);
  L.push(`Penalty: ${s.months.toFixed(2)} months (${s.whole} month(s)${s.days ? ` + ${s.days} day(s)` : ""}), ${iso(s.penaltyStart)} to ${iso(s.penaltyEnd)}`);
  L.push(`Care cost over the penalty at ${dollars(input.monthlyCost)} a month: ${dollars(r.grossCare)}; after ${dollars(input.monthlyIncome)} income: ${dollars(r.gap)}`);
  if (r.lastAge) L.push(`The last countable transfer leaves the window on ${iso(r.lastAge)}.`);
  L.push("");
  L.push("Not decided here: the state's divisor, window and exemptions; whether a transfer was for fair value; trusts, annuities, the home, income-only states; the decision to apply.");
  return L.join("\n");
}

export function sweepCsv(r) {
  const out = ["application_date,months_later,countable_transfers,penalty_months"];
  for (const x of r.sweep) out.push(`${iso(x.date)},${x.months},${Math.round(x.counted)},${x.penaltyMonths.toFixed(2)}`);
  return out.join("\n");
}
