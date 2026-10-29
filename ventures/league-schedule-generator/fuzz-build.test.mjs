import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("random leagues (courts, times, blackouts, closures, limits) build to valid schedules", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-build.mjs", "150", "11"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /built 150, rejected 0, invalid 0/);
});

test("rainouts, late teams and officials on random leagues keep the schedule valid", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-passes.mjs", "120", "5"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /invalid 0/);
});

test("multi-division leagues and their rainout passes stay valid", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-divisions.mjs", "60", "3"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /invalid 0/);
});

test("withdrawals, shared grounds, linked teams, travel tables and venue carry-over stay valid", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-more.mjs", "25", "9"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /invalid 0/);
});

test("play-off race and odds agree with a brute force over every outcome", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-race.mjs", "80", "4"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /invalid 0/);
});

test("iCalendar and CSV exports of random leagues are well-formed", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-exports.mjs", "60", "3"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /invalid 0/);
});

test("the validator catches seeded faults (mutation check)", () => {
  const r = spawnSync(process.execPath, ["eval/mutate-validator.mjs", "60", "3"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /missed 0/);
});
