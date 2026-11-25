// Retainage receivable across jobs: what is still held, when each job's release falls due,
// what is overdue and for how long, completed jobs with no release billed, and totals by GC.
// Pure functions, no I/O. Money is integer cents; dates are whole UTC days.
// The release days come from the user's subcontract (or a statute the user has read); this
// module never supplies a legal deadline of its own.
import { parseCsv, parseMoney, parseDate, dayText, dollars, csvCell } from "./colog.mjs";

export { dollars, dayText };

const HEADERS = {
  job: /^(job|job name|project|project name|job #|job no\.?|job number|name)$/,
  gc: /^(gc|general contractor|customer|client|contractor|owner|billed to|paid by)$/,
  contract: /^(contract|contract sum|contract amount|contract value|revised contract|revised contract sum)$/,
  held: /^(held|retainage|retainage held|retainage to date|retention|retention held|total retainage|retainage withheld|withheld)$/,
  released: /^(released|retainage released|retainage paid|paid|retention released|received)$/,
  completed: /^(completed|completion|substantial completion|completion date|date completed|substantially complete|sc date|final completion)$/,
  days: /^(release days|days|days to release|release within|due in|terms|release terms \(days\))$/,
  requested: /^(requested|billed|release billed|retainage billed|release requested|invoice sent|date billed|date requested)$/,
};

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

// Aging buckets, in the order the page shows them.
export const BUCKETS = [
  ["open", "Job not complete"],
  ["not_due", "Complete, not yet due"],
  ["no_terms", "Complete, no release days entered"],
  ["d1_30", "Overdue 1–30 days"],
  ["d31_90", "Overdue 31–90 days"],
  ["d91_180", "Overdue 91–180 days"],
  ["d181", "Overdue over 180 days"],
];
const bucketOf = (x) => {
  if (x.completed === undefined || x.completed > x.asOf) return "open";
  if (x.due == null) return "no_terms";
  const o = x.asOf - x.due;
  if (o <= 0) return "not_due";
  if (o <= 30) return "d1_30";
  if (o <= 90) return "d31_90";
  if (o <= 180) return "d91_180";
  return "d181";
};

const wholeDays = (raw) => {
  const t = String(raw ?? "").trim().replace(/\s*days?$/i, "").replace(/^net\s*/i, "");
  if (t === "") return undefined;
  return /^\d+$/.test(t) && +t <= 3650 ? +t : null;
};

/**
 * @param {string} text CSV or tab-separated job list with a header row
 * @param {{asOf?: string, defaultDays?: string|number, rate?: string|number}} settings
 *   defaultDays: release days for jobs whose own row leaves them blank (blank: none)
 *   rate: annual cost of money, percent, to price overdue retainage (blank: not priced)
 */
export function compute(text, settings = {}) {
  const out = { jobs: [], errors: [], findings: [], totals: null, byGc: [], buckets: [] };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one job."); return out; }
  const idx = mapHeaders(grid[0]);
  if (idx.held == null) { out.errors.push("No retainage column. Name a column 'Retainage held'."); return out; }
  if (idx.job == null) { out.errors.push("No job column. Name a column 'Job'."); return out; }

  const asOf = settings.asOf ? parseDate(settings.asOf) : Math.floor(Date.now() / 86400000);
  if (asOf == null) { out.errors.push("As-of date must be YYYY-MM-DD or M/D/YYYY."); return out; }
  const defaultDays = wholeDays(settings.defaultDays);
  if (defaultDays === null) { out.errors.push("Default release days must be a whole number from 0 to 3650, or blank."); return out; }
  const rateRaw = String(settings.rate ?? "").trim().replace(/%$/, "");
  // Plain decimals only: Number() read "1e1" as 10 and "0x8" as 8 (red team 2026-11-25).
  const rate = rateRaw === "" ? null : /^\d+(\.\d+)?$/.test(rateRaw) ? Number(rateRaw) : NaN;
  if (rate !== null && !(Number.isFinite(rate) && rate >= 0 && rate <= 100)) { out.errors.push("Cost of money must be a percent from 0 to 100, or blank."); return out; }

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    const job = get("job") || `Row ${r + 1}`, gc = get("gc");
    const where = `Row ${r + 1} (${job})`;
    const held = parseMoney(get("held")), released = parseMoney(get("released")), contract = parseMoney(get("contract"));
    if (held == null) { out.errors.push(`${where}: retainage held is not a dollar figure.`); continue; }
    if (released == null) { out.errors.push(`${where}: released is not a dollar figure.`); continue; }
    if (contract == null) { out.errors.push(`${where}: contract is not a dollar figure.`); continue; }
    if (held < 0 || released < 0) { out.errors.push(`${where}: enter retainage held and released as positive amounts.`); continue; }
    const completed = parseDate(get("completed")), requested = parseDate(get("requested"));
    if (completed === null) { out.errors.push(`${where}: completion date must be YYYY-MM-DD or M/D/YYYY.`); continue; }
    if (requested === null) { out.errors.push(`${where}: release billed date must be YYYY-MM-DD or M/D/YYYY.`); continue; }
    const ownDays = wholeDays(get("days"));
    if (ownDays === null) { out.errors.push(`${where}: release days must be a whole number of days.`); continue; }
    const days = ownDays ?? defaultDays;
    const outstanding = held - released;
    const isComplete = completed !== undefined && completed <= asOf;
    const due = completed !== undefined && days !== undefined ? completed + days : null;
    const x = { row: r + 1, job, gc, contract, held, released, outstanding, completed, requested, days, daysFromDefault: ownDays === undefined && days !== undefined, due, asOf, isComplete };
    x.sinceComplete = isComplete ? asOf - completed : null;
    x.overdue = isComplete && due != null && asOf > due ? asOf - due : 0;
    x.bucket = bucketOf(x);
    x.carrying = rate !== null && x.overdue > 0 && outstanding > 0 ? Math.round((outstanding * rate * x.overdue) / 36500) : 0;
    out.jobs.push(x);
  }
  if (out.errors.length) return out;
  if (!out.jobs.length) { out.errors.push("No jobs found."); return out; }

  const live = out.jobs.filter((x) => x.outstanding > 0);
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const overdue = live.filter((x) => x.overdue > 0);
  const unbilled = live.filter((x) => x.isComplete && x.requested === undefined);
  const totals = {
    asOf, rate, defaultDays,
    jobs: out.jobs.length, withBalance: live.length,
    held: sum(out.jobs, "held"), released: sum(out.jobs, "released"),
    outstanding: sum(live, "outstanding"),
    openJobs: sum(live.filter((x) => !x.isComplete), "outstanding"),
    completeOutstanding: sum(live.filter((x) => x.isComplete), "outstanding"),
    overdue: sum(overdue, "outstanding"), overdueCount: overdue.length,
    unbilled: sum(unbilled, "outstanding"), unbilledCount: unbilled.length,
    carrying: sum(live, "carrying"),
    oldestOverdue: overdue.reduce((m, x) => Math.max(m, x.overdue), 0),
    // Dollar-weighted days past due, over overdue retainage only.
    weightedOverdue: overdue.length ? Math.round(overdue.reduce((a, x) => a + x.outstanding * x.overdue, 0) / sum(overdue, "outstanding")) : null,
  };
  out.totals = totals;

  out.buckets = BUCKETS.map(([key, label]) => {
    const xs = live.filter((x) => x.bucket === key);
    return { key, label, count: xs.length, amount: sum(xs, "outstanding") };
  });

  const gcs = new Map();
  for (const x of live) {
    const k = x.gc || "(no GC named)";
    const g = gcs.get(k) ?? { gc: k, jobs: 0, outstanding: 0, overdue: 0 };
    g.jobs += 1; g.outstanding += x.outstanding; if (x.overdue > 0) g.overdue += x.outstanding;
    gcs.set(k, g);
  }
  out.byGc = [...gcs.values()].sort((a, b) => b.outstanding - a.outstanding || a.gc.localeCompare(b.gc));

  // Who to chase first: overdue jobs by money times days late, then completed jobs never billed.
  out.chase = [...overdue].sort((a, b) => b.outstanding * b.overdue - a.outstanding * a.overdue || b.outstanding - a.outstanding);

  const F = (severity, title) => out.findings.push({ severity, title });
  for (const x of out.jobs) if (x.outstanding < 0) F("high", `${x.job}: ${dollars(x.released)} released against ${dollars(x.held)} held. More released than held usually means a figure is cumulative in one column and monthly in the other; check both.`);
  if (unbilled.length) F("high", `${unbilled.length} completed job${unbilled.length > 1 ? "s" : ""} holding ${dollars(totals.unbilled)} of retainage with no release billed: ${unbilled.map((x) => `${x.job} (${x.sinceComplete} days since completion)`).join("; ")}. Retainage is rarely paid until it is billed, usually with closeout documents and a final waiver.`);
  for (const x of out.chase) F("high", `${x.job}${x.gc ? ` (${x.gc})` : ""}: ${dollars(x.outstanding)} was due ${dayText(x.due)}, ${x.overdue} days ago${x.daysFromDefault ? " (on the default release days)" : ""}.${x.carrying ? ` At ${totals.rate}% a year, waiting has cost about ${dollars(x.carrying)} so far.` : ""}`);
  for (const x of live) if (x.isComplete && x.due == null) F("info", `${x.job}: complete since ${dayText(x.completed)} but no release days, so no due date. Enter the days your subcontract gives for release after completion.`);
  for (const x of out.jobs) if (x.contract > 0 && x.held * 100 > x.contract * 10) F("info", `${x.job}: retainage held is ${((x.held * 100) / x.contract).toFixed(1)}% of the contract. Most subcontracts hold 10% or less, and several states cap public-work retainage at 5%; check the rate and whether retainage was reduced at the halfway point.`);
  for (const x of out.jobs) if (x.requested !== undefined && x.completed !== undefined && x.requested < x.completed) F("info", `${x.job}: release billed ${dayText(x.requested)}, before completion ${dayText(x.completed)}. Check the dates, unless the contract allowed an early release.`);
  for (const x of out.jobs) if (x.completed !== undefined && x.completed > asOf) F("info", `${x.job}: completion date ${dayText(x.completed)} is after the as-of date, so the job is treated as not yet complete.`);
  const top = out.byGc[0];
  if (out.byGc.length > 1 && top && totals.outstanding > 0 && top.outstanding * 2 > totals.outstanding) F("info", `${top.gc} holds ${((top.outstanding * 100) / totals.outstanding).toFixed(0)}% of your outstanding retainage (${dollars(top.outstanding)}). One slow payer that size is a cash-flow risk worth planning for.`);
  // Matched without case, reported in the spelling first typed.
  const names = new Map();
  for (const x of out.jobs) {
    const k = x.job.toLowerCase(), seen = names.get(k);
    names.set(k, { n: seen?.n ?? x.job, c: (seen?.c ?? 0) + 1 });
  }
  for (const { n, c } of names.values()) if (c > 1) F("info", `Job "${n}" appears ${c} times. If these are separate pay-app periods, enter one row per job with the totals to date.`);
  out.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return out;
}

