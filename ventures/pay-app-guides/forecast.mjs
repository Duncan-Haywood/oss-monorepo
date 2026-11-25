// When will I get paid? A cash-in forecast from pay applications, for a subcontractor with several
// jobs. Two inputs: the jobs (what each bills a month, its retainage, the GC's pay-app cutoff day and
// how long the owner and then the GC take to pay) and the applications already sent and not yet paid.
// Out: the date each payment should arrive, which are already late, receipts week by week, and, if
// the user enters cash on hand and weekly spending, the first week the bank balance goes negative.
//
// Pure functions, no I/O. Money is integer cents; dates are whole UTC days (colog.mjs helpers).
// Every day count comes from the user's subcontract or experience. The only law the module touches is
// the prompt-payment day count in calc.mjs's PROMPT_PAY table, shown for comparison, never applied.
import { parseCsv, parseMoney, parseDate, dayText, dollars, csvCell } from "./colog.mjs";
import { PROMPT_PAY } from "./calc.mjs";

export { dollars, dayText };

const JOB_HEADERS = {
  job: /^(job|job name|project|project name|job #|job no\.?|job number|name)$/,
  gc: /^(gc|general contractor|customer|client|contractor|billed to|paid by)$/,
  monthly: /^(monthly billing|monthly|billing|bill per month|per month|monthly amount|amount per month|expected billing|avg billing|average billing)$/,
  retainage: /^(retainage|retainage %|retainage rate|retention|retention %|ret %|ret)$/,
  submit: /^(submit day|cutoff|cutoff day|pay app due|pay app day|due day|submit by|submit by day|billing day|day)$/,
  owner: /^(owner days|owner pays in|owner pays|days to owner payment|owner terms|owner)$/,
  gcDays: /^(gc days|gc pays in|gc pays|gc terms|days after owner|pass through|pass-through days|sub days)$/,
  months: /^(months left|months|months remaining|remaining months|billings left)$/,
  state: /^(state|st)$/,
};
const APP_HEADERS = {
  job: JOB_HEADERS.job,
  app: /^(app|app #|app no\.?|application|application #|application no\.?|pay app|pay app #|number|#|no\.?)$/,
  due: /^(amount due|due|current payment due|line 8|amount|billed|net due|payment due)$/,
  submitted: /^(submitted|date submitted|sent|date sent|submission date|date)$/,
  received: /^(received|paid|paid so far|amount received|amount paid|payments)$/,
};

function mapHeaders(row, spec) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(spec)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

// "30", "30 days", "net 30" -> 30; blank -> undefined; anything else -> null.
const wholeDays = (raw, max = 365) => {
  const t = String(raw ?? "").trim().replace(/\s*days?$/i, "").replace(/^net\s*/i, "");
  if (t === "") return undefined;
  return /^\d+$/.test(t) && +t <= max ? +t : null;
};
const percent = (raw) => {
  const t = String(raw ?? "").trim().replace(/%$/, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : null;
};

// Day number of the given day-of-month in the month containing `day`, clamped to the month's end
// (a cutoff of 31 in February is the 28th or 29th).
function dayInMonth(year, month, dom) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(year, month, Math.min(dom, last)) / 86400000);
}

/** Parse the jobs table. Returns { jobs, errors }. */
export function parseJobs(text) {
  const out = { jobs: [], errors: [] };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Jobs: paste a header row and at least one job."); return out; }
  const idx = mapHeaders(grid[0], JOB_HEADERS);
  if (idx.job == null) { out.errors.push("Jobs: no job column. Name a column 'Job'."); return out; }
  for (const [k, name] of [["monthly", "Monthly billing"], ["submit", "Submit day"], ["owner", "Owner days"]]) {
    if (idx[k] == null) { out.errors.push(`Jobs: no '${name}' column.`); return out; }
  }
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    if (row.every((c) => String(c).trim() === "")) continue;
    const job = get("job") || `Row ${r + 1}`, where = `Jobs row ${r + 1} (${job})`;
    const monthly = parseMoney(get("monthly"));
    if (monthly == null || monthly < 0) { out.errors.push(`${where}: monthly billing is not a positive dollar figure.`); continue; }
    const retainage = percent(get("retainage"));
    if (retainage == null) { out.errors.push(`${where}: retainage must be a percent from 0 to 50.`); continue; }
    const submit = wholeDays(get("submit"), 31);
    if (submit == null || submit < 1) { out.errors.push(`${where}: submit day must be a day of the month, 1 to 31.`); continue; }
    const owner = wholeDays(get("owner"));
    if (owner == null) { out.errors.push(`${where}: owner days must be a whole number of days, 0 to 365.`); continue; }
    const gcDays = wholeDays(get("gcDays"));
    if (gcDays === null) { out.errors.push(`${where}: GC days must be a whole number of days, 0 to 365, or blank.`); continue; }
    const monthsRaw = get("months");
    const months = monthsRaw === "" ? null : /^\d+$/.test(monthsRaw) && +monthsRaw <= 120 ? +monthsRaw : NaN;
    if (Number.isNaN(months)) { out.errors.push(`${where}: months left must be a whole number, or blank for every month in the forecast.`); continue; }
    const state = get("state").toLowerCase();
    out.jobs.push({ row: r + 1, job, gc: get("gc"), monthly, retainage, submit, owner, gcDays: gcDays ?? 0, gcDaysBlank: gcDays === undefined, months, state });
  }
  if (!out.jobs.length && !out.errors.length) out.errors.push("Jobs: no jobs found.");
  return out;
}

