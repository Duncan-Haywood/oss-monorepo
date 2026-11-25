import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE, forecast, parseApps, parseJobs, receiptsCsv, summaryText, weeksCsv } from "./forecast.mjs";

const run = (jobs, apps = "", settings = {}) => {
  const j = parseJobs(jobs), a = parseApps(apps);
  assert.deepEqual([...j.errors, ...a.errors], []);
  return forecast({ jobs: j.jobs, apps: a.apps }, { asOf: "2026-11-25", ...settings });
};
const HEAD = "Job,GC,Monthly billing,Retainage %,Submit day,Owner days,GC days,Months left";

test("sample, checked by hand: dates, amounts, late money, missed cutoff and the first short week", () => {
  const r = run(SAMPLE.jobs, SAMPLE.apps, SAMPLE);
  assert.deepEqual(r.errors, []);
  const t = r.totals;
  // Elm St app 5: sent 9/25, 30 + 10 days -> 11/4, 21 days late on 11/25.
  assert.equal(r.overdue.length, 1);
  assert.equal(r.overdue[0].expected, Date.UTC(2026, 10, 4) / 864e5);
  assert.equal(r.overdue[0].late, 21);
  assert.equal(t.overdue, 5_130_000);
  // Sent and due: Elm 6 54,000 + Oak 8 19,800 (12/4) + Riverside 3 40,850 - 20,000 received (10/20 + 52 = 12/11).
  assert.equal(t.sentDue, 5_400_000 + 1_980_000 + 2_085_000);
  // To send: Elm 11/25 and 12/25 at 60,000 less 10%; Oak 11/25 (1 month left) at 19,800;
  // Riverside 12/20 at 42,750 (its 11/20 cutoff passed); Elm 1/25 and Riverside 1/20 are paid after 2/23.
  assert.equal(t.planned, 5_400_000 * 2 + 1_980_000 + 4_275_000);
  // Retainage on every application sent inside the 13 weeks (to 2/23): Elm 11/25, 12/25, 1/25 at 6,000;
  // Oak 11/25 at 2,200; Riverside 12/20, 1/20, 2/20 at 2,250.
  assert.equal(t.retainageBuilt, 1_800_000 + 220_000 + 675_000);
  assert.deepEqual(r.missed.map((x) => x.job), ["Riverside school"]);
  // Balance: 25,000 - 21,000 a week plus receipts; first goes negative in the week of 1/27.
  assert.equal(r.weeks[0].balance, 400_000);
  assert.equal(t.firstShort, Date.UTC(2027, 0, 27) / 864e5);
  const weekTotal = r.weeks.reduce((s, w) => s + w.total, 0);
  assert.equal(weekTotal, t.expected);
  assert.match(summaryText(r), /First week below zero\s+2027-01-27/);
  assert.equal(r.findings[0].severity, "high");
});

test("an application sent in this billing period is not planned again; months left counts it", () => {
  const r = run(`${HEAD}\nA,G,10000,0,25,30,0,1`, "Job,Amount due,Submitted\nA,10000,2026-11-24");
  assert.equal(r.receipts.filter((x) => x.kind === "planned").length, 0);
  assert.equal(r.missed.length, 0, "Oct 25 + 30 days is before Nov 25, so that application may be paid");
  const r3 = run(`${HEAD}\nA,G,10000,0,20,30,0,`);
  assert.equal(r3.missed.length, 1, "Nov 20 + 30 days is after Nov 25: an unpaid application should be listed");
  const r2 = run(`${HEAD}\nA,G,10000,0,25,30,0,2`, "Job,Amount due,Submitted\nA,10000,2026-11-24");
  assert.deepEqual(r2.receipts.filter((x) => x.kind === "planned").map((x) => x.submitted), [Date.UTC(2026, 11, 25) / 864e5]);
});

test("cutoff day 31 falls on the last day of short months", () => {
  const r = run(`${HEAD}\nA,G,1000,0,31,0,0,3`, "", { weeks: "20" });
  assert.deepEqual(r.receipts.map((x) => new Date(x.submitted * 864e5).toISOString().slice(0, 10)), ["2026-11-30", "2026-12-31", "2027-01-31"]);
  const feb = run(`${HEAD}\nA,G,1000,0,31,0,0,1`, "", { asOf: "2027-02-01" });
  assert.equal(new Date(feb.receipts[0].submitted * 864e5).toISOString().slice(0, 10), "2027-02-28");
});

test("money billed inside the forecast but paid after it is left out of the weeks, retainage is counted", () => {
  const r = run(`${HEAD}\nA,G,10000,10,26,90,0,`, "", { weeks: "4" });
  assert.equal(r.totals.expected, 0);
  assert.equal(r.totals.retainageBuilt, 100_000);
});

test("partial payments forecast only the unpaid rest; fully paid applications drop out", () => {
  const r = run(`${HEAD}\nA,G,0,0,25,30,10,`, "Job,Amount due,Submitted,Received\nA,10000,2026-11-01,4000\nA,5000,2026-11-02,5000");
  assert.equal(r.receipts.length, 1);
  assert.equal(r.receipts[0].amount, 600_000);
  assert.equal(r.receipts[0].partial, true);
});

test("prompt payment note only where the user's GC days exceed the table's days, and never applied", () => {
  const r = run("Job,Monthly,Submit day,Owner days,GC days,State\nA,1000,25,30,10,tx\nB,1000,25,30,5,tx\nC,1000,25,30,30,zz");
  const notes = r.findings.filter((f) => /prompt payment table/.test(f.title));
  assert.equal(notes.length, 1);
  assert.match(notes[0].title, /^A:/);
  assert.equal(r.receipts.find((x) => x.job === "A").expected - r.receipts.find((x) => x.job === "A").submitted, 40);
});

test("errors: bad cells, unknown jobs, bad settings", () => {
  assert.match(parseJobs("Job,Monthly billing,Owner days\nA,1,1").errors[0], /Submit day/);
  assert.match(parseJobs(`${HEAD}\nA,G,abc,10,25,30,10,`).errors[0], /monthly billing/);
  assert.match(parseJobs(`${HEAD}\nA,G,100,10,32,30,10,`).errors[0], /submit day/);
  assert.match(parseJobs(`${HEAD}\nA,G,100,60,25,30,10,`).errors[0], /retainage/);
  assert.match(parseApps("Job,Amount due,Submitted\nA,100,13/40/2026").errors[0], /submitted date/);
  const j = parseJobs(`${HEAD}\nA,G,100,10,25,30,10,`).jobs;
  assert.match(forecast({ jobs: j, apps: parseApps("Job,Amount due,Submitted\nB,100,2026-11-01").apps }, { asOf: "2026-11-25" }).errors[0], /not in the jobs table/);
  assert.match(forecast({ jobs: j }, { weeks: "2" }).errors[0], /4 to 52/);
  assert.match(forecast({ jobs: j }, { cash: "lots" }).errors[0], /Cash on hand/);
  assert.match(forecast({ jobs: [] }, {}).errors[0], /at least one job/);
});

test("CSV exports neutralise formula cells", () => {
  const r = run(`${HEAD}\n=HYPERLINK("x"),G,1000,0,26,0,0,1`);
  const csv = receiptsCsv(r);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(weeksCsv(r), /^Week of,To,/);
});
