import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseGabc } from './gabc.mjs';
import { splitVoices, describeSplit, phrasesOf, wordsOf, TENOR_RANGE, BASS_RANGE } from './voicefit.mjs';
import { parseMidi } from './render.mjs';
import { run } from './cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'corpus');
const both = { low: Math.max(TENOR_RANGE.low, BASS_RANGE.low), high: Math.min(TENOR_RANGE.high, BASS_RANGE.high) };
const files = [
  ...readdirSync(join(corpus, 'gregobase-1908')).filter((f) => f.endsWith('.gabc')).map((f) => join(corpus, 'gregobase-1908', f)),
  ...readdirSync(corpus).filter((f) => f.endsWith('.gabc')).map((f) => join(corpus, f)),
];
const load = (f) => parseGabc(readFileSync(f, 'utf8')).events;
const ev = (spec) => spec.split(' ').map((t) => (t === '|' ? { type: 'bar', kind: 'full', pulses: 1 } : { type: 'note', midi: Number(t), pulses: 1 }));

test('every note is in its singers\' range on all 67 corpus files', () => {
  let split = 0;
  for (const f of files) {
    const r = splitVoices(load(f));
    assert.ok(r.fits, f);
    for (const e of r.events.filter((x) => x.type === 'note')) {
      const range = e.voice === 'all' ? both : e.voice === 'tenor' ? TENOR_RANGE : BASS_RANGE;
      assert.ok(e.midi >= range.low && e.midi <= range.high, `${f}: ${e.midi} for ${e.voice}`);
    }
    assert.equal(r.allNotes + r.tenorNotes + r.bassNotes, r.notes);
    if (r.split) split++;
  }
  assert.equal(files.length, 67);
  assert.equal(split, 7); // the seven files with a 17-semitone ambitus, one more than C3-E4 holds
});

test('a chant that fits the unison band is sung by everyone, centred in it', () => {
  const r = splitVoices(ev('50 52 53 | 55 53 52 50'));
  assert.equal(r.split, false);
  assert.ok(r.phrases.every((p) => p.voice === 'all'));
  assert.equal(r.changes, 0);
});

test('a high phrase goes to the tenors, a low one to the basses, the rest to everyone', () => {
  // 26 semitones overall: no unison fit at any final, but each phrase fits one section
  const r = splitVoices(ev('50 52 53 | 62 66 67 69 | 55 53 | 45 43 | 50'));
  assert.ok(r.fits);
  assert.deepEqual(r.phrases.map((p) => p.voice), ['all', 'tenor', 'all', 'bass', 'all']);
  assert.equal(r.shift, 0);
  assert.equal(r.tenorNotes, 4);
  assert.equal(r.bassNotes, 2);
});

test('a phrase wider than either section, or a forced final out of reach, is refused', () => {
  assert.equal(splitVoices(ev('40 70 | 50')).fits, false);
  assert.equal(splitVoices(ev('50 52 | 55'), { shift: 30 }).fits, false);
  assert.throws(() => splitVoices(ev('50'), { tenor: { low: 70, high: 80 }, bass: { low: 40, high: 60 } }), /do not overlap/);
});

test('phrases are cut at every bar kind', () => {
  const e = parseGabc('(c4) A(f)men(g,) al(h;)le(g:)lu(f)ia(e::)').events;
  assert.equal(phrasesOf(e).length, 4);
});

test('CLI: Tenors and Basses tracks, unison notes in both, a who column in the cues', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-split-'));
  const mid = join(dir, 'd.mid'), cues = join(dir, 'd.txt');
  const r = run([join(corpus, 'dies-irae.gabc'), '--split-voices', '--fit', '8', '-o', mid, '--cues', cues]);
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /full choir on 600 of 613 notes \(C3-E4\); tenors alone on phrase 54 \(13 notes\); final F3/);
  assert.match(r.text, /^mode 1$/m); // the mode check reads the final as written, not as transposed
  const m = parseMidi(readFileSync(mid));
  const byCh = (ch) => m.notes.filter((n) => n.ch === ch).length;
  assert.equal(byCh(0), 613); // tenors: the 600 unison notes and their own 13
  assert.equal(byCh(4), 600); // basses: the unison notes only
  const sheet = readFileSync(cues, 'utf8').split('\n').filter(Boolean);
  assert.match(sheet[0], /who/);
  const who = sheet.slice(1).map((l) => l.trim().split(/\s+/)[5]);
  assert.equal(who.filter((w) => w === 'T').length, 13);
  assert.equal(who.filter((w) => w === 'all').length, 600);
});

