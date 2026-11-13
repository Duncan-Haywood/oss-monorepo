import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc } from './gabc.mjs';
import { CHOIRS, CHOIR_NAMES, choirUnison, fewestSections, splitVoices, suggestFinal, TENOR_RANGE, BASS_RANGE } from './voicefit.mjs';
import { run } from './cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'corpus');
const files = [
  ...readdirSync(join(corpus, 'gregobase-1908')).filter((f) => f.endsWith('.gabc')).map((f) => join(corpus, 'gregobase-1908', f)),
  ...readdirSync(corpus).filter((f) => f.endsWith('.gabc')).map((f) => join(corpus, f)),
];
const dies = join(corpus, 'dies-irae.gabc');
const first1908 = files[0];

test('presets: textbook is the defaults, each preset nests T2 under T and has a unison band', () => {
  assert.deepEqual(CHOIR_NAMES, ['textbook', 'amateur', 'octave']);
  assert.equal(CHOIRS.textbook.tenor, TENOR_RANGE);
  assert.equal(CHOIRS.textbook.bass, BASS_RANGE);
  for (const n of CHOIR_NAMES) {
    const c = CHOIRS[n];
    assert.ok(c.tenor2.high <= c.tenor.high && c.bass.low < c.baritone.low && c.baritone.low < c.tenor.low, n);
    const u = choirUnison(c);
    for (const s of ['tenor', 'tenor2', 'baritone', 'bass']) assert.ok(c[s].low <= u.low && u.high <= c[s].high, `${n} ${s}`);
  }
  assert.deepEqual(choirUnison(CHOIRS.textbook), { low: 48, high: 64 });
  assert.deepEqual(choirUnison(CHOIRS.octave), { low: 52, high: 57 });
});

test('fewestSections on the corpus: what it names fits, and one fewer does not', () => {
  for (const n of CHOIR_NAMES) {
    const c = CHOIRS[n];
    for (const f of files) {
      const ev = parseGabc(readFileSync(f, 'utf8')).events;
      const v = fewestSections(ev, c);
      const tries = [
        () => suggestFinal(ev, choirUnison(c)).fits,
        () => splitVoices(ev, { tenor: c.tenor, bass: c.bass }).fits,
        () => splitVoices(ev, { tenor: c.tenor, bass: c.bass, baritone: c.baritone }).fits,
        () => splitVoices(ev, { tenor: c.tenor, bass: c.bass, baritone: c.baritone, tenor2: c.tenor2 }).fits,
      ];
      const k = v.sections === 0 ? 4 : v.sections - 1;
      for (let j = 0; j < k; j++) assert.equal(tries[j](), false, `${n} ${f} ${j}`);
      if (v.sections) assert.equal(tries[k](), true, `${n} ${f}`);
    }
  }
});

test('--choir sets the unison range and names the fewest sections when unison fails', () => {
  assert.match(run([first1908, '--choir', 'textbook', '--suggest-final']).text, /^finals that fit C3-E4/);
  const r = run([dies, '--choir', 'octave', '--suggest-final']);
  assert.equal(r.code, 1);
  assert.match(r.text, /wider than E3-A3; the octave choir can sing it as tenors, baritones and basses: add --split-voices --baritones$/);
  const a = run([dies, '--choir', 'amateur', '--auto-final']);
  assert.match(a.text, /use --final to choose; the amateur choir can sing it as tenors and basses: add --split-voices$/);
  // --range wins over the preset's unison band, and then no hint is given
  const g = run([dies, '--choir', 'octave', '--range', '40-52', '--suggest-final']);
  assert.match(g.text, /wider than E2-E3; try --split-voices$/);
  const j = JSON.parse(run([dies, '--choir', 'octave', '--suggest-final', '--json']).text);
  assert.equal(j.choir, 'octave');
  assert.equal(j.fewestSections.sections, 3);
});

test('--choir sets the split ranges, and a section flag overrides one section', () => {
  const s = JSON.parse(run([dies, '--choir', 'octave', '--split-voices', '--baritones', '--json']).text);
  assert.equal(s.choir, 'octave');
  assert.equal(s.voices.unison, 'E3-A3');
  assert.equal(s.voices.allNotes, 7);
  const t = JSON.parse(run([dies, '--choir', 'amateur', '--split-voices', '--json']).text);
  assert.equal(t.voices.unison, 'D3-C4');
  const o = JSON.parse(run([dies, '--choir', 'amateur', '--split-voices', '--tenor', '48-69', '--json']).text);
  assert.equal(o.voices.unison, 'C3-C4');
  // with octave-wide tenors and basses alone the Dies irae does not fit
  const no = run([dies, '--choir', 'octave', '--split-voices']);
  assert.equal(no.code, 1);
  assert.match(no.text, /tenors E3-E4 and basses A2-A3/);
});

test('--choir: unknown names are refused; without it nothing changes', () => {
  const r = run([dies, '--choir', 'alto']);
  assert.equal(r.code, 2);
  assert.match(r.text, /one of textbook, amateur, octave/);
  assert.equal(run([dies, '--split-voices', '--json']).text, run([dies, '--choir', 'textbook', '--split-voices', '--json']).text.replace(/\n  "choir": "textbook",/, ''));
  assert.match(run([first1908, '--suggest-final']).text, /^finals that fit E2-E4/);
});
