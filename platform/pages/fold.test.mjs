// The phone-fold rule for audience pages (fold.mjs; browser half fold-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { FOLD, PEEK_PX, foldFailures } from './fold.mjs';

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
