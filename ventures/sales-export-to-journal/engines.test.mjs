import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { SOURCES, compare } from "./sync-engines.mjs";
import { PLATFORMS } from "./calc.mjs";

// The hub's readers must be byte-for-byte copies of the single-platform tools. If this fails, a fix
// landed in one tool and not here: run `node ventures/sales-export-to-journal/sync-engines.mjs`.
test("every engine is an exact copy of its single-platform tool", () => {
  const off = compare().filter((r) => r.state !== "same");
  assert.deepEqual(off, [], "run sync-engines.mjs to copy the sources over");
});

test("every engine file and every platform has a source listed", () => {
  const files = readdirSync(new URL("./engines/", import.meta.url)).map((f) => f.replace(/\.mjs$/, "")).sort();
  assert.deepEqual(Object.keys(SOURCES).sort(), files);
  assert.deepEqual(PLATFORMS.map((p) => p.id).sort(), files);
});
