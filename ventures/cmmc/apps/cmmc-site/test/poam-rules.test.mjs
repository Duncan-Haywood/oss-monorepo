// The POA&M eligibility page: counts computed from official-text.json, the same verdicts the
// calculator gives, and the page built and linked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPages } from "../src/pages.mjs";
import { POAM_PATH, poamCounts, poamVerdict } from "../src/poam-rules.mjs";
import { poamEligible, REQUIREMENTS } from "../src/sprs.mjs";

test("counts: 46 one-pointers may go on a POA&M, 63 may not, 3.13.11 only on partial credit", () => {
  const c = poamCounts();
  assert.deepEqual(
    [c.total, c.yes, c.partial, c.no, c.never, c.fivePoint, c.threePoint, c.onePoint],
    [110, 46, 1, 57, 6, 44, 14, 51],
  );
  assert.equal(c.yes + c.partial + c.no + c.never, c.total);
  assert.equal(c.onePointExcluded, 5);
  assert.equal(c.budget, 22);
  assert.equal(c.maxOpenItems, 22);
  assert.equal(c.maxOpenWithEncryption, 20);
});

test("every verdict agrees with the calculator's poamEligible for that requirement open alone", () => {
  for (const r of REQUIREMENTS) {
    const v = poamVerdict(r);
    const full = poamEligible(r.nistId, { notMet: new Set([r.nistId]), partial: new Set() });
    if (r.nistId === "3.12.4") {
      assert.equal(v.status, "never");
      continue;
    }
    assert.equal(full.eligible, v.status === "yes", r.nistId);
    if (r.nistId === "3.13.11") {
      const pc = poamEligible(r.nistId, {
        notMet: new Set([r.nistId]),
        partial: new Set([r.nistId]),
      });
      assert.equal(pc.eligible, true);
      assert.equal(v.status, "partial");
    }
  }
});

test("the page lists all 110 requirements and the other pages link to it", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === POAM_PATH);
  assert.ok(page);
  assert.equal((page.body.match(/<tr><th scope="row">[A-Z]{2}\.L2-3\./g) ?? []).length, 110);
  for (const from of ["/sprs-score-calculator", "/cmmc-level-1-vs-level-2"])
    assert.ok(pages.find((p) => p.path === from).body.includes(`href="${POAM_PATH}"`), from);
});
