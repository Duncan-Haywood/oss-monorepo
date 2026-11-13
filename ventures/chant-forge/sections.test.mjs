// Song sections (sections.mjs) and the section-aware backing (genre.mjs arrange with `sections`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGabc, fitToBars, fitStretch, transposeToFinal } from './gabc.mjs';
import { sectionPlan, sectionAt } from './sections.mjs';
import { arrange, BAR, SCALES } from './genre.mjs';
import { eventsToMidi, PPQ } from './midi.mjs';
import { renderMidi } from './render.mjs';
import { run } from './cli.mjs';

const KICK = 36, SNARE = 38, CRASH = 49;
const corpus = (f) => parseGabc(readFileSync(new URL(`./corpus/${f}`, import.meta.url), 'utf8'));
const inBar = (list, bar) => list.filter((n) => n.tick >= bar * BAR && n.tick < (bar + 1) * BAR);
const tiles = (plan) => plan.every((s, i) => i === 0 || s.start === plan[i - 1].start + plan[i - 1].bars);

test('a six-verse hymn gives one section per verse, starting on the verse downbeats', () => {
  const ev = fitStretch(transposeToFinal(corpus('pange-lingua-full.gabc').events, 52), 8);
  const plan = sectionPlan({ events: ev, intro: 2, outro: 2 });
  const chant = plan.filter((s) => s.energy === 'verse' || s.energy === 'drop');
  assert.equal(chant.length, 6);
  assert.equal(plan[0].energy, 'intro');
  assert.equal(plan.at(-1).energy, 'outro');
  assert.equal(chant[0].energy, 'verse');
  assert.equal(chant.at(-1).energy, 'drop');
  assert.ok(tiles(plan), JSON.stringify(plan));
  // each verse's first note sits on its section's first downbeat
  let t = 0, after = true;
  const starts = [];
  for (const e of ev) {
    if (e.type === 'note' && after) { starts.push(t / 8); after = false; }
    if (e.type === 'bar' && e.kind === 'double') after = true;
    t += e.pulses;
  }
  assert.deepEqual(chant.map((s) => s.start - 2), starts);
  // every section leading into a drop ends on a build; drops never do
  for (let i = 0; i < plan.length - 1; i++) assert.equal(plan[i].build, plan[i + 1].energy === 'drop' && plan[i].energy !== 'drop');
});

test('short sections merge, so a 28-double-bar Te Deum does not flicker', () => {
  const ev = fitToBars(corpus('te-deum-simple.gabc').events, 8);
  const plan = sectionPlan({ events: ev, minBars: 4 });
  assert.ok(plan.length >= 2 && plan.length < 28, String(plan.length));
  assert.ok(plan.every((s) => s.bars >= 4), JSON.stringify(plan.map((s) => s.bars)));
  assert.ok(tiles(plan));
  assert.equal(sectionAt(plan, 0), plan[0]);
  assert.equal(sectionAt(plan, 10_000), null);
});

test('a piece with no inner double bar is one drop; bad counts throw', () => {
  const ev = fitToBars(corpus('pange-lingua.gabc').events, 8);
  const plan = sectionPlan({ events: ev });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].energy, 'drop');
  assert.throws(() => sectionPlan({ events: ev, intro: 1.5 }));
  assert.throws(() => sectionPlan({ events: ev, outro: -1 }));
});

const plan = [
  { name: 'Intro', energy: 'intro', start: 0, bars: 2, build: false },
  { name: 'Verse 1', energy: 'verse', start: 2, bars: 4, build: true },
  { name: 'Drop 1', energy: 'drop', start: 6, bars: 4, build: false },
  { name: 'Outro', energy: 'outro', start: 10, bars: 2, build: false },
];