test('CLI: without --split-voices the file is unchanged; flag checks', () => {
  const f = join(corpus, 'pange-lingua.gabc');
  const dir = mkdtempSync(join(tmpdir(), 'cf-split-'));
  run([f, '--final', '52', '-o', join(dir, 'a.mid')]);
  run([f, '--split-voices', '--final', '52', '-o', join(dir, 'b.mid')]);
  const a = parseMidi(readFileSync(join(dir, 'a.mid'))), b = parseMidi(readFileSync(join(dir, 'b.mid')));
  assert.equal(a.notes.length, 53);
  assert.equal(b.notes.length, 106); // fits in unison: both sections sing every note
  assert.deepEqual(a.notes.map((n) => n.note), b.notes.filter((n) => n.ch === 0).map((n) => n.note));
  assert.equal(run([f, '--tenor', '48-69']).code, 2);
  assert.equal(run([f, '--split-voices', '--auto-final']).code, 2);
  assert.equal(run([f, '--split-voices', '--bass', '60-40']).code, 2);
  assert.equal(run([join(corpus, 'dies-irae.gabc'), '--split-voices', '--final', '62']).code, 1);
});

// ---- Handing over inside a phrase, at a word (2026-11-13, later) ----
const wev = (spec) => spec.split(' ').map((t) => {
  if (t === '|') return { type: 'bar', kind: 'full', pulses: 1 };
  const start = t.startsWith('/');
  return { type: 'note', midi: Number(start ? t.slice(1) : t), pulses: 1, syllable: start ? 'w' : null, wordStart: start };
});

test('needed (the default) matches the bar-only split exactly on all 67 corpus files', () => {
  for (const f of files) {
    const a = splitVoices(load(f), { words: 'never' }), b = splitVoices(load(f));
    assert.equal(b.handoffs, 0, f);
    assert.deepEqual(b.events, a.events, f);
    assert.deepEqual(b.phrases, a.phrases, f);
  }
});

test('a phrase wider than either section is handed over once, at a word', () => {
  // one phrase, 29 semitones: tenors 48-69 take the high word, basses 40-64 the low one
  const e = wev('/40 42 45 /60 64 /66 69');
  assert.equal(splitVoices(e, { words: 'never' }).fits, false);
  const r = splitVoices(e);
  assert.ok(r.fits);
  assert.equal(r.handoffs, 1);
  assert.equal(r.phrases[0].voice, 'mixed');
  assert.deepEqual(r.phrases[0].parts.map((p) => p.voice), ['bass', 'tenor']);
  assert.equal(r.bassNotes + r.tenorNotes + r.allNotes, 7);
  // a word that is itself wider than both sections is refused, and the reason names it
  const x = splitVoices(wev('/40 70 /50'));
  assert.equal(x.fits, false);
  assert.match(x.reason, /widest word, "w", spans 30/);
});

test('prefer trades a handoff for more than wordCost full-choir notes', () => {
  // phrase 2 needs tenors only on its first word (one note at 66); the rest fits C3-E4
  const e = wev('/50 52 | /66 /60 61 62 63 | /55 53');
  const keep = splitVoices(e, { shift: 0 });
  assert.deepEqual(keep.phrases.map((p) => p.voice), ['all', 'tenor', 'all']);
  const cheap = splitVoices(e, { shift: 0, words: 'prefer', wordCost: 3 });
  assert.equal(cheap.phrases[1].voice, 'mixed');
  assert.equal(cheap.allNotes, 8); // 4 more full-choir notes (of 9) for one handoff
  const dear = splitVoices(e, { shift: 0, words: 'prefer', wordCost: 4 }); // a tie keeps the whole phrase
  assert.equal(dear.phrases[1].voice, 'tenor');
  assert.throws(() => splitVoices(e, { words: 'sometimes' }), /never, needed or prefer/);
  assert.throws(() => splitVoices(e, { words: 'prefer', wordCost: -1 }), /whole number/);
});