/** Parse the applications sent and not yet paid. Blank text is fine (no open applications). */
export function parseApps(text) {
  const out = { apps: [], errors: [] };
  if (String(text ?? "").trim() === "") return out;
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Open applications: paste a header row and at least one application, or leave the box empty."); return out; }
  const idx = mapHeaders(grid[0], APP_HEADERS);
  for (const [k, name] of [["job", "Job"], ["due", "Amount due"], ["submitted", "Submitted"]]) {
    if (idx[k] == null) { out.errors.push(`Open applications: no '${name}' column.`); return out; }
  }
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    if (row.every((c) => String(c).trim() === "")) continue;
    const job = get("job"), where = `Open applications row ${r + 1}${job ? ` (${job})` : ""}`;
    if (!job) { out.errors.push(`${where}: no job named.`); continue; }
    const due = parseMoney(get("due")), received = parseMoney(get("received"));
    if (due == null || due <= 0) { out.errors.push(`${where}: amount due is not a positive dollar figure.`); continue; }
    if (received == null || received < 0) { out.errors.push(`${where}: received is not a dollar figure.`); continue; }
    const submitted = parseDate(get("submitted"));
    if (submitted == null) { out.errors.push(`${where}: submitted date must be YYYY-MM-DD or M/D/YYYY.`); continue; }
    out.apps.push({ row: r + 1, job, app: get("app"), due, received, submitted });
  }
  return out;
}

/**
 * @param {{jobs: object[], apps: object[]}} input from parseJobs / parseApps
 * @param {{asOf?: string, weeks?: string|number, cash?: string, spend?: string}} settings
 *   weeks: forecast length, 4 to 52 (default 13, one quarter)
 *   cash: money in the bank on the as-of date (blank: no balance line)
 *   spend: what goes out each week: payroll, suppliers, rent (blank: no balance line)
 */
