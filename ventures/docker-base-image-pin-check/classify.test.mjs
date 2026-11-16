import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PINNED,
  MUTABLE,
  STAGE,
  SCRATCH,
  VARIABLE,
  splitNameAndRef,
  classifyFrom,
  remediationCommand,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
} from "./classify.mjs";

const DIGEST = "sha256:" + "a".repeat(64);
const CLI = fileURLToPath(new URL("./check.py", import.meta.url));

test("splitNameAndRef: bare name, no tag, no digest", () => {
  assert.deepEqual(splitNameAndRef("node"), { name: "node", tag: null, digest: null });
});

test("splitNameAndRef: name with tag", () => {
  assert.deepEqual(splitNameAndRef("node:18"), { name: "node", tag: "18", digest: null });
});

test("splitNameAndRef: name with digest", () => {
  assert.deepEqual(splitNameAndRef(`node@${DIGEST}`), { name: "node", tag: null, digest: DIGEST });
});

test("splitNameAndRef: registry with port is not mistaken for a tag", () => {
  assert.deepEqual(splitNameAndRef("registry.example.com:5000/team/app:1.2"), {
    name: "registry.example.com:5000/team/app",
    tag: "1.2",
    digest: null,
  });
});

test("splitNameAndRef: registry with port and no tag", () => {
  assert.deepEqual(splitNameAndRef("registry.example.com:5000/team/app"), {
    name: "registry.example.com:5000/team/app",
    tag: null,
    digest: null,
  });
});

test("classifyFrom: digest reference is pinned", () => {
  const { classification, name, tag, digest } = classifyFrom(`node@${DIGEST}`, new Set());
  assert.equal(classification, PINNED);
  assert.equal(name, "node");
  assert.equal(tag, null);
  assert.equal(digest, DIGEST);
});

test("classifyFrom: uppercase digest hex is still pinned", () => {
  assert.equal(classifyFrom(`node@sha256:${"A".repeat(64)}`, new Set()).classification, PINNED);
});

test("classifyFrom: a specific version tag is still mutable", () => {
  // The one distinction this tool exists to draw: node:18 looks pinned and is not.
  const { classification, name, tag } = classifyFrom("node:18", new Set());
  assert.equal(classification, MUTABLE);
  assert.equal(name, "node");
  assert.equal(tag, "18");
});

test("classifyFrom: explicit latest is mutable", () => {
  assert.equal(classifyFrom("node:latest", new Set()).classification, MUTABLE);
});

test("classifyFrom: bare name with no tag is mutable", () => {
  const { classification, tag } = classifyFrom("node", new Set());
  assert.equal(classification, MUTABLE);
  assert.equal(tag, null);
});

test("classifyFrom: scratch is skipped", () => {
  assert.equal(classifyFrom("scratch", new Set()).classification, SCRATCH);
  assert.equal(classifyFrom("SCRATCH", new Set()).classification, SCRATCH);
});

test("classifyFrom: a build-stage reference is skipped", () => {
  assert.equal(classifyFrom("builder", new Set(["builder"])).classification, STAGE);
});

test("classifyFrom: an ARG substitution is variable", () => {
  assert.equal(classifyFrom("${BASE_IMAGE}", new Set()).classification, VARIABLE);
  assert.equal(classifyFrom("node:${NODE_VERSION}", new Set()).classification, VARIABLE);
});

test("remediationCommand with a tag", () => {
  assert.equal(remediationCommand("node", "18"), "docker buildx imagetools inspect node:18");
});

test("remediationCommand with no tag assumes latest", () => {
  assert.equal(remediationCommand("node", null), "docker buildx imagetools inspect node:latest");
});

test("scanText flags a mutable tag with remediation", () => {
  const findings = scanText("FROM node:18\n", "Dockerfile");
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.classification, MUTABLE);
  assert.equal(finding.image, "node");
  assert.equal(finding.tag, "18");
  assert.equal(finding.file, "Dockerfile");
  assert.equal(finding.line, 1);
  assert.equal(finding.remediation, "docker buildx imagetools inspect node:18");
});

