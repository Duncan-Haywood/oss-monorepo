// A cappella first verse and the key lift into the last drop (sections.mjs acappella / keyLift,
// liftEvents; genre.mjs arrange; cli.mjs --a-cappella, --key-lift, --range).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGabc, fitStretch, fitToBars, transposeToFinal } from './gabc.mjs';
import { sectionPlan, liftEvents } from './sections.mjs';
import { arrange, BAR, SCALES, APPROACH, GENRE_NAMES } from './genre.mjs';
import { run } from './cli.mjs';

const corpus = (f) => parseGabc(readFileSync(new URL(`./corpus/${f}`, import.meta.url), 'utf8'));
const path = (f) => new URL(`./corpus/${f}`, import.meta.url).pathname;
const inBar = (list, bar) => list.filter((n) => n.tick >= bar * BAR && n.tick < (bar + 1) * BAR);
const hymn = () => fitStretch(transposeToFinal(corpus('pange-lingua-full.gabc').events, 52), 8);
const dir = mkdtempSync(join(tmpdir(), 'chant-lift-'));

test('a cappella: the first verse is the choir alone, and the build bar brings the band in', () => {
  const ev = hymn();
  const plan = sectionPlan({ events: ev, intro: 2, outro: 2, acappella: true });
  const first = plan[1];
  assert.equal(first.energy, 'acappella');
  assert.equal(first.name, 'Verse 1 (a cappella)');
  assert.ok(first.build);
  assert.equal(plan.filter((s) => s.energy === 'verse')[0].name, 'Verse 2');
  const bars = plan.at(-1).start + plan.at(-1).bars;
  for (const genre of GENRE_NAMES) {
    const a = arrange({ genre, mode: 3, final: 52, bars, fills: true, sections: plan });
    for (let b = first.start; b < first.start + first.bars - 1; b++) {
      for (const k of ['drums', 'bass', 'chords']) assert.equal(inBar(a[k], b).length, 0, `${genre} ${k} bar ${b}`);
    }
    const build = first.start + first.bars - 1;
    assert.ok(inBar(a.drums, build).some((n) => n.note === 36), `${genre}: the build bar has kicks`);
    // the intro before it is unchanged by the option
    const plain = arrange({ genre, mode: 3, final: 52, bars, sections: sectionPlan({ events: ev, intro: 2, outro: 2 }) });
    for (const k of ['drums', 'bass', 'chords']) assert.deepEqual(inBar(a[k], 0).concat(inBar(a[k], 1)), inBar(plain[k], 0).concat(inBar(plain[k], 1)));
  }
  // one section: nothing for the drop to follow
  assert.throws(() => sectionPlan({ events: fitToBars(corpus('pange-lingua.gabc').events, 8), acappella: true }), /two or more/);
});

test('key lift: the last drop and outro move up, the build into it is in the new key, the rest is untouched', () => {
  const ev = hymn();
  const plain = sectionPlan({ events: ev, intro: 2, outro: 2 });
  const plan = sectionPlan({ events: ev, intro: 2, outro: 2, keyLift: 2 });
  const d = plan.findLastIndex((s) => s.energy === 'drop');
  assert.ok(plan.slice(d).every((s) => s.lift === 2));
  assert.ok(plan.slice(0, d).every((s) => !s.lift));
  assert.equal(plan[d - 1].buildLift, 2);
  const bars = plan.at(-1).start + plan.at(-1).bars;
  const from = plan[d].start;
  const buildBar = from - 1;
  for (const genre of GENRE_NAMES) {
    const a = arrange({ genre, mode: 3, final: 52, bars, sections: plan });
    const b = arrange({ genre, mode: 3, final: 52, bars, sections: plain });
    const before = (l) => l.filter((n) => n.tick < buildBar * BAR);
    const after = (l) => l.filter((n) => n.tick >= buildBar * BAR);
    for (const k of ['drums', 'bass', 'chords']) assert.deepEqual(before(a[k]), before(b[k]), `${genre} ${k} before the build`);
    assert.deepEqual(after(a.drums), after(b.drums), `${genre}: drums do not transpose`);
    for (const k of ['bass', 'chords']) assert.deepEqual(after(a[k]), after(b[k]).map((n) => ({ ...n, note: n.note + 2 })), `${genre} ${k} up a whole tone`);
    assert.match(a.sections[d].name, /key up 2/);
  }
  assert.throws(() => sectionPlan({ events: ev, keyLift: 1.5 }));
  assert.throws(() => sectionPlan({ events: fitToBars(corpus('pange-lingua.gabc').events, 8), keyLift: 2 }), /two or more/);
});