test('the DP is exact: brute force over every word assignment on 300 random lines', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const tenor = { low: 52, high: 64 }, bass = { low: 45, high: 57 }, both = { low: 52, high: 57 };
  const R = { all: both, tenor, bass };
  for (let t = 0; t < 300; t++) {
    const toks = [];
    const n = 4 + rnd(6);
    let m = 50 + rnd(6);
    for (let i = 0; i < n; i++) {
      if (i && rnd(4) === 0) toks.push('|');
      m = Math.max(42, Math.min(66, m + rnd(9) - 4));
      toks.push((i === 0 || toks.at(-1) === '|' || rnd(2) ? '/' : '') + m);
    }
    const e = wev(toks.join(' '));
    const ph = phrasesOf(e);
    const ws = wordsOf(e, ph);
    for (const [words, wordCost] of [['needed', 4], ['prefer', 0], ['prefer', 3]]) {
      const r = splitVoices(e, { tenor, bass, words, wordCost, shift: 0 });
      // brute force at shift 0
      let best = null;
      const V = ['all', 'tenor', 'bass'];
      for (let code = 0; code < 3 ** ws.length; code++) {
        let c = code, ok = true, mid = 0, nonAll = 0, ch = 0, prev = null;
        for (let k = 0; k < ws.length; k++) {
          const v = V[c % 3]; c = Math.floor(c / 3);
          if (ws[k].lo < R[v].low || ws[k].hi > R[v].high) { ok = false; break; }
          if (v !== 'all') nonAll += ws[k].notes;
          if (prev && prev !== v) { ch++; if (ws[k - 1].phrase === ws[k].phrase) mid++; }
          prev = v;
        }
        if (!ok) continue;
        const key = words === 'needed' ? [mid, nonAll, ch] : [nonAll + wordCost * mid, ch, mid];
        const d = best ? key.findIndex((x, i) => x !== best[i]) : -1;
        if (!best || (d >= 0 && key[d] < best[d])) best = key;
      }
      if (!best) { assert.equal(r.fits, false, toks.join(' ')); continue; }
      assert.ok(r.fits, toks.join(' '));
      const nonAll = r.notes - r.allNotes;
      const got = words === 'needed' ? [r.handoffs, nonAll, r.changes] : [nonAll + wordCost * r.handoffs, r.changes, r.handoffs];
      assert.deepEqual(got, best, `${words} ${wordCost}: ${toks.join(' ')}`);
    }
  }
});

test('octave-wide sections: words make 56 of the 67 corpus files singable, bars alone 50', () => {
  const tenor = { low: 52, high: 64 }, bass = { low: 45, high: 57 };
  let never = 0, needed = 0, handoffs = 0;
  for (const f of files) {
    if (splitVoices(load(f), { tenor, bass, words: 'never' }).fits) never++;
    const r = splitVoices(load(f), { tenor, bass });
    if (r.fits) { needed++; handoffs += r.handoffs; }
  }
  assert.equal(never, 50);
  assert.equal(needed, 56);
  assert.equal(handoffs, 7);
});

test('CLI: --split-words hands phrase 54 of the Dies irae over at a word', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-split-'));
  const r = run([join(corpus, 'dies-irae.gabc'), '--split-voices', '--split-words', '-o', join(dir, 'w.mid'), '--json']);
  assert.equal(r.code, 0, r.text);
  const v = JSON.parse(r.text).voices;
  assert.equal(v.allNotes, 607);
  assert.equal(v.tenorNotes, 6);
  assert.deepEqual(v.sharedPhrases, [54]);
  assert.equal(v.handoffs, 1);
  assert.match(v.line, /phrase 54 handed over at a word: tenors "Judicándus", all "homo reus:"/);
  const f = join(corpus, 'pange-lingua.gabc');
  assert.equal(run([f, '--split-words']).code, 2);
  assert.equal(run([f, '--split-voices', '--word-cost', '3']).code, 2);
  assert.equal(run([f, '--split-voices', '--split-words', '--word-cost', 'x']).code, 2);
});

