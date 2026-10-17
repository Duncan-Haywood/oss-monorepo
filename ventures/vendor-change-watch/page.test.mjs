import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("./index.html", import.meta.url), "utf8");

test("the page names the user problem and stays local", () => {
  assert.match(index, /See exactly what changed in a vendor's terms/);
  assert.match(index, /Nothing is uploaded|never uploaded/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /FAQPage/);
  assert.match(index, /load-example/);
  assert.match(index, /Turn usage counting off/);
});

test("carries the portfolio's liability and hosting clauses", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /not legal, compliance, procurement, or security advice/i);
  // The venture's central claim, and the one a silent regression would break.
  assert.match(index, /does not assert that a vendor is or is not compliant/i);
});

test("does not promise to fetch vendor pages, which a browser cannot do", () => {
  // The CLI fetches; this page cannot, and saying otherwise would be the one
  // deceptive claim available here. The FAQ has to explain the split.
  assert.match(index, /Why can't this fetch the vendor's page for me/);
  assert.match(index, /cross-origin/i);
  assert.match(index, /vendor-watch add/);
});

test("says a first capture is stored rather than unchanged", () => {
  // The venture's rule: a check with no basis for comparison must never read as
  // stability. The page states it in the copy and in the FAQ.
  assert.match(index, /nothing to compare it to yet/i);
  assert.match(index, /never as .unchanged.|never as “unchanged”/i);
});

test("declares the usage events it actually records", () => {
  for (const event of [
    "page_captured",
    "report_built",
    "example_loaded",
    "report_copied",
    "report_downloaded",
  ]) {
    assert.ok(index.includes(event), `usage event ${event} should be declared and used`);
  }
  assert.match(index, /Do Not Track and Global Privacy Control are honoured/);
});

test("links the sponsor and licence without gating the tool", () => {
  assert.match(index, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(index, /entirely optional and never changes what the tool does/);
});

test("loads its logic from the shared modules rather than restating it", () => {
  // The diff rules live in diff.mjs alongside the CLI's semantics; a page that
  // reimplemented them inline is how the two halves drift apart.
  assert.match(index, /from "\.\/diff\.mjs"/);
  assert.match(index, /from "\.\/store\.mjs"/);
  assert.match(index, /from "\.\/usage\.mjs"/);
});

// Closest sibling: same vendor-policy-diff job, but for two dated JSON
// snapshots you already hold rather than captures stored in this browser.
// Related-tool chrome rotates inside the whole evidence category, so without
// an explicit one-hop a crawler on this page reaches that tool only via /c/evidence/.
test("index links one hop to the vendor-change-evidence sibling", () => {
  assert.match(
    index,
    /href="\.\.\/vendor-change-evidence\/"/,
    "index must link ../vendor-change-evidence/ so crawlers reach the snapshot evidence tool in one hop",
  );
  assert.match(index, /vendor change evidence/i);
});

test("footer links the Vendor Watch command-line sibling", () => {
  assert.match(index, /href="\.\.\/vendor-watch\/"/);
});
