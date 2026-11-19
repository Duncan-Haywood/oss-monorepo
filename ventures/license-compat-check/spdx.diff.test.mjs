// Differential test: parseExpression against spdx-expression-parse, the SPDX
// parser that ships inside npm (MIT, jslicense/spdx-expression-parse.js), on
// randomly generated valid expressions over every id in npm's copy of
// spdx-license-ids and spdx-exceptions. The packages are read from the npm
// next to `node` (or SPDX_ORACLE_DIR=/path/to/npm/node_modules); when they
// cannot be found the test is skipped, never faked. Nothing is copied from
// them: they are only called.
//
// AND and OR are associative, so both trees are flattened before comparing;
// leaves compare by normalizeId of the oracle's id (with its "+").
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseExpression, normalizeId } from "./engine.mjs";

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
function flat(op, parts) {
  const out = [];
  for (const p of parts) if (p.startsWith(`${op}[`)) out.push(...JSON.parse(p.slice(op.length))); else out.push(p);
  return `${op}${JSON.stringify(out)}`;
}
function canonOracle(t) {
  if (t.license) { const leaf = `id:${normalizeId(t.license + (t.plus ? "+" : ""))}`; return t.exception ? `with(${leaf},${t.exception.toLowerCase()})` : leaf; }
  return flat(t.conjunction, [canonOracle(t.left), canonOracle(t.right)]);
}
function canonEngine(n) {
  if (n.type === "id") return `id:${n.id}`;
  if (n.type === "with") return `with(${canonEngine(n.base)},${String(n.exception).toLowerCase()})`;
  return flat(n.type, [canonEngine(n.left), canonEngine(n.right)]);
}

test("parseExpression matches spdx-expression-parse on 20,000 random valid expressions", { skip }, () => {
  const r = rng(20261119);
  let checked = 0;
  const bad = [];
  for (let k = 0; k < 20000; k += 1) {
    const e = gen(r, 3);
    let t;
    try { t = O.parse(e); } catch { continue; }
    checked += 1;
    const got = canonEngine(parseExpression(e));
    const want = canonOracle(t);
    if (got !== want && bad.length < 5) bad.push({ e, got, want });
  }
  assert.ok(checked > 19000, `only ${checked} generated expressions parsed`);
  assert.deepEqual(bad, []);
});

test("every SPDX id that normalizeId knows round-trips through the parser unchanged", { skip }, () => {
  for (const id of O.ids) {
    const n = normalizeId(id);
    if (!n) continue;
    assert.deepEqual(parseExpression(id), { type: "id", raw: id, id: n });
    assert.equal(canonEngine(parseExpression(`(${id})`)), `id:${n}`);
  }
});
