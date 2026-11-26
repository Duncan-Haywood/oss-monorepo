// Pins the content-stream tokenizer in pdf-text.mjs (rewritten 2026-11-26 to
// compare char codes instead of running regexes per character) to the
// regex version it replaced, kept below as the reference. Same tokens, same
// doubles (Object.is, so -0 counts), on hand-picked edge cases and a seeded
// fuzz of PDF syntax and numbers. Perf note:
// docs/history/drawing-review-perf-2026-11-26.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens } from './pdf-text.mjs';
import { parseValue } from './pdf-parser.mjs';

function* reference(str) { // the pre-2026-11-26 tokenizer, minus inline images
  let i = 0;
  const n = str.length;
  const WS = /[\0\t\n\f\r ]/;
  while (i < n) {
    const c = str[i];
    if (WS.test(c)) { i++; continue; }
    if (c === '%') { while (i < n && str[i] !== '\n' && str[i] !== '\r') i++; continue; }
    if (c === '(' || c === '<' || c === '[' || c === '/') {
      const [v, next] = parseValue(str, i);
      yield { v };
      i = Math.max(next, i + 1);
      continue;
    }
    let j = i;
    while (j < n && !WS.test(str[j]) && !'()<>[]{}/%'.includes(str[j])) j++;
    if (j === i) { i++; continue; }
    const word = str.slice(i, j);
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield { v: parseFloat(word) };
    else yield { op: word };
  }
}

function same(str) {
  const a = [...reference(str)], b = [...tokens(str)];
  assert.equal(b.length, a.length, JSON.stringify(str));
  for (let k = 0; k < a.length; k++) {
    assert.equal(b[k].op, a[k].op, JSON.stringify(str));
    if (typeof a[k].v === 'number') assert.ok(Object.is(b[k].v, a[k].v), `${JSON.stringify(str)}: ${b[k].v} vs ${a[k].v}`);
    else assert.deepEqual(b[k].v, a[k].v, JSON.stringify(str));
  }
  return a.length;
}

test('edge cases tokenize as the regex version did', () => {
  for (const s of ['', ' ', '0', '-0', '+0', '-.0', '.5', '5.', '-.', '+', '-', '.', '..5', '1.2.3', '1e5', '0x10',
    '12345678901234567890', '0.1234567890123456789', '-999999999999999.9', '1--2', '3+4', 'a1', '1a',
    '100 200 m 300.25 -4.5 l S', 'BT /F1 9 Tf (A\\)B) Tj [(x) -120 (y)] TJ ET', '<414243> Tj <</A 1>> BDC EMC',
    '%comment\r1 2 re\n%x\n3', '{1} 2 ]3[ 4>', '1\x002\t3\f4\r5\n6', '\x80\xff 7 \x9f8', 'T* \' "']) same(s);
});

test('seeded fuzz of syntax and numbers matches the regex version', () => {
  let seed = 11;
  const rnd = (k) => (seed = (seed * 1103515245 + 12345) % 2147483648) % k;
  const alpha = ['0', '7', '.', '-', '+', ' ', '\n', '\r', '\t', '\0', '\f', '%', '(', ')', '<', '>', '[', ']', '{', '}', '/', 'm', 'Tj', '\\', '<<', '>>', '\x80'];
  for (let k = 0; k < 3000; k++) {
    let s = '';
    for (let q = 1 + rnd(24); q > 0; q--) s += alpha[rnd(alpha.length)];
    same(s);
  }
  const words = [];
  for (let k = 0; k < 20000; k++) {
    let w = ['', '-', '+'][rnd(3)];
    for (let q = rnd(10); q > 0; q--) w += rnd(10);
    if (rnd(4)) { w += '.'; for (let q = rnd(10); q > 0; q--) w += rnd(10); }
    words.push(w);
  }
  assert.ok(same(words.join(' ')) > 15000);
});
