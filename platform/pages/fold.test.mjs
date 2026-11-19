// The phone-fold rule for audience pages (fold.mjs; browser half fold-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { FOLD, PEEK_PX, foldFailures, foldTable, parseWidths } from './fold.mjs';

test('a card that starts with PEEK_PX to spare passes; one px later fails', () => {
  const edge = FOLD.height - PEEK_PX;
  assert.deepEqual(foldFailures([{ page: 'c/for-a', top: edge }]), []);
  const out = foldFailures([{ page: 'c/for-b', top: edge + 1 }]);
  assert.equal(out.length, 1);
  assert.match(out[0], /c\/for-b: first tool card starts at 829px/);
});

test('the 2026-11-18 retirees reading fails: the heading showed, the card did not', () => {
  // #17145 measured the section top (~771 px); the first card was at 846.
  assert.equal(foldFailures([{ page: 'c/for-retirees', top: 846 }]).length, 1);
  assert.deepEqual(foldFailures([{ page: 'c/for-retirees', top: 821 }]), []);
});

test('a page with no card at all is a failure, not a pass', () => {
  for (const top of [null, undefined, NaN]) {
    const out = foldFailures([{ page: 'c/for-x', top }]);
    assert.equal(out.length, 1, String(top));
    assert.match(out[0], /no tool card/);
  }
});

test('the height can be overridden for a shorter phone', () => {
  assert.equal(foldFailures([{ page: 'c/for-a', top: 700 }], { height: 667 }).length, 1);
  assert.deepEqual(foldFailures([{ page: 'c/for-a', top: 640 }], { height: 667 }), []);
});

test('a fractional miss never reads as "starts at N, needs N"', () => {
  const [msg] = foldFailures([{ page: 'c/for-a', top: 764.4 }], { height: 780 });
  assert.match(msg, /starts at 765px; it needs to start by 764px/);
});

test('widths: a comma list, de-duplicated; empty falls back to WIDTH or the default', () => {
  assert.deepEqual(parseWidths('320,360, 375,390,360'), [320, 360, 375, 390]);
  assert.deepEqual(parseWidths(undefined), [FOLD.width]);
  assert.deepEqual(parseWidths('', '360'), [360]);
  for (const bad of ['abc', '0', '-320', '390.5', ',']) assert.throws(() => parseWidths(bad), /width/, bad);
});

test('the --all table lists every page, deepest first, with px to spare at each width', () => {
  const edge = FOLD.height - PEEK_PX; // 828
  const byWidth = new Map([
    [320, [{ page: 'c/for-a', top: 700 }, { page: 'c/for-b', top: 840.2 }, { page: 'c/for-c', top: null }]],
    [390, [{ page: 'c/for-a', top: 650 }, { page: 'c/for-b', top: 800 }]],
  ]);
  const [title, head, ...rows] = foldTable(byWidth);
  assert.match(title, new RegExp(`${edge}px line`));
  assert.match(head, /^page\s+320px\s+390px$/);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^c\/for-c\s+no card\s+not loaded$/);
  assert.match(rows[1], /^c\/for-b\s+841 \(-13\)\s+800 \(\+28\)$/);
  assert.match(rows[2], /^c\/for-a\s+700 \(\+128\)\s+650 \(\+178\)$/);
});
