import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PINNED,
  MUTABLE,
  LOCAL,
  DOCKER,
  classifyUses,
  looksLikeVersionTag,
  remediationCommand,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
} from "./classify.mjs";

const SHA = "a".repeat(40);
const CLI = fileURLToPath(new URL("./check.py", import.meta.url));

test("a full commit SHA is pinned", () => {
  const { classification, action, ref } = classifyUses(`actions/checkout@${SHA}`);
  assert.equal(classification, PINNED);
  assert.equal(action, "actions/checkout");
  assert.equal(ref, SHA);
});

test("an uppercase SHA is still pinned", () => {
  assert.equal(classifyUses(`actions/checkout@${SHA.toUpperCase()}`).classification, PINNED);
});

test("a version tag is mutable", () => {
  const { classification, action, ref } = classifyUses("actions/checkout@v4");
  assert.equal(classification, MUTABLE);
  assert.equal(action, "actions/checkout");
  assert.equal(ref, "v4");
});

test("a branch name is mutable", () => {
  assert.equal(classifyUses("some-org/some-action@main").classification, MUTABLE);
});

test("a short abbreviated SHA is not pinned", () => {
  assert.equal(classifyUses("actions/checkout@a1b2c3d").classification, MUTABLE);
});

test("a local action (./) is classified local", () => {
  const { classification, action, ref } = classifyUses("./local-action");
  assert.equal(classification, LOCAL);
  assert.equal(action, "./local-action");
  assert.equal(ref, null);
});

test("a parent-relative local action is classified local", () => {
  assert.equal(classifyUses("../shared/local-action").classification, LOCAL);
});

test("a docker:// action is classified docker", () => {
  const { classification, action } = classifyUses("docker://alpine:3.19");
  assert.equal(classification, DOCKER);
  assert.equal(action, "docker://alpine:3.19");
});

test("a reference with no @ref is mutable with no ref", () => {
  const { classification, ref } = classifyUses("some-org/some-action");
  assert.equal(classification, MUTABLE);
  assert.equal(ref, null);
});

test("a quoted uses value is unquoted first", () => {
  const { classification, action } = classifyUses(`"actions/checkout@${SHA}"`);
  assert.equal(classification, PINNED);
  assert.equal(action, "actions/checkout");
});

test("looksLikeVersionTag recognizes version-shaped refs", () => {
  assert.equal(looksLikeVersionTag("v4"), true);
  assert.equal(looksLikeVersionTag("v4.1.0"), true);
  assert.equal(looksLikeVersionTag("4"), true);
  assert.equal(looksLikeVersionTag("main"), false);
  assert.equal(looksLikeVersionTag("release-branch"), false);
});

test("remediationCommand suggests refs/tags for a version tag", () => {
  assert.equal(
    remediationCommand("actions/checkout", "v4"),
    "git ls-remote https://github.com/actions/checkout refs/tags/v4",
  );
});

test("remediationCommand suggests refs/heads for a branch name", () => {
  assert.equal(
    remediationCommand("some-org/some-action", "main"),
    "git ls-remote https://github.com/some-org/some-action refs/heads/main",
  );
});

test("remediationCommand resolves a subdirectory action to the repo root", () => {
  assert.equal(
    remediationCommand("some-org/some-repo/subpath", "v1"),
    "git ls-remote https://github.com/some-org/some-repo refs/tags/v1",
  );
});

test("remediationCommand with no ref gives a bare ls-remote", () => {
  assert.equal(
    remediationCommand("some-org/some-action", null),
    "git ls-remote https://github.com/some-org/some-action",
  );
});

test("remediationCommand returns null for a malformed action", () => {
  assert.equal(remediationCommand("bare-name", "v1"), null);
});

test("scanText flags a mutable tag with remediation", () => {
  const text = "jobs:\n  build:\n    steps:\n      - uses: actions/setup-node@v4\n";
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.classification, MUTABLE);
  assert.equal(finding.action, "actions/setup-node");
  assert.equal(finding.ref, "v4");
  assert.equal(finding.file, "wf.yml");
  assert.equal(finding.line, 4);
  assert.equal(finding.remediation, "git ls-remote https://github.com/actions/setup-node refs/tags/v4");
});

test("scanText produces a clean pinned finding with no remediation key", () => {
  const text = `jobs:\n  build:\n    steps:\n      - uses: actions/checkout@${SHA}\n`;
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, PINNED);
  assert.equal("remediation" in findings[0], false);
});

test("scanText skips local actions entirely", () => {
  const text = "jobs:\n  build:\n    steps:\n      - uses: ./.github/actions/my-local-action\n";
  assert.deepEqual(scanText(text, "wf.yml"), []);
});

