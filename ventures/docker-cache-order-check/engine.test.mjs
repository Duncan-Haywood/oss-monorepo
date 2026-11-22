import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInstructions,
  parseCopyArgs,
  isBroadCopy,
  scanText,
  escapeChar,
  scanFiles,
  hasRisk,
  summarize,
  describeFinding,
  FINDING_KINDS,
} from "./engine.mjs";

test("parseInstructions joins backslash continuations and drops comments", () => {
  const text = [
    "# a comment",
    "FROM node:20",
    "",
    "RUN apt-get update && \\",
    "    # install curl",
    "    apt-get install -y curl",
  ].join("\n");
  const instructions = parseInstructions(text);
  assert.equal(instructions.length, 2);
  assert.deepEqual(instructions[0], { lineNumber: 2, instruction: "FROM", args: "node:20" });
  assert.equal(instructions[1].instruction, "RUN");
  assert.equal(instructions[1].lineNumber, 4);
  assert.match(instructions[1].args, /apt-get update.*apt-get install -y curl/);
});

test("parseInstructions handles an unterminated trailing continuation", () => {
  const instructions = parseInstructions("RUN echo a \\\n  echo b");
  assert.equal(instructions.length, 1);
  assert.equal(instructions[0].args, "echo a echo b");
});

test("parseCopyArgs: ordinary shell form with --from and --chown flags", () => {
  const { fromStage, sources, dest } = parseCopyArgs("--from=builder --chown=1000:1000 /app/dist /srv");
  assert.equal(fromStage, "builder");
  assert.deepEqual(sources, ["/app/dist"]);
  assert.equal(dest, "/srv");
});

test("parseCopyArgs: ordinary form with no flags", () => {
  const { fromStage, sources, dest } = parseCopyArgs("package.json package-lock.json ./");
  assert.equal(fromStage, null);
  assert.deepEqual(sources, ["package.json", "package-lock.json"]);
  assert.equal(dest, "./");
});

test("parseCopyArgs: JSON-array form", () => {
  const { sources, dest } = parseCopyArgs('["package.json", "./"]');
  assert.deepEqual(sources, ["package.json"]);
  assert.equal(dest, "./");
});

test("parseCopyArgs: malformed JSON-array form reports no sources rather than guessing", () => {
  const { sources, dest } = parseCopyArgs("[not json");
  assert.deepEqual(sources, []);
  assert.equal(dest, null);
});

test("isBroadCopy: '.' and './' are broad; a named directory or file is not", () => {
  assert.equal(isBroadCopy({ sources: ["."] }), true);
  assert.equal(isBroadCopy({ sources: ["./"] }), true);
  assert.equal(isBroadCopy({ sources: ["src/"] }), false);
  assert.equal(isBroadCopy({ sources: ["package.json"] }), false);
  assert.equal(isBroadCopy({ sources: [".", "extra"] }), false);
});

