import test from "node:test";
import assert from "node:assert/strict";

import { parseXml, extractTestcases, classifyRuns, summarizeRuns } from "./classify.mjs";

function junit(cases) {
  const body = cases
    .map(({ classname = "suite.Thing", name, outcome = "pass", message = "boom" }) => {
      if (outcome === "pass") return `<testcase classname="${classname}" name="${name}" time="0.01"/>`;
      if (outcome === "fail") return `<testcase classname="${classname}" name="${name}" time="0.01"><failure message="${message}">trace</failure></testcase>`;
      if (outcome === "error") return `<testcase classname="${classname}" name="${name}" time="0.01"><error message="${message}">trace</error></testcase>`;
      if (outcome === "skip") return `<testcase classname="${classname}" name="${name}" time="0.01"><skipped/></testcase>`;
      throw new Error(`unknown outcome ${outcome}`);
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="suite" tests="${cases.length}">\n${body}\n</testsuite></testsuites>`;
}

test("parseXml throws a plain error on non-XML input", () => {
  assert.throws(() => parseXml("not xml at all"), /paste a JUnit XML report/);
});

test("parseXml handles CDATA and entities without choking", () => {
  const tree = parseXml(`<a><b msg="x &amp; y">1 &lt; 2<![CDATA[<raw> & stuff]]></b></a>`);
  assert.equal(tree.children[0].tag, "a");
});

test("extractTestcases reads classname, name, and pass/fail/skip status", () => {
  const rows = extractTestcases(
    junit([
      { name: "test_one", outcome: "pass" },
      { name: "test_two", outcome: "fail", message: "AssertionError" },
      { name: "test_three", outcome: "skip" },
    ]),
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.status),
    ["passed", "failed", "skipped"],
  );
  assert.equal(rows[1].message, "AssertionError");
});

test("a test that fails in one run and passes in another is flaky", () => {
  const runA = junit([{ name: "test_login", outcome: "fail" }]);
  const runB = junit([{ name: "test_login", outcome: "pass" }]);
  const rows = classifyRuns([
    { label: "attempt 1", xml: runA },
    { label: "attempt 2", xml: runB },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, "flaky");
  assert.equal(rows[0].passed, 1);
  assert.equal(rows[0].failed, 1);
});

test("a test that fails in every run is broken, not flaky", () => {
  const rows = classifyRuns([
    { label: "run 1", xml: junit([{ name: "test_checkout", outcome: "fail" }]) },
    { label: "run 2", xml: junit([{ name: "test_checkout", outcome: "fail" }]) },
    { label: "run 3", xml: junit([{ name: "test_checkout", outcome: "fail" }]) },
  ]);
  assert.equal(rows[0].verdict, "broken");
  assert.equal(rows[0].failed, 3);
  assert.equal(rows[0].passed, 0);
});

test("a test that passes everywhere is stable", () => {
  const rows = classifyRuns([
    { label: "run 1", xml: junit([{ name: "test_home", outcome: "pass" }]) },
    { label: "run 2", xml: junit([{ name: "test_home", outcome: "pass" }]) },
  ]);
  assert.equal(rows[0].verdict, "stable");
});

test("a test present only in some runs (rerun-failed-only CI) is still classified correctly", () => {
  // run 1: full suite, test_flaky fails. run 2: only reruns previously-failed
  // tests, so it's the *only* test present — and it passes. This is the most
  // common real shape and must not be misread as "missing", it must count.
  const rows = classifyRuns([
    { label: "full suite", xml: junit([{ name: "test_stable", outcome: "pass" }, { name: "test_flaky", outcome: "fail" }]) },
    { label: "rerun of failures", xml: junit([{ name: "test_flaky", outcome: "pass" }]) },
  ]);
  const flaky = rows.find((r) => r.name === "test_flaky");
  const stable = rows.find((r) => r.name === "test_stable");
  assert.equal(flaky.verdict, "flaky");
  assert.equal(flaky.seenInRuns, 2);
  assert.equal(stable.verdict, "stable");
  assert.equal(stable.seenInRuns, 1);
});

test("same classname disambiguates tests with the same short name in different suites", () => {
  const rows = classifyRuns([
    {
      xml: junit([
        { classname: "pkg.A", name: "test_it", outcome: "pass" },
        { classname: "pkg.B", name: "test_it", outcome: "fail" },
      ]),
    },
  ]);
  assert.equal(rows.length, 2);
  const verdicts = Object.fromEntries(rows.map((r) => [r.classname, r.verdict]));
  assert.equal(verdicts["pkg.A"], "stable");
  assert.equal(verdicts["pkg.B"], "broken");
});

test("multiple <testcase> attempts for the same test within one file (pytest-rerunfailures) are both counted", () => {
  const xml = `<testsuite>
    <testcase classname="t" name="test_retry" time="0.1"><error message="setup failed, will retry">trace</error></testcase>
    <testcase classname="t" name="test_retry" time="0.1"/>
  </testsuite>`;
  const rows = classifyRuns([{ xml }]);
  assert.equal(rows[0].verdict, "flaky");
  assert.equal(rows[0].failed, 1);
  assert.equal(rows[0].passed, 1);
});

test("Surefire/Failsafe flakyFailure element is treated as a flaky signal even with a single passing outcome", () => {
  const xml = `<testsuite>
    <testcase classname="t" name="test_x" time="0.2">
      <flakyFailure message="first attempt failed">trace</flakyFailure>
    </testcase>
  </testsuite>`;
  const rows = classifyRuns([{ xml }]);
  assert.equal(rows[0].verdict, "flaky");
});

test("classifyRuns rejects an empty run list rather than returning nothing silently", () => {
  assert.throws(() => classifyRuns([]), /at least one run/);
});

test("a per-run parse error names which run failed", () => {
  assert.throws(() => classifyRuns([{ label: "run 2", xml: "garbage" }]), /run 2/);
});

test("summarizeRuns reports flaky first even when broken tests also exist", () => {
  const rows = classifyRuns([
    { xml: junit([{ name: "test_a", outcome: "fail" }, { name: "test_b", outcome: "fail" }]) },
    { xml: junit([{ name: "test_a", outcome: "pass" }, { name: "test_b", outcome: "fail" }]) },
  ]);
  const summary = summarizeRuns(rows, 2);
  assert.equal(summary.status, "flaky");
  assert.match(summary.text, /1 of 2/);
});

test("summarizeRuns with no failures at all reads as stable", () => {
  const rows = classifyRuns([{ xml: junit([{ name: "test_a", outcome: "pass" }]) }]);
  const summary = summarizeRuns(rows, 1);
  assert.equal(summary.status, "stable");
});

test("delimiter-containing identities do not turn unrelated failures into flakiness", () => {
  const cases = [
    { classname: "pkg::Suite", name: "test_it", outcome: "pass" },
    { classname: "pkg", name: "Suite::test_it", outcome: "fail" },
    { classname: "", name: "pkg::Suite::test_it", outcome: "skip" },
  ];
  const rows = classifyRuns([{ xml: junit(cases) }, { xml: junit(cases) }]);
  assert.equal(rows.length, 3);
  for (const [index, verdict] of ["stable", "broken", "skipped-only"].entries()) {
    const row = rows.find((r) => r.classname === cases[index].classname);
    assert.equal(row.name, cases[index].name);
    assert.equal(row.verdict, verdict);
    assert.equal(row.seenInRuns, 2);
    assert.equal(row.passed + row.failed + row.skipped, 2);
  }
  assert.equal(summarizeRuns(rows, 2).status, "broken");
});
