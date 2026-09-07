import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const page = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html"),
  "utf8",
);

// The deposit comparison section already deep-links to
// appointment-deposit-calculator/deposit-vs-no-show-fee.html, and that article
// links onward to the deposit hub — but a crawler entering on this index still
// needs two hops to reach the deposit calculator itself. The deposit hub
// already one-hop links here (#3673 / e7f9ad2ab); without the reciprocal, the
// same one-way orphan class remains from this side.
test("index links to the related appointment-deposit-calculator hub", () => {
  assert.match(
    page,
    /href="\.\.\/appointment-deposit-calculator\/"/,
    "index must link ../appointment-deposit-calculator/ so crawlers can reach the deposit hub in one hop",
  );
});
