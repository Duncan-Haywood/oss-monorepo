import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInstructions,
  parseCopyArgs,
  isBroadCopy,
  scanText,
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
