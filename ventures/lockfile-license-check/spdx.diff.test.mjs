// Differential test: categorizeExpression against spdx-expression-parse, the
// SPDX parser that ships inside npm (MIT, jslicense/spdx-expression-parse.js).
// For random valid expressions over every id in npm's spdx-license-ids, the
// category must equal the oracle's tree folded with this file's own rule:
// best leaf of an OR, worst of an AND, leaves through categorizeId. So this
// tests the parsing (precedence, parentheses, WITH, "+"), not the category
// table. Skipped, never faked, when npm's copy cannot be found (set
// SPDX_ORACLE_DIR=/path/to/npm/node_modules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { categorizeExpression, categorizeId } from "./classify.mjs";

function findOracle() {
  const tries = [process.env.SPDX_ORACLE_DIR, join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "node_modules"), "/opt/node22/lib/node_modules/npm/node_modules", "/usr/lib/node_modules/npm/node_modules", "/usr/local/lib/node_modules/npm/node_modules"];
  for (const d of tries) if (d && existsSync(join(d, "spdx-expression-parse", "package.json")) && existsSync(join(d, "spdx-exceptions"))) {
    const req = createRequire(import.meta.url);
    return { parse: req(join(d, "spdx-expression-parse")), ids: req(join(d, "spdx-license-ids")), exceptions: req(join(d, "spdx-exceptions")) };
  }
  return null;
}
const O = findOracle();
const skip = O ? false : "npm's spdx-expression-parse not found (set SPDX_ORACLE_DIR)";
const RANK = { permissive: 0, unknown: 1, "weak-copyleft": 2, "strong-copyleft": 3, unlicensed: 4 };

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), (x >>> 0) / 2 ** 32);
}
function gen(r, depth) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  if (depth <= 0 || r() < 0.35) {
    let s = pick(O.ids);
    if (r() < 0.1) s += "+";
    if (r() < 0.15) s += ` WITH ${pick(O.exceptions)}`;
    return r() < 0.1 ? `(${s})` : s;
  }
  const s = `${gen(r, depth - 1)} ${r() < 0.5 ? "AND" : "OR"} ${gen(r, depth - 1)}`;
  return r() < 0.4 ? `(${s})` : s;
}
function fold(t) {
  if (t.license) return categorizeId(t.license + (t.plus ? "+" : ""));
  const a = fold(t.left);
  const b = fold(t.right);
  if (t.conjunction === "or") return RANK[a] <= RANK[b] ? a : b;
  return RANK[a] >= RANK[b] ? a : b;
}

test("categorizeExpression matches spdx-expression-parse's tree on 20,000 random valid expressions", { skip }, () => {
  const r = rng(20261119);
  let checked = 0;
  const bad = [];
  for (let k = 0; k < 20000; k += 1) {
    const e = gen(r, 3);
    let t;
    try { t = O.parse(e); } catch { continue; }
    checked += 1;
    const got = categorizeExpression(e);
    const want = fold(t);
    if (got !== want && bad.length < 5) bad.push({ e, got, want });
  }
  assert.ok(checked > 19000, `only ${checked} generated expressions parsed`);
  assert.deepEqual(bad, []);
});
