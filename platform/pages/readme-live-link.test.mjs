import test from 'node:test';
import assert from 'node:assert/strict';
import { addLiveLink, BASE } from './readme-live-link.mjs';

test('inserts after the first paragraph', () => {
  const out = addLiveLink('# T\n\nFirst para\nline two.\n\n## Next\n', 'foo');
  assert.equal(out, `# T\n\nFirst para\nline two.\n\n**Live tool:** ${BASE}foo/\n\n## Next\n`);
});
test('idempotent', () => {
  const once = addLiveLink('# T\n\nBody.\n', 'foo');
  assert.equal(addLiveLink(once, 'foo'), once);
});
test('leaves a README that already links alone', () => {
  const s = `# T\n\nSee ${BASE}foo/ now\n`;
  assert.equal(addLiveLink(s, 'foo'), s);
});
test('heading-only README', () => {
  assert.match(addLiveLink('# T\n', 'foo'), /\*\*Live tool:\*\* /);
});
