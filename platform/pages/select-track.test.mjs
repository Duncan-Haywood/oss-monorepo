import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyBlock, renderBlock, renderRule, START, END, WIDTHS, WIDTH } from './select-track.mjs';

const page = '<html>\n<head>\n  <title>t</title>\n</head>\n<body></body>\n</html>\n';
const grid = { selector: 'div.grid:has(#mode)', min: 249, from: 500 };

test('renderBlock is empty with nothing to widen', () => {
  assert.equal(renderBlock([]), '');
});

test('a rule widens the track only from the width the page already had two columns', () => {
  assert.equal(renderRule(grid),
    '@media (min-width: 500px) { div.grid:has(#mode) { grid-template-columns: repeat(auto-fit, minmax(min(100%, 249px), 1fr)); } }');
});

test('the block goes just before </head>', () => {
  const out = applyBlock(page, renderBlock([grid, { selector: '#opts', min: 300, from: 740 }]));
  assert.match(out, /<title>t<\/title>\n  <!-- select-track:start -->/);
  assert.match(out, /#opts \{ grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\); \} \}/);
  assert.match(out, /<!-- select-track:end -->\n<\/head>/);
});

test('re-running replaces the block; an empty block removes it', () => {
  const once = applyBlock(page, renderBlock([grid]));
  const twice = applyBlock(once, renderBlock([{ ...grid, min: 300 }]));
  assert.equal(twice.split(START).length, 2);
  assert.ok(twice.includes('300px') && !twice.includes('249px'));
  assert.equal(applyBlock(twice, ''), page);
});

test('a </head> sharing its line with </style> keeps the style closed first', () => {
  const tight = '<head><style>a{}\n</style></head>\n<body></body>\n';
  const out = applyBlock(tight, renderBlock([grid]));
  assert.ok(out.indexOf('</style>\n  <!-- select-track:start -->') > 0, out);
  assert.equal(applyBlock(out, renderBlock([grid])), out);
});

test('a start marker with no end is an error', () => {
  assert.throws(() => applyBlock(page.replace('</head>', `${START}\n</head>`), ''), /no end/);
  assert.ok(END);
});

test('the widths it checks run from a small phone to the laptop width', () => {
  assert.equal(WIDTHS[0], 320);
  assert.equal(WIDTHS.at(-1), WIDTH);
});

test('every venture block in the tree is well formed', () => {
  const ventures = path.resolve(import.meta.dirname, '..', '..', 'ventures');
  let seen = 0;
  for (const d of fs.readdirSync(ventures)) {
    const f = path.join(ventures, d, 'index.html');
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, 'utf8');
    const s = h.split(START).length - 1;
    assert.ok(s <= 1, `${d}: ${s} select-track blocks`);
    if (!s) continue;
    seen += 1;
    assert.ok(h.indexOf(END) > h.indexOf(START) && h.indexOf(END) < h.indexOf('</head>'), `${d}: block outside <head>`);
    const block = h.slice(h.indexOf(START), h.indexOf(END));
    const rules = block.match(/@media \(min-width: \d+px\) \{ [^{}]+ \{ grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, \d+px\), 1fr\)\); \} \}/g) || [];
    assert.ok(rules.length >= 1, `${d}: no rule in the block`);
  }
  assert.ok(seen >= 0);
});
