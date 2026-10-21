import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildCatalogue } from "./build-catalogue.mjs";
import { CATALOGUE } from "./catalogue.mjs";
import { CATALOGUE_DATA } from "./catalogue-data.mjs";

test("the committed catalogue matches a fresh run of the engine (node build-catalogue.mjs)", () => {
  const files = buildCatalogue();
  for (const [rel, text] of Object.entries(files)) {
    const p = new URL(`./${rel}`, import.meta.url);
    assert.ok(existsSync(p), `${rel} is missing`);
    assert.equal(readFileSync(p, "utf8"), text, `${rel} is stale; run node build-catalogue.mjs`);
  }
});

test("every catalogue design passes its rule checks and has a unique id", () => {
  assert.equal(new Set(CATALOGUE.map((c) => c.id)).size, CATALOGUE.length);
  assert.equal(CATALOGUE_DATA.length, CATALOGUE.length);
  for (const d of CATALOGUE_DATA) assert.equal(d.checksFailed, 0, d.id);
});
