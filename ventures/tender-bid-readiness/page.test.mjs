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
