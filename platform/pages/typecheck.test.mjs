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

test("walk skips node_modules, dist and dot directories, and a tsconfig venture is left to its own tsc", async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const plain = join(root, "ventures", "zz-redteam-fixture");
  const ts = join(root, "ventures", "zz-redteam-fixture-ts");
  try {
    for (const d of ["src", "node_modules/x", "dist", ".hidden"]) mkdirSync(join(plain, d), { recursive: true });
    for (const d of ["src", "node_modules/x", "dist", ".hidden"]) writeFileSync(join(plain, d, "a.mjs"), "// @ts-check\n");
    mkdirSync(ts, { recursive: true });
    writeFileSync(join(ts, "a.mjs"), "// @ts-check\n");
    writeFileSync(join(ts, "tsconfig.json"), "{}");
    assert.deepEqual(optedInFiles(["zz-redteam-fixture"]), ["ventures/zz-redteam-fixture/src/a.mjs"]);
    assert.deepEqual(optedInFiles(["zz-redteam-fixture-ts"]), []);
    // a plain file (not a directory) under ventures/ is skipped, not walked
    writeFileSync(join(root, "ventures", "zz-redteam-file"), "x");
    assert.deepEqual(optedInFiles(["zz-redteam-file"]), []);
  } finally {
    for (const p of [plain, ts, join(root, "ventures", "zz-redteam-file")]) rmSync(p, { recursive: true, force: true });
  }
});