test("scanText produces a clean pinned finding with no remediation key", () => {
  const findings = scanText(`FROM node@${DIGEST}\n`, "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, PINNED);
  assert.equal("remediation" in findings[0], false);
});

test("scanText skips a second FROM that references an earlier build stage", () => {
  const text = "FROM node:18 AS builder\nRUN npm run build\nFROM builder AS runtime\n";
  const findings = scanText(text, "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].image, "node");
});

test("scanText skips FROM scratch entirely", () => {
  assert.deepEqual(scanText("FROM scratch\nCOPY app /app\n", "Dockerfile"), []);
});

test("scanText skips a variable reference entirely", () => {
  assert.deepEqual(scanText("ARG BASE_IMAGE=node:18\nFROM ${BASE_IMAGE}\n", "Dockerfile"), []);
});

test("scanText ignores a commented-out FROM line", () => {
  const text = `# FROM node:18\nFROM node@${DIGEST}\n`;
  const findings = scanText(text, "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, PINNED);
});

test("scanText tolerates the --platform flag", () => {
  const findings = scanText("FROM --platform=linux/amd64 node:18\n", "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].image, "node");
  assert.equal(findings[0].tag, "18");
});

test("scanText covers multiple build stages", () => {
  const text = `FROM node:18 AS builder\nRUN npm run build\nFROM node@${DIGEST} AS runtime\nCOPY --from=builder /app/dist /app/dist\n`;
  const findings = scanText(text, "Dockerfile");
  assert.equal(findings.length, 2);
  const classifications = findings.map((f) => f.classification);
  assert.equal(classifications.filter((c) => c === MUTABLE).length, 1);
  assert.equal(classifications.filter((c) => c === PINNED).length, 1);
});

test("scanText line numbers are one-indexed and correct", () => {
  const findings = scanText("# comment\nARG X=1\nFROM node:18\n", "Dockerfile");
  assert.equal(findings[0].line, 3);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const files = [
    { name: "Dockerfile", text: "FROM node:18\n" },
    { name: "Dockerfile.worker", text: `FROM node@${DIGEST}\n` },
  ];
  const findings = scanFiles(files);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].file, "Dockerfile");
  assert.equal(findings[1].file, "Dockerfile.worker");
});

test("hasUnresolvedRisk is true only when a mutable finding exists", () => {
  assert.equal(hasUnresolvedRisk([{ classification: PINNED }, { classification: MUTABLE }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: PINNED }]), false);
  assert.equal(hasUnresolvedRisk([]), false);
});

test("classificationCounts tallies by classification", () => {
  const findings = scanText(`FROM node:18\nFROM node@${DIGEST} AS x\n`, "Dockerfile");
  const counts = classificationCounts(findings);
  assert.equal(counts[MUTABLE], 1);
  assert.equal(counts[PINNED], 1);
});

test("summaryLine flags mutable findings", () => {
  assert.match(summaryLine(scanText("FROM node:18\n", "Dockerfile")), /1 mutable base image reference found/);
});

test("summaryLine reports a clean scan", () => {
  assert.match(summaryLine(scanText(`FROM node@${DIGEST}\n`, "Dockerfile")), /pinned to a content digest/);
});

test("summaryLine handles no findings at all", () => {
  assert.match(summaryLine([]), /No FROM lines/);
});

// The guard that matters most: the CLI and the browser port must never
// disagree about what a FROM line means. Both are run over the same
// Dockerfile text and their findings compared field for field, so a
// classification rule changed in one file and not the other fails here
// rather than showing a visitor a different verdict than their own CI run.
test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "docker-pin-parity-"));
  const dockerfileText = `# multi-stage build
FROM node:18 AS builder
RUN npm ci && npm run build
FROM node@${DIGEST} AS runtime
COPY --from=builder /app/dist /app/dist
FROM scratch
COPY --from=runtime /app/dist /app/dist
FROM \${BASE_IMAGE}
FROM registry.example.com:5000/team/app:1.2
FROM ubuntu@not-a-real-digest
`;
  writeFileSync(path.join(dir, "Dockerfile"), dockerfileText);

  const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
  const pythonFindings = JSON.parse(stdout);

  const jsFindings = scanText(dockerfileText, path.join(dir, "Dockerfile"));

  assert.equal(jsFindings.length, pythonFindings.length);
  for (let i = 0; i < jsFindings.length; i++) {
    const js = jsFindings[i];
    const py = pythonFindings[i];
    assert.equal(js.image, py.image, `image mismatch at index ${i}`);
    assert.equal(js.tag ?? null, py.tag ?? null, `tag mismatch at index ${i}`);
    assert.equal(js.digest ?? null, py.digest ?? null, `digest mismatch at index ${i}`);
    assert.equal(js.classification, py.classification, `classification mismatch at index ${i}`);
    assert.equal(js.line, py.line, `line mismatch at index ${i}`);
    assert.equal(js.remediation ?? null, py.remediation ?? null, `remediation mismatch at index ${i}`);
  }
});

// Red-team 2026-11-16: the digest grammar's edges, which three escaped
// mutants of DIGEST_RE showed no test pinned.
test("classifyFrom: a digest using every hex digit, zeros included, is pinned", () => {
  const hex = "0123456789abcdef".repeat(4);
  assert.equal(classifyFrom(`node@sha256:${hex}`, new Set()).classification, PINNED);
});

test("classifyFrom: a 32-hex digest is the shortest one pinned; 31 is mutable", () => {
  assert.equal(classifyFrom(`node@md5:${"a".repeat(32)}`, new Set()).classification, PINNED);
  assert.equal(classifyFrom(`node@md5:${"a".repeat(31)}`, new Set()).classification, MUTABLE);
});

test("classifyFrom: an algorithm with a separator and digits (multihash+sha256) is pinned", () => {
  assert.equal(classifyFrom(`node@multihash+sha256:${"a".repeat(64)}`, new Set()).classification, PINNED);
});

// Red-team 2026-11-16, real defect: BuildKit matches stage names
// case-insensitively, so `FROM build` after `AS Build` is the stage, not a pull.
test("scanText: a stage named with different case is still the stage", () => {
  const findings = scanText("FROM node:18 AS Build\nRUN make\nFROM build\nFROM B\n", "Dockerfile");
  assert.equal(findings.length, 2);
  assert.equal(findings[0].image, "node");
  assert.equal(findings[1].image, "B");
  assert.equal(scanText("FROM node:18 AS b\nFROM B\n", "Dockerfile").length, 1);
});

// Red-team 2026-11-16, real defect: a FROM split with a backslash continuation
// was reported as image "\" with a nonsense remediation command.
test("scanText: a FROM split across lines with a backslash is read as one instruction", () => {
  const text = `FROM --platform=linux/amd64 \\\n    node:20 \\\n    AS build\nFROM build\nFROM \\\r\n  # a comment inside the continuation\n  ubuntu@${DIGEST}\r\n`;
  const findings = scanText(text, "Dockerfile");
  assert.equal(findings.length, 2);
  assert.deepEqual([findings[0].line, findings[0].image, findings[0].tag, findings[0].classification], [1, "node", "20", MUTABLE]);
  assert.equal(findings[0].remediation, "docker buildx imagetools inspect node:20");
  assert.deepEqual([findings[1].line, findings[1].image, findings[1].classification], [5, "ubuntu", PINNED]);
});
