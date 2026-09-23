import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  EOL,
  EOL_SOON,
  SUPPORTED,
  DEPRECATED_IMAGE,
  UNKNOWN_TAG,
  UNKNOWN_IMAGE,
  STAGE,
  SCRATCH,
  VARIABLE,
  EOL_DATA,
  splitNameAndTag,
  normalizeTag,
  classifyFrom,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
} from "./classify.mjs";

const CLI = fileURLToPath(new URL("./check.py", import.meta.url));
const TODAY = new Date("2026-09-23T00:00:00Z");

test("EOL_DATA is byte-identical to check.py's table", () => {
  // The one guard against the two hand-written tables drifting: shell out
  // to the CLI's own --dump-data and diff. Without this, a date edited in
  // one file and not the other would ship a page and a CLI that silently
  // disagree about the same Dockerfile.
  const raw = execFileSync("python3", [CLI, "--dump-data"], { encoding: "utf8" });
  const fromPython = JSON.parse(raw);
  assert.deepEqual(fromPython, EOL_DATA);
});

test("splitNameAndTag: bare name, no tag", () => {
  assert.deepEqual(splitNameAndTag("node"), { name: "node", tag: null });
});

test("splitNameAndTag: registry with port is not mistaken for a tag", () => {
  assert.deepEqual(splitNameAndTag("registry.example.com:5000/team/node:18"), {
    name: "registry.example.com:5000/team/node",
    tag: "18",
  });
});

test("splitNameAndTag: digest reference has no tag", () => {
  const digest = "sha256:" + "a".repeat(64);
  assert.deepEqual(splitNameAndTag(`node@${digest}`), { name: "node", tag: null });
});

test("normalizeTag strips an OS/variant suffix", () => {
  assert.equal(normalizeTag("18-bookworm"), "18");
  assert.equal(normalizeTag("3.11-slim"), "3.11");
});

test("classifyFrom: stage reference is skipped", () => {
  assert.equal(classifyFrom("builder", new Set(["builder"]), TODAY).classification, STAGE);
});

test("classifyFrom: scratch is skipped", () => {
  assert.equal(classifyFrom("scratch", new Set(), TODAY).classification, SCRATCH);
});

test("classifyFrom: a build-arg substitution is skipped", () => {
  assert.equal(classifyFrom("${BASE_IMAGE}", new Set(), TODAY).classification, VARIABLE);
});

test("classifyFrom: no tag is unknown-tag, not silently supported", () => {
  assert.equal(classifyFrom("node", new Set(), TODAY).classification, UNKNOWN_TAG);
});

test("classifyFrom: latest is unknown-tag", () => {
  assert.equal(classifyFrom("node:latest", new Set(), TODAY).classification, UNKNOWN_TAG);
});

test("classifyFrom: an image outside the curated table is unknown-image", () => {
  assert.equal(classifyFrom("myregistry/custom-base:7", new Set(), TODAY).classification, UNKNOWN_IMAGE);
});

test("classifyFrom: openjdk is flagged deprecated-image regardless of tag", () => {
  const result = classifyFrom("openjdk:17-jdk", new Set(), TODAY);
  assert.equal(result.classification, DEPRECATED_IMAGE);
  assert.match(result.note, /eclipse-temurin/);
});

test("classifyFrom: eclipse-temurin is not flagged deprecated", () => {
  assert.notEqual(classifyFrom("eclipse-temurin:17-jdk", new Set(), TODAY).classification, DEPRECATED_IMAGE);
});

test("classifyFrom: node:18 is past EOL as of the fixed reference date", () => {
  const result = classifyFrom("node:18", new Set(), TODAY);
  assert.equal(result.classification, EOL);
  assert.ok(result.daysPastEol > 0);
});

test("classifyFrom: node:18 with an OS suffix still resolves", () => {
  assert.equal(classifyFrom("node:18-bookworm-slim", new Set(), TODAY).classification, EOL);
});

test("classifyFrom: node:22 is supported as of the fixed reference date", () => {
  assert.equal(classifyFrom("node:22", new Set(), TODAY).classification, SUPPORTED);
});

test("classifyFrom: debian codename resolves to the same cycle as the numeric tag", () => {
  const byCodename = classifyFrom("debian:bullseye", new Set(), TODAY);
  const byNumber = classifyFrom("debian:11-slim", new Set(), TODAY);
  assert.equal(byCodename.classification, byNumber.classification);
  assert.equal(byCodename.cycle, byNumber.cycle);
});

test("classifyFrom: ubuntu codename resolves to its numeric release", () => {
  assert.equal(classifyFrom("ubuntu:focal", new Set(), TODAY).cycle, "20.04");
});

test("classifyFrom: eol-soon window is configurable", () => {
  // Python 3.10 EOL 2026-10-04 -- 11 days after the fixed reference date.
  const narrow = classifyFrom("python:3.10-slim", new Set(), TODAY, 5);
  const wide = classifyFrom("python:3.10-slim", new Set(), TODAY, 90);
  assert.equal(narrow.classification, SUPPORTED);
  assert.equal(wide.classification, EOL_SOON);
});

test("classifyFrom: the library/ official-image prefix does not change the verdict", () => {
  assert.equal(classifyFrom("library/node:18", new Set(), TODAY).classification, EOL);
});

test("scanText: multi-stage Dockerfile classifies each stage independently", () => {
  const text = "FROM node:18 AS builder\nWORKDIR /app\nFROM node:22 AS runtime\nCOPY --from=builder /app/dist ./dist\n";
  const findings = scanText(text, "Dockerfile", TODAY);
  assert.deepEqual(findings.map((f) => f.classification), [EOL, SUPPORTED]);
});

test("scanText: a commented-out FROM line is ignored", () => {
  const findings = scanText("# FROM node:18\nFROM node:22\n", "Dockerfile", TODAY);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].image, "node");
});

test("scanFiles concatenates findings across multiple pasted files in order", () => {
  const findings = scanFiles(
    [
      { name: "a/Dockerfile", text: "FROM node:18\n" },
      { name: "b/Dockerfile", text: "FROM node:22\n" },
    ],
    TODAY,
  );
  assert.deepEqual(findings.map((f) => f.file), ["a/Dockerfile", "b/Dockerfile"]);
});

test("hasUnresolvedRisk is true for eol and deprecated-image, false for eol-soon alone", () => {
  assert.equal(hasUnresolvedRisk([{ classification: EOL }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: DEPRECATED_IMAGE }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: EOL_SOON }]), false);
});

test("classificationCounts tallies each classification", () => {
  const counts = classificationCounts([{ classification: EOL }, { classification: EOL }, { classification: SUPPORTED }]);
  assert.deepEqual(counts, { [EOL]: 2, [SUPPORTED]: 1 });
});

test("summaryLine names risk before eol-soon before an all-clear", () => {
  assert.match(summaryLine([{ classification: EOL }, { classification: EOL_SOON }]), /past end-of-life or discontinued/);
  assert.match(summaryLine([{ classification: EOL_SOON }]), /reach end-of-life within/);
  assert.match(summaryLine([{ classification: SUPPORTED }]), /No base image/);
  assert.match(summaryLine([]), /No FROM lines found/);
});
