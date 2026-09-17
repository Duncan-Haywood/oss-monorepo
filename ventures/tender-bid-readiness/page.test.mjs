import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("landing page is a private paste-and-check with disclaimers", () => {
  assert.match(page, /from '\.\/check\.mjs'/);
  assert.match(page, /id="source"/);
  assert.match(page, /id="check"/);
  assert.match(page, /tender-bid-readiness:/);
  assert.match(page, /count\('checked'\)/);
  assert.match(page, /doNotTrack/);
  assert.match(page, /globalPrivacyControl/);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /SoftwareApplication/);
  assert.doesNotMatch(page, /must bid|should submit|you are eligible/);
});

// tender-radar already links into this checker (triage CSV → check one
// notice). Without the reverse link, a crawler entering on this product
// never reaches the shortlist tool — same one-way orphan class as #3639.
test("index links to the related Tender Radar shortlist tool", () => {
  assert.match(
    page,
    /href="\.\.\/tender-radar\/"/,
    "index must link ../tender-radar/ so crawlers can reach the shortlist tool",
  );
});

// Closest hand-built sibling: contractor-bid-readiness tracks requirements you
// list yourself. It was a crawlable orphan (no inbound tool link); this one-hop
// closes it. Reciprocal of the link that page now carries back here.
test("index links one hop to the contractor-bid-readiness sibling", () => {
  assert.match(
    page,
    /href="\.\.\/contractor-bid-readiness\/"/,
    "index must link ../contractor-bid-readiness/ so crawlers reach the hand-built checklist in one hop",
  );
  assert.match(page, /contractor bid readiness checklist/i);
});
