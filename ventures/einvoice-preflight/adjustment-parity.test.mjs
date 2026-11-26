// The web checker (adjustment.mjs) and the Python package (adjustment.py) must
// give the same header allowance/charge findings and the same net delta. A
// sign rule was missed in both copies once (a negative invoice's base
// carrying the sign, red team 2026-11-26); this feeds both sides the same
// seeded-random rows, with signs on amount, base and percent, on ordinary and
// negative invoices, and fails on any disagreement, so a fix made to one copy
// and not the other is caught here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { headerAdjustmentNetDelta, inspectHeaderAdjustments } from "./adjustment.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function invoices(n) {
  const rand = seeded(20261126);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const sign = () => (rand() < 0.3 ? -1 : 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const negative = rand() < 0.5;
    const totals = negative ? { net: -1500, gross: -1650 } : { net: 1500, gross: 1650 };
    const rows = [];
    const count = Math.floor(rand() * 3) + 1;
    for (let r = 0; r < count; r++) {
      if (rand() < 0.05) {
        rows.push(pick([null, [], "x", 0]));
        continue;
      }
      const base = sign() * pick([100, 200, 1500, 99.99, 0]);
      const percent = sign() * pick([10, 2.5, 33.333, 100, 120]);
      // Most rows match base x percent; some are a cent or a sign off.
      let amount = Math.round(base * percent) / 100;
      if (rand() < 0.2) amount += 0.01;
      if (rand() < 0.1) amount = -amount;
      const row = { kind: pick(["allowance", "charge", "discount", "true", "bogus"]), amount: Number(amount.toFixed(2)) };
      if (rand() < 0.8) row.base = base;
      if (rand() < 0.8) row.percent = percent;
      if (rand() < 0.9) row.reason = pick(["Early payment discount", "", "TBD", "x".repeat(120)]);
      rows.push(row);
    }
    out.push({ totals, adjustments: rows });
  }
  return out;
}

test("JS and Python agree on header allowance/charge findings and net delta", () => {
  const cases = invoices(1500);
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'src')",
    "from einvoice_preflight.adjustment import header_adjustment_net_delta, inspect_header_adjustments",
    "out = []",
    "for inv in json.load(sys.stdin):",
    "    out.append({'findings': [[f['rule'], f['path']] for f in inspect_header_adjustments(inv)],",
    "                'delta': f'{header_adjustment_net_delta(inv):.2f}'})",
    "print(json.dumps(out))",
  ].join("\n");
  const run = spawnSync("python3", ["-I", "-c", script], { cwd: HERE, input: JSON.stringify(cases), encoding: "utf8" });
  // The package's own CI runs the Python suite, so python3 is always there.
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  const python = JSON.parse(run.stdout);
  const disagree = [];
  let clean = 0;
  let negativeBaseClean = 0;
  cases.forEach((inv, i) => {
    const findings = inspectHeaderAdjustments(inv).map((f) => [f.rule, f.path]);
    const delta = (headerAdjustmentNetDelta(inv) + 0).toFixed(2);
    const js = { findings, delta: delta === "-0.00" ? "0.00" : delta };
    const py = { ...python[i], delta: python[i].delta === "-0.00" ? "0.00" : python[i].delta };
    if (JSON.stringify(js) !== JSON.stringify(py)) disagree.push({ inv, js, py });
    if (findings.length === 0) {
      clean += 1;
      if (inv.adjustments.some((r) => r && typeof r.base === "number" && r.base < 0)) negativeBaseClean += 1;
    }
  });
  assert.deepEqual(disagree.slice(0, 5), [], `${disagree.length} of ${cases.length} invoices disagree`);
  // The corpus must reach clean invoices, including a negative base, or it guards little.
  assert.ok(clean > 50, `only ${clean} clean invoices in the corpus`);
  assert.ok(negativeBaseClean > 5, `only ${negativeBaseClean} clean invoices with a negative base`);
});
