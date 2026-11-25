import test from "node:test";
import assert from "node:assert/strict";
import { toNum, parseCsv, mapColumns, readOutcome, readJobs, quantile, summarise, calibrate, reportCsv, EXAMPLE_CSV, MIN_JOBS } from "./calibrate.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("CSV: quotes, doubled quotes, CRLF, BOM, semicolons and blank lines", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n1,2'), [["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  assert.deepEqual(parseCsv("a;b\n1,5;2"), [["a", "b"], ["1,5", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2\n"), [["a", "b"], ["1", "2"]]);
});

test("headers map from common ERP and spreadsheet names, with units", () => {
  const { map, units } = mapColumns(["Job #", "Work Center", "Qty", "Est Setup (min)", "Act Setup (min)", "Std Cycle Time (hrs)", "Actual Cycle Time (hrs)", "Status"]);
  assert.equal(map.machine, 1);
  assert.equal(map.quantity, 2);
  assert.equal(map.quotedSetup, 3);
  assert.equal(map.actualSetup, 4);
  assert.equal(map.quotedCycle, 5);
  assert.equal(map.actualCycle, 6);
  assert.equal(map.outcome, 7);
  assert.deepEqual(units, { setup: "minutes", cycle: "hours" });
  const run = mapColumns(["quoted run time per part", "actual run time per part"]).map;
  assert.equal(run.quotedCycle, 0, "'run' alone must not read as actual");
  assert.equal(run.actualCycle, 1);
});

test("outcomes: won and lost words, anything else unknown", () => {
  for (const w of ["Won", "W", "yes", "Awarded", "PO received"]) assert.equal(readOutcome(w), "won", w);
  for (const l of ["lost", "No Bid", "declined", "0"]) assert.equal(readOutcome(l), "lost", l);
  for (const u of ["", "pending", "open"]) assert.equal(readOutcome(u), "");
});

test("units convert: setup minutes to hours, cycle hours to minutes", () => {
  const { jobs } = readJobs("job,setup quoted min,setup actual min,cycle est hours,cycle actual hours\nA,90,120,0.5,0.25");
  close(jobs[0].quotedSetup, 1.5);
  close(jobs[0].actualSetup, 2);
  close(jobs[0].quotedCycle, 30);
  close(jobs[0].actualCycle, 15);
});

test("bad rows are skipped with a reason; quotes without actuals keep their outcome", () => {
  const r = readJobs("job,quoted_setup_hours,actual_setup_hours,outcome\nA,2,3,won\nB,abc,1,\nC,-1,1,\nD,0,1,\nE,,,lost\nF,2,,");
  assert.deepEqual(r.jobs.map((j) => j.job), ["A"]);
  assert.deepEqual(r.skipped.map((s) => s.line), [3, 4, 5, 7]);
  assert.equal(r.quotes.length, 1);
  assert.equal(r.quotes[0].outcome, "lost");
});

test("no usable column pair is an error, not an empty report", () => {
  assert.match(readJobs("job,price\nA,10").error, /quoted and an actual/);
  assert.match(readJobs("").error, /No rows/);
});

test("quantile interpolates between ranks", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(quantile([], 0.5), null);
});

test("setup summary, by hand: median, quartiles, hours ratio and hours missed", () => {
  // ratios 1.0, 1.25, 1.5, 2.0, 0.5 -> sorted 0.5 1.0 1.25 1.5 2.0
  const jobs = [[2, 2], [4, 5], [2, 3], [1, 2], [2, 1]].map(([q, a], i) => ({ job: `J${i}`, line: i + 2, quantity: 1, quotedSetup: q, actualSetup: a }));
  const s = summarise(jobs, "setup");
  assert.equal(s.n, 5);
  assert.equal(s.median, 1.25);
  assert.equal(s.p25, 1.0);
  assert.equal(s.p75, 1.5);
  assert.equal(s.quotedHours, 11);
  assert.equal(s.actualHours, 13);
  close(s.hoursRatio, 13 / 11);
  assert.equal(s.hoursMissed, 2);
  assert.equal(s.factor, 1.25);
  assert.equal(s.confidence, "rough");
  assert.equal(s.under, 3 / 5);
  // 2.0 is not above 2 and 0.5 is not below 0.5: no outliers at the boundary
  assert.deepEqual(s.outliers, []);
});

