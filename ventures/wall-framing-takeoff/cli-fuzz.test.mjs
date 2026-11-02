import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

// Property test: for random flag combinations and hostile plan text (cut-off
// JSON, wrong types, junk values), main() never throws: it returns a numeric
// exit code and a string. Exit 0 means output; 1 or 2 means a message.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const FLAGS = ["--json", "--csv", "--sheathing", "--overhang", "--horizontal", "--budget", "--floor", "--deck", "--foundation", "--drywall", "--insulation", "--trim", "--siding", "--eaves", "--ventilation", "--gutters", "--fasteners", "--stairs", "--roof", "--headers", "--panel-max=12ft", "--panel-max=zzz", "--panel-order", "--rim-lap=9.25", "--rim-lap=-3", "--sheathing-psf=abc", "--schedule", "--nonsense"];
const JUNK = [null, "x", -5, 1e999, [], {}, "10'", "", true, 0];

test("fuzz: random flags and hostile plans never make the CLI throw", () => {
  const rand = rng(2026);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  let ok = 0, refused = 0;
  for (let i = 0; i < 200; i++) {
    const plan = samplePlan();
    const w = plan.walls[Math.floor(rand() * plan.walls.length)];
    const mode = Math.floor(rand() * 4);
    if (mode === 0) w[pick(["length", "height", "openings", "tees"])] = pick(JUNK);
    if (mode === 1) plan[pick(["studSpacing", "kerf", "stock", "walls", "studLength"])] = pick(JUNK);
    let text = JSON.stringify(plan);
    if (mode === 2) text = text.slice(0, Math.floor(rand() * text.length));
    const argv = ["plan.json"];
    for (let k = 0, n = Math.floor(rand() * 4); k < n; k++) argv.push(pick(FLAGS));
    let r;
    try { r = main(argv, () => text); } catch (e) { assert.fail(`threw on ${argv.join(" ")} (mode ${mode}): ${e.message}`); }
    assert.equal(typeof r.code, "number", argv.join(" "));
    assert.equal(typeof r.out, "string", argv.join(" "));
    assert.ok([0, 1, 2].includes(r.code), `${argv.join(" ")} -> ${r.code}`);
    r.code === 0 ? ok++ : refused++;
  }
  assert.ok(ok > 20 && refused > 20, `mix ok=${ok} refused=${refused}`);
});