test('the lifted build chord stands on the old final: its tonic in Mixolydian, its major chord in Dorian', () => {
  // bVII of the new key a whole tone up has the old final as its root. In Mixolydian it is the
  // old tonic chord itself; in Dorian the old minor tonic with its third raised (a Picardy-style
  // turn). Either way the choir's last phrase, ending on the old final, sits on its own root.
  for (const [mode, name, third] of [[1, 'dorian', 4], [7, 'mixolydian', 4]]) {
    const final = 50;
    const plan = [
      { name: 'Verse 1', energy: 'verse', start: 0, bars: 4, build: true, buildLift: 2 },
      { name: 'Drop 1', energy: 'drop', start: 4, bars: 4, build: false, lift: 2 },
    ];
    const a = arrange({ genre: 'edm', mode, final, bars: 8, sections: plan });
    const held = inBar(a.chords, 3).filter((n) => n.tick === 3 * BAR && n.vel === 70).map((n) => n.note).sort((x, y) => x - y); // not the riser
    assert.equal(APPROACH[name], 6);
    assert.equal(held[0] % 12, final % 12, `${name}: root is the old final`);
    assert.deepEqual(held.map((n) => n - held[0]), [0, third, 7], name);
    assert.equal(SCALES[name][2], name === 'dorian' ? 3 : 4); // the old tonic's own third
  }
});

test('liftEvents raises exactly the last verse\'s notes', () => {
  const ev = hymn();
  const plan = sectionPlan({ events: ev, intro: 2, keyLift: 2 });
  const lifted = liftEvents(ev, plan, { intro: 2 });
  // the last double bar's verse: every note after the fifth inner double bar
  let doubles = 0;
  const expect = [];
  for (const e of ev) {
    if (e.type === 'bar' && e.kind === 'double') doubles++;
    if (e.type === 'note') expect.push(doubles >= 5);
  }
  const notes = lifted.filter((e) => e.type === 'note');
  const orig = ev.filter((e) => e.type === 'note');
  assert.equal(notes.length, orig.length);
  notes.forEach((n, i) => assert.equal(n.midi, orig[i].midi + (expect[i] ? 2 : 0), `note ${i}`));
  assert.ok(expect.filter(Boolean).length > 40);
  // no plan lift: a copy, unchanged
  assert.deepEqual(liftEvents(ev, sectionPlan({ events: ev })), ev);
});

test('cli: the key lift is checked against the singing range', () => {
  const base = [path('pange-lingua-full.gabc'), '--fit', '8', '--stretch', '--genre', 'deep-house', '--sections', '--key-lift', '2'];
  const high = run([...base, '--final', '57', '-o', join(dir, 'a.mid')]);
  assert.equal(high.code, 1);
  const m = /use --final (\d+) or lower/.exec(high.text);
  assert.ok(m, high.text);
  const ok = run([...base, '--final', m[1], '-o', join(dir, 'b.mid'), '--json']);
  assert.equal(ok.code, 0, ok.text);
  assert.equal(run([...base, '--final', String(Number(m[1]) + 1), '-o', join(dir, 'c.mid')]).code, 1);
  // --suggest-final reports keys, before the lift, and its highest is the refusal's bound
  const sug = JSON.parse(run([...base, '--suggest-final', '--json']).text);
  assert.equal(sug.keyLift, 2);
  assert.equal(sug.finals.highest, Number(m[1]));
  // a wider range lets the higher key through
  assert.equal(run([...base, '--final', '57', '--range', '45-70', '-o', join(dir, 'd.mid')]).code, 0);
  assert.equal(run([...base, '--range', '64-40', '--suggest-final']).code, 2);
  assert.equal(run([...base, '--drone', '-o', join(dir, 'e.mid')]).code, 2);
  assert.match(run([path('pange-lingua-full.gabc'), '--key-lift', '2']).text, /needs --sections/);
  assert.match(run([path('pange-lingua-full.gabc'), '--genre', 'edm', '--a-cappella']).text, /needs --sections/);
  assert.match(run([path('pange-lingua.gabc'), '--fit', '8', '--genre', 'edm', '--sections', '--a-cappella']).text, /two or more/);
});

test('cli: --auto-final with a key lift keeps every note, lifted ones included, in E2-E4', () => {
  for (const f of ['pange-lingua-full.gabc', 'veni-creator-full.gabc', 'te-deum-simple.gabc']) {
    for (const lift of [1, 2, 3]) {
      const out = join(dir, `${f}-${lift}.mid`);
      const r = run([path(f), '--auto-final', '--fit', '8', '--genre', 'metal', '--sections', '--a-cappella', '--key-lift', String(lift), '-o', out, '--json']);
      if (r.code === 1) { assert.match(r.text, /wider than/); continue; }
      assert.equal(r.code, 0, r.text);
      const s = JSON.parse(r.text);
      const midi = (name) => { const m = /^([A-G][#b]?)(\d)$/.exec(name); return 12 * (Number(m[2]) + 1) + ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].indexOf(m[1]); };
      assert.ok(midi(s.lowest) >= 40 && midi(s.highest) <= 64, `${f} +${lift}: ${s.lowest}-${s.highest}`);
      assert.ok(s.sections.some((x) => /a cappella/.test(x)) && s.sections.some((x) => new RegExp(`key up ${lift}`).test(x)), s.sections.join('; '));
    }
  }
});
