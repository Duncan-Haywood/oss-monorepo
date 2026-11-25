import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, jobsCsv, chaseList, sampleJobs, SAMPLE_SETTINGS } from "./retlog.mjs";

const sample = () => compute(sampleJobs(), SAMPLE_SETTINGS);

test("the example adds up by hand", () => {
  const r = sample();
  assert.deepEqual(r.errors, []);
  const t = r.totals;
  // Held 41,200 + 44,000 + 23,650 + 15,900 + 98,000 + 15,400 = 238,150; released 22,000 + 15,900 = 37,900.
  assert.equal(t.held, 23815000);
  assert.equal(t.released, 3790000);
  // Outstanding 238,150 - 37,900 = 200,250 on five jobs (the library is paid in full).
  assert.equal(t.outstanding, 20025000);
  assert.equal(t.withBalance, 5);
  // Only Oak Park is not complete.
  assert.equal(t.openJobs, 9800000);
  assert.equal(t.completeOutstanding, 10225000);
});

test("due dates and days overdue follow completion + release days", () => {
  const r = sample();
  const j = Object.fromEntries(r.jobs.map((x) => [x.job, x]));
  // Maple St: 2026-06-30 + 60 = 2026-08-29; to 2026-11-25 is 88 days.
  assert.equal(j["Maple St clinic"].overdue, 88);
  assert.equal(j["Maple St clinic"].bucket, "d31_90");
  // Riverside: 2026-08-15 + 45 = 2026-09-29; 57 days.
  assert.equal(j["Riverside school addition"].overdue, 57);
  assert.equal(j["Riverside school addition"].outstanding, 2200000);
  // Elm Ave takes the 60-day default: 2026-10-02 + 60 = 2026-12-01, not yet due.
  assert.equal(j["Elm Ave retail fit-out"].bucket, "not_due");
  assert.equal(j["Elm Ave retail fit-out"].daysFromDefault, true);
  // Warehouse 7: 2026-11-10 + 30 = 2026-12-10, not due, but completed with no release billed.
  assert.equal(j["Warehouse 7 mezzanine"].bucket, "not_due");
  assert.equal(j["Oak Park apartments"].bucket, "open");
  assert.equal(r.totals.overdue, 4120000 + 2200000);
  assert.equal(r.totals.oldestOverdue, 88);
  // Dollar-weighted: (41,200 x 88 + 22,000 x 57) / 63,200 = 77.2 -> 77.
  assert.equal(r.totals.weightedOverdue, 77);
});

test("carrying cost is simple interest on overdue retainage only", () => {
  const r = sample();
  const j = Object.fromEntries(r.jobs.map((x) => [x.job, x]));
  // 41,200 x 8% x 88 / 365 = 794.65; 22,000 x 8% x 57 / 365 = 274.85.
  assert.equal(j["Maple St clinic"].carrying, 79465);
  assert.equal(j["Riverside school addition"].carrying, 27485);
  assert.equal(r.totals.carrying, 79465 + 27485);
  assert.equal(compute(sampleJobs(), { ...SAMPLE_SETTINGS, rate: "" }).totals.carrying, 0);
});

test("completed jobs with no release billed are flagged, and the chase list orders by money x days", () => {
  const r = sample();
  assert.equal(r.totals.unbilledCount, 2); // Elm Ave and Warehouse 7
  assert.equal(r.totals.unbilled, 2365000 + 1540000);
  assert.ok(r.findings.some((f) => f.severity === "high" && /2 completed jobs/.test(f.title)));
  const list = chaseList(r).split("\n");
  assert.match(list[0], /^1\. Maple St clinic/);
  assert.match(list[1], /^2\. Riverside/);
  assert.match(list[2], /Elm Ave.*bill the release/);
  assert.equal(list.length, 4);
});

test("aging buckets and GC totals sum to the outstanding total", () => {
  const r = sample();
  assert.equal(r.buckets.reduce((a, b) => a + b.amount, 0), r.totals.outstanding);
  assert.equal(r.byGc.reduce((a, g) => a + g.outstanding, 0), r.totals.outstanding);
  // Harbor: 22,000 + 98,000 = 120,000, over half of 200,250.
  assert.equal(r.byGc[0].gc, "Harbor Construction");
  assert.equal(r.byGc[0].outstanding, 12000000);
  assert.ok(r.findings.some((f) => /Harbor Construction holds 60%/.test(f.title)));
});