// words: groups of MIDI numbers, each group one word of one phrase
const wordsEv = (...ws) => ws.flatMap((w, k) => w.map((m, j) => ({ type: 'note', midi: m, pulses: 1, wordStart: j === 0, syllable: j === 0 ? `w${k + 1}` : '' })));
const OCT = { tenor: { low: 52, high: 64 }, bass: { low: 45, high: 57 }, shift: 0 };

test('overlap: the incoming section joins on the last note when it is in both ranges', () => {
  const plain = splitVoices(wordsEv([62, 56], [50, 48]), OCT);
  assert.equal(plain.overlaps, undefined);
  assert.deepEqual(plain.events.map((e) => e.voice), ['tenor', 'tenor', 'bass', 'bass']);
  const r = splitVoices(wordsEv([62, 56], [50, 48]), { ...OCT, overlap: true });
  assert.deepEqual(r.events.map((e) => e.voice), ['tenor', 'all', 'bass', 'bass']);
  assert.deepEqual(r.overlaps.map((o) => [o.from, o.to, o.how, o.note]), [['tenor', 'bass', 'joins early', 'Ab3']]);
  assert.equal(r.breaks, 0);
  assert.deepEqual([r.allNotes, r.tenorNotes, r.bassNotes], [1, 1, 2]);
  assert.match(describeSplit(r), /phrase 1: basses join tenors on Ab3 and take over/);
});

test('overlap: else the outgoing section holds on for the first note; else the line breaks', () => {
  const r = splitVoices(wordsEv([62, 63], [55, 48]), { ...OCT, overlap: true });
  assert.deepEqual(r.events.map((e) => e.voice), ['tenor', 'tenor', 'all', 'bass']);
  assert.equal(r.overlaps[0].how, 'holds on');
  assert.equal(r.overlaps[0].syllable, 'w2');
  assert.match(describeSplit(r), /phrase 1: tenors hold on with basses for G3 \("w2"\)/);
  const b = splitVoices(wordsEv([62, 63], [50, 48]), { ...OCT, overlap: true });
  assert.deepEqual(b.events.map((e) => e.voice), ['tenor', 'tenor', 'bass', 'bass']);
  assert.equal(b.overlaps.length, 0);
  assert.equal(b.breaks, 1);
  assert.match(describeSplit(b), /1 handoff with no note both sections can sing \(the line breaks there\)/);
});

test('overlap: no overlap across a bar or next to the full choir', () => {
  const ev2 = [...wordsEv([62, 56]), { type: 'bar', kind: 'full', pulses: 1 }, ...wordsEv([50, 48])];
  const r = splitVoices(ev2, { ...OCT, overlap: true });
  assert.equal(r.overlaps.length + r.breaks, 0);
  const s = splitVoices(wordsEv([62, 63], [55, 54], [50, 48]), { ...OCT, words: 'prefer', wordCost: 0, overlap: true });
  assert.deepEqual(s.events.map((e) => e.voice), ['tenor', 'tenor', 'all', 'all', 'bass', 'bass']);
  assert.equal(s.overlaps.length + s.breaks, 0);
});

test('overlap on the corpus, octave sections: every direct swap overlaps, every note in range', () => {
  const tenor = { low: 52, high: 64 }, bass = { low: 45, high: 57 };
  const inBoth = { low: 52, high: 57 };
  let swaps = 0;
  for (const f of files) {
    const r = splitVoices(load(f), { tenor, bass, words: 'prefer', overlap: true });
    if (!r.fits) continue;
    swaps += r.overlaps.length;
    assert.equal(r.breaks, 0, f);
    assert.equal(r.allNotes + r.tenorNotes + r.bassNotes, r.notes);
    for (const e of r.events.filter((x) => x.type === 'note')) {
      const range = e.voice === 'all' ? inBoth : e.voice === 'tenor' ? tenor : bass;
      assert.ok(e.midi >= range.low && e.midi <= range.high, `${f}: ${e.midi} for ${e.voice}`);
    }
  }
  assert.equal(swaps, 13); // eval/overlap-report.md
});

