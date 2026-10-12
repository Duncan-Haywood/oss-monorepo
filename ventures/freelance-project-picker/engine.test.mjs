import test from "node:test";
import assert from "node:assert/strict";
import { parseOffers, plan, optimise, feasible, cumulativeCapacity, summarize } from "./engine.mjs";

const parse = (t) => parseOffers(t);

test("parse reads capacity rows and projects, rejects bad rows with line numbers", () => {
  const p = parse("kind,fee,hours,deadline_week,label\ncapacity,,30,,default\ncapacity,,10,2\nproject,$1200,20,2,A\n# note\n");
  assert.equal(p.errors.length, 0);
  assert.equal(p.capacities.length, 2);
  assert.deepEqual(p.projects[0], { line: 4, fee: 1200, hours: 20, deadline: 2, label: "A" });
  assert.match(parse("project,abc,5,1").errors[0], /line 1: fee/);
  assert.match(parse("project,100,0,1").errors[0], /hours/);
  assert.match(parse("project,100,5,0").errors[0], /deadline week/);
  assert.match(parse("gig,1,1,1").errors[0], /not capacity or project/);
  assert.match(parse("capacity,,x").errors[0], /capacity needs hours/);
});

test("cumulative capacity uses the default and per-week overrides", () => {
  const p = parse("capacity,,30\ncapacity,,10,2");
  assert.deepEqual(cumulativeCapacity(p.capacities, 3), [0, 30, 40, 70]);
});

test("feasibility is the cumulative-deadline rule", () => {
  const cum = [0, 10, 20];
  assert.ok(feasible([{ hours: 10, deadline: 1 }, { hours: 10, deadline: 2 }], cum));
  assert.ok(!feasible([{ hours: 11, deadline: 1 }], cum));
  assert.ok(!feasible([{ hours: 10, deadline: 2 }, { hours: 15, deadline: 2 }], cum));
});

function brute(projects, cum, buffer) {
  let best = 0;
  for (let mask = 0; mask < 1 << projects.length; mask += 1) {
    const set = projects.filter((_, i) => mask & (1 << i));
    if (feasible(set, cum, buffer)) best = Math.max(best, set.reduce((s, p) => s + p.fee, 0));
  }
  return best;
}

test("optimiser matches trying every subset on random instances", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let t = 0; t < 300; t += 1) {
    const weeks = 1 + rnd(5);
    const cum = [0];
    for (let w = 1; w <= weeks; w += 1) cum.push(cum[w - 1] + rnd(25));
    const projects = Array.from({ length: 1 + rnd(9) }, (_, i) => ({ line: i + 1, fee: rnd(500), hours: 1 + rnd(30), deadline: 1 + rnd(weeks), label: `p${i}` }));
    const buffer = rnd(3) * 0.25;
    const got = optimise(projects, cum, buffer);
    assert.equal(got.value, brute(projects, cum, buffer), `instance ${t}`);
    assert.ok(feasible(got.chosen, cum, buffer), `chosen set deliverable, instance ${t}`);
    assert.equal(got.chosen.reduce((s, p) => s + p.fee, 0), got.value);
  }
});

test("the best-rate rule loses to the plan on the worked example", () => {
  const p = plan(parse("capacity,,30\ncapacity,,15,3\nproject,6000,60,3,A\nproject,2400,40,2,B\nproject,3200,35,4,C\nproject,1800,12,1,D\nproject,5200,80,5,E\nproject,900,10,5,F\nproject,2600,30,5,G"));
  assert.equal(p.totals.plan, 12700);
  assert.equal(p.totals.bestRateFirst, 11300);
  assert.equal(p.totals.upliftVsBestRate, 1400);
  assert.equal(summarize(p).status, "gain");
});

test("a project that cannot fit alone says so and has a break-even fee only if it can", () => {
  const p = plan(parse("capacity,,10\nproject,5000,50,2,huge\nproject,100,5,1,small"));
  const huge = p.declined.find((d) => d.label === "huge");
  assert.match(huge.reason, /do not fit/);
  assert.equal(huge.breakEvenFee, null);
  assert.deepEqual(p.chosen.map((c) => c.label), ["small"]);
});

test("break-even fee: taking the declined project at that fee ties the plan", () => {
  const parsed = parse("capacity,,20\nproject,1000,20,1,A\nproject,600,20,1,B");
  const p = plan(parsed);
  const b = p.declined[0];
  assert.equal(b.label, "B");
  assert.equal(b.breakEvenFee, 1000);
  const tied = plan(parse("capacity,,20\nproject,1000,20,1,A\nproject,1000,20,1,B"));
  assert.equal(tied.totals.plan, 1000);
});

test("buffer shrinks what fits", () => {
  const parsed = parse("capacity,,20\nproject,1000,20,1,A");
  assert.equal(plan(parsed).chosen.length, 1);
  assert.equal(plan(parsed, { buffer: 10 }).chosen.length, 0);
  assert.equal(summarize(plan(parsed, { buffer: 10 })).status, "none");
});

test("ten more hours a week is worth what the extra project(s) it unlocks pay", () => {
  const p = plan(parse("capacity,,20\nproject,1000,20,1,A\nproject,600,10,1,B"));
  assert.equal(p.totals.plan, 1000);
  assert.equal(p.sensitivity.extraTenHoursEveryWeek, 600);
});
