import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, takeoff } from "./engine.mjs";
import { gangOpenings } from "./ganged.mjs";

const win = (label, offset, extra = {}) => ({ kind: "window", label, offset, width: 36, height: 48, header: "2x6", ...extra });
const planWith = (openings) => { const p = samplePlan(); p.walls = [{ ...p.walls[0], id: "N", openings }]; return p; };

test("two windows 3 in apart cannot lay out alone, and gang into one 75 in opening", () => {
  const plan = planWith([win("W1", 60), win("W2", 99)]); // 60+36=96, gap 3
  assert.equal(takeoff(plan).ok, false);
  const { plan: g, notes } = gangOpenings(plan);
  const ops = g.walls[0].openings;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].width, 75); // 99 + 36 - 60, by hand
  assert.equal(notes.length, 1);
  assert.equal(takeoff(g).ok, true, JSON.stringify(takeoff(g).errors));
  assert.equal(plan.walls[0].openings.length, 2); // input untouched
});

test("windows far enough apart, or of different height, are left alone", () => {
  const far = planWith([win("W1", 60), win("W2", 120)]);
  assert.equal(gangOpenings(far).plan.walls[0].openings.length, 2);
  const tall = planWith([win("W1", 60), win("W2", 99, { height: 60 })]);
  assert.equal(gangOpenings(tall).plan.walls[0].openings.length, 2);
});

test("three in a row gang into one", () => {
  const g = gangOpenings(planWith([win("A", 60), win("B", 99), win("C", 138)])).plan.walls[0].openings;
  assert.equal(g.length, 1);
  assert.equal(g[0].width, 114); // 138 + 36 - 60
});

test("CLI --gang lays out a plan that otherwise fails", async () => {
  const { main } = await import("./cli.mjs");
  const fs = await import("node:fs");
  const f = "/tmp/ganged-plan.json";
  fs.writeFileSync(f, JSON.stringify(planWith([win("W1", 60), win("W2", 99)])));
  assert.notEqual((await main([f])).code, 0);
  const r = await main([f, "--gang"]);
  assert.equal(r.code, 0, r.out.slice(0, 300));
  assert.match(r.out, /GANGED OPENINGS/);
});
