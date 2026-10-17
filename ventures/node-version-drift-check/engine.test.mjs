import test from "node:test";
import assert from "node:assert/strict";
import {
  satisfies, parseRange, hasUpperBound, analyze, hasRisk, summarize, describeFinding,
  eolFor, FINDING_KINDS as K, TABLE_DATE,
} from "./engine.mjs";

const TODAY = "2026-10-11";
const pkg = (range, extra = {}) => ({ path: "package.json", text: JSON.stringify({ engines: { node: range }, ...extra }) });
const kinds = (r) => r.findings.map((f) => f.kind);
const wf = (body) => ({ path: ".github/workflows/ci.yml", text: body });
const SETUP = (withBody) => `jobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n${withBody}\n      - run: npm ci\n`;

test("satisfies: caret, tilde, comparators, hyphen, x-ranges, || and AND", () => {
  const cases = [
    ["20.5.0", "^20", true], ["21.0.0", "^20", false], ["0.2.5", "^0.2.3", true], ["0.3.0", "^0.2.3", false],
    ["0.0.3", "^0.0.3", true], ["0.0.4", "^0.0.3", false], ["1.9.0", "^1.2", true],
    ["20.9.9", "~20.9", true], ["20.10.0", "~20.9", false], ["20.9.5", "~20.9.1", true],
    ["18.0.0", ">=16 <20", true], ["20.0.0", ">=16 <20", false], ["22.1.0", ">= 22", true],
    ["14.5.0", "12 - 14", true], ["15.0.0", "12 - 14", false], ["12.1.0", "12.1 - 14.2.3", true],
    ["16.1.0", "16.x", true], ["17.0.0", "16.x", false], ["16.9.9", "16", true],
    ["18.5.0", "18.2 || 20", false], ["20.1.0", "18.2 || 20", true], ["1.2.3", ">1.2.3", false],
    ["1.2.4", ">1.2.3", true], ["2.0.0", ">1", true], ["1.9.9", ">1", false], ["1.2.3", "<=1.2.3", true],
    ["1.9.9", "<=1", true], ["2.0.0", "<=1", false], ["4.9.9", "<5", true], ["3.0.0", "*", true], ["3.0.0", "", true],
    ["v20.1.0", "=20", true],
  ];
  for (const [v, r, want] of cases) assert.equal(satisfies(v, r), want, `${v} vs "${r}"`);
});

test("parseRange rejects garbage and hasUpperBound reads it", () => {
  assert.equal(parseRange("lts/*"), null);
  assert.equal(parseRange("^a.b"), null);
  assert.equal(hasUpperBound(parseRange(">=18")), false);
  assert.equal(hasUpperBound(parseRange(">=18 <23")), true);
  assert.equal(hasUpperBound(parseRange("^18 || >=20")), false);
  assert.equal(hasUpperBound(parseRange("^18 || ^20")), true);
});

test("1. a pin that cannot satisfy engines.node is flagged; a partial pin that can is not", () => {
  const bad = analyze([pkg(">=22"), { path: ".nvmrc", text: "v20.11.1\n" }], { today: TODAY });
  assert.ok(kinds(bad).includes(K.PIN_VIOLATES_ENGINES));
  const ok = analyze([pkg(">=20.5"), { path: ".nvmrc", text: "20\n" }], { today: "2026-01-01" });
  assert.ok(!kinds(ok).includes(K.PIN_VIOLATES_ENGINES), "20 can mean 20.5+");
  const exact = analyze([pkg(">=20.5"), { path: ".nvmrc", text: "20.4.0\n" }], { today: "2026-01-01" });
  assert.ok(kinds(exact).includes(K.PIN_VIOLATES_ENGINES));
});

test("1. Dockerfile, .tool-versions, volta and CI pins are checked against engines", () => {
  const r = analyze([
    { path: "package.json", text: JSON.stringify({ engines: { node: "^22" }, volta: { node: "20.1.0" } }) },
    { path: "Dockerfile", text: "FROM --platform=linux/amd64 node:20.11-alpine3.19 AS build\nFROM node:22 AS run\n" },
    { path: ".tool-versions", text: "python 3.12\nnodejs 18.19.0\n" },
    wf(SETUP("          node-version: '20.x'")),
  ], { today: "2026-01-01" });
  const bad = r.findings.filter((f) => f.kind === K.PIN_VIOLATES_ENGINES).map((f) => f.file).sort();
  assert.deepEqual(bad, [".github/workflows/ci.yml", ".tool-versions", "Dockerfile", "package.json"]);
});

