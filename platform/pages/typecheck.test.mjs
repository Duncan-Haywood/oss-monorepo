import { test } from "node:test";
import assert from "node:assert/strict";
import { optedIn, parseDiagnostics, tscArgs, optedInFiles } from "./typecheck.mjs";

test("the pragma counts only among the leading comments, where tsc reads it", () => {
  assert.ok(optedIn("// @ts-check\nexport const a = 1;\n"));
  assert.ok(optedIn("#!/usr/bin/env node\n// @ts-check\n"));
  assert.ok(optedIn("// What this file does.\n//\n/* @ts-check */\nconst a = 1;\n"));
  assert.ok(optedIn("\n\n// @ts-check\n"));
  assert.ok(!optedIn("export const a = 1;\n// @ts-check\n"));
  assert.ok(!optedIn("// @ts-nocheck\n"));
  assert.ok(!optedIn("// @ts-checked\n"));
  assert.ok(!optedIn(""));
});

test("diagnostics parse into repository-relative paths", () => {
  const out = [
    "ventures/x/calc.mjs(75,107): error TS1117: An object literal cannot have multiple properties with the same name.",
    "  some continuation line",
    "/repo/ventures/x/app.mjs(3,1): error TS2304: Cannot find name 'foo'.",
  ].join("\n");
  const d = parseDiagnostics(out, "/repo");
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { file: "ventures/x/calc.mjs", line: 75, col: 107, code: "TS1117", message: "An object literal cannot have multiple properties with the same name." });
  assert.equal(d[1].file, "ventures/x/app.mjs");
});

test("checkJs is added only when asked for, and the shared globals always load", () => {
  const plain = tscArgs("/t", ["a.mjs"]);
  assert.ok(!plain.includes("--checkJs"));
  assert.ok(plain.includes("platform/pages/typecheck-globals.d.ts"));
  assert.equal(plain.at(-1), "a.mjs");
  assert.ok(tscArgs("/t", ["a.mjs"], { checkJs: true }).includes("--checkJs"));
  assert.equal(plain[plain.indexOf("--typeRoots") + 1], "/t");
});

test("opted-in files are found per venture, and unknown slugs are skipped", () => {
  const files = optedInFiles(["bai2-statement-reader", "no-such-venture"]);
  assert.ok(files.includes("ventures/bai2-statement-reader/usage.mjs"));
  assert.ok(files.every((f) => f.startsWith("ventures/bai2-statement-reader/")));
});
