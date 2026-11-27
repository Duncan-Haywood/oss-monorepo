// The Level 2 requirements page: all 110 requirements and 320 objectives from official-text.json,
// the same points and POA&M verdicts as the calculator, counts pinned, and the page built and linked.
import assert from "node:assert/strict";
import { test } from "node:test";
import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };
import {
  FAMILY_SHOWS,
  LEVEL2_PATH,
  level2Counts,
  level2Requirements,
} from "../src/level2-requirements.mjs";
import { buildPages } from "../src/pages.mjs";
import { poamVerdict } from "../src/poam-rules.mjs";
import { FAMILIES, MAX_SCORE, MIN_SCORE, REQUIREMENTS } from "../src/sprs.mjs";

test("counts: 110 requirements, 320 objectives, 31 basic, 79 derived, 14 families", () => {
  const c = level2Counts();
  assert.deepEqual(
    [c.requirements, c.objectives, c.basic, c.derived, c.families.length],
    [110, 320, 31, 79, 14],
  );
  assert.equal(
    c.families.reduce((s, f) => s + f.requirements, 0),
    110,
  );
  assert.equal(
    c.families.reduce((s, f) => s + f.objectives, 0),
    320,
  );
  // Every point lost: the calculator's floor.
  assert.equal(MAX_SCORE - c.families.reduce((s, f) => s + f.points, 0), MIN_SCORE);
  assert.deepEqual(
    c.families.find((f) => f.code === "AC"),
    { code: "AC", name: "Access Control", requirements: 22, objectives: 70, points: 54 },
  );
});

test("each requirement carries the official text, objectives, points and POA&M verdict", () => {
  const reqs = level2Requirements();
  for (const [i, r] of reqs.entries()) {
    const o = official.level2[i];
    assert.equal(r.nistId, o.nistId);
    assert.equal(r.text, o.text);
    assert.deepEqual(
      r.objectives.map((x) => x.text),
      o.objectives,
    );
    assert.equal(r.weight, REQUIREMENTS[i].weight);
    assert.deepEqual(r.poam, poamVerdict(REQUIREMENTS[i]));
  }
  assert.equal(reqs.find((r) => r.nistId === "3.1.1").objectives[0].id, "3.1.1[a]");
});

test("one evidence example per family, no more", () => {
  assert.deepEqual(Object.keys(FAMILY_SHOWS).sort(), FAMILIES.map(([, c]) => c).sort());
});

test("the page lists all 110 with every objective, and other pages link to it", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === LEVEL2_PATH);
  assert.ok(page);
  assert.ok(page.description.length <= 160, `description ${page.description.length} > 160`);
  assert.equal((page.body.match(/<section class="requirement"/g) ?? []).length, 110);
  assert.equal(
    (page.body.match(/<li><span class="muted">3\.\d+\.\d+\[[a-z]\]<\/span>/g) ?? []).length,
    320,
  );
  for (const from of [
    "/cmmc-level-1-vs-level-2",
    "/cmmc-level-1-requirements",
    "/cmmc-poam-eligible-requirements",
  ])
    assert.ok(pages.find((p) => p.path === from).body.includes(`href="${LEVEL2_PATH}"`), from);
});
