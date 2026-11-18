import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGabc } from './gabc.mjs';
import { suggestFinal } from './voicefit.mjs';

const note = (midi) => ({ type: 'note', midi, pulses: 1 });

test('a 5-semitone line has a window of finals and a centred pick', () => {
  const r = suggestFinal([note(60), note(65), note(62)]); // C4..F4, final D4
  assert.equal(r.fits, true);
  assert.equal(r.finals.lowest, 62 + (40 - 60));
  assert.equal(r.finals.highest, 62 + (64 - 65));
  // every note lands in range after the recommended shift
  const s = r.recommended.shift;
  assert.ok(60 + s >= 40 && 65 + s <= 64);
});

test('a line wider than the range is reported, not forced', () => {
  const r = suggestFinal([note(40), note(70)]);
  assert.equal(r.fits, false);
  assert.equal(r.over, 6);
});

test('a custom range and bad input', () => {
  const r = suggestFinal([note(60), note(62)], { low: 45, high: 55 });
  assert.equal(r.fits, true);
  assert.throws(() => suggestFinal([]), /no notes/);
  assert.throws(() => suggestFinal([note(60)], { low: 60, high: 50 }), /below/);
});

test('every corpus piece gets an answer that keeps notes in range', () => {
  const dir = new URL('./corpus/', import.meta.url).pathname;
  for (const f of ['dies-irae', 'pange-lingua', 'salve-regina', 'te-deum', 'veni-creator']) {
    const p = parseGabc(readFileSync(`${dir}${f}.gabc`, 'utf8'));
    const r = suggestFinal(p.events);
    const ms = p.events.filter((e) => e.type === 'note').map((e) => e.midi);
    if (r.fits) {
      const s = r.recommended.shift;
      assert.ok(Math.min(...ms) + s >= 40 && Math.max(...ms) + s <= 64, f);
    } else assert.ok(r.over > 0, f);
  }
});
