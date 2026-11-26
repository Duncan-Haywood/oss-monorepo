// Every CFDI fixture, perturbed the way a stranger's file might be (an old or future date,
// each attribute removed or emptied in turn), must come back as a report, never an exception.
// Added by the 2026-11-12 red-team run: a Comercio Exterior CFDI dated before 2024-01-18
// threw a TypeError in cce20.mjs and the user saw no report at all. This sweep found it on
// main (15 of ~1,500 variants threw) and is ~1 s, so a new crash of that class fails CI.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { checkCfdi } from "./cfdi.mjs";

const dir = new URL("./fixtures/", import.meta.url);
const fixtures = readdirSync(dir).filter((f) => /^cfdi.*\.xml$/.test(f));

function variants(t) {
  const out = [];
  for (const d of ["1999-01-01", "2023-12-31", "2024-01-17", "2099-12-31", "garbage"]) {
    out.push([`Fecha ${d}`, t.replace(/Fecha="[^"]*"/, `Fecha="${d}T00:00:00"`)]);
  }
  for (const m of t.matchAll(/ ([A-Za-z:]+)="[^"]*"/g)) {
    if (m[1].startsWith("xmlns")) continue;
    const before = t.slice(0, m.index), after = t.slice(m.index + m[0].length);
    out.push([`drop ${m[1]} at ${m.index}`, before + after]);
    out.push([`empty ${m[1]} at ${m.index}`, `${before} ${m[1]}=""${after}`]);
  }
  return out;
}

test("CFDI fixtures exist for the sweep", () => {
  assert.ok(fixtures.length >= 5, fixtures.join(", "));
});

for (const f of fixtures) {
  test(`${f}: no perturbation makes checkCfdi throw`, () => {
    const t = readFileSync(new URL(f, dir), "utf8");
    const thrown = [];
    for (const [label, v] of variants(t)) {
      try {
        const r = checkCfdi(v);
        assert.ok(Array.isArray(r.findings));
      } catch (e) {
        thrown.push(`${label}: ${e.message}`);
      }
    }
    assert.deepEqual(thrown, []);
  });
}