test("scanText skips docker actions entirely", () => {
  const text = "jobs:\n  build:\n    steps:\n      - uses: docker://alpine:3.19\n";
  assert.deepEqual(scanText(text, "wf.yml"), []);
});

test("scanText ignores a commented-out uses line", () => {
  const text = `jobs:\n  build:\n    steps:\n      # - uses: actions/setup-node@v4\n      - uses: actions/checkout@${SHA}\n`;
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, PINNED);
});

test("scanText tolerates an inline comment after the ref", () => {
  const text = "      - uses: actions/checkout@v4  # pin me later\n";
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ref, "v4");
});

test("scanText covers multiple jobs and steps", () => {
  const text = `jobs:
  build:
    steps:
      - uses: actions/checkout@${SHA}
      - uses: actions/setup-node@v4
      - run: npm test
  deploy:
    needs: build
    steps:
      - uses: actions/checkout@${SHA}
      - uses: some-org/deploy-action@main
      - uses: ./.github/actions/notify
`;
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.length, 4);
  const classifications = findings.map((f) => f.classification);
  assert.equal(classifications.filter((c) => c === PINNED).length, 2);
  assert.equal(classifications.filter((c) => c === MUTABLE).length, 2);
});

test("scanText line numbers are one-indexed and correct", () => {
  const text = "line1\nline2\n  - uses: actions/checkout@v4\n";
  const findings = scanText(text, "wf.yml");
  assert.equal(findings[0].line, 3);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const files = [
    { name: "ci.yml", text: "steps:\n  - uses: actions/checkout@v4\n" },
    { name: "deploy.yml", text: `steps:\n  - uses: actions/checkout@${SHA}\n` },
  ];
  const findings = scanFiles(files);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].file, "ci.yml");
  assert.equal(findings[1].file, "deploy.yml");
});

test("hasUnresolvedRisk is true only when a mutable finding exists", () => {
  assert.equal(hasUnresolvedRisk([{ classification: PINNED }, { classification: MUTABLE }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: PINNED }]), false);
  assert.equal(hasUnresolvedRisk([]), false);
});

test("classificationCounts tallies by classification", () => {
  const findings = scanText(`steps:\n  - uses: actions/checkout@${SHA}\n  - uses: actions/setup-node@v4\n`, "wf.yml");
  const counts = classificationCounts(findings);
  assert.equal(counts[PINNED], 1);
  assert.equal(counts[MUTABLE], 1);
});

test("summaryLine flags mutable findings", () => {
  const findings = scanText("steps:\n  - uses: actions/checkout@v4\n", "wf.yml");
  assert.match(summaryLine(findings), /1 mutable reference found/);
});

test("summaryLine reports a clean scan", () => {
  const findings = scanText(`steps:\n  - uses: actions/checkout@${SHA}\n`, "wf.yml");
  assert.match(summaryLine(findings), /pinned to a commit SHA/);
});

test("summaryLine handles no findings at all", () => {
  assert.match(summaryLine([]), /No third-party/);
});

// The guard that matters most: the CLI and the browser port must never
// disagree about what a `uses:` line means. Both are run over the same
// workflow text and their findings compared field for field, so a
// classification rule changed in one file and not the other fails here
// rather than showing a visitor a different verdict than their own CI run.
test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pinned-actions-parity-"));
  const workflowsDir = path.join(dir, ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });
  const workflowText = `name: ci
on: push
jobs:
  build:
    steps:
      - uses: actions/checkout@${SHA}
      - uses: actions/setup-node@v4
      - uses: some-org/deploy-action@main
      - uses: docker://alpine:3.19
      - uses: ./.github/actions/notify
      - uses: some-org/some-action@a1b2c3d
      - uses: some-org/bare-action
`;
  writeFileSync(path.join(workflowsDir, "ci.yml"), workflowText);

  const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
  const pythonFindings = JSON.parse(stdout);

  const jsFindings = scanText(workflowText, path.join(workflowsDir, "ci.yml"));

  assert.equal(jsFindings.length, pythonFindings.length);
  for (let i = 0; i < jsFindings.length; i++) {
    const js = jsFindings[i];
    const py = pythonFindings[i];
    assert.equal(js.action, py.action, `action mismatch at index ${i}`);
    assert.equal(js.ref, py.ref, `ref mismatch at index ${i}`);
    assert.equal(js.classification, py.classification, `classification mismatch at index ${i}`);
    assert.equal(js.line, py.line, `line mismatch at index ${i}`);
    assert.equal(js.remediation ?? null, py.remediation ?? null, `remediation mismatch at index ${i}`);
  }
});
