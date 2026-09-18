import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateBillableWeight } from './calc.mjs';
import { leverText } from './levers.mjs';

const lever = input => leverText(calculateBillableWeight(input));

test('a package billed on air says how much air, in pounds', () => {
  const text = lever({ length: 16, width: 12, height: 10, weight: 4 });
  assert.match(text.headline, /14 lb/);
  assert.match(text.headline, /10 lb<\/b> of it is air/);
  assert.match(text.detail, /556 in³/);
});

test('when a flatter box is achievable the lever quotes the height', () => {
  // 30 x 24 x 20 at 60 lb: break-even cube 8,340 in3, i.e. 11.6in on the same
  // footprint -- a real repack instruction.
  const text = lever({ length: 30, width: 24, height: 20, weight: 60 });
  assert.match(text.detail, /11\.6″/);
  assert.match(text.detail, /shallower/);
  assert.ok(!/smaller box/.test(text.detail));
});

test('when no achievable height reaches the target it says smaller box, not flatter box', () => {
  // A 1 lb item in a 24 x 18 carton: break-even cube is 139 in3, which on that
  // footprint is a third of an inch. Telling someone to pack to 0.3in is worse
  // than saying nothing.
  const text = lever({ length: 24, width: 18, height: 12, weight: 1 });
  assert.match(text.detail, /smaller box, not a flatter one/);
  assert.ok(!/shallower/.test(text.detail));
  assert.match(text.plain.join(' '), /smaller box/);
});

test('a package billed on actual weight is told how much room it has left', () => {
  const text = lever({ length: 12, width: 10, height: 8, weight: 8 });
  assert.match(text.headline, /not paying for air/);
  assert.match(text.detail, /headroom/);
  assert.match(text.detail, /taller/);
});

test('a near-boundary package gets the tape-measure warning, a roomy one does not', () => {
  // 12 x 10 x 8 = 960 in3; 7.2 lb x 139 = 1,000.8 in3 break-even, so only
  // 40.8 in3 (4.3%) of headroom -- one carton size away from flipping.
  const tight = lever({ length: 12, width: 10, height: 8, weight: 7.2 });
  assert.match(tight.detail, /under 10%/);
  const roomy = lever({ length: 10, width: 8, height: 6, weight: 20 });
  assert.ok(!/under 10%/.test(roomy.detail));
});

test('the plain lines carry the same facts as the HTML, with no markup', () => {
  for (const input of [
    { length: 16, width: 12, height: 10, weight: 4 },
    { length: 12, width: 10, height: 8, weight: 8 },
    { length: 24, width: 18, height: 12, weight: 1 },
  ]) {
    const text = lever(input);
    assert.ok(text.plain.length > 0);
    for (const line of text.plain) {
      assert.ok(!/<[a-z/]/i.test(line), `clipboard line must not carry markup: ${line}`);
    }
  }
});

test('the divisor the visitor chose is named, so a pasted target is not read against the wrong contract', () => {
  const text = lever({ length: 16, width: 12, height: 10, weight: 4, divisor: 166 });
  assert.match(text.detail, /166 divisor/);
});
