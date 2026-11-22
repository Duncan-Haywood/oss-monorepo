// Differential tests for parseExampleFile against the .env loaders people
// actually run. eval/README.md has the full four-loader measurement (Node
// util.parseEnv, npm dotenv 16.4.7 and 17.2.3, python-dotenv 1.0.1); this file
// pins the cases where those loaders agree, and runs a seeded comparison
// against util.parseEnv, which ships inside Node 22 and needs no download.
import test from "node:test";
import assert from "node:assert/strict";
import * as util from "node:util";

// util.parseEnv arrived in Node 21.7; on older Node the seeded test skips.
const parseEnv = util.parseEnv;
import { parseExampleFile, scanSource, diffEnv } from "./engine.mjs";

const keys = (text) => [...parseExampleFile(text).keys()].sort();

// Each row: what all four loaders declared (measured 2026-11-22, eval/README.md).
const CONSENSUS = [
  ["plain", "A=1\n", ["A"]],
  ["dotted key", "APP.NAME=1\n", ["APP.NAME"]],
  ["dashed key", "my-key=1\n", ["my-key"]],
  ["digit-leading key", "9LIVES=1\n", ["9LIVES"]],
  ["double-quoted multi-line value hides B", 'A="x\nB=2\ny"\n', ["A"]],
  ["single-quoted multi-line value hides B", "A='x\nB=2\ny'\n", ["A"]],
  ["multi-line value with CRLF", 'A="x\r\nB=2\r\ny"\r\nC=3\r\n', ["A", "C"]],
  ["comment inside a multi-line value", 'A="x\n# B=2\ny"\nC=3\n', ["A", "C"]],
  ["# inside quotes", 'A="x # y"\nB=2\n', ["A", "B"]],
  ["a PEM key's base64 line ending in = padding", 'KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjAN\nAQAB==\n-----END PUBLIC KEY-----"\nPORT=1\n', ["KEY", "PORT"]],
];

for (const [name, text, expected] of CONSENSUS) {
  test(`parseExampleFile matches every loader: ${name}`, () => {
    assert.deepEqual(keys(text), expected);
  });
}

// Three of the four loaders (both dotenv versions and python-dotenv) agree;
// util.parseEnv is the odd one out, so these are pinned rather than diffed.
test("an escaped quote does not close a multi-line value (dotenv, python-dotenv)", () => {
  assert.deepEqual(keys('A="x\\"\nB=2\ny"\n'), ["A"]);
});
test("a lone \\r ends a line (dotenv, python-dotenv)", () => {
  assert.deepEqual(keys("A=1\rB=2\r"), ["A", "B"]);
});
test("a quote that never closes leaves the value on its own line (Node, dotenv)", () => {
  assert.deepEqual(keys('A="x\nB=2\n'), ["A", "B"]);
});

// Node 22's util.parseEnv reads `A= ` (empty value, then a space) as taking
// the next line for its value, so B vanishes; dotenv 16/17 and python-dotenv
// both read A as empty and B as declared (measured 2026-11-22).
test("an empty value with a trailing space does not swallow the next line (dotenv, python-dotenv)", () => {
  assert.deepEqual(keys("A= \nB=1\n"), ["A", "B"]);
});

test("a phantom declaration inside a multi-line value no longer hides a missing variable", () => {
  const declared = parseExampleFile('CERT="-----BEGIN-----\nAPI_KEY=example\n-----END-----"\n');
  const report = diffEnv({ declared, referenced: scanSource("process.env.CERT; process.env.API_KEY;") });
  assert.deepEqual(report.missing.map((m) => m.name), ["API_KEY"]);
});

test("a dashed key read through a quoted form matches its declaration", () => {
  const declared = parseExampleFile("my-key=1\nAPP.NAME=x\n");
  const referenced = scanSource(`process.env["my-key"]; os.getenv("APP.NAME")`);
  const report = diffEnv({ declared, referenced });
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.unused, []);
});

test("process.env.FOO.trim() still reads FOO, not FOO.trim", () => {
  assert.deepEqual([...scanSource("process.env.FOO.trim()").keys()], ["FOO"]);
});

// Seeded comparison with util.parseEnv over files built only from features
// on which all four loaders agree (no escapes, no lone \r, no colon
// separators, every quote closes on a line with nothing after it, and no
// empty value after a trailing space: see the util.parseEnv test above).
function rng(seed) {
  let s = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const NAMES = ["FOO", "BAR_1", "_X", "db_url", "APP.NAME", "my-key", "9LIVES", "A"];
const VALUES = ["1", "hello world", "a=b", "http://x/y?a=b", "${HOME}/p"];
function genFile(seed) {
  const r = rng(seed);
  const out = [];
  for (let n = 1 + Math.floor(r() * 8); n > 0; n--) {
    const roll = r();
    if (roll < 0.1) { out.push(""); continue; }
    const head = pick(r, ["", "  ", "export "]) + pick(r, NAMES) + pick(r, ["=", " = ", "= "]);
    const v = pick(r, VALUES);
    const inner = pick(r, NAMES) + pick(r, ["=inside", "=", ""]);
    const q = pick(r, ['"', "'", "`"]);
    const line = roll < 0.2 ? "# " + head + v
      : roll < 0.55 ? head + v
      : roll < 0.75 ? head + q + v + q
      : head + q + v + "\n" + inner + "\nend" + q;
    out.push(line);
  }
  return out.join(r() < 0.2 ? "\r\n" : "\n") + "\n";
}

test("parseExampleFile agrees with node:util parseEnv on 5,000 seeded files", { skip: !parseEnv && "needs Node >= 21.7" }, () => {
  const disagreements = [];
  for (let seed = 1; seed <= 5000; seed++) {
    const text = genFile(seed);
    const ours = keys(text);
    const node = Object.keys(parseEnv(text)).sort();
    if (JSON.stringify(ours) !== JSON.stringify(node)) disagreements.push({ seed, text, ours, node });
  }
  assert.deepEqual(disagreements.slice(0, 3), []);
});
