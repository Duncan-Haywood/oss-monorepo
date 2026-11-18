// Tool-page h1s stay a size that leaves the tool above a laptop's fold.
// Why: docs/reports/polish-2026-11-17-hero-headings.md (247 pages asked for 3.1 to 6rem;
// 40 rendered 163 to 282 px tall at 1,280 px, the ADA page's 228 px among them) and
// docs/reports/polish-2026-11-17-h1-length.md (17 h1s of 101 to 125 characters, 5 or 6 lines on a phone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { h1Ceilings, oversizedHeadings, MAX_H1_REM, h1Text, longHeadings, MAX_H1_CHARS } from './hero-heading.mjs';

test('h1Ceilings reads clamp ceilings and fixed rem sizes from h1 rules only', () => {
  assert.deepEqual(h1Ceilings('h1{font-size:clamp(2rem,6vw,4.5rem);line-height:.95}'), [4.5]);
  assert.deepEqual(h1Ceilings('h1 { font:800 clamp(2.1rem,5.6vw,4.4rem)/1.0 Georgia,serif; }'), [4.4]);
  assert.deepEqual(h1Ceilings('@media(max-width:720px){ h1 { font-size:3rem; } }'), [3]);
  assert.deepEqual(h1Ceilings('.hero h1{font-size:clamp(1.8rem, 4.8vw, 2.8rem)}'), [2.8]);
  assert.deepEqual(h1Ceilings('.h1x{font-size:5rem} #h1{font-size:5rem} h2{font-size:clamp(2rem,6vw,5rem)}'), []);
});

test(`no tool page's own CSS sizes its h1 above ${MAX_H1_REM}rem`, () => {
  const over = oversizedHeadings();
  assert.deepEqual(over, [], over.map((o) => `${o.slug}/${o.file}: ${o.rem}rem`).join('\n'));
});

test('h1Text reads the first h1, without tags, entities decoded', () => {
  assert.equal(h1Text('<h1 class="x">Profit &amp; loss\n  <span>per&nbsp;hour</span></h1><h1>Two</h1>'), 'Profit & loss per hour');
  assert.equal(h1Text('<h1>What&#8217;s it &#x2014; worth?</h1>'), 'What\u2019s it \u2014 worth?');
  assert.equal(h1Text('<h2>None</h2>'), null);
});

test(`no tool page's h1 is longer than ${MAX_H1_CHARS} characters`, () => {
  const over = longHeadings();
  assert.deepEqual(over, [], over.map((o) => `${o.slug}: ${o.chars} chars: ${o.text}`).join('\n'));
});
