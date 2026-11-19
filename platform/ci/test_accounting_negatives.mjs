// Every venture amount parser must read accounting-format negatives as
// negative (or refuse them), never as a positive number.
//
// Red team 2026-11-18: eleven ventures tested for a negative with
// /^\(.*\)$/, which matches "($100.00)" but not "$(100.00)", the text Excel's
// Accounting format writes, nor "(100.00) USD". Then they stripped every
// non-digit and returned +100: a refund or fee read as income, silently. This
// test imports every non-test .mjs under ventures/ (vendored engines/ copies
// included), finds the exported
// parseNumber/parseMoney/parseAmount/parseCents, and feeds it those shapes, so
// a new copy of the anchored pattern fails here instead of waiting for a
// red-team run. Returning null, NaN or throwing is fine: the row is flagged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENTURES = join(ROOT, "ventures");
const NAMES = /^parse(Number|Money|Amount|Cents)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "fixtures", "eval", "data"]);
function* mjsFiles(dir, rel = "") {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* mjsFiles(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name); }
    else if (e.name.endsWith(".mjs") && !/\.test\.mjs$|^test_/.test(e.name)) yield rel ? `${rel}/${e.name}` : e.name;
  }
}
// Parsers that read the magnitude only, with the sign decided by their caller
// (the caller is covered by its venture's own tests).
const MAGNITUDE_ONLY = new Set(["rev-rec/csv.mjs:parseAmount"]);
const NEGATIVES = ["($100.00)", "$(100.00)", "$ (100.00)", "(100.00) USD", "USD (100.00)", "(100.00)"];

export function parsers() {
  const out = [];
  for (const v of readdirSync(VENTURES).sort()) {
    if (!existsSync(join(VENTURES, v)) || !statSync(join(VENTURES, v)).isDirectory()) continue;
    for (const f of mjsFiles(join(VENTURES, v))) {
      const p = join(VENTURES, v, f);
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/export (?:async )?function (parse(?:Number|Money|Amount|Cents))\s*\(/g)) {
        if (NAMES.test(m[1]) && !MAGNITUDE_ONLY.has(`${v}/${f}:${m[1]}`)) out.push({ rel: `${v}/${f}`, path: p, name: m[1] });
      }
    }
  }
  return out;
}

const positive = (r) => (typeof r === "number" && r > 0) || (typeof r === "bigint" && r > 0n) ||
  (r && typeof r === "object" && typeof r.value === "number" && r.value > 0);

test("there are amount parsers to check", () => {
  assert.ok(parsers().length >= 10, `found only ${parsers().length}`);
});

test("no amount parser reads an accounting-format negative as positive", async () => {
  const bad = [];
  for (const { rel, path, name } of parsers()) {
    let fn;
    try { fn = (await import(pathToFileURL(path).href))[name]; } catch { continue; } // a browser-only module
    if (typeof fn !== "function") continue;
    for (const x of NEGATIVES) {
      let r;
      try { r = fn(x); } catch { continue; }
      if (positive(r)) bad.push(`${rel} ${name}(${JSON.stringify(x)}) = ${JSON.stringify(r)}`);
    }
  }
  assert.deepEqual(bad, [], "read as positive:\n" + bad.join("\n"));
});