test("scanText: flags npm install ordered after a broad COPY", () => {
  const dockerfile = [
    "FROM node:20",
    "WORKDIR /app",
    "COPY . .",
    "COPY package.json package-lock.json ./",
    "RUN npm ci",
  ].join("\n");
  const findings = scanText(dockerfile, "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY);
  assert.equal(findings[0].ecosystem, "npm/yarn/pnpm");
  assert.equal(findings[0].broadCopyLine, 3);
  assert.equal(findings[0].line, 4);
});

test("scanText: correctly-ordered manifest-then-install-then-broad-copy is clean", () => {
  const dockerfile = [
    "FROM node:20",
    "WORKDIR /app",
    "COPY package.json package-lock.json ./",
    "RUN npm ci",
    "COPY . .",
  ].join("\n");
  const findings = scanText(dockerfile, "Dockerfile");
  assert.deepEqual(findings, []);
});

test("scanText: flags an install with no isolated manifest copy at all", () => {
  const dockerfile = ["FROM python:3.12", "COPY . .", "RUN pip install -r requirements.txt"].join("\n");
  const findings = scanText(dockerfile, "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY);
  assert.equal(findings[0].ecosystem, "pip");
});

test("scanText: flags apt-get update run without install in the same layer", () => {
  const dockerfile = ["FROM ubuntu:24.04", "RUN apt-get update", "RUN apt-get install -y curl"].join("\n");
  const findings = scanText(dockerfile, "Dockerfile");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT);
  assert.equal(findings[0].line, 2);
});

test("scanText: apt-get update combined with install in one RUN is clean", () => {
  const dockerfile = ["FROM ubuntu:24.04", "RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*"].join(
    "\n",
  );
  assert.deepEqual(scanText(dockerfile, "Dockerfile"), []);
});

test("scanText: apt update (no -get) and dist-upgrade are also recognized", () => {
  const clean = scanText("FROM debian:12\nRUN apt update && apt dist-upgrade -y", "Dockerfile");
  assert.deepEqual(clean, []);
  const dirty = scanText("FROM debian:12\nRUN apt update", "Dockerfile");
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0].kind, FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT);
});

test("scanText: COPY --from=<stage> is a multi-stage copy, never a broad build-context copy", () => {
  const dockerfile = [
    "FROM golang:1.22 AS builder",
    "COPY go.mod go.sum ./",
    "RUN go mod download",
    "COPY . .",
    "RUN go build -o /out ./...",
    "FROM gcr.io/distroless/base",
    "COPY --from=builder /out /out",
    "RUN echo done",
  ].join("\n");
  assert.deepEqual(scanText(dockerfile, "Dockerfile"), []);
});

test("scanText: per-stage state resets at each FROM (a broad copy in an earlier stage does not taint a later one)", () => {
  const dockerfile = [
    "FROM node:20 AS deps",
    "COPY . .",
    "FROM node:20",
    "COPY package.json ./",
    "RUN npm ci",
    "COPY . .",
  ].join("\n");
  assert.deepEqual(scanText(dockerfile, "Dockerfile"), []);
});

test("scanText: JSON-array COPY form is understood the same way as shell form", () => {
  const dockerfile = ["FROM node:20", 'COPY ["package.json", "./"]', "RUN npm ci", 'COPY [".", "."]'].join("\n");
  assert.deepEqual(scanText(dockerfile, "Dockerfile"), []);
  const dirty = ["FROM node:20", 'COPY [".", "."]', 'COPY ["package.json", "./"]', "RUN npm ci"].join("\n");
  assert.equal(scanText(dirty, "Dockerfile").length, 1);
});

test("scanFiles concatenates findings across files in order", () => {
  const files = [
    { name: "a/Dockerfile", text: "FROM node:20\nCOPY . .\nRUN npm ci" },
    { name: "b/Dockerfile", text: "FROM ubuntu:24.04\nRUN apt-get update" },
  ];
  const findings = scanFiles(files);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].file, "a/Dockerfile");
  assert.equal(findings[1].file, "b/Dockerfile");
});

test("hasRisk / summarize / describeFinding agree with scanText's findings", () => {
  const dockerfile = ["FROM node:20", "COPY . .", "COPY package.json ./", "RUN npm ci"].join("\n");
  const findings = scanText(dockerfile, "Dockerfile");
  assert.equal(hasRisk(findings), true);
  assert.match(summarize(findings), /1 cache-order issue/);
  assert.match(describeFinding(findings[0]), /Dockerfile:3/);
  assert.equal(hasRisk([]), false);
  assert.equal(summarize([]), "No cache-order issues found.");
});

// Quality round 89 (portfolio/quality/audits/2026-11-19-docker-cache-order-check.json):
// each layout below was rebuilt under BuildKit and the expected verdict is
// what the real cache did after a source-only edit.
const kindsOf = (lines) => scanText(lines.join("\n")).map((f) => f.kind);

