// The reader against DXF files written by ezdxf (another implementation),
// with each part's area as ezdxf computed it (check/make_fixtures.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { partsFromDxf, runJob } from "./job.mjs";

const dir = new URL("./check/fixtures/", import.meta.url);
const truth = JSON.parse(readFileSync(new URL("areas.json", dir), "utf8")).files;

for (const [name, t] of Object.entries(truth)) {
  test(`${name}: same parts and areas as ezdxf (within 0.05%)`, () => {
    const r = partsFromDxf(readFileSync(new URL(name, dir), "utf8"), name, { tol: 0.001 });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.insunits, t.units);
    const areas = r.parts.map((p) => p.part.area).sort((a, b) => b - a);
    assert.equal(areas.length, t.areas.length);
    areas.forEach((a, i) => assert.ok(Math.abs(a - t.areas[i]) <= 5e-4 * t.areas[i], `${a} vs ezdxf ${t.areas[i]}`));
    const job = runJob(r.parts.map((p) => ({ ...p, qty: 3 })), { sheetW: 1000, sheetH: 500, gap: 1, margin: 1 });
    assert.ok(job.check.ok, job.check.problems.join("\n"));
    assert.equal(job.result.unplaced.length, 0);
  });
}