for (const genre of ['deep-house', 'edm', 'hard-rock', 'metal']) {
  test(`${genre}: intro, verse, build, drop and outro do what they say`, () => {
    const a = arrange({ genre, mode: 1, final: 50, bars: 12, fills: true, sections: plan });
    for (const bar of [0, 1]) {
      assert.ok(!inBar(a.drums, bar).some((n) => [KICK, SNARE, CRASH, 39].includes(n.note)), `intro bar ${bar} has kick/snare/crash`);
      assert.equal(inBar(a.bass, bar).length, 0);
      assert.ok(inBar(a.chords, bar).length > 0);
    }
    for (const bar of [2, 3, 4]) {
      assert.equal(inBar(a.chords, bar).length, 0, 'verse has no chord part');
      assert.ok(!inBar(a.drums, bar).some((n) => n.note === CRASH), 'verse has no crash');
      assert.ok(inBar(a.drums, bar).some((n) => n.note === KICK));
    }
    // build bar 5: snare roll that speeds up and swells, kicks on 1 and 2, the last eighth empty
    const roll = inBar(a.drums, 5).filter((n) => n.note === SNARE);
    const gaps = roll.slice(1).map((n, i) => n.tick - roll[i].tick);
    assert.ok(roll.length >= 6);
    assert.ok(gaps.every((g, i) => i === 0 || g <= gaps[i - 1]), `gaps ${gaps}`);
    assert.ok(roll.every((n, i) => i === 0 || n.vel >= roll[i - 1].vel));
    assert.deepEqual(inBar(a.drums, 5).filter((n) => n.note === KICK).map((n) => n.tick - 5 * BAR), [0, PPQ]);
    const air = 6 * BAR - PPQ / 2;
    for (const k of ['drums', 'bass', 'chords']) {
      for (const n of inBar(a[k], 5)) assert.ok(n.tick < air && n.tick + n.len <= air, `${k} sounds in the air gap`);
    }
    // drop: crash on the first downbeat, chords back
    assert.ok(a.drums.some((n) => n.note === CRASH && n.tick === 6 * BAR));
    assert.ok(inBar(a.chords, 6).length > 0);
    // outro: no kick, no bass until the last bar's held chord and crash
    assert.ok(!inBar(a.drums, 10).some((n) => n.note === KICK));
    assert.deepEqual(inBar(a.drums, 11).map((n) => n.note), [CRASH]);
    assert.equal(inBar(a.chords, 11).length, 3);
    // every pitched note stays in the mode
    for (const n of [...a.bass, ...a.chords]) assert.ok(SCALES.dorian.includes((((n.note - 50) % 12) + 12) % 12), `${n.note}`);
    assert.deepEqual(a.sections.map((s) => s.tick), [0, 2 * BAR, 6 * BAR, 10 * BAR]);
  });
}

test('without sections the backing is unchanged', () => {
  const a = arrange({ genre: 'metal', mode: 3, final: 52, bars: 9, fills: true });
  const b = arrange({ genre: 'metal', mode: 3, final: 52, bars: 9, fills: true, sections: null });
  assert.deepEqual(a, b);
  assert.equal(a.sections, undefined);
});

test('rendered, the drop is louder than the verse and the intro quieter than both', () => {
  const a = arrange({ genre: 'deep-house', mode: 1, final: 50, bars: 12, sections: plan });
  // no chant notes, so only the backing is measured
  const wav = renderMidi(eventsToMidi([{ type: 'bar', kind: 'full', pulses: 8 * 12 }], { bpm: 120, backing: a }), { targetPeak: 0.8 });
  const rate = 44100, barSec = 2; // 4 beats at 120 BPM
  const rms = (b0, b1) => {
    const L = wav.channels[0];
    let s = 0, n = 0;
    for (let i = Math.floor(b0 * barSec * rate); i < Math.floor(b1 * barSec * rate); i++) { s += L[i] * L[i]; n++; }
    return Math.sqrt(s / n);
  };
  const intro = rms(0, 2), verse = rms(2, 5), drop = rms(6, 10);
  assert.ok(intro < verse && verse < drop, `intro ${intro.toFixed(4)} verse ${verse.toFixed(4)} drop ${drop.toFixed(4)}`);
});

test('the MIDI carries a marker per section', () => {
  const a = arrange({ genre: 'edm', mode: 1, final: 50, bars: 12, sections: plan });
  const bytes = eventsToMidi([{ type: 'note', midi: 50, pulses: 8, syllable: 'A' }], { backing: a });
  const text = new TextDecoder('latin1').decode(bytes);
  for (const s of plan) assert.ok(text.includes(s.name), s.name);
});

const d = mkdtempSync(join(tmpdir(), 'cf-sec-'));
const f = join(d, 'a.gabc');
writeFileSync(f, 'name:T;\nmode:1;\n%%\n(c4) Ky(f)ri(g)e(f) (::) Chri(g)ste(f) (::) Ky(f)ri(g)e(f) (::)\n');
const secs = (r) => Number(/([\d.]+) s at/.exec(r.text)[1]);

test('cli: --sections and --outro', () => {
  assert.equal(run([f, '--sections']).code, 2, '--sections needs --genre');
  for (const v of ['0', '17', 'x', '1.5']) assert.equal(run([f, '--outro', v]).code, 2, v);
  const a = run([f, '--bpm', '120', '--fit', '8']);
  const b = run([f, '--bpm', '120', '--fit', '8', '--outro', '2']);
  assert.ok(Math.abs(secs(b) - secs(a) - 4) < 0.15, `${secs(a)} vs ${secs(b)}`);
  const o = join(d, 'o.mid');
  const r = run([f, '--genre', 'deep-house', '--fit', '8', '--sections', '--intro', '2', '--outro', '2', '-o', o]);
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /sections: Intro bar 1-2 .*; Drop 1 bar 3-5; Outro bar 6-7/);
  const text = new TextDecoder('latin1').decode(readFileSync(o));
  assert.ok(text.includes('Intro') && text.includes('Outro'));
});