const cents = (c) => (c / 100).toFixed(2);

// Every cell goes through csvCell (colog.mjs), the formula-injection guard: a cell starting =, +, -, @, tab
// or CR gets a leading apostrophe. retlog.test.mjs checks it on a typed =HYPERLINK job name.

export function jobsCsv(result) {
  const head = ["Job", "GC", "Contract", "Retainage held", "Released", "Outstanding", "Completed", "Release days", "Due", "Release billed", "Days overdue", "Aging", "Carrying cost"];
  const label = Object.fromEntries(BUCKETS);
  const rows = result.jobs.map((x) => [x.job, x.gc, x.contract ? cents(x.contract) : "", cents(x.held), cents(x.released), cents(x.outstanding), dayText(x.completed), x.days ?? "", dayText(x.due), dayText(x.requested), x.overdue || "", x.outstanding > 0 ? label[x.bucket] : "Paid in full", x.carrying ? cents(x.carrying) : ""].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

export function summaryText(result) {
  const t = result.totals;
  if (!t) return "";
  const L = (k, v) => `${k.padEnd(38)}${String(v).padStart(16)}`;
  const lines = [
    "Retainage receivable",
    `As of ${dayText(t.asOf)}`,
    "",
    L(`Outstanding retainage (${t.withBalance} jobs)`, dollars(t.outstanding)),
    L("  on jobs not yet complete", dollars(t.openJobs)),
    L("  on completed jobs", dollars(t.completeOutstanding)),
    L(`Overdue (${t.overdueCount} jobs)`, dollars(t.overdue)),
    L(`Completed, release not billed (${t.unbilledCount})`, dollars(t.unbilled)),
    L("Oldest overdue", t.oldestOverdue ? `${t.oldestOverdue} days` : "none"),
  ];
  if (t.rate !== null) lines.push(L(`Carrying cost of overdue at ${t.rate}%`, dollars(t.carrying)));
  lines.push("", "Aging");
  for (const b of result.buckets) if (b.count) lines.push(L(`  ${b.label} (${b.count})`, dollars(b.amount)));
  lines.push("", "By GC");
  for (const g of result.byGc) lines.push(L(`  ${g.gc} (${g.jobs})`, dollars(g.outstanding)) + (g.overdue ? `  overdue ${dollars(g.overdue)}` : ""));
  return lines.join("\n");
}

// A follow-up list in chase order, one line per job, to paste into an email or a call sheet.
export function chaseList(result) {
  const t = result.totals;
  if (!t) return "";
  const lines = result.chase.map((x, i) => `${i + 1}. ${x.job}${x.gc ? `, ${x.gc}` : ""}: ${dollars(x.outstanding)} retainage, due ${dayText(x.due)}, ${x.overdue} days overdue${x.requested !== undefined ? `; release billed ${dayText(x.requested)}` : "; release not yet billed"}.`);
  const unbilled = result.jobs.filter((x) => x.outstanding > 0 && x.isComplete && x.requested === undefined && !(x.overdue > 0));
  for (const x of unbilled) lines.push(`${lines.length + 1}. ${x.job}${x.gc ? `, ${x.gc}` : ""}: ${dollars(x.outstanding)} retainage, complete ${dayText(x.completed)}; bill the release.`);
  return lines.join("\n");
}

export const SAMPLE_SETTINGS = { asOf: "2026-11-25", defaultDays: "60", rate: "8" };
export function sampleJobs() {
  return [
    "Job,GC,Contract,Retainage held,Released,Completed,Release days,Release billed",
    "Maple St clinic,Northgate Builders,412000,41200,0,2026-06-30,60,2026-07-08",
    "Riverside school addition,Harbor Construction,880000,44000,22000,2026-08-15,45,2026-08-20",
    "Elm Ave retail fit-out,Northgate Builders,236500,23650,0,2026-10-02,,",
    "County library roof,Summit General,318000,15900,15900,2026-05-01,60,2026-05-10",
    "Oak Park apartments,Harbor Construction,1250000,98000,0,,,",
    "Warehouse 7 mezzanine,Summit General,154000,15400,0,2026-11-10,30,",
  ].join("\n");
}
