import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseNote, parseSection, parseSingers, describeSection, assignSections, singersChoir, fewestSectionsForSingers, overlap } from './singers.mjs';
import { parseGabc } from './gabc.mjs';
import { splitVoices, suggestFinal } from './voicefit.mjs';
import { run } from './cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flat = join(here, 'examples', 'range-test.csv');
const sectioned = join(here, 'examples', 'range-test-sections.csv');
const dies = join(here, 'corpus', 'dies-irae.gabc');
const tmp = mkdtempSync(join(tmpdir(), 'singers-'));
const file = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p; };

test('parseNote reads note names and MIDI numbers, C4 = 60', () => {
  assert.equal(parseNote('C4'), 60);
  assert.equal(parseNote('E2'), 40);
  assert.equal(parseNote('Eb4'), 63);
  assert.equal(parseNote('F#2'), 42);
  assert.equal(parseNote('bb2'), 46);
  assert.equal(parseNote('C♯3'), 49);
  assert.equal(parseNote(' 50 '), 50);
  for (const bad of ['', 'H3', 'C', '200', 'E##2', null]) assert.equal(parseNote(bad), null, String(bad));
});

test('parseSection takes the names a sheet uses', () => {
  assert.equal(parseSection('T'), 'tenor');
  assert.equal(parseSection('Tenor 1'), 'tenor');
  assert.equal(parseSection('2nd tenor'), 'tenor2');
  assert.equal(parseSection('Bar.'), 'baritone');
  assert.equal(parseSection('Basses'), 'bass');
  assert.equal(parseSection('alto'), null);
  assert.equal(parseSection('constructor'), null);
});

test('parseSingers: header names, separators, quotes and errors with row numbers', () => {
  const p = parseSingers('Singer;Lowest;Highest\n"Smith; J";D3;G4\n\n# skip\nRow;C3;60\n');
  assert.equal(p.sectioned, false);
  assert.deepEqual(p.singers.map((s) => [s.name, s.low, s.high]), [['Smith; J', 50, 67], ['Row', 48, 60]]);
  const tabs = parseSingers('low\thigh\tpart\nA2\tD4\tB\n');
  assert.equal(tabs.singers[0].name, 'row 2');
  assert.equal(tabs.singers[0].section, 'bass');
  assert.throws(() => parseSingers('name,top\nA,G4\n'), /needs a "low" and a "high"/);
  assert.throws(() => parseSingers('low,high\nD3,Q4\n'), /row 2: high "Q4"/);
  assert.throws(() => parseSingers('low,high\nD3,C3\n'), /row 2: high C3 is not above low D3/);
  assert.throws(() => parseSingers('low,high,section\nD3,G4,T\nA2,D4,\n'), /row 3: no section/);
  assert.throws(() => parseSingers('low,high,section\nD3,G4,alto\n'), /section "alto"/);
  assert.throws(() => parseSingers('low,high\n'), /no singers/);
});

test('describeSection names who sets each end and what excusing them buys', () => {
  const g = [
    { name: 'a', low: 48, high: 67 },
    { name: 'b', low: 50, high: 69 },
    { name: 'c', low: 47, high: 64 },
  ];
  const r = describeSection(g);
  assert.equal(r.range, 'D3-E4');
  assert.deepEqual(r.lowWithout, { name: 'b', low: 48, note: 'C3' });
  assert.deepEqual(r.highWithout, { name: 'c', high: 67, note: 'G4' });
  // a limit two singers share moves for neither of them alone
  const tie = describeSection([{ name: 'a', low: 50, high: 60 }, { name: 'b', low: 50, high: 62 }]);
  assert.equal(tie.lowWithout, undefined);
  assert.deepEqual(tie.lowSetBy, ['a', 'b']);
});

// every labelled partition into k non-empty groups, scored by the same rule
function bruteForce(singers, order) {
  const k = order.length;
  let best = null;
  const lab = new Array(singers.length).fill(0);
  const total = k ** singers.length;
  for (let x = 0; x < total; x++) {
    let y = x;
    for (let i = 0; i < singers.length; i++) { lab[i] = y % k; y = Math.floor(y / k); }
    const groups = order.map((_, q) => singers.filter((_, i) => lab[i] === q));
    if (groups.some((g) => !g.length)) continue;
    const w = groups.map((g) => overlap(g).width);
    if (w.some((v) => v <= 0)) continue;
    const s = { min: Math.min(...w), sum: w.reduce((a, b) => a + b, 0) };
    if (!best || s.min > best.min || (s.min === best.min && s.sum > best.sum)) best = s;
  }
  return best;
}

