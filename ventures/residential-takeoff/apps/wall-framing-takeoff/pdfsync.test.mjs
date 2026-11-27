// The PDF reader under planpdf.mjs is vendored byte for byte from the free PDF
// Plan Takeoff (ventures/pdf-plan-takeoff), which keeps the six-way copy of
// pdf-parser.mjs in step (its pdf-parser-sync.test.mjs). These files parse
// untrusted uploads, so a fix there must reach this copy: whichever side
// changes, this test fails until they agree. Skipped where the free tool's
// folder is absent (this folder copied on its own).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const source = new URL("../../../pdf-plan-takeoff/", import.meta.url);
for (const file of ["pdf-parser.mjs", "inflate-browser.mjs", "pdf-text.mjs", "geometry.mjs", "scale.mjs", "sample.mjs"]) {
  test(`${file} matches ventures/pdf-plan-takeoff's copy`, { skip: !existsSync(new URL(file, source)) }, () => {
    assert.equal(readFileSync(new URL(file, import.meta.url), "utf8"), readFileSync(new URL(file, source), "utf8"), `${file} differs from ventures/pdf-plan-takeoff/${file}; copy the fixed file across`);
  });
}
