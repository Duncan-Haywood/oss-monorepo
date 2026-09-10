// Structural tests for index.html sibling links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// Closest outdoor sibling: same property-maintenance job, but a tree removal
// rather than a mowing stop. Related-tool chrome rotates inside the landscape
// subcategory, so without an explicit one-hop a crawler on this page may never
// land on that tool.
test('index links one hop to the tree-service-bid-calculator sibling', () => {
  const html = page('index.html');
  assert.match(
    html,
    /href="\.\.\/tree-service-bid-calculator\/"/,
    'index must link ../tree-service-bid-calculator/ so crawlers reach the tree calculator in one hop',
  );
  assert.match(html, /tree service bid calculator/i);
});
