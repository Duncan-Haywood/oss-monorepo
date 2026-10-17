import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJobs, evaluate, planDay, diagnose, priceFor, num, MAX_JOBS } from "./calc.mjs";

const J = (label, price, onsite, driveMin, supplies = 0) => ({ label, price, onsite, driveMin, supplies });
const O = { hoursAvailable: 8, targetHourly: 30, vehicleCostPerHour: 0, dailyFixed: 0 };

test("parseJobs reads commas, tabs, a header and money formatting", () => {
  const { jobs, errors } = parseJobs('label,price,hours,drive,supplies\nSUV full detail,"$1,200",3,20,15\nSedan\t150\t2\t10');
  assert.equal(errors.length, 0);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].price, 1200);
  assert.equal(jobs[1].supplies, 0);
});

test("parseJobs reports bad lines instead of guessing", () => {
  const { jobs, errors } = parseJobs("A,100,0,10\nB,abc,2,10\nC,100,2\nD,100,2,-5");
  assert.equal(jobs.length, 0);
  assert.equal(errors.length, 4);
});

test("parseJobs caps the list so the search stays instant", () => {
  const text = Array.from({ length: MAX_JOBS + 3 }, (_, i) => `J${i},100,1,5`).join("\n");
  const { jobs, errors } = parseJobs(text);
  assert.equal(jobs.length, MAX_JOBS);
  assert.ok(errors.some((e) => /first 14/.test(e)));
});

test("drive is twice the farthest job, not the sum", () => {
  const e = evaluate([J("a", 100, 1, 10), J("b", 100, 1, 30)], { ...O, vehicleCostPerHour: 30 });
  assert.equal(e.driveHours, 1);
  assert.equal(e.vehicle, 30);
  assert.equal(e.hoursUsed, 3);
  assert.equal(e.profit, 170);
});

test("an empty set has no economics and does not divide by zero", () => {
  const e = evaluate([], O);
  assert.equal(e.profit, 0);
  assert.equal(e.perHour, 0);
});

test("planDay takes every job when they all fit and pay", () => {
  const p = planDay([J("a", 200, 2, 10), J("b", 250, 3, 10)], O);
  assert.equal(p.best.jobs, 2);
  assert.equal(p.declined.length, 0);
});

test("planDay drops a far low-value job that would push others out of the day", () => {
  const jobs = [J("near1", 220, 3, 10), J("near2", 220, 3, 10), J("far", 150, 2, 120)];
  const p = planDay(jobs, O);
  assert.deepEqual(p.best.set.map((j) => j.label).sort(), ["near1", "near2"]);
  assert.equal(p.declined[0].label, "far");
});

test("planDay prefers the higher-profit set under the hour cap", () => {
  const jobs = [J("big", 500, 6, 10), J("s1", 150, 3, 10), J("s2", 150, 3, 10)];
  const p = planDay(jobs, O);
  assert.equal(p.best.set[0].label, "big");
  assert.equal(p.best.profit, 500);
});

test("the best-hourly set can differ from the best-profit set", () => {
  const jobs = [J("fast", 200, 1, 5), J("slow", 300, 6, 5)];
  const p = planDay(jobs, O);
  assert.equal(p.best.jobs, 2);
  assert.equal(p.bestHourly.set[0].label, "fast");
});

test("no job fits a short day: plan says so and diagnoses it", () => {
  const p = planDay([J("long", 900, 12, 10)], O);
  assert.equal(p.none, true);
  assert.equal(diagnose(p)[0].level, "high");
});

test("per-job price to hit target covers time, supplies and added vehicle cost", () => {
  const p = planDay([J("a", 100, 2, 15, 10)], { ...O, vehicleCostPerHour: 20 });
  const pj = p.perJob[0];
  // 2h on site + 0.5h round trip = 2.5h; 2.5*30 + 10 supplies + 0.5*20 vehicle = 95
  assert.equal(Math.round(pj.priceToHitTarget), 95);
  assert.ok(pj.gap < 0);
});

test("a job under target is named with the price it needs", () => {
  const p = planDay([J("cheap", 40, 2, 10, 5)], O);
  const d = diagnose(p).find((f) => /under target/.test(f.title));
  assert.ok(d);
  assert.match(d.text, /would need/);
});

test("daily fixed costs can make the best day a loss", () => {
  const p = planDay([J("a", 80, 2, 10)], { ...O, dailyFixed: 100 });
  assert.ok(p.best.profit < 0);
  assert.equal(diagnose(p)[0].level, "high");
});

test("priceFor shares the drive when asked to", () => {
  const solo = priceFor({ onsite: 2, driveMin: 30, supplies: 10, targetHourly: 30, vehicleCostPerHour: 20 });
  const shared = priceFor({ onsite: 2, driveMin: 30, supplies: 10, targetHourly: 30, vehicleCostPerHour: 20, sharedDriveFraction: 0.5 });
  assert.ok(shared < solo);
  assert.equal(Math.round(solo), 120); // (2h + 1h round trip) * 30 + 10 supplies + 1h * 20 vehicle
});

test("num strips currency symbols and rejects junk", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.ok(Number.isNaN(num("abc")));
});
