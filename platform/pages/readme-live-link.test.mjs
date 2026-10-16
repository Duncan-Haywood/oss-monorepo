import test from 'node:test';
import assert from 'node:assert/strict';
import { addLiveLink, liveUrl } from './readme-live-link.mjs';

test('inserts the live link under the title', () => {
  const out = addLiveLink('# Tool\n\nA calculator.\n', 'tool');
  assert.equal(out, `# Tool\n\n**Live tool:** <${liveUrl('tool')}>\n\nA calculator.\n`);
});

test('is idempotent and respects an existing link', () => {
  const once = addLiveLink('# Tool\n\nText\n', 'tool');
  assert.equal(addLiveLink(once, 'tool'), null);
  assert.equal(addLiveLink(`# T\n\nLive: ${liveUrl('tool')}\n`, 'tool'), null);
});

test('skips a README with no title', () => {
  assert.equal(addLiveLink('no heading here\n', 'tool'), null);
});
