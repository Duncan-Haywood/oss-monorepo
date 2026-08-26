import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the page exposes the project-work controls a contractor needs', () => {
  for (const marker of [
    'id="projects"',
    'id="addProject"',
    'id="projectBlock"',
    'id="firstMonth"',
    'formatBidSummary',
    'PROJECT_RATE_PRESETS',
    'strip and wax',
    'One-time / project work',
    'First-month invoice',
    'How do I price strip and wax',
  ]) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('custom space names stay available for Other rows', () => {
  assert.match(html, /class="a-name"/);
  assert.match(html, /Other space/);
  assert.match(html, /e\.g\. Server room/);
});
