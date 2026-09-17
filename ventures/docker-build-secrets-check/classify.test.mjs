import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENV_SECRET,
  ARG_LITERAL,
  ARG_DECLARED,
  SENSITIVE_COPY,
  looksSecret,
  parseEnvPairs,
  parseArg,
  parseCopySources,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
} from "./classify.mjs";

const CLI = fileURLToPath(new URL("./check.py", import.meta.url));

test("looksSecret: plain secret name", () => {
  assert.equal(looksSecret("SECRET"), true);
});

test("looksSecret: snake_case password", () => {
  assert.equal(looksSecret("DB_PASSWORD"), true);
});

test("looksSecret: camelCase api key", () => {
  assert.equal(looksSecret("myApiKey"), true);
});

test("looksSecret: unrelated name is not secret", () => {
  assert.equal(looksSecret("NODE_VERSION"), false);
});

test("looksSecret: USER_NAME is not a false positive", () => {
  assert.equal(looksSecret("USER_NAME"), false);
});

test("parseEnvPairs: single modern pair", () => {
  assert.deepEqual(parseEnvPairs("API_KEY=abc123"), [["API_KEY", "abc123"]]);
});

test("parseEnvPairs: multiple modern pairs", () => {
  assert.deepEqual(parseEnvPairs("NODE_ENV=production API_KEY=abc123"), [
    ["NODE_ENV", "production"],
    ["API_KEY", "abc123"],
  ]);
});

test("parseEnvPairs: quoted value", () => {
  assert.deepEqual(parseEnvPairs('API_KEY="abc 123"'), [["API_KEY", "abc 123"]]);
});

test("parseEnvPairs: legacy single-pair form", () => {
  assert.deepEqual(parseEnvPairs("PATH /usr/local/bin:/usr/bin"), [["PATH", "/usr/local/bin:/usr/bin"]]);
});

test("parseArg: no default", () => {
  assert.deepEqual(parseArg("API_TOKEN"), ["API_TOKEN", null]);
});

test("parseArg: literal default", () => {
  assert.deepEqual(parseArg("API_TOKEN=abc123"), ["API_TOKEN", "abc123"]);
});

test("parseArg: empty default is not null", () => {
  const [name, value] = parseArg("FOO=");
  assert.equal(name, "FOO");
  assert.equal(value, "");
});

test("parseCopySources: plain shell form", () => {
  assert.deepEqual(parseCopySources(".env /app/.env"), [".env"]);
});

test("parseCopySources: json array form", () => {
  assert.deepEqual(parseCopySources('["id_rsa", "package.json", "/app/"]'), ["id_rsa", "package.json"]);
});

test("parseCopySources: flags are skipped", () => {
  assert.deepEqual(parseCopySources("--chown=node:node .env /app/.env"), [".env"]);
});

test("parseCopySources: destination-only is ignored", () => {
  assert.deepEqual(parseCopySources(".env"), []);
});

test("scanText: ENV secret name is flagged", () => {
  const findings = scanText("FROM node:18\nENV API_KEY=abc123\n");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, ENV_SECRET);
  assert.equal(findings[0].name, "API_KEY");
  assert.equal(findings[0].line, 2);
});

test("scanText: ENV secret name with empty value is not flagged", () => {
  assert.deepEqual(scanText("ENV API_KEY=\n"), []);
});

test("scanText: ARG literal default is flagged", () => {
  const findings = scanText("ARG API_KEY=abc123\n");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, ARG_LITERAL);
});

test("scanText: bare ARG declaration is advisory", () => {
  const findings = scanText("ARG API_KEY\n");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, ARG_DECLARED);
});

test("scanText: ARG non-secret name is not flagged", () => {
  assert.deepEqual(scanText("ARG NODE_VERSION=18\n"), []);
});

test("scanText: COPY of .env is flagged", () => {
  const findings = scanText("COPY .env /app/.env\n");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, SENSITIVE_COPY);
});

test("scanText: COPY of an ordinary file is not flagged", () => {
  assert.deepEqual(scanText("COPY package.json ./package.json\n"), []);
});

test("scanText: commented line is ignored", () => {
  assert.deepEqual(scanText("# ENV API_KEY=abc123\nENV FOO=bar\n"), []);
});

test("scanText: backslash-continued ENV line is joined", () => {
  const findings = scanText("ENV NODE_ENV=production \\\n    API_KEY=abc123\n");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, "API_KEY");
  assert.equal(findings[0].line, 1);
});

test("scanFiles: concatenates findings across pasted files in order", () => {
  const files = [
    { name: "Dockerfile", text: "ENV API_KEY=abc123\n" },
    { name: "Dockerfile.worker", text: "ARG DB_PASSWORD=hunter2\n" },
  ];
  const findings = scanFiles(files);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].file, "Dockerfile");
  assert.equal(findings[1].file, "Dockerfile.worker");
});

test("hasUnresolvedRisk: true only for risk classes", () => {
  assert.equal(hasUnresolvedRisk([{ classification: ENV_SECRET }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: ARG_DECLARED }]), false);
  assert.equal(hasUnresolvedRisk([]), false);
});

test("classificationCounts tallies by classification", () => {
  const findings = scanText("ENV API_KEY=abc123\nARG TOKEN\n");
  const counts = classificationCounts(findings);
  assert.equal(counts[ENV_SECRET], 1);
  assert.equal(counts[ARG_DECLARED], 1);
});

test("summaryLine: flags high-risk findings", () => {
  assert.match(summaryLine(scanText("ENV API_KEY=abc123\n")), /1 high-risk finding/);
});

test("summaryLine: no findings at all", () => {
  assert.match(summaryLine([]), /No secret-looking findings/);
});

test("summaryLine: advisory-only reads as no high-risk findings", () => {
  assert.match(summaryLine(scanText("ARG API_KEY\n")), /No high-risk findings/);
});

// The guard that matters most: the CLI and the browser port must never
// disagree about what a Dockerfile instruction means. Both are run over the
// same Dockerfile text and their findings compared field for field.
test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "docker-secrets-parity-"));
  const dockerfileText = `# build a small service
FROM node:18 AS builder
ARG NODE_VERSION=18
ARG DB_PASSWORD=hunter2
ARG SIGNING_TOKEN
ENV NODE_ENV=production \\
    API_KEY=abc123
COPY package.json ./package.json
COPY .env /app/.env
COPY --chown=node:node id_rsa /root/.ssh/id_rsa
COPY ["credentials.json", "config.json", "/app/"]
RUN npm ci
`;
  writeFileSync(path.join(dir, "Dockerfile"), dockerfileText);

  const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
  const pythonFindings = JSON.parse(stdout);

  const jsFindings = scanText(dockerfileText, path.join(dir, "Dockerfile"));

  assert.equal(jsFindings.length, pythonFindings.length);
  for (let i = 0; i < jsFindings.length; i++) {
    const js = jsFindings[i];
    const py = pythonFindings[i];
    assert.equal(js.instruction, py.instruction, `instruction mismatch at index ${i}`);
    assert.equal(js.name, py.name, `name mismatch at index ${i}`);
    assert.equal(js.classification, py.classification, `classification mismatch at index ${i}`);
    assert.equal(js.line, py.line, `line mismatch at index ${i}`);
    assert.equal(js.remediation, py.remediation, `remediation mismatch at index ${i}`);
  }
});
