import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGabc } from './gabc.mjs';

const letters = (s) =>
  parseGabc(`%%\n${s}`).events.filter((e) => e.type === 'note').map((e) => e.letter).join('');

// Made-up strings: NABC alternation, neumes split across groups, line and
// spacing markers. Pitches must come from the GABC part only.
test('NABC snippets after | are ignored, pitches kept', () => {
  assert.equal(letters('(c4) A(fg|vi|ls)(h)b(ij|pu|ta)'), 'fghij');
  assert.equal(letters('(c4) A(fgh|vi|lsc1|cdf)'), 'fgh');
  assert.equal(letters('(c4) A(f|vi)(|su1)b(g|)'), 'fg');
});

test('neumes split across groups and spacing markers keep every pitch', () => {
  assert.equal(letters('(c4) A(f/g)b(h!i)c(j)'), 'fghij');
  assert.equal(letters('(c4) A(f[ob:1;6mm]g)b'), 'fg');
  assert.equal(letters('(c4) A(f)(z)b(g)(Z)c(h)'), 'fgh');
  assert.equal(letters('(c4) A(fg) (,) b(h)(;2)c(i) (`)'), 'fghi');
});
