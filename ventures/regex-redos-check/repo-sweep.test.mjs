import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sweep, sourceFiles } from "../../platform/ci/check_redos.mjs";

test("check_redos: flags a new exponential regex, honours the allowlist, skips tests and vendored files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "redos-"));
  fs.writeFileSync(path.join(root, "a.mjs"), "export const r = /^(a+)+$/;\nexport const ok = /^[a-z]+$/;\n");
  fs.writeFileSync(path.join(root, "a.test.mjs"), "const r = /(x+)+y/;\n");
  fs.writeFileSync(path.join(root, "lib.esm.js"), "const r = /(x+)+y/;\n");
  fs.mkdirSync(path.join(root, "fixtures"));
  fs.writeFileSync(path.join(root, "fixtures", "f.js"), "const r = /(x+)+y/;\n");
  assert.deepEqual([...sourceFiles(root)].map((f) => path.basename(f)), ["a.mjs"]);
  const r = sweep(root, new Map());
  assert.equal(r.fresh.length, 1);
  assert.equal(r.fresh[0].pattern, "^(a+)+$");
  const rel = path.relative(path.resolve(import.meta.dirname, "../.."), path.join(root, "a.mjs")).split(path.sep).join("/");
  assert.equal(sweep(root, new Map([[`${rel}\t^(a+)+$`, "test"]])).fresh.length, 0);
  fs.rmSync(root, { recursive: true });
});

test("check_redos: this repository's product code has no un-allowlisted exponential suspect", async () => {
  const { loadAllow } = await import("../../platform/ci/check_redos.mjs");
  const r = sweep(path.resolve(import.meta.dirname, ".."), loadAllow());
  assert.deepEqual(r.fresh.map((f) => `${f.file}:${f.line} /${f.pattern}/`), []);
  assert.deepEqual(r.stale, []);
});