test("2. different majors across files are flagged once, matrix lists are exempt", () => {
  const r = analyze([
    { path: ".nvmrc", text: "22" }, { path: "Dockerfile", text: "FROM node:20-slim\n" },
    wf(SETUP("          node-version: [18, 20, 22]")),
  ], { today: "2026-01-01" });
  const d = r.findings.filter((f) => f.kind === K.MAJOR_DISAGREEMENT);
  assert.equal(d.length, 1);
  assert.match(d[0].message, /Node 20: Dockerfile/);
  assert.match(d[0].message, /Node 22: \.nvmrc/);
  assert.doesNotMatch(d[0].message, /Node 18/);
  const agree = analyze([{ path: ".nvmrc", text: "22.1.0" }, { path: "Dockerfile", text: "FROM node:22.3-slim\n" }], { today: "2026-01-01" });
  assert.ok(!kinds(agree).includes(K.MAJOR_DISAGREEMENT));
});

test("2. monorepo packages are compared per package, not across the repo", () => {
  const r = analyze([
    { path: "a/package.json", text: "{}" }, { path: "a/.nvmrc", text: "20" },
    { path: "b/package.json", text: "{}" }, { path: "b/.nvmrc", text: "22" },
  ], { today: "2026-01-01" });
  assert.ok(!kinds(r).includes(K.MAJOR_DISAGREEMENT));
});

test("3. end-of-life uses the dated table and --today", () => {
  const files = [{ path: ".nvmrc", text: "20" }];
  assert.ok(!kinds(analyze(files, { today: "2026-04-29" })).includes(K.EOL_NODE));
  assert.ok(kinds(analyze(files, { today: "2026-04-29" })).includes(K.EOL_SOON));
  assert.ok(kinds(analyze(files, { today: "2026-04-30" })).includes(K.EOL_NODE));
  assert.ok(!kinds(analyze([{ path: ".nvmrc", text: "22" }], { today: TODAY })).includes(K.EOL_NODE));
  assert.ok(kinds(analyze([{ path: ".nvmrc", text: "19" }], { today: TODAY })).includes(K.EOL_NODE));
  assert.ok(kinds(analyze([{ path: ".nvmrc", text: "6.17.1" }], { today: TODAY })).includes(K.EOL_NODE));
  assert.deepEqual(kinds(analyze([{ path: ".nvmrc", text: "99" }], { today: TODAY })), [], "unknown majors are not guessed");
});

test("3. every matrix entry is checked for end-of-life", () => {
  const r = analyze([wf(SETUP("          node-version: ${{ matrix.node }}").replace("    steps:", "    strategy:\n      matrix:\n        node: [16, 18, 22]\n    steps:"))], { today: TODAY });
  const eol = r.findings.filter((f) => f.kind === K.EOL_NODE);
  assert.equal(eol.length, 2);
  assert.ok(hasRisk(r));
});

test("4. unbounded engines with nothing pinned is flagged; a pin or a bound clears it", () => {
  assert.ok(kinds(analyze([pkg(">=18")], { today: TODAY })).includes(K.ENGINES_UNBOUNDED));
  assert.ok(!kinds(analyze([pkg(">=22 <25")], { today: TODAY })).includes(K.ENGINES_UNBOUNDED));
  assert.ok(!kinds(analyze([pkg(">=22"), { path: ".nvmrc", text: "24" }], { today: TODAY })).includes(K.ENGINES_UNBOUNDED));
  assert.ok(!kinds(analyze([pkg(">=22"), { path: "Dockerfile", text: "FROM node:24\n" }], { today: TODAY })).includes(K.ENGINES_UNBOUNDED));
  assert.ok(kinds(analyze([pkg(">=22"), { path: ".nvmrc", text: "lts/*" }], { today: TODAY })).includes(K.ENGINES_UNBOUNDED), "an alias is not a pin");
});

