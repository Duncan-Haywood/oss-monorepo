// Structural / discoverability checks for index.html.
// Dependency-free (no jsdom) so CI stays a plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page names the problem and stays private', () => {
  assert.match(html, /<title>[^<]*Contractor Bid Readiness/i);
  assert.match(html, /meta name="description"[^>]*missing/i);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /No warranty/);
  assert.match(html, /never uploaded/i);
});

// Closest sibling: same "Getting paid & job margin" subcategory — paste-and-
// scan a public tender rather than listing RFP artifacts by hand. Related-tool
// chrome rotates alphabetically, so without an explicit one-hop a crawler on
// this page may never land on that checker (siblings.mjs named it nearest).
test('index links one hop to the tender-bid-readiness sibling', () => {
  assert.match(
    html,
    /href="\.\.\/tender-bid-readiness\/"/,
    'index must link ../tender-bid-readiness/ so crawlers reach the tender checker in one hop',
  );
  assert.match(html, /tender bid readiness checker/i);
});

// The other half of the certified-payroll one-hop: a contractor who wins one
// of these public jobs inherits the Davis-Bacon payroll obligation, so the two
// tools sit on the same workflow either side of the award.
test("index links one hop to the certified-payroll-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/certified-payroll-calculator\/"/,
    'index must link ../certified-payroll-calculator/ so crawlers reach the certified payroll calculator in one hop',
  );
  assert.match(html, /certified payroll calculator/i);
});
