import test from "node:test";
import assert from "node:assert/strict";

import { classify, seconds, report, jobsFromPayload, summarize, STARVED, RAN, PENDING, SKIPPED } from "./classify.mjs";

function job(overrides = {}) {
  return {
    id: 1,
    name: "validate",
    conclusion: "success",
    runner_id: 12,
    runner_name: "gh-runner-4",
    started_at: "2026-08-26T22:41:49Z",
    completed_at: "2026-08-26T22:43:28Z",
    ...overrides,
  };
}

test("runner_id 0 is starved", () => {
  const { verdict, reason } = classify(job({ runner_id: 0, runner_name: "" }));
  assert.equal(verdict, STARVED);
  assert.match(reason, /no runner was ever assigned/);
});

test("a real runner_id is ran", () => {
  assert.equal(classify(job()).verdict, RAN);
});

test("a fast job on a real runner is not starved", () => {
  const { verdict } = classify(job({ conclusion: "failure", completed_at: "2026-08-26T22:41:52Z" }));
  assert.equal(verdict, RAN);
});

test("a slow job with no runner is still starved", () => {
  const { verdict } = classify(job({ runner_id: 0, runner_name: "", completed_at: "2026-08-26T23:41:49Z" }));
  assert.equal(verdict, STARVED);
});

test("a missing runner_id throws rather than guessing", () => {
  assert.throws(() => classify({ id: 7, status: "completed" }));
});

test("an unfinished job is pending, not a crash", () => {
  for (const status of ["queued", "in_progress", "waiting"]) {
    const { verdict, reason } = classify({ id: 7, name: "validate", status });
    assert.equal(verdict, PENDING);
    assert.match(reason, new RegExp(status));
  }
});

test("a job the workflow skipped is not starvation", () => {
  const { verdict, reason } = classify({ id: 7, name: "preflight", status: "completed", conclusion: "skipped" });
  assert.equal(verdict, SKIPPED);
  assert.match(reason, /never needed a runner/);
});

test("a skipped job that did get a runner is read normally", () => {
  assert.equal(classify(job({ conclusion: "skipped" })).verdict, RAN);
});

test("seconds measures wall clock", () => {
  assert.equal(seconds(job()), 99);
});

test("seconds is null for an in-flight job", () => {
  assert.equal(seconds(job({ completed_at: null })), null);
});

test("seconds is null for a skipped job's backwards stamps", () => {
  assert.equal(
    seconds(job({ started_at: "2026-08-31T05:49:16Z", completed_at: "2026-08-31T05:49:15Z" })),
    null,
  );
});

test("report classifies every job", () => {
  const rows = report([job(), job({ id: 2, runner_id: 0, runner_name: "" })]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].verdict, RAN);
  assert.equal(rows[1].verdict, STARVED);
});

test("jobsFromPayload accepts all three API shapes", () => {
  assert.deepEqual(jobsFromPayload({ jobs: [job()] }), [job()]);
  assert.deepEqual(jobsFromPayload(job()), [job()]);
  assert.deepEqual(jobsFromPayload([job()]), [job()]);
  assert.throws(() => jobsFromPayload("nope"));
});

test("summarize flags starvation over everything else", () => {
  const rows = report([job(), job({ id: 2, runner_id: 0, runner_name: "" }), { id: 3, name: "x", status: "queued" }]);
  const { status, text } = summarize(rows);
  assert.equal(status, STARVED);
  assert.match(text, /never got a runner/);
});

test("summarize reports a clean run", () => {
  const rows = report([job(), { id: 2, name: "preflight", status: "completed", conclusion: "skipped" }]);
  const { status, text } = summarize(rows);
  assert.equal(status, RAN);
  assert.match(text, /got a real runner/);
  assert.match(text, /1 skipped/);
});
