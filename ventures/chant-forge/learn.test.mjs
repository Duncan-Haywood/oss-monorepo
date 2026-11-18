import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eventsToMidi } from './midi.mjs';
import { choirSections, learningTracks, renderMidi } from './render.mjs';
import { parseGabc, fitToBars } from './gabc.mjs';
import { splitVoices } from './voicefit.mjs';
import { run } from './render-cli.mjs';

// two phrases: tenors alone on A3 for 2 s, then basses alone on D3 for 2 s (120 BPM, 2 pulses a beat)
const two = () => eventsToMidi([
  { type: 'note', midi: 57, pulses: 8, syllable: 'te', voice: 'tenor' },
  { type: 'note', midi: 50, pulses: 8, syllable: 'bas', voice: 'bass' },
], { bpm: 120 });
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const db = (x) => 20 * Math.log10(x);

test('choirSections names the split tracks, in score order; a unison chant is one Choir section', () => {
  assert.deepEqual(choirSections(two()).map((s) => [s.name, s.slug, s.notes]), [['Tenors', 'tenors', 1], ['Basses', 'basses', 1]]);
  const uni = choirSections(eventsToMidi([{ type: 'note', midi: 50, pulses: 4, syllable: 'a' }], { bpm: 120 }));
  assert.deepEqual(uni.map((s) => s.name), ['Choir']);
});

test('a part track puts its section on the left and the other section 12 dB down on the right', () => {
  const tr = learningTracks(two(), { rate: 22050 });
  assert.deepEqual(tr.map((t) => `${t.slug}-${t.mode}`), ['tenors-part', 'tenors-minus', 'basses-part', 'basses-minus']);
  const [L, R] = tr[0].wav.channels;
  const rate = 22050, a1 = Math.round(0.5 * rate), b1 = Math.round(1.8 * rate), a2 = Math.round(2.5 * rate), b2 = Math.round(3.8 * rate);
  // tenor phrase: pan -0.5 keeps L at full and R at half, about 6 dB
  assert.ok(Math.abs(db(rms(L, a1, b1) / rms(R, a1, b1)) - 6.02) < 0.1, 'own section left of centre');
  // bass phrase: mirrored to the right, and 12 dB under the tenors (the D3 and A3 voices differ a little in level)
  assert.ok(Math.abs(db(rms(R, a2, b2) / rms(L, a2, b2)) - 6.02) < 0.1, 'other section right of centre');
  const drop = db(rms(R, a2, b2) / rms(L, a1, b1));
  assert.ok(drop < -9 && drop > -15, `other section ${drop.toFixed(1)} dB against own`);
});

test('a minus track leaves the section out and keeps the others as in the mix', () => {
  const tr = learningTracks(two(), { rate: 22050 });
  const minusT = tr.find((t) => t.slug === 'tenors' && t.mode === 'minus').wav.channels[0];
  const mix = renderMidi(two(), { rate: 22050 }).channels[0];
  const rate = 22050, a1 = Math.round(0.5 * rate), b1 = Math.round(1.8 * rate), a2 = Math.round(2.5 * rate), b2 = Math.round(3.8 * rate);
  assert.ok(rms(minusT, a1, b1) < 1e-9, 'no tenor note in the tenors-minus track');
  // peak normalisation scales each file to the same peak, so compare shapes: the bass phrase is the whole of minus
  const r = rms(minusT, a2, b2) / rms(mix, a2, b2);
  assert.ok(r > 0.99, `bass phrase kept (ratio to the mix ${r.toFixed(3)} after normalising)`);
});

test('the CLI writes a part and a minus track per section of a real split chant, and refuses stray level flags', () => {
  const p = parseGabc(readFileSync(new URL('./corpus/salve-regina.gabc', import.meta.url), 'utf8'));
  const s = splitVoices(fitToBars(p.events, 8), { baritone: { low: 45, high: 65 } });
  assert.ok(s.fits);
  const dir = mkdtempSync(join(tmpdir(), 'cf-learn-'));
  try {
    const mid = join(dir, 'salve.mid');
    writeFileSync(mid, eventsToMidi(s.events, { bpm: 124 }));
    const o = run([mid, '--rate', '22050', '--learn', join(dir, 'learn')]);
    assert.equal(o.code, 0, o.text);
    assert.deepEqual(readdirSync(join(dir, 'learn')).sort(), ['basses', 'baritones', 'tenors'].flatMap((x) => [`salve-${x}-minus.wav`, `salve-${x}-part.wav`]).sort());
    assert.match(o.text, /6 rehearsal tracks .* for Tenors, Baritones, Basses/);
    assert.equal(run([mid, '--others', '-10']).code, 2);
    assert.equal(run([mid, '--learn', join(dir, 'x'), '--backing', '3']).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});



