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
  UNRESOLVED,
  splitNameAndRef,
  classifyFrom,
  remediationCommand,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
  parseArg,
  escapeChar,
  heredocTerminators,
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

// go-digest validates sha256 as ^[a-f0-9]{64}$, so Docker rejects upper case.
test("classifyFrom: uppercase sha256 hex is not a valid pin", () => {
  assert.equal(classifyFrom(`node@sha256:${"A".repeat(64)}`, new Set()).classification, MUTABLE);
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

test("scanText resolves a global ARG default (audit 2026-11-17 defect 0)", () => {
  const [f] = scanText("ARG NODE_VERSION=18\nFROM node:${NODE_VERSION}-alpine\n", "Dockerfile");
  assert.equal(f.classification, MUTABLE);
  assert.equal(f.tag, "18-alpine");
  assert.equal(f.from_arg, "node:${NODE_VERSION}-alpine");
});

test("scanText reports an ARG with no default as unresolved, a risk", () => {
  const findings = scanText("ARG V\nFROM node:$V\n", "Dockerfile");
  assert.equal(findings[0].classification, UNRESOLVED);
  assert.deepEqual(findings[0].unresolved_args, ["V"]);
  assert.equal(hasUnresolvedRisk(findings), true);
});

test("scanText: an ARG inside a stage does not reach a later FROM", () => {
  const findings = scanText(`FROM alpine@${DIGEST}\nARG V=18\nFROM node:\${V}\n`, "Dockerfile");
  assert.equal(findings[1].classification, UNRESOLVED);
});

test("truncated and upper-case sha256 digests are not pinned", () => {
  assert.equal(classifyFrom("node@sha256:" + "a".repeat(40), new Set()).classification, MUTABLE);
  assert.equal(classifyFrom("node@sha256:" + "A".repeat(64), new Set()).classification, MUTABLE);
});

test("remediation for a malformed digest on a tagged image keeps the tag", () => {
  const [f] = scanText("FROM node:18@sha256:abc\n", "Dockerfile");
  assert.equal(f.remediation, "docker buildx imagetools inspect node:18");
});

test("summaryLine with FROM lines but nothing pulled does not say there are none", () => {
  const stats = {};
  const findings = scanText("FROM scratch\n", "Dockerfile", stats);
  assert.equal(stats.fromLines, 1);
  assert.doesNotMatch(summaryLine(findings, stats.fromLines), /No FROM lines/);
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
FROM node:18@sha256:abc
FROM ubuntu@sha256:${"a".repeat(40)}
`;
  const argText = `ARG NODE_VERSION=18
ARG REG
ARG PIN=sha256:${"c".repeat(64)}
FROM node:\${NODE_VERSION}-alpine
FROM \${REG}/app:1
FROM \${REG}/app@sha256:${"d".repeat(64)}
FROM node@\${PIN}
FROM \${REG:-docker.io}/library/python:3.12
FROM python:\${NODE_VERSION:-3.11}
`;
  for (const [label, text] of [["plain", dockerfileText], ["build args", argText]]) {
    writeFileSync(path.join(dir, "Dockerfile"), text);
    const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
    const pythonFindings = JSON.parse(stdout);
    const jsFindings = scanText(text, path.join(dir, "Dockerfile"));
    assert.equal(jsFindings.length, pythonFindings.length, label);
    for (let i = 0; i < jsFindings.length; i++) {
      const js = jsFindings[i];
      const py = pythonFindings[i];
      for (const key of ["image", "tag", "digest", "classification", "line", "remediation", "from_arg", "note"]) {
        assert.equal(js[key] ?? null, py[key] ?? null, `${label}: ${key} mismatch at index ${i}`);
      }
      assert.deepEqual(js.unresolved_args ?? null, py.unresolved_args ?? null, `${label}: unresolved_args at ${i}`);
    }
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
test("scanText: a backslash right after the tag drops only the backslash", () => {
  // No space before the continuation: only the "\\" goes, so the tag keeps
  // its last character (node:20, not node:2) and the alias still applies.
  const findings = scanText("FROM node:20\\\n  AS build\nFROM build\n", "Dockerfile");
  assert.equal(findings.length, 1);
  assert.deepEqual([findings[0].line, findings[0].image, findings[0].tag], [1, "node", "20"]);
});

test("scanText: a FROM split across lines with a backslash is read as one instruction", () => {
  const text = `FROM --platform=linux/amd64 \\\n    node:20 \\\n    AS build\nFROM build\nFROM \\\r\n  # a comment inside the continuation\n  ubuntu@${DIGEST}\r\n`;
  const findings = scanText(text, "Dockerfile");
  assert.equal(findings.length, 2);
  assert.deepEqual([findings[0].line, findings[0].image, findings[0].tag, findings[0].classification], [1, "node", "20", MUTABLE]);
  assert.equal(findings[0].remediation, "docker buildx imagetools inspect node:20");
  assert.deepEqual([findings[1].line, findings[1].image, findings[1].classification], [5, "ubuntu", PINNED]);
});

// Red-team 2026-11-19: an escaped mutant (`value !== ""` flipped in the `:-`
// branch) showed no test set an ARG that has a `:-` default.
test("expandArgs: a set, non-empty ARG beats its :- default; an empty one does not", () => {
  const set = scanText("ARG V=3.12\nFROM python:${V:-3.11}\n", "Dockerfile");
  assert.deepEqual([set[0].image, set[0].tag], ["python", "3.12"]);
  const empty = scanText('ARG V=""\nFROM python:${V:-3.11}\n', "Dockerfile");
  assert.equal(empty[0].tag, "3.11");
});

// Red-team 2026-11-19: check.py read files as plain utf-8, so a byte order
// mark hid the first FROM from the CLI while this page still saw it.
test("scanText and check.py agree on a Dockerfile that starts with a UTF-8 BOM", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dbc-bom-"));
  writeFileSync(path.join(dir, "Dockerfile"), "\uFEFFFROM node:18\n");
  const py = JSON.parse(execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" }));
  const js = scanText("\uFEFFFROM node:18\n", "Dockerfile");
  assert.equal(js.length, 1);
  assert.equal(py.length, 1);
  assert.equal(py[0].tag, js[0].tag);
});

test("parseArg strips double quotes as well as single (red-team 2026-11-20)", () => {
  // Only the single-quoted form was tested, so a fault in the '"' test escaped.
  for (const q of ['"', "'"]) {
    const args = new Map();
    parseArg(`BASE=${q}node@${DIGEST}${q}`, args);
    assert.equal(args.get("BASE"), `node@${DIGEST}`);
    const [f] = scanText(`ARG BASE=${q}node@${DIGEST}${q}\nFROM \${BASE}\n`, "Dockerfile");
    assert.equal(f.classification, "pinned");
  }
});

// Red-team 2026-11-22, real defect: under `# escape=`` (Windows Dockerfiles)
// a trailing backslash, as in `WORKDIR C:\app\`, is not a continuation. The
// scan glued the next FROM onto the WORKDIR and never reported its tag.
test("an escape=` directive stops a trailing backslash hiding the next FROM", () => {
  const text = `# escape=\`\nFROM mcr.microsoft.com/windows/servercore@${DIGEST}\nWORKDIR C:\\app\\\nFROM mcr.microsoft.com/powershell:latest\n`;
  assert.deepEqual(
    scanText(text, "Dockerfile").map((f) => [f.line, f.classification]),
    [[2, "pinned"], [4, "mutable"]],
  );
  const tick = scanText("# escape=`\r\nFROM `\r\n  node:18 AS build\r\nFROM build\r\n", "Dockerfile");
  assert.deepEqual(tick.map((f) => [f.line, f.tag]), [[2, "18"]]);
  assert.equal(escapeChar("# hello\n# escape=`\n"), "\\");
  assert.equal(escapeChar("# syntax=docker/dockerfile:1\n#  ESCAPE = `\n"), "`");
  assert.equal(escapeChar("FROM x\n# escape=`\n"), "\\");
  // The CLI reads the same file the same way.
  const dir = mkdtempSync(path.join(tmpdir(), "dbc-escape-"));
  writeFileSync(path.join(dir, "Dockerfile"), text);
  const py = JSON.parse(execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" }));
  assert.deepEqual(py.map((f) => [f.line, f.classification]), [[2, "pinned"], [4, "mutable"]]);
});

// Red team 2026-11-22 (second run): a heredoc's body is not part of the
// Dockerfile's instructions. A RUN or COPY that writes a nested Dockerfile
// with <<EOF used to have its `FROM alpine:latest` line reported as a
// mutable base image of this file.
const HEREDOC_FILE = [
  "FROM python:3.12@" + DIGEST + " AS build",
  "COPY <<EOF /srv/Dockerfile",
  "FROM alpine:latest",
  "EOF",
  "RUN <<-'SCRIPT' cat > /tmp/a <<\"INNER\"",
  "\tFROM debian:12",
  "\tSCRIPT",
  "FROM ubuntu:latest",
  "INNER",
  "FROM node:20",
].join("\n");

test("scanText skips FROM lines inside RUN/COPY heredocs, and reads the FROM after them", () => {
  assert.deepEqual(
    scanText(HEREDOC_FILE).map((f) => [f.line, f.classification, f.image]),
    [[1, PINNED, "python:3.12"], [10, MUTABLE, "node"]],
  );
  const dir = mkdtempSync(path.join(tmpdir(), "dbc-heredoc-"));
  writeFileSync(path.join(dir, "Dockerfile"), HEREDOC_FILE.replace(/\n/g, "\r\n"));
  const py = JSON.parse(execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" }));
  assert.deepEqual(py.map((f) => [f.line, f.classification]), [[1, PINNED], [10, MUTABLE]]);
  assert.deepEqual(scanText(HEREDOC_FILE.replace(/\n/g, "\r\n")).map((f) => f.line), [1, 10]);
});

test("heredocTerminators reads only RUN, COPY and ADD openers", () => {
  assert.deepEqual(heredocTerminators("RUN <<EOF"), [{ name: "EOF", chomp: false }]);
  assert.deepEqual(heredocTerminators("run 2<<-\"X\" cat"), [{ name: "X", chomp: true }]);
  assert.deepEqual(heredocTerminators("ADD <<a /a <<b /b"), [{ name: "a", chomp: false }, { name: "b", chomp: false }]);
  assert.deepEqual(heredocTerminators("RUN echo $((1<<2)) '<<EOF' <<< x"), []);
  assert.deepEqual(heredocTerminators("LABEL x=<<EOF"), []);
  assert.deepEqual(heredocTerminators("ENV <<EOF"), []);
});

test("an unclosed shell shift does not swallow the next FROM", () => {
  const text = "FROM a:1 AS one\nRUN echo $((1<<2))\nFROM b:2\n";
  assert.deepEqual(scanText(text).map((f) => f.line), [1, 3]);
});

test("a sha512 digest of exactly 128 hex characters is pinned (mutation-found)", () => {
  assert.equal(scanText("FROM nginx@sha512:" + "a".repeat(128))[0].classification, PINNED);
  assert.equal(scanText("FROM nginx@sha512:" + "a".repeat(129))[0].classification, MUTABLE);
});

test("a FROM whose continuation runs off the end of the file is still read (mutation-found)", () => {
  const f = scanText("FROM nginx:latest \\");
  assert.deepEqual(f.map((x) => [x.line, x.classification]), [[1, MUTABLE]]);
});