test('assignSections: contiguous cuts by mid-range reach the best min width of any partition (random choirs)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let checked = 0;
  for (let trial = 0; trial < 60; trial++) {
    const n = 4 + Math.floor(rnd() * 5); // 4-8 singers
    const k = trial % 2 ? 2 : 3;
    const singers = Array.from({ length: n }, (_, i) => {
      const low = 40 + Math.floor(rnd() * 14);
      return { row: i + 2, name: `s${i}`, low, high: low + 8 + Math.floor(rnd() * 10) };
    });
    const order = k === 2 ? ['bass', 'tenor'] : ['bass', 'baritone', 'tenor'];
    const a = assignSections(singers, order);
    const b = bruteForce(singers, order);
    if (!b) { assert.equal(a, null); continue; }
    assert.ok(a, `trial ${trial}`);
    const w = order.map((s) => overlap(a.groups[s]).width);
    // the min width is the rule's first aim: contiguous cuts must not lose it
    assert.equal(Math.min(...w), b.min, `trial ${trial}`);
    checked++;
  }
  assert.ok(checked > 40);
});

test('singersChoir: sections from the file, or divided low to high', () => {
  const s = singersChoir(parseSingers(readFileSync(sectioned, 'utf8')));
  assert.equal(s.assigned, false);
  assert.deepEqual(s.choir, { bass: { low: 46, high: 60 }, baritone: { low: 48, high: 64 }, tenor: { low: 51, high: 65 } });
  assert.deepEqual(s.unison, { low: 51, high: 60 });
  const f = singersChoir(parseSingers(readFileSync(flat, 'utf8')), ['tenor', 'bass']);
  assert.equal(f.assigned, true);
  assert.ok(f.choir.bass.low < f.choir.tenor.low && f.choir.bass.high < f.choir.tenor.high);
  assert.equal(f.groups.tenor.length + f.groups.bass.length, 12);
  assert.throws(() => singersChoir(parseSingers('section,low,high\nB,E2,G2\nB,A2,D3\n')), /basses share no note: row 3's low A2 is above row 2's high G2/);
  assert.throws(() => singersChoir(parseSingers('low,high\nE2,G3\n'), ['tenor', 'bass']), /1 singers cannot make 2 sections/);
});

test('fewestSectionsForSingers: what it names fits, and fewer does not', () => {
  const ev = parseGabc(readFileSync(dies, 'utf8')).events;
  const p = parseSingers(readFileSync(flat, 'utf8'));
  const v = fewestSectionsForSingers(ev, p);
  assert.equal(v.sections, 2);
  const all = overlap(p.singers);
  assert.equal(suggestFinal(ev, { low: all.low, high: all.high }).fits, false);
  assert.equal(splitVoices(ev, { tenor: v.choir.tenor, bass: v.choir.bass }).fits, true);
  // a sectioned file is tried only as the voicing its sections make
  const s = fewestSectionsForSingers(ev, parseSingers(readFileSync(sectioned, 'utf8')));
  assert.equal(s.sections, 3);
});

test('CLI: --singers alone prints the section report', () => {
  const r = run(['--singers', sectioned]);
  assert.equal(r.code, 0);
  assert.match(r.text, /^9 singers\ntenors Eb3-F4 \(3: Singer A, Singer B, Singer C\); low set by Singer C \(D3 without\)/);
  assert.match(r.text, /\nunison Eb3-C4/);
  const f = run(['--singers', flat, '--baritones']);
  assert.match(f.text, /divided by range/);
  assert.match(f.text, /\nbaritones /);
  const j = JSON.parse(run(['--singers', flat, '--json']).text);
  assert.equal(j.singers, 12);
  assert.equal(j.assigned, true);
  assert.ok(j.sections.tenor && j.sections.bass);
});

test('CLI: --singers sets the unison band and the split, and names the fewest sections', () => {
  const r = run([dies, '--singers', flat, '--suggest-final']);
  assert.equal(r.code, 1);
  assert.match(r.text, /wider than Eb3-Bb3; the singers in .*range-test\.csv can sing it as tenors and basses: add --split-voices$/);
  const s = JSON.parse(run([dies, '--singers', sectioned, '--split-voices', '--json']).text);
  assert.equal(s.voices.unison, 'Eb3-C4');
  assert.equal(s.voices.sectionNotes.baritone, 600, 'a sectioned file with baritones brings them in');
  assert.equal(s.singers.count, 9);
  assert.equal(s.singers.sections.baritone.range, 'C3-E4');
  // a section flag still overrides one section
  const o = JSON.parse(run([dies, '--singers', sectioned, '--split-voices', '--tenor', '48-69', '--json']).text);
  assert.equal(o.voices.unison, 'C3-C4');
});

test('CLI: --singers refusals', () => {
  assert.match(run([dies, '--singers', flat, '--choir', 'amateur']).text, /use one/);
  assert.match(run([dies, '--singers', join(tmp, 'nope.csv')]).text, /no file/);
  const noBass = file('t.csv', 'section,low,high\nT,C3,G4\n');
  assert.match(run([dies, '--singers', noBass, '--split-voices']).text, /needs basses/);
  const tb = file('tb.csv', 'section,low,high\nT,C3,G4\nB,E2,D4\n');
  assert.match(run([dies, '--singers', tb, '--split-voices', '--baritones']).text, /names no baritones/);
  const apart = file('apart.csv', 'low,high\nE2,A2\nE4,A4\n');
  const u = run([dies, '--singers', apart, '--suggest-final']);
  assert.equal(u.code, 1);
  assert.match(u.text, /cannot sing in unison; try --split-voices/);
});