export function forecast({ jobs = [], apps = [] } = {}, settings = {}) {
  const out = { errors: [], findings: [], receipts: [], weeks: [], overdue: [], missed: [], totals: null };
  const asOf = settings.asOf ? parseDate(settings.asOf) : Math.floor(Date.now() / 86400000);
  if (asOf == null) { out.errors.push("As-of date must be YYYY-MM-DD or M/D/YYYY."); return out; }
  const wRaw = String(settings.weeks ?? "").trim();
  const weeks = wRaw === "" ? 13 : /^\d+$/.test(wRaw) && +wRaw >= 4 && +wRaw <= 52 ? +wRaw : null;
  if (weeks == null) { out.errors.push("Weeks to forecast must be a whole number from 4 to 52."); return out; }
  const cashRaw = String(settings.cash ?? "").trim(), spendRaw = String(settings.spend ?? "").trim();
  const cash = cashRaw === "" ? null : parseMoney(cashRaw);
  const spend = spendRaw === "" ? null : parseMoney(spendRaw);
  if (cash === null && cashRaw !== "") { out.errors.push("Cash on hand is not a dollar figure."); return out; }
  if ((spend === null && spendRaw !== "") || (spend != null && spend < 0)) { out.errors.push("Weekly spending is not a positive dollar figure."); return out; }
  if (!jobs.length) { out.errors.push("Enter at least one job."); return out; }

  const end = asOf + weeks * 7; // exclusive
  const byName = new Map(jobs.map((j) => [j.job.toLowerCase(), j]));
  const lag = (j) => j.owner + j.gcDays;

  // 1. Applications already sent.
  for (const a of apps) {
    const j = byName.get(a.job.toLowerCase());
    if (!j) { out.errors.push(`Open application for "${a.job}" names a job that is not in the jobs table.`); continue; }
    const amount = a.due - a.received;
    if (amount <= 0) continue;
    const expected = a.submitted + lag(j);
    const r = { kind: "sent", job: j.job, gc: j.gc, app: a.app, submitted: a.submitted, expected, amount, partial: a.received > 0, late: Math.max(0, asOf - expected) };
    out.receipts.push(r);
    if (r.late > 0) out.overdue.push(r);
  }
  if (out.errors.length) return out;

  // 2. Applications still to send: one per month on each job's cutoff day, from the as-of date on,
  //    for the job's remaining months or for as long as the forecast runs. A cutoff is skipped when
  //    an open application for the job was sent in that billing period (after the cutoff before
  //    it), so this month's application is never counted twice.
  const start = new Date(asOf * 86400000);
  const Y = start.getUTCFullYear(), M = start.getUTCMonth();
  const sentDays = (j) => apps.filter((a) => a.job.toLowerCase() === j.job.toLowerCase()).map((a) => a.submitted);
  let retainageBuilt = 0;
  for (const j of jobs) {
    if (j.monthly === 0) continue;
    const net = Math.round((j.monthly * (100 - j.retainage)) / 100);
    const mine = sentDays(j);
    const sentInPeriod = (m) => {
      const prev = dayInMonth(Y, M + m - 1, j.submit), cut = dayInMonth(Y, M + m, j.submit);
      return mine.some((d) => d > prev && d <= cut);
    };
    // The last cutoff before the as-of date with nothing listed for it, when an application sent
    // on it would not be paid yet on the user's own terms (so it should be in the open list).
    const last = dayInMonth(Y, M, j.submit) < asOf ? 0 : -1;
    const lastCut = dayInMonth(Y, M + last, j.submit);
    if (lastCut + lag(j) > asOf && (j.months == null || j.months > 0) && !sentInPeriod(last)) out.missed.push({ job: j.job, gc: j.gc, cutoff: lastCut });
    let sent = 0;
    for (let m = 0; m < 24 && (j.months == null || sent < j.months); m++) {
      const sub = dayInMonth(Y, M + m, j.submit);
      if (sub < asOf) continue;
      if (sentInPeriod(m)) { sent += 1; continue; }
      if (sub >= end) break;
      sent += 1;
      const expected = sub + lag(j);
      retainageBuilt += j.monthly - net;
      if (expected >= end) continue; // billed inside the forecast, paid after it
      out.receipts.push({ kind: "planned", job: j.job, gc: j.gc, app: "", submitted: sub, expected, amount: net, partial: false, late: 0 });
    }
  }
  out.receipts.sort((a, b) => a.expected - b.expected || a.job.localeCompare(b.job));

  // 3. Week by week. Late money is not spread into a week: it is shown on its own line, because
  //    nobody knows when it comes. The balance line counts only money expected on its date.
  let balance = cash, firstShort = null, lowest = null;
  for (let w = 0; w < weeks; w++) {
    const from = asOf + w * 7, to = from + 7;
    const xs = out.receipts.filter((r) => r.late === 0 && r.expected >= from && r.expected < to);
    const sentIn = xs.filter((r) => r.kind === "sent").reduce((s, r) => s + r.amount, 0);
    const plannedIn = xs.filter((r) => r.kind === "planned").reduce((s, r) => s + r.amount, 0);
    const week = { from, to: to - 1, sent: sentIn, planned: plannedIn, total: sentIn + plannedIn, count: xs.length };
    if (cash != null && spend != null) {
      balance += week.total - spend;
      week.balance = balance;
      if (lowest == null || balance < lowest.balance) lowest = { balance, from };
      if (balance < 0 && firstShort == null) firstShort = week;
    }
    out.weeks.push(week);
  }

  const sum = (xs) => xs.reduce((s, r) => s + r.amount, 0);
  const inWindow = out.receipts.filter((r) => r.late === 0 && r.expected < end);
  const t = {
    asOf, weeks, end: end - 1, cash, spend,
    overdue: sum(out.overdue), overdueCount: out.overdue.length,
    sentDue: sum(inWindow.filter((r) => r.kind === "sent")),
    planned: sum(inWindow.filter((r) => r.kind === "planned")),
    expected: sum(inWindow),
    retainageBuilt,
    firstShort: firstShort ? firstShort.from : null,
    lowest: lowest ? lowest.balance : null, lowestWeek: lowest ? lowest.from : null,
    endBalance: cash != null && spend != null ? balance : null,
  };
  out.totals = t;

  // Findings, the ones to act on first.
  const F = (severity, title) => out.findings.push({ severity, title });
  for (const r of [...out.overdue].sort((a, b) => b.amount * b.late - a.amount * a.late)) {
    F("high", `${r.job}${r.app ? ` application ${r.app}` : ""}${r.gc ? ` (${r.gc})` : ""}: ${dollars(r.amount)} ${r.partial ? "still unpaid, " : ""}expected ${dayText(r.expected)}, ${r.late} days ago. Ask what is holding it: a missing lien waiver, insurance certificate or certified payroll is the usual cause, and the owner may not have paid the GC yet.`);
  }
  for (const x of out.missed) F("high", `${x.job}: the cutoff on ${dayText(x.cutoff)} has passed and no open application is listed for it. If you sent it and it is unpaid, add it to the open applications; if you missed the cutoff, that month's work waits for the next one.`);
  if (firstShort) F("high", `On these numbers the bank balance goes below zero in the week of ${dayText(firstShort.from)} (${dollars(firstShort.balance)}). Chasing the late money, billing stored materials or asking a GC for an earlier cutoff moves that week; a line of credit covers it.`);
  const weeksWithNothing = out.weeks.filter((w) => w.total === 0).length;
  if (weeksWithNothing >= 3 && weeksWithNothing < weeks) F("info", `${weeksWithNothing} of the ${weeks} weeks have no pay-app money expected. Payroll runs every week; billing on a few cutoff days does not.`);
  for (const j of jobs) {
    const pp = PROMPT_PAY[j.state];
    if (pp && !j.gcDaysBlank && j.gcDays > pp.days) F("info", `${j.job}: you expect the GC to pay ${j.gcDays} days after the owner pays it. The prompt payment table on this site lists ${pp.days} days for ${pp.state} (${pp.law}). Whether it covers this job, and what the subcontract says, decides whether you can ask for it sooner: see the prompt payment page.`);
    if (j.gcDaysBlank) F("info", `${j.job}: no GC days entered, so the forecast assumes the GC pays the day the owner pays it. Most GCs take a week or more.`);
  }
  const lags = jobs.filter((j) => j.monthly > 0).map((j) => lag(j));
  if (lags.length) {
    const avg = Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
    F("info", `Average ${avg} days from sending an application to the money arriving, plus up to a month of work waiting for the next cutoff: work done early in a billing period can take ${avg + 30} days or more to turn into cash.`);
  }
  if (retainageBuilt > 0) F("info", `The applications this forecast sends hold back ${dollars(retainageBuilt)} of retainage, which is not in any week above. It comes at closeout: track it with the retainage tracker.`);
  const gcs = new Map();
  for (const r of inWindow) if (r.gc) gcs.set(r.gc, (gcs.get(r.gc) ?? 0) + r.amount);
  const top = [...gcs].sort((a, b) => b[1] - a[1])[0];
  if (gcs.size > 1 && top && t.expected > 0 && top[1] * 2 > t.expected) F("info", `${top[0]} accounts for ${Math.round((top[1] * 100) / t.expected)}% of the money expected in this forecast (${dollars(top[1])}). If that GC pays late, most of the forecast moves with it.`);
  out.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return out;
}

