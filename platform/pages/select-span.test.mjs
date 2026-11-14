import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBlock, renderBlock, START, END } from './select-span.mjs';

const page = '<html>\n<head>\n  <title>t</title>\n</head>\n<body></body>\n</html>\n';

test('renderBlock is empty with nothing to span', () => {
  assert.equal(renderBlock([]), '');
});

test('the block goes just before </head> and spans each item', () => {
  const out = applyBlock(page, renderBlock(['div.fields > label:has(> #scope)', 'div.fields > label:has(> #door)']));
  assert.match(out, /<title>t<\/title>\n  <!-- select-span:start -->/);
  assert.match(out, /div\.fields > label:has\(> #scope\),\n\s+div\.fields > label:has\(> #door\) \{ grid-column: 1 \/ -1; \}/);
  assert.match(out, /<!-- select-span:end -->\n<\/head>/);
});

test('re-running replaces the block instead of stacking a second one', () => {
  const once = applyBlock(page, renderBlock(['#a']));
  const twice = applyBlock(once, renderBlock(['#b']));
  assert.equal(twice.split(START).length, 2);
  assert.ok(twice.includes('#b {') && !twice.includes('#a {'));
});

test('an empty block removes an old one and leaves the page as it was', () => {
  assert.equal(applyBlock(applyBlock(page, renderBlock(['#a'])), ''), page);
});

test('a start marker with no end is an error, not a silent rewrite', () => {
  assert.throws(() => applyBlock(page.replace('</head>', `${START}\n</head>`), ''), /no end/);
  assert.ok(END);
});

test('every venture block in the tree is well formed', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const ventures = path.resolve(import.meta.dirname, '..', '..', 'ventures');
  for (const d of fs.readdirSync(ventures)) {
    const f = path.join(ventures, d, 'index.html');
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, 'utf8');
    const s = h.split(START).length - 1;
    assert.ok(s <= 1, `${d}: ${s} select-span blocks`);
    if (s) {
      const block = h.slice(h.indexOf(START), h.indexOf(END));
      assert.ok(h.indexOf(END) > h.indexOf(START) && h.indexOf(END) < h.indexOf('</head>'), `${d}: block outside <head>`);
      assert.match(block, /\{ grid-column: 1 \/ -1; \}/, d);
    }
  }
});
