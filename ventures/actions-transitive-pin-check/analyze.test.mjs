import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWorkflow, analyzeWorkflows, summaryLine } from "./analyze.mjs";

const WORKFLOW = `
jobs:
  build:
    steps:
      - uses: actions/checkout@8f152de45cc393bb48ce5d89d36b731f54556e65
      - uses: some-org/reusable/.github/workflows/ci.yml@1111111111111111111111111111111111111111
      - uses: some-org/composite-action@2222222222222222222222222222222222222222
      - uses: some-org/still-a-tag@v3
`;

test("analyzeWorkflow: with no fetchRef, only classifies the top level", async () => {
  const report = await analyzeWorkflow(WORKFLOW, { filename: "ci.yml" });
  assert.equal(report.checkedTransitive, false);
  assert.equal(report.findings.length, 4);
  assert.equal(report.nested.length, 0);
});

test("analyzeWorkflow: a mutable top-level ref is never fetched (that finding belongs to the sibling checker)", async () => {
  let calls = 0;
  const fetchRef = async () => { calls += 1; return "jobs: {}"; };
  const report = await analyzeWorkflow("jobs:\n  x:\n    steps:\n      - uses: some-org/tool@main\n", {
    filename: "ci.yml",
    fetchRef,
  });
  assert.equal(calls, 0);
  assert.equal(report.nested.length, 0);
});

test("analyzeWorkflow: a pinned reusable workflow that itself loads a mutable ref is flagged transitively-unpinned", async () => {
  const fetchRef = async ({ owner, repo, path }) => {
    assert.equal(owner, "some-org");
    assert.equal(repo, "reusable");
    assert.equal(path, ".github/workflows/ci.yml");
    return "jobs:\n  build:\n    steps:\n      - uses: another-org/tool@v9\n";
  };
  const report = await analyzeWorkflow(
    "jobs:\n  x:\n    steps:\n      - uses: some-org/reusable/.github/workflows/ci.yml@1111111111111111111111111111111111111111\n",
    { filename: "ci.yml", fetchRef },
  );
  assert.equal(report.checkedTransitive, true);
  assert.equal(report.transitiveRiskCount, 1);
  assert.equal(report.nested[0].status, "resolved");
  assert.equal(report.nested[0].transitivelyUnpinned[0].action, "another-org/tool");
});

test("analyzeWorkflow: a pinned reference whose definition is fully pinned underneath is clean, not a finding", async () => {
  const fetchRef = async () => "jobs:\n  x:\n    steps:\n      - uses: another-org/tool@3333333333333333333333333333333333333333\n";
  const report = await analyzeWorkflow(
    "jobs:\n  x:\n    steps:\n      - uses: some-org/composite-action@2222222222222222222222222222222222222222\n",
    { filename: "ci.yml", fetchRef },
  );
  assert.equal(report.transitiveRiskCount, 0);
  assert.equal(report.nested[0].status, "resolved");
  assert.equal(report.nested[0].transitivelyUnpinned.length, 0);
});

test("analyzeWorkflow: a fetch that returns null is unresolved, not silently clean", async () => {
  const fetchRef = async () => null;
  const report = await analyzeWorkflow(
    "jobs:\n  x:\n    steps:\n      - uses: some-org/js-action@4444444444444444444444444444444444444444\n",
    { filename: "ci.yml", fetchRef },
  );
  assert.equal(report.transitiveRiskCount, 0);
  assert.equal(report.unresolvedCount, 1);
  assert.equal(report.nested[0].status, "unresolved");
});

test("analyzeWorkflow: an action tries action.yml then action.yaml before giving up", async () => {
  const seenPaths = [];
  const fetchRef = async ({ path }) => {
    seenPaths.push(path);
    return path.endsWith(".yaml") ? "jobs: {}\nruns:\n  using: composite\n" : null;
  };
  const report = await analyzeWorkflow(
    "jobs:\n  x:\n    steps:\n      - uses: some-org/tool@5555555555555555555555555555555555555555\n",
    { filename: "ci.yml", fetchRef },
  );
  assert.deepEqual(seenPaths, ["action.yml", "action.yaml"]);
  assert.equal(report.nested[0].status, "resolved");
});

test("analyzeWorkflow: maxFetches caps the number of network calls", async () => {
  let calls = 0;
  const fetchRef = async () => { calls += 1; return null; };
  const text = [
    "jobs:",
    "  x:",
    "    steps:",
    "      - uses: org/one@1111111111111111111111111111111111111111",
    "      - uses: org/two@2222222222222222222222222222222222222222",
  ].join("\n");
  const report = await analyzeWorkflow(text, { filename: "ci.yml", fetchRef, maxFetches: 1 });
  assert.equal(calls, 1);
  assert.equal(report.nested.some((n) => n.status === "skipped-limit"), true);
});

test("analyzeWorkflows: rolls up multiple files' reports", async () => {
  const fetchRef = async () => "jobs:\n  x:\n    steps:\n      - uses: another-org/tool@v9\n";
  const result = await analyzeWorkflows(
    [
      { name: "a.yml", text: "jobs:\n  x:\n    steps:\n      - uses: some-org/reusable/.github/workflows/ci.yml@1111111111111111111111111111111111111111\n" },
      { name: "b.yml", text: "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n" },
    ],
    { fetchRef },
  );
  assert.equal(result.reports.length, 2);
  assert.equal(result.transitiveRiskCount, 1);
});

test("summaryLine: reports unresolved separately from clean", () => {
  const line = summaryLine({ transitiveRiskCount: 0, unresolvedCount: 2, checkedTransitive: true });
  assert.match(line, /could not be fetched/);
  assert.match(line, /not clean/);
});

test("summaryLine: names the count when something is transitively unpinned", () => {
  const line = summaryLine({ transitiveRiskCount: 3, unresolvedCount: 0, checkedTransitive: true });
  assert.match(line, /^3 references/);
});
