import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, evaluate, analyze, reportCsv, sampleText } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const job = (o = {}) => ({ name: "J", contract: 100000, est: 80000, cost: 40000, billed: 60000, prior: null, ...o });

test("hand-computed: half done, billed ahead", () => {
  const r = evaluate(job());
  near(r.pctComplete, 0.5);
  near(r.earned, 50000);
  near(r.overUnder, 10000);
  near(r.overbilled, 10000);
  near(r.estGross, 20000);
  near(r.grossRecognised, 10000);
  near(r.backlog, 50000);
  // left to bill 40000, left to spend 40000
  near(r.cashToCome, 0);
});

test("underbilled job: asset, not liability", () => {
  const r = evaluate(job({ billed: 30000 }));
  near(r.overUnder, -20000);
  near(r.underbilled, 20000);
  near(r.overbilled, 0);
  near(r.fundedByYou, 10000);
});

test("loss job carries its whole loss now", () => {
  // contract 100000, est 110000 => loss 10000; 55% done: earned 50000, cost 60500 => 10500? use exact numbers
  const r = evaluate(job({ est: 110000, cost: 55000, billed: 50000 }));
  assert.equal(r.loss, true);
  near(r.grossRecognised, -10000);
  // loss already inside costs vs earned: cost 55000 - earned 50000 = 5000, provision for the rest = 5000
  near(r.lossProvision, 5000);
});

test("cost above estimate is capped at 100% and warned", () => {
  const r = evaluate(job({ cost: 90000 }));
  near(r.pctComplete, 1);
  assert.equal(r.warnings.length, 1);
  near(r.earned, 100000);
});

test("negative cash to come when billed past the job's margin", () => {
  const r = evaluate(job({ billed: 85000 }));
  // left to bill 15000, left to spend 40000
  near(r.cashToCome, -25000);
});

test("percent complete falls and underbilling rises when the estimate grows", () => {
  const base = evaluate(job());
  const grown = evaluate(job(), 0.1);
  assert.ok(grown.pctComplete < base.pctComplete);
  assert.ok(grown.overUnder > base.overUnder);
  assert.ok(grown.estGross < base.estGross);
});

test("portfolio totals and surety ratios", () => {
  const jobs = [job({ name: "A" }), job({ name: "B", contract: 200000, est: 150000, cost: 150000, billed: 200000 })];
  const r = analyze(jobs, { workingCapital: 100000 });
  near(r.totalContract, 300000);
  near(r.backlog, 50000);
  near(r.over, 10000);
  near(r.surety.backlogToWc, 0.5);
  near(r.surety.adjustedWorkingCapital, 100000 - r.under);
  assert.equal(r.surety.overAggregate, false);
  const tight = analyze(jobs, { workingCapital: 2000 });
  assert.equal(tight.surety.overAggregate, true);
});

test("stress test names jobs that turn into losses", () => {
  const r = analyze([job({ est: 96000 })], { stress: 0.05 });
  assert.deepEqual(r.stress.newLosses, ["J"]);
  assert.ok(r.stress.fadeDollars > 0);
});

test("a clean schedule gets the all-clear and a bad option is refused", () => {
  const r = analyze([job({ billed: 50000 })]);
  assert.equal(r.findings[0].level, "good");
  assert.ok(analyze([job()], { stress: 0.9 }).error);
  assert.ok(analyze([]).error);
});

test("parseRows: header by name, money formats, bad rows skipped", () => {
  const p = parseRows("Job,Billed to date,Contract,Cost to date,Estimated total cost\nA,\"$60,000\",\"$100,000\",40000,80000\nB,x,1,1,1\n");
  assert.equal(p.jobs.length, 1);
  assert.equal(p.jobs[0].billed, 60000);
  assert.equal(p.jobs[0].contract, 100000);
  assert.equal(p.warnings.length, 1);
  assert.ok(parseRows("").error);
});

test("parseRows reads a prior estimate and reports drift", () => {
  const p = parseRows("job,contract,est,cost,billed,prior estimate\nA,100000,88000,40000,50000,80000");
  const r = analyze(p.jobs);
  near(r.rows[0].driftPct, 0.1);
  assert.ok(r.findings.some((f) => /grown/.test(f.title)));
});

test("sample parses and exports a CSV with one line per job", () => {
  const p = parseRows(sampleText());
  assert.equal(p.jobs.length, 6);
  const r = analyze(p.jobs, { workingCapital: 210000 });
  assert.equal(reportCsv(r).split("\n").length, 7);
  assert.ok(r.lossJobs.includes("Cedar Rd basement"));
});
