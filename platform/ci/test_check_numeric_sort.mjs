// node --test platform/ci/test_check_numeric_sort.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarise } from "./check_numeric_sort.mjs";
import { callSite, kindOf } from "./numeric_sort_hook.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

test("kindOf tells numbers and decimal strings from everything else", () => {
  assert.equal(kindOf([10, 9, 1]), "number");
  assert.equal(kindOf(["10", "9", "-2.5"]), "decimal-string");
  assert.equal(kindOf(["2026-01-02", "2025-12-31"]), null);
  assert.equal(kindOf([1, "2"]), null);
  assert.equal(kindOf(["a", "b"]), null);
  assert.equal(kindOf([7]), null);
});

test("callSite skips the hook's own frames", () => {
  const stack = `Error\n    at record (${join(HERE, "numeric_sort_hook.mjs")}:1:1)\n    at f (file:///repo/a.mjs:3:9)`;
  assert.equal(callSite(stack), "/repo/a.mjs:3:9");
});

test("the hook logs a wrong numeric sort and leaves the result unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "numsort-"));
  try {
    const script = join(dir, "s.mjs");
    const log = join(dir, "l.jsonl");
    writeFileSync(script, [
      "console.log(JSON.stringify([10, 9, 1].sort()));",
      "console.log(JSON.stringify([3, 1, 2].toSorted()));",
      "console.log(JSON.stringify(['b', 'a'].sort()));",
      "console.log(JSON.stringify([10, 9, 1].sort((a, b) => a - b)));",
    ].join("\n"));
    const r = spawnSync(process.execPath, [`--import=${join(HERE, "numeric_sort_hook.mjs")}`, script], {
      env: { ...process.env, NUMERIC_SORT_LOG: log }, encoding: "utf8",
    });
    assert.equal(r.stdout, '[1,10,9]\n[1,2,3]\n["a","b"]\n[1,9,10]\n');
    const rows = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(rows.map((x) => [x.site.match(/s\.mjs:(\d+):\d+$/)?.[1], x.kind, x.wrong]), [
      ["1", "number", true],
      ["2", "number", false],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("summarise keeps repo sites, drops tests by default, ranks WRONG first", () => {
  const line = (site, wrong) => JSON.stringify({ site: join(ROOT, site), kind: "number", wrong, n: 2, sample: [10, 9] });
  const lines = [
    line("ventures/a/calc.mjs:1:1", false),
    line("ventures/b/calc.mjs:2:2", true),
    line("ventures/b/calc.test.mjs:3:3", true),
    JSON.stringify({ site: "/elsewhere/x.mjs:1:1", kind: "number", wrong: true, sample: [] }),
    "not json",
  ];
  assert.deepEqual(summarise(lines).map((r) => [r.site, r.wrong]), [
    ["ventures/b/calc.mjs:2:2", true],
    ["ventures/a/calc.mjs:1:1", false],
  ]);
  assert.equal(summarise(lines, { tests: true }).length, 3);
});