test("cycle hours weigh by quantity; a factor needs MIN_JOBS jobs", () => {
  const jobs = [
    { job: "long", line: 2, quantity: 100, quotedCycle: 6, actualCycle: 6.6 },
    { job: "short", line: 3, quantity: 1, quotedCycle: 60, actualCycle: 180 },
  ];
  const s = summarise(jobs, "cycle");
  close(s.quotedHours, 10 + 1);
  close(s.actualHours, 11 + 3);
  close(s.hoursMissed, 3);
  assert.equal(s.factor, null);
  assert.equal(s.confidence, "too few");
  assert.equal(s.outliers.length, 1);
  assert.equal(s.outliers[0].job, "short");
  assert.ok(MIN_JOBS > jobs.length);
});

test("example history: per-machine groups, win rate counting open quotes, dollars at a rate", () => {
  const r = calibrate(EXAMPLE_CSV, { rate: 100 });
  assert.equal(r.error, "");
  assert.equal(r.jobs.length, 11);
  assert.equal(r.quotes.length, 3);
  assert.deepEqual(r.machines.map((m) => m.name), ["Haas VF-2", "Okuma LB3000"]);
  const haas = r.machines[0];
  // Haas setup ratios: 1.333 1.25 1.25 1.0 1.1667 2.25 -> median of 6 = (1.25+1.25)/2
  assert.equal(haas.setup.n, 6);
  close(haas.setup.median, 1.25);
  assert.equal(haas.setup.factor, 1.25);
  assert.equal(haas.setup.outliers.length, 1);
  assert.equal(haas.setup.outliers[0].job, "J-1006");
  // Okuma runs slightly under its quotes on cycle time
  assert.ok(r.machines[1].cycle.median < 1);
  // 11 won jobs + Q-2003 won, Q-2001 and Q-2002 lost
  assert.deepEqual([r.overall.wins.won, r.overall.wins.lost], [12, 2]);
  close(r.overall.dollarsMissed, r.overall.hoursMissed * 100);
  assert.equal(calibrate(EXAMPLE_CSV).overall.dollarsMissed, null);
});

test("no quantity column is flagged, because cycle hours then count one part per job", () => {
  assert.equal(calibrate("job,quoted cycle min,actual cycle min\nA,10,12").noQuantity, true);
  assert.equal(calibrate(EXAMPLE_CSV).noQuantity, false);
});

test("report CSV: one row per group and kind, formula-looking cells defused", () => {
  const csv = reportCsv(calibrate(EXAMPLE_CSV));
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^group,kind,jobs,median_ratio/);
  assert.equal(lines.length, 1 + 3 * 2);
  const evil = reportCsv(calibrate("job,machine,quoted_setup_hours,actual_setup_hours\nA,=HYPERLINK(1),1,1"));
  assert.match(evil, /\n'=HYPERLINK\(1\),setup/);
});

test("numbers by comma shape: thousands, decimal comma, semicolon files", () => {
  assert.equal(toNum("1,234.5"), 1234.5);
  assert.equal(toNum("1,5"), 1.5);
  assert.equal(toNum("1.234,5"), 1234.5);
  assert.equal(toNum("1,500"), 1500);
  assert.equal(toNum("1,500", true), 1.5);
  assert.ok(Number.isNaN(toNum("1,2,3")));
  assert.equal(toNum(" $12 "), 12);
  assert.equal(toNum(""), null);
  const { jobs } = readJobs("job;quoted setup h;actual setup h\nA;1,5;2,25");
  assert.equal(jobs[0].quotedSetup, 1.5);
  assert.equal(jobs[0].actualSetup, 2.25);
});

test("report CSV keeps a negative number a number", () => {
  const csv = reportCsv(calibrate("job,quoted_setup_hours,actual_setup_hours\nA,2,1.6"));
  assert.match(csv, /,-0\.4,/);
  assert.doesNotMatch(csv, /'-0/);
});
