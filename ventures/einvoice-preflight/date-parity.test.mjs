// The browser/server checks (period.mjs, shared by checks.mjs and terms.mjs)
// and the Python package (period.py, terms.py, checks.py) must agree on which
// strings are ISO dates. They drifted once: Number() read "2026-+7-01" and
// "2026-07- 1" as dates and Date.UTC turned "0050-01-01" into 1950, so the
// web checker passed dates the CLI rejected (red team, 2026-11-25).
// This feeds both sides the same strings, fixed and seeded-random, and fails
// on any disagreement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseIsoDate } from "./period.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const FIXED = [
  "2026-07-01", "2024-02-29", "2025-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-01-00",
  "0001-01-01", "0000-01-01", "0050-01-01", "0099-12-31", "0100-02-29", "9999-12-31",
  "2026-+7-01", "2026- 7-01", "2026-07- 1", "2026-07-1 ", "-001-01-01", "+202-01-01", " 202-01-01",
  "2026-07x01", "2026x07-01", "20260701", "2026-07-011", "2026-W27-3", "2026-٠٧-01",
  "2026-1e-01", "2026-0x-01", "2026-.5-01", "", "2026-07-01T00:00",
];

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function randomCases(n) {
  const rand = seeded(20261125);
  const pick = (str) => str[Math.floor(rand() * str.length)];
  const pad = (v, w) => String(v).padStart(w, "0");
  const out = [];
  for (let i = 0; i < n; i++) {
    // A real-looking date (years 1-9999, so years below 100 are covered),
    // and half the time one character swapped for a digit or a character
    // Number() tolerates.
    const date = `${pad(1 + Math.floor(rand() * 9999), 4)}-${pad(1 + Math.floor(rand() * 12), 2)}-${pad(1 + Math.floor(rand() * 31), 2)}`;
    if (rand() < 0.5) {
      out.push(date);
      continue;
    }
    const at = Math.floor(rand() * 10);
    out.push(date.slice(0, at) + pick("0123456789-+ .e") + date.slice(at + 1));
  }
  return out;
}

test("JS and Python agree on which strings are ISO dates", (t) => {
  const cases = [...FIXED, ...randomCases(3000)];
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'src')",
    "from einvoice_preflight.period import parse_iso_date as p",
    "from einvoice_preflight.terms import parse_iso_date as t",
    "from einvoice_preflight.checks import _iso_date as c",
    "out = []",
    "for s in json.load(sys.stdin):",
    "    got = {str(f(s)) if f(s) else None for f in (p, t, c)}",
    "    assert len(got) == 1, (s, got)",
    "    out.append(got.pop())",
    "print(json.dumps(out))",
  ].join("\n");
  const run = spawnSync("python3", ["-I", "-c", script], { cwd: HERE, input: JSON.stringify(cases), encoding: "utf8" });
  if (run.error) {
    t.skip("python3 is not available");
    return;
  }
  assert.equal(run.status, 0, run.stderr);
  const python = JSON.parse(run.stdout);
  const disagree = [];
  cases.forEach((s, i) => {
    const d = parseIsoDate(s);
    const js = d ? d.toISOString().slice(0, 10) : null;
    if (js !== python[i]) disagree.push({ s, js, python: python[i] });
  });
  assert.deepEqual(disagree.slice(0, 10), [], `${disagree.length} of ${cases.length} strings disagree`);
  // The random corpus must reach both outcomes, or it guards nothing.
  assert.ok(python.filter(Boolean).length > 100, "too few valid dates in the corpus");
  assert.ok(python.filter((v) => v === null).length > 100, "too few invalid dates in the corpus");
});
