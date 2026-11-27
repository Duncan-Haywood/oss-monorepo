// The Level 1 requirements page: the mapping mirrors apps/cmmc's level1.ts, the text and objectives
// come from official-text.json, the counts are pinned, and the page is built and linked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };
import {
  LEVEL1_PATH,
  level1Counts,
  level1Requirements,
  ROWS,
} from "../src/level1-requirements.mjs";
import { buildPages } from "../src/pages.mjs";

test("ROWS mirror apps/cmmc level1.ts: numeral, family, text and NIST ids", () => {
  const ts = readFileSync(
    new URL("../../cmmc/src/shared/controls/level1.ts", import.meta.url),
    "utf8",
  );
  const rows = [
    ...ts.matchAll(/\[\s*"([ivx]+)",\s*"([A-Z]{2})",\s*"([^"]+)",\s*\[([^\]]+)\],?\s*\]/g),
  ].map((m) => [m[1], m[2], m[3], [...m[4].matchAll(/"([\d.]+)"/g)].map((x) => x[1])]);
  assert.equal(rows.length, 15);
  assert.deepEqual(
    ROWS.map(([roman, fam, , ids]) => [roman, fam, ids]),
    rows.map(([roman, fam, , ids]) => [roman, fam, ids]),
  );
  assert.deepEqual(
    official.level1,
    rows.map((r) => r[2]),
  );
});

test("counts: 15 requirements, 17 NIST requirements, 59 objectives, 6 families", () => {
  assert.deepEqual(level1Counts(), { requirements: 15, objectives: 59, nistIds: 17, families: 6 });
});

test("objectives read FCI, never CUI", () => {
  for (const r of level1Requirements())
    for (const o of r.objectives) assert.ok(!/\bCUI\b/.test(o.text), `${o.id}: ${o.text}`);
  const mp = level1Requirements().find((r) => r.id === "MP.L1-b.1.vii");
  assert.ok(mp.objectives.some((o) => o.text.includes("FCI")));
});

test("the page lists all 15 with every objective, and other pages link to it", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === LEVEL1_PATH);
  assert.ok(page);
  assert.ok(page.description.length <= 160, `description ${page.description.length} > 160`);
  assert.equal((page.body.match(/<section class="requirement"/g) ?? []).length, 15);
  assert.equal(
    (page.body.match(/<li><span class="muted">3\.\d+\.\d+\[[a-z]\]<\/span>/g) ?? []).length,
    59,
  );
  for (const from of ["/", "/cmmc-level-1-vs-level-2"])
    assert.ok(pages.find((p) => p.path === from).body.includes(`href="${LEVEL1_PATH}"`), from);
});
