import test from "node:test";
import assert from "node:assert/strict";
import { parseReport, filterFindings, hotspots, location, sortFindings } from "./viewer.mjs";
import example from "./example-report.mjs";

const devsecJson = JSON.stringify(example);

test("parses the devsec JSON report", () => {
  const r = parseReport(devsecJson);
  assert.equal(r.tool, "devsec-toolkit");
  assert.equal(r.findings.length, example.findings.length);
  assert.deepEqual(r.counts, example.summary.findings);
  assert.ok(r.checks.some((c) => c.id === "actions-injection" && c.status === "ok"));
});

test("findings come out most severe first", () => {
  const r = parseReport(devsecJson);
  const rank = { high: 3, medium: 2, low: 1 };
  const ranks = r.findings.map((f) => rank[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
});

test("parses a SARIF report back to the same findings", () => {
  const sarif = {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "devsec-toolkit", version: "0.1.0", rules: [
        { id: "actions-injection/script-injection", defaultConfiguration: { level: "error" }, properties: { tags: ["security", "ci-cd"] } },
        { id: "actions-timeout/job-missing-timeout", defaultConfiguration: { level: "note" }, properties: { tags: ["security", "ci-cd"] } },
      ] } },
      results: [
        { ruleId: "actions-timeout/job-missing-timeout", ruleIndex: 1, level: "note", message: { text: "no timeout" },
          locations: [{ physicalLocation: { artifactLocation: { uri: ".github/workflows/ci.yml" }, region: { startLine: 7 } } }] },
        { ruleId: "actions-injection/script-injection", ruleIndex: 0, level: "error", message: { text: "Untrusted text in a shell\nFix: use env:" },
          locations: [{ physicalLocation: { artifactLocation: { uri: ".github/workflows/pr.yml" }, region: { startLine: 17 } } }] },
      ],
    }],
  };
  const r = parseReport(JSON.stringify(sarif));
  assert.equal(r.version, "0.1.0");
  assert.deepEqual(r.counts, { high: 1, medium: 0, low: 1 });
  const [first] = r.findings;
  assert.equal(first.check, "actions-injection");
  assert.equal(first.rule, "script-injection");
  assert.equal(first.category, "ci-cd");
  assert.equal(first.message, "Untrusted text in a shell");
  assert.equal(first.fix, "use env:");
  assert.equal(location(first), ".github/workflows/pr.yml:17");
});

test("rejects text that is not a report, with a reason", () => {
  assert.throws(() => parseReport("not json"), /not JSON/);
  assert.throws(() => parseReport('{"findings": []}'), /Not a devsec-toolkit report/);
});

test("filters by severity floor, check and text", () => {
  const { findings } = parseReport(devsecJson);
  const high = filterFindings(findings, { minSeverity: "high" });
  assert.ok(high.length > 0 && high.every((f) => f.severity === "high"));
  const medUp = filterFindings(findings, { minSeverity: "medium" });
  assert.ok(medUp.length > high.length && medUp.every((f) => f.severity !== "low"));
  const k8s = filterFindings(findings, { check: "k8s-pod-security" });
  assert.ok(k8s.length > 0 && k8s.every((f) => f.check === "k8s-pod-security"));
  const docker = filterFindings(findings, { text: "DOCKERFILE" });
  assert.ok(docker.length > 0 && docker.every((f) => `${f.file} ${f.message}`.toLowerCase().includes("dockerfile")));
});

test("hotspots rank files by high findings, then total", () => {
  const spots = hotspots([
    { file: "a", severity: "low" }, { file: "a", severity: "low" }, { file: "a", severity: "low" },
    { file: "b", severity: "high" },
  ]);
  assert.deepEqual(spots.map((s) => s.file), ["b", "a"]);
});

test("unknown severities and bad lines are normalised, not trusted", () => {
  const r = parseReport(JSON.stringify({ tool: "devsec-toolkit", findings: [{ severity: "critical", line: -3, file: "x" }] }));
  assert.equal(r.findings[0].severity, "low");
  assert.equal(r.findings[0].line, null);
  assert.equal(location(r.findings[0]), "x");
  assert.deepEqual(sortFindings([]), []);
});