test("glob manifest copy (Docker's Node.js guide layout) is clean", () => {
  assert.deepEqual(kindsOf(["FROM node:20", "WORKDIR /app", "COPY package*.json ./", "RUN npm ci", "COPY . .", "RUN npm run build"]), []);
  assert.deepEqual(kindsOf(["FROM python:3.12", "COPY requirements*.txt ./", "RUN pip install -r requirements.txt", "COPY . ."]), []);
  assert.deepEqual(kindsOf(["FROM ruby:3.3", "COPY Gemfile* ./", "RUN bundle install", "COPY . ."]), []);
});

test("broad copy between the manifest copy and the install is flagged", () => {
  const findings = scanText(["FROM node:20", "COPY package.json ./", "COPY . .", "RUN npm ci"].join("\n"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY);
  assert.equal(findings[0].installLine, 4);
  assert.equal(findings[0].broadCopyLine, 3);
});

test("tool-setup installs are not the dependency install", () => {
  assert.deepEqual(kindsOf(["FROM python:3.12", "RUN pip install --upgrade pip", "COPY requirements.txt .", "RUN pip install -r requirements.txt", "COPY . ."]), []);
  assert.deepEqual(kindsOf(["FROM python:3.12", "RUN pip install --no-cache-dir poetry==1.8.3", "COPY pyproject.toml poetry.lock ./", "RUN poetry install"]), []);
  assert.deepEqual(kindsOf(["FROM node:20", "RUN npm install -g pnpm", "COPY package.json pnpm-lock.yaml ./", "RUN pnpm install", "COPY . ."]), []);
  // ...but the real install after a setup install is still checked.
  assert.deepEqual(kindsOf(["FROM python:3.12", "RUN pip install -U pip", "COPY . .", "RUN pip install -r requirements.txt"]),
    [FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY]);
});

test("a requirements/ directory copy names the manifest", () => {
  assert.deepEqual(kindsOf(["FROM python:3.12", "COPY requirements/ requirements/", "RUN pip install -r requirements/prod.txt", "COPY . ."]), []);
});

test("yarn build is not an install; bare yarn is", () => {
  assert.deepEqual(kindsOf(["FROM node:20", "COPY . .", "RUN yarn build"]), []);
  assert.deepEqual(kindsOf(["FROM node:20", "COPY . .", "RUN yarn --frozen-lockfile"]), [FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY]);
});

test("apt-get update with flags, alone in its RUN, is flagged", () => {
  assert.deepEqual(kindsOf(["FROM debian:12", "RUN apt-get -qq update", "RUN apt-get -qq install -y curl"]), [FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT]);
  assert.deepEqual(kindsOf(["FROM debian:12", "RUN apt-get -qq update && apt-get -y install curl"]), []);
});

// Red-team 2026-11-22, real defect: under `# escape=`` (Windows Dockerfiles)
// `COPY . C:\app\` ends with a backslash that is not a continuation. The
// parser glued `RUN npm install` onto the COPY and reported nothing.
test("an escape=` directive stops a trailing backslash hiding the install step", () => {
  const windows = "# escape=`\nFROM mcr.microsoft.com/windows/servercore:ltsc2022\nWORKDIR C:\\app\\\nCOPY . C:\\app\\\nRUN npm install\n";
  const linux = "FROM node:20\nWORKDIR /app\nCOPY . /app/\nRUN npm install\n";
  // Same finding; the Windows file is one line longer (the directive).
  assert.deepEqual(scanText(windows).map((f) => [f.line - 1, f.kind]), scanText(linux).map((f) => [f.line, f.kind]));
  assert.deepEqual(scanText(windows).map((f) => f.line), [5]);
  assert.equal(escapeChar("# hello\n# escape=`\n"), "\\");
  assert.equal(escapeChar("# syntax=docker/dockerfile:1\r\n#  ESCAPE = `\r\n"), "`");
  assert.equal(escapeChar("FROM x\n# escape=`\n"), "\\");
});