test('CLI: --overlap reports overlaps and breaks; needs --split-voices', () => {
  const f = join(corpus, 'gregobase-1908', '3408.gabc');
  const r = run([f, '--split-voices', '--split-words', '--overlap', '--tenor', '52-64', '--bass', '45-57', '--json']);
  assert.equal(r.code, 0, r.text);
  const v = JSON.parse(r.text).voices;
  assert.equal(v.overlaps, 1);
  assert.equal(v.breaks, 0);
  assert.match(v.line, /basses join|tenors join|hold on with/);
  assert.equal(JSON.parse(run([f, '--split-voices', '--split-words', '--tenor', '52-64', '--bass', '45-57', '--json']).text).voices.overlaps, undefined);
  assert.equal(run([f, '--overlap']).code, 2);
});

// ---- Three sections: baritones between tenors and basses (2026-11-13) ----
const BARITONE = { low: 45, high: 65 };
const OCTAVE = { tenor: { low: 52, high: 64 }, baritone: { low: 48, high: 60 }, bass: { low: 45, high: 57 } };
const SECTIONS3 = { tenor: TENOR_RANGE, baritone: BARITONE, bass: BASS_RANGE };
const rangeOf = (voice, secs) => {
  const names = voice === 'all' ? Object.keys(secs) : voice.split('+');
  return { low: Math.max(...names.map((n) => secs[n].low)), high: Math.min(...names.map((n) => secs[n].high)) };
};

test('three sections: every note is in the range of every section that sings it, on all 67 files and both range sets', () => {
  for (const secs of [SECTIONS3, OCTAVE]) {
    for (const f of files) {
      const r = splitVoices(load(f), { ...secs, overlap: true });
      if (!r.fits) continue;
      let sum = 0;
      for (const n of Object.values(r.voiceNotes)) sum += n;
      assert.equal(sum, r.notes, f);
      for (const e of r.events.filter((x) => x.type === 'note')) {
        const g = rangeOf(e.voice, secs);
        assert.ok(e.midi >= g.low && e.midi <= g.high, `${f}: ${e.midi} for ${e.voice}`);
      }
    }
  }
});

test('three sections: octave-wide sections fit 64 of 67 files with baritones, 56 without', () => {
  const fit = (bar) => files.filter((f) => splitVoices(load(f), { ...OCTAVE, baritone: bar ? OCTAVE.baritone : null }).fits).length;
  assert.equal(fit(false), 56);
  assert.equal(fit(true), 64);
  assert.equal(splitVoices(load(join(corpus, 'dies-irae.gabc')), { tenor: OCTAVE.tenor, bass: OCTAVE.bass }).fits, false);
  assert.ok(splitVoices(load(join(corpus, 'dies-irae.gabc')), OCTAVE).fits);
});

test('three sections: a phrase out of the unison band goes to the two sections that reach it, not one', () => {
  // unison C3-E4 (48-64); tenors and baritones 48-65; baritones and basses 45-64
  const r = splitVoices(ev('50 52 55 | 60 63 65 | 52 50 | 46 48 50 | 50'), { ...SECTIONS3, shift: 0 });
  assert.deepEqual(r.phrases.map((p) => p.voice), ['all', 'tenor+baritone', 'all', 'baritone+bass', 'all']);
  assert.deepEqual(r.sectionNotes, { tenor: 9, baritone: 12, bass: 9 });
  assert.match(describeSplit(r), /tenors and baritones together on phrase 2 \(3 notes\); baritones and basses together on phrase 4 \(3 notes\)/);
  // 67 is above the baritones and 44 below them: one section alone
  const s = splitVoices(ev('50 52 55 | 60 63 65 67 | 52 50 | 44 46 48 | 50'), { ...SECTIONS3, shift: 0 });
  assert.deepEqual(s.phrases.map((p) => p.voice), ['all', 'tenor', 'all', 'bass', 'all']);
  // the same chant with two sections: the 65 and the 46 phrases are tenors and basses alone
  const two = splitVoices(ev('50 52 55 | 60 63 65 | 52 50 | 46 48 50 | 50'), { shift: 0 });
  assert.deepEqual(two.phrases.map((p) => p.voice), ['all', 'tenor', 'all', 'bass', 'all']);
});