const c2 = (c) => (c / 100).toFixed(2);

/** One row per expected payment, formula-safe cells (csvCell). */
export function receiptsCsv(result) {
  const head = ["Job", "GC", "Application", "Sent or planned", "Submitted", "Expected", "Amount", "Days late"];
  const rows = result.receipts.map((r) => [r.job, r.gc, r.app, r.kind === "sent" ? "Sent" : "Planned", dayText(r.submitted), dayText(r.expected), c2(r.amount), r.late || ""].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

/** The week table, formula-safe cells. */
export function weeksCsv(result) {
  const bal = result.totals && result.totals.endBalance != null;
  const head = ["Week of", "To", "From applications sent", "From applications to send", "Total in", ...(bal ? ["Balance"] : [])];
  const rows = result.weeks.map((w) => [dayText(w.from), dayText(w.to), c2(w.sent), c2(w.planned), c2(w.total), ...(bal ? [c2(w.balance)] : [])].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

export function summaryText(result) {
  const t = result.totals;
  if (!t) return "";
  const L = (k, v) => `${k.padEnd(40)}${String(v).padStart(16)}`;
  const lines = [
    "Pay application cash forecast",
    `${dayText(t.asOf)} to ${dayText(t.end)} (${t.weeks} weeks)`,
    "",
    L(`Late now (${t.overdueCount} application${t.overdueCount === 1 ? "" : "s"})`, dollars(t.overdue)),
    L("Expected from applications sent", dollars(t.sentDue)),
    L("Expected from applications to send", dollars(t.planned)),
    L("Expected in the forecast, total", dollars(t.expected)),
    L("Retainage held back (not in the weeks)", dollars(t.retainageBuilt)),
  ];
  if (t.endBalance != null) {
    lines.push(L("Cash on hand at start", dollars(t.cash)), L("Spending per week", dollars(t.spend)), L("Lowest balance", `${dollars(t.lowest)} (${dayText(t.lowestWeek)})`), L("Balance at the end", dollars(t.endBalance)));
    if (t.firstShort != null) lines.push(L("First week below zero", dayText(t.firstShort)));
  }
  lines.push("", "Week of        Money in");
  for (const w of result.weeks) lines.push(`${dayText(w.from)}  ${dollars(w.total).padStart(16)}${w.balance != null ? `  balance ${dollars(w.balance)}` : ""}`);
  return lines.join("\n");
}

export const SAMPLE = {
  asOf: "2026-11-25",
  weeks: "13",
  cash: "25,000",
  spend: "21,000",
  jobs: [
    "Job,GC,Monthly billing,Retainage %,Submit day,Owner days,GC days,Months left,State",
    "Elm St clinic,Harbor Builders,60000,10,25,30,10,3,tx",
    "Riverside school,Northgate Construction,45000,5,20,45,7,,il",
    "Oak Ave retail,Harbor Builders,22000,10,25,30,10,1,tx",
  ].join("\n"),
  apps: [
    "Job,App #,Amount due,Submitted,Received",
    "Elm St clinic,5,51300.00,2026-09-25,0",
    "Elm St clinic,6,54000.00,2026-10-25,0",
    "Riverside school,3,40850.00,2026-10-20,20000",
    "Oak Ave retail,8,19800.00,2026-10-25,0",
  ].join("\n"),
};
