// The FCI vs CUI page: every quotation is word for word in a saved regulation text (FAR and DFARS from
// fixtures/dfars/, 32 CFR 2002.4 and 2002.20 from fixtures/cui/, hashes pinned so a silent edit
// fails), every example rests on a quotation the page shows, and the level pages link to it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EXAMPLES, FCI_CUI_PATH, fciCuiCounts, QUOTES } from "../src/fci-cui.mjs";
import { buildPages } from "../src/pages.mjs";
import { source } from "../src/site.mjs";

const fixture = (f) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");

// sha256 of each 32 CFR Part 2002 text (eCFR versioner API, 2026-11-01 point in time, read 28 Nov 2026).
// The FAR and DFARS fixtures are pinned in test/dfars-clauses.test.mjs.
const HASHES = {
  "cui/cfr-32-2002.4.txt": "05c4737aeb2e3a42eac26027e10540df82bd450721212e78ab1acd3ccb57e15b",
  "cui/cfr-32-2002.20.txt": "088bf343a77afa890fddcb2f8387f896cae8faf7abd2c520cd5a273e4d4647b8",
};

test("the saved Part 2002 texts are the ones read from the eCFR", () => {
  for (const [f, h] of Object.entries(HASHES))
    assert.equal(createHash("sha256").update(fixture(f)).digest("hex"), h, f);
  assert.ok(fixture("cui/cfr-32-2002.4.txt").startsWith("§ 2002.4 Definitions."));
  assert.ok(fixture("cui/cfr-32-2002.20.txt").startsWith("§ 2002.20 Marking."));
});

test("every quotation is word for word in its regulation", () => {
  for (const [id, { file, text }] of Object.entries(QUOTES))
    assert.ok(flat(fixture(file)).includes(flat(text)), `${id} not found in ${file}`);
});

test("the page shows every quotation, every example and the sources it cites", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === FCI_CUI_PATH);
  assert.ok(page);
  assert.ok(page.description.length <= 160, `description ${page.description.length}`);
  assert.deepEqual(fciCuiCounts(), {
    quotes: 17,
    examples: 7,
    fci: 1,
    cui: 2,
    neither: 3,
    ask: 1,
  });
  for (const id of Object.keys(QUOTES))
    assert.ok(page.body.includes(`data-quote="${id}"`), `${id} unused on the page`);
  for (const e of EXAMPLES) {
    assert.ok(Object.hasOwn(QUOTES, e.why), `${e.item}: no quote ${e.why}`);
    assert.ok(["FCI", "CUI", "Neither", "Ask"].includes(e.verdict), e.verdict);
  }
  assert.equal((page.body.match(/<tr><th scope="row">/g) ?? []).length, EXAMPLES.length);
  for (const id of ["cfr-2002-4", "cfr-2002-20", "cui-registry"]) {
    assert.ok(source(id).url.startsWith("https://"), id);
    assert.ok(page.body.includes(source(id).url), `${id} not linked`);
  }
  // It says the readings are ours and never decides for the reader.
  assert.match(page.body, /our reading/);
  assert.match(page.body, /not a determination/);
});

test("the level comparison and the DFARS clauses page link to it", () => {
  const pages = buildPages();
  for (const path of ["/cmmc-level-1-vs-level-2", "/dfars-cybersecurity-clauses"])
    assert.ok(pages.find((p) => p.path === path).body.includes(`href="${FCI_CUI_PATH}"`), path);
});