test("a completed job without release days gets no due date and says why", () => {
  const r = compute("Job,Retainage held,Completed\nA,1000,2026-01-01", { asOf: "2026-11-25" });
  assert.equal(r.jobs[0].due, null);
  assert.equal(r.jobs[0].bucket, "no_terms");
  assert.equal(r.totals.overdue, 0);
  assert.ok(r.findings.some((f) => /no release days/.test(f.title)));
});

test("bad input is reported, not guessed", () => {
  assert.match(compute("Job,Amount\nA,1", {}).errors[0], /retainage column/);
  assert.match(compute("Job,Retainage held\nA,lots", {}).errors[0], /not a dollar figure/);
  assert.match(compute("Job,Retainage held,Completed\nA,1,31/31/2026", {}).errors[0], /completion date/);
  assert.match(compute("Job,Retainage held,Release days\nA,1,soon", {}).errors[0], /release days/);
  assert.match(compute("Job,Retainage held\nA,1", { rate: "abc" }).errors[0], /Cost of money/);
  const over = compute("Job,Retainage held,Released\nA,1000,1500", { asOf: "2026-11-25" });
  assert.ok(over.findings.some((f) => /More released than held/.test(f.title)));
  assert.equal(over.totals.outstanding, 0);
});

test("headers are read by alias and 'Net 45' style days are accepted", () => {
  const r = compute("Project\tCustomer\tRetention\tRetention released\tSubstantial completion\tTerms\nA\tB\t$5,000.00\t$0\t9/1/2026\tNet 45", { asOf: "2026-11-25" });
  assert.deepEqual(r.errors, []);
  // 2026-09-01 + 45 = 2026-10-16; 40 days overdue.
  assert.equal(r.jobs[0].overdue, 40);
  assert.equal(r.jobs[0].gc, "B");
});

test("summary and CSV carry the figures, and CSV cells cannot run as formulas", () => {
  const r = sample();
  const s = summaryText(r);
  assert.match(s, /Outstanding retainage \(5 jobs\)\s+\$200,250\.00/);
  assert.match(s, /Carrying cost of overdue at 8%\s+\$1,069\.50/);
  const csv = jobsCsv(compute("Job,Retainage held\n=HYPERLINK(1),100", { asOf: "2026-11-25" }));
  assert.match(csv, /'=HYPERLINK/);
  assert.equal(jobsCsv(r).split("\n").length, 7);
});

// Red team 2026-11-25 (escaped mutants and defects).
const H = "Job,GC,Retainage held,Released,Completed,Release days";
test("a negative held alone is refused, even with released positive", () => {
  const r = compute(`${H}\nA,G,-100,50,2026-01-01,30`, { asOf: "2026-11-25" });
  assert.match(r.errors.join(" "), /positive amounts/);
});
test("over-released overdue job carries no (negative) carrying cost", () => {
  const r = compute(`${H}\nA,G,100,500,2026-01-01,30`, { asOf: "2026-11-25", rate: "8" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.jobs[0].carrying, 0);
});
test("GCs with equal outstanding sort by name", () => {
  const r = compute(`${H}\nA,Zeta,100,0,,\nB,Alpha,100,0,,`, { asOf: "2026-11-25" });
  assert.deepEqual(r.byGc.map((g) => g.gc), ["Alpha", "Zeta"]);
});
test("a job listed once is not reported as a duplicate; a duplicate keeps the user's spelling", () => {
  assert.ok(!sample().findings.some((f) => /appears \d+ times/.test(f.title)));
  const r = compute(`${H}\nMaple St,G,100,0,,\nmaple st,G,200,0,,`, { asOf: "2026-11-25" });
  assert.ok(r.findings.some((f) => f.title.includes('Job "Maple St" appears 2 times')));
});
test("cost of money must be a plain decimal percent", () => {
  for (const rate of ["1e1", "0x8", "Infinity"]) assert.match(compute(sampleJobs(), { ...SAMPLE_SETTINGS, rate }).errors.join(" "), /Cost of money/, rate);
  assert.deepEqual(compute(sampleJobs(), { ...SAMPLE_SETTINGS, rate: "8.5%" }).errors, []);
});