test('three sections: the DP is exact (brute force over every assignment of 150 random small chants)', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const sets = ['all', 'tenor+baritone', 'baritone+bass', 'tenor+bass', 'tenor', 'baritone', 'bass'];
  for (let t = 0; t < 150; t++) {
    const phr = 1 + rnd(5);
    const spec = [];
    for (let k = 0; k < phr; k++) {
      const n = 1 + rnd(3);
      for (let j = 0; j < n; j++) spec.push(String(40 + rnd(30)));
      if (k < phr - 1) spec.push('|');
    }
    const e = ev(spec.join(' '));
    const r = splitVoices(e, { ...SECTIONS3, shift: 0, words: 'never' });
    const ps = phrasesOf(e);
    let best = null;
    const walk = (k, acc, missing, changes) => {
      if (k === ps.length) { if (!best || missing < best[0] || (missing === best[0] && changes < best[1])) best = [missing, changes]; return; }
      for (const v of sets) {
        const g = rangeOf(v, SECTIONS3);
        if (g.low > g.high || ps[k].lo < g.low || ps[k].hi > g.high) continue;
        const size = v === 'all' ? 3 : v.split('+').length;
        walk(k + 1, v, missing + (3 - size) * ps[k].notes, changes + (k && v !== acc ? 1 : 0));
      }
    };
    walk(0, null, 0, 0);
    assert.equal(r.fits, best !== null, spec.join(' '));
    if (!best) continue;
    const missing = r.events.filter((x) => x.type === 'note').reduce((a, x) => a + 3 - (x.voice === 'all' ? 3 : x.voice.split('+').length), 0);
    assert.deepEqual([missing, r.changes], best, spec.join(' '));
  }
});

test('CLI --baritones: a Baritones track, T+Bar style who column, flag checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-split3-'));
  const mid = join(dir, 'd.mid'), cues = join(dir, 'd.txt');
  const f = join(corpus, 'dies-irae.gabc');
  const r = run([f, '--split-voices', '--baritones', '--tenor', '52-64', '--baritone', '48-60', '--bass', '45-57', '--fit', '8', '-o', mid, '--cues', cues, '--json']);
  assert.equal(r.code, 0, r.text);
  const v = JSON.parse(r.text).voices;
  const m = parseMidi(readFileSync(mid));
  const byCh = (ch) => m.notes.filter((n) => n.ch === ch).length;
  assert.equal(byCh(0), v.sectionNotes.tenor);
  assert.equal(byCh(5), v.sectionNotes.baritone);
  assert.equal(byCh(4), v.sectionNotes.bass);
  assert.ok(v.sectionNotes.baritone > 0);
  const who = readFileSync(cues, 'utf8').split('\n').filter((l) => l && !l.startsWith('--')).slice(1).map((l) => l.trim().split(/\s+/)[5]);
  assert.ok(who.every((w) => /^(all|T|Bar|B|T\+Bar|Bar\+B|T\+B)$/.test(w)), who.find((w) => !/^(all|T|Bar|B|T\+Bar|Bar\+B|T\+B)$/.test(w)));
  assert.ok(who.some((w) => w.includes('Bar')));
  assert.equal(run([f, '--baritones']).code, 2);
  assert.equal(run([f, '--split-voices', '--baritone', '60-40']).code, 2);
  // without baritones, octave sections cannot sing it
  assert.equal(run([f, '--split-voices', '--tenor', '52-64', '--bass', '45-57']).code, 1);
});
