import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './build.mjs';
import { renderVenturesReadme, toolLine, anchor } from './ventures-readme.mjs';

const BASE = 'https://example.test/';

test('a tool line links the live page and the code, escaping brackets in the title', () => {
  assert.equal(toolLine({ slug: 'foo', title: 'Foo [beta]', baseUrl: BASE }),
    '- [Foo \\[beta\\]](https://example.test/foo/) · [code](foo/)');
});

test('anchors match GitHub heading ids, including doubled hyphens from a dropped "&"', () => {
  assert.equal(anchor('Trade & contractor bids'), 'trade--contractor-bids');
  assert.equal(anchor('UK tax, pay & benefits'), 'uk-tax-pay--benefits');
});

test('the rendered catalogue has a table of contents, a section per category and the other directories', () => {
  const md = renderVenturesReadme({
    baseUrl: BASE,
    groups: [{ category: { id: 'trades', title: 'Trade & contractor bids', blurb: 'Bids.' },
      items: [{ slug: 'roof-bid', title: 'Roof Bid' }] }],
    others: ['server-thing'],
  });
  assert.match(md, /^# /);
  assert.ok(md.includes('- [Trade & contractor bids](#trade--contractor-bids) (1)'));
  assert.ok(md.includes('[Browse this section on the site →](https://example.test/c/trades/)'));
  assert.ok(md.includes('- [Roof Bid](https://example.test/roof-bid/) · [code](roof-bid/)'));
  assert.ok(md.includes('- [`server-thing`](server-thing/)'));
});

test('every directory the committed ventures/README.md links still exists', () => {
  const file = path.join(REPO_ROOT, 'ventures', 'README.md');
  const md = readFileSync(file, 'utf8');
  const linked = [...md.matchAll(/\]\(([a-z0-9][a-z0-9-]*)\/\)/g)].map((m) => m[1]);
  assert.ok(linked.length > 100, 'ventures/README.md should list the catalogue');
  const gone = linked.filter((slug) => !existsSync(path.join(REPO_ROOT, 'ventures', slug)));
  assert.deepEqual(gone, [], 'regenerate with: node platform/pages/ventures-readme.mjs');
});