test("aliases and variables are notices, never guesses", () => {
  const r = analyze([
    { path: ".nvmrc", text: "lts/*\n" }, { path: "Dockerfile", text: "FROM node:lts-alpine\nFROM node\nFROM node:${V}\n" },
    wf(SETUP("          node-version: latest\n          cache: npm")),
  ], { today: TODAY });
  assert.equal(r.findings.filter((f) => f.kind === K.UNRESOLVED_PIN).length, 5);
  assert.ok(!hasRisk(r));
});

test("lts codenames resolve to their major", () => {
  const r = analyze([{ path: ".nvmrc", text: "lts/hydrogen" }], { today: TODAY });
  assert.ok(kinds(r).includes(K.EOL_NODE));
  assert.equal(r.pins[0].major, 18);
});

test("Dockerfile ARG defaults, registry prefixes, digests and line continuations are handled", () => {
  const r = analyze([{ path: "Dockerfile", text: "ARG NODE_VERSION=18\nFROM docker.io/library/node:${NODE_VERSION}-slim@sha256:abc \\\n  AS base\nFROM busybox:1\n" }], { today: TODAY });
  assert.equal(r.pins.length, 1);
  assert.equal(r.pins[0].major, 18);
});

test("workflow: block and flow matrices, include entries, node-version-file, comments", () => {
  const block = wf(`jobs:
  t:
    strategy:
      matrix:
        os: [ubuntu-latest]
        node-version:
          - 18.x # old
          - "22"
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
`);
  const r = analyze([block], { today: TODAY });
  assert.deepEqual(r.pins.map((p) => p.major), [18, 22]);
  assert.ok(r.pins.every((p) => p.matrix));

  const file = analyze([wf(SETUP("          node-version-file: '.nvmrc'")), { path: ".nvmrc", text: "22" }], { today: TODAY });
  assert.deepEqual(file.pins.map((p) => p.file), [".nvmrc"]);
  assert.equal(file.findings.length, 0);
  const missing = analyze([wf(SETUP("          node-version-file: .node-version"))], { today: TODAY });
  assert.ok(kinds(missing).includes(K.UNRESOLVED_PIN));
});

test("workflow: only actions/setup-node steps are read", () => {
  const r = analyze([wf("jobs:\n  t:\n    steps:\n      - uses: other/action@v1\n        with:\n          node-version: 10\n")], { today: TODAY });
  assert.equal(r.pins.length, 0);
});

test("engines.node allowing an end-of-life major is a notice only", () => {
  const r = analyze([pkg(">=18 <25")], { today: TODAY });
  assert.deepEqual(kinds(r), [K.ENGINES_ALLOWS_EOL]);
  assert.ok(!hasRisk(r));
});

test("invalid package.json and unreadable engines produce notices", () => {
  assert.ok(kinds(analyze([{ path: "package.json", text: "{nope" }], { today: TODAY })).includes(K.UNREADABLE));
  assert.ok(kinds(analyze([pkg("lts/*")], { today: TODAY })).includes(K.UNREADABLE));
});

test("a consistent repo is clean and summarize says so", () => {
  const r = analyze([pkg(">=22 <25"), { path: ".nvmrc", text: "v22.11.0" }, { path: "Dockerfile", text: "FROM node:22-slim" }], { today: TODAY });
  assert.deepEqual(r.findings, []);
  assert.match(summarize(r), /^No Node\.js version drift found across 1 engines\.node range\(s\) and 2 Node\.js pin\(s\)/);
  assert.match(summarize(r), new RegExp(TABLE_DATE));
});

test("describeFinding labels risk and notice, and the EOL table is dated and honest", () => {
  const r = analyze([{ path: ".nvmrc", text: "18" }], { today: TODAY });
  assert.match(describeFinding(r.findings[0]), /^\[risk\] eol-node:/);
  assert.equal(eolFor(18).eol, "2025-04-30");
  assert.equal(eolFor(20).eol, "2026-04-30");
  assert.equal(eolFor(22).eol, "2027-04-30");
  assert.equal(eolFor(24).eol, "2028-04-30");
  assert.equal(eolFor(21).approx, true);
  assert.equal(eolFor(99), null);
});
