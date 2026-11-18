import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli.mjs";

const dir = mkdtempSync(join(tmpdir(), "wft-shape-"));
const run = (text) => { const f = join(dir, "p.json"); writeFileSync(f, text); return main([f]); };

test("a plan file of the wrong shape is refused in plain words, not with a JavaScript error", () => {
  const cases = [
    ["null", /must be a JSON object/],
    ["5", /must be a JSON object/],
    ['{"walls":5}', /"walls" must be a list/],
    ['{"walls":"x"}', /"walls" must be a list/],
    ['{"walls":[5]}', /wall 1 must be an object/],
    ['{"walls":[null]}', /wall 1 must be an object/],
    ['{"walls":[{"length":96}],"stock":[96]}', /stock entry 1 must be an object/],
    ['{"walls":[{"length":96}],"stock":4}', /"stock" must be a list/],
    ['{"walls":[{"length":96,"openings":3}]}', /"openings" must be a list/],
    ['{"walls":[{"length":96,"openings":[7]}]}', /opening 1 must be an object/],
  ];
  for (const [text, re] of cases) {
    const r = run(text);
    assert.equal(r.code, 2, text);
    assert.match(r.out, re, text);
    assert.doesNotMatch(r.out, /Cannot (create|read|use|assign)|not iterable/, text);
  }
});

test("--schedule on a plan with no usable schedule exits 1, like --orders and --risk", () => {
  const plan = '{"walls":[{"length":96}]}';
  for (const extra of [[], ["--json"], ["--csv"]]) {
    const f = join(dir, "s.json"); writeFileSync(f, plan);
    const r = main([f, "--schedule", ...extra]);
    assert.equal(r.code, 1, extra.join(" ") || "text");
  }
});
