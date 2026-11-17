import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addOrganum, boundaryOf, organalNote, collection } from './organum.mjs';
import { parseGabc, transposeToFinal } from './gabc.mjs';
import { parseMidi, choirSections } from './render.mjs';
import { run } from './cli.mjs';

const here = new URL('.', import.meta.url).pathname;
const corpus = (f) => join(here, 'corpus', f);
const dir = mkdtempSync(join(tmpdir(), 'cf-org-'));

// a D-dorian collection with B flat: C D E F G A Bb
const dorian = new Set([0, 2, 4, 5, 7, 9, 10]);

test('the boundary is the nearest note a whole tone or more under the final', () => {
  assert.equal(boundaryOf(50, dorian), 48); // D3 final: C3
  assert.equal(boundaryOf(52, dorian), 50); // E: D
  assert.equal(boundaryOf(53, dorian), 50); // F: not E, a semitone under it, but D
});

test('a fourth below where the chant has the note, held at the boundary, no tritone', () => {
  const k = { boundary: 48, pcs: dorian };
  assert.equal(organalNote(57, k), 52); // A3 over E3
  assert.equal(organalNote(55, k), 50); // G3 over D3
  assert.equal(organalNote(53, k), 48); // F3 over C3, the boundary itself
  assert.equal(organalNote(52, k), 48); // E3: the fourth B2 is under the boundary, so C3 (a third)
  assert.equal(organalNote(50, k), 48); // D3, the final: C3, a second
  assert.equal(organalNote(48, k), 48); // C3: unison on the boundary
  assert.equal(organalNote(45, k), 45); // A2 under the boundary: unison with the chant
  // E over B: B natural is not in the set (only B flat), so no E-Bb tritone: the third below, C
  assert.equal(organalNote(64, k), 60);
  // with B natural only, B over F# is not available: the third below, G
  assert.equal(organalNote(59, { boundary: 48, pcs: new Set([0, 2, 4, 5, 7, 9, 11]) }), 55);
});

test('no organal note is a tritone or wider than a fourth, and every phrase ends in unison', () => {
  for (const f of ['dies-irae.gabc', 'pange-lingua-full.gabc', 'veni-creator-full.gabc', 'te-deum.gabc', 'salve-regina.gabc']) {
    const p = parseGabc(readFileSync(corpus(f), 'utf8'));
    const ev = transposeToFinal(p.events, 50);
    const { events, notes } = addOrganum(ev, { from: 1 });
    const pcs = collection(ev);
    const sung = events.filter((e) => e.type === 'note');
    assert.equal(notes, sung.length, f);
    for (const e of sung) {
      const iv = e.midi - e.organal;
      assert.ok(iv >= 0 && iv <= 5 && iv !== 1, `${f}: interval ${iv}`);
      assert.ok(pcs.has(((e.organal % 12) + 12) % 12), `${f}: organal ${e.organal} is not a note the chant sings`);
      assert.ok(e.organal >= Math.min(e.midi, 48), `${f}: under the boundary`);
    }
    let last = null;
    for (const e of events) {
      if (e.type === 'note') last = e;
      else if (e.type === 'bar' && last) { assert.equal(last.organal, last.midi, `${f}: phrase end ${last.syllable}`); last = null; }
    }
    // fourths are the most common interval in all of them (the texture is parallel organum)
    const fourths = sung.filter((e) => e.midi - e.organal === 5).length;
    assert.ok(fourths / sung.length > 0.25, `${f}: ${fourths} of ${sung.length} fourths`);
  }
});

test('pitch, rhythm and syllables of the chant are untouched', () => {
  const p = parseGabc(readFileSync(corpus('dies-irae.gabc'), 'utf8'));
  const { events } = addOrganum(p.events, { from: 1 });
  assert.deepEqual(events.map(({ organal, ...e }) => e), p.events);
});

test('--repeat with --organum: the first pass is plain, later passes carry the second voice', () => {
  const r = run([corpus('veni-creator.gabc'), '--repeat', '3', '--organum', '--final', '50', '--json']);
  assert.equal(r.code, 0, r.text);
  const notes = r.events.filter((e) => e.type === 'note');
  assert.ok(notes.filter((e) => e.pass === 1).every((e) => e.organal === undefined));
  assert.ok(notes.filter((e) => e.pass > 1).every((e) => typeof e.organal === 'number'));
  const s = JSON.parse(r.text);
  assert.equal(s.organum.passes, '2-3');
  assert.equal(s.organum.notes, (notes.length / 3) * 2);
});

test('without --organum there is no Organal voice track, and a repeat sings the pass twice', () => {
  const a = join(dir, 'a.mid'), b = join(dir, 'b.mid');
  assert.equal(run([corpus('dies-irae.gabc'), '--repeat', '2', '--final', '50', '-o', a]).code, 0);
  assert.equal(run([corpus('dies-irae.gabc'), '--final', '50', '-o', b]).code, 0);
  const ma = parseMidi(readFileSync(a)), mb = parseMidi(readFileSync(b));
  assert.ok(!ma.notes.some((n) => n.ch === 7));
  assert.equal(ma.notes.length, mb.notes.length * 2);
});

test('the MIDI gets an Organal voice choir track that the renderer and --learn see', () => {
  const out = join(dir, 'o.mid');
  const r = run([corpus('pange-lingua.gabc'), '--organum', '--final', '50', '-o', out]);
  assert.equal(r.code, 0, r.text);
  const bytes = readFileSync(out);
  const m = parseMidi(bytes);
  const org = m.notes.filter((n) => n.ch === 7), chant = m.notes.filter((n) => n.ch === 0);
  assert.equal(org.length, chant.length);
  assert.ok(org.every((n, i) => n.tick === chant[i].tick && n.note <= chant[i].note));
  assert.ok(org.some((n) => n.syl), 'lyrics on the organal track');
  const names = choirSections(bytes).map((s) => s.name);
  assert.ok(names.includes('Organal voice'), names.join(', '));
});

test('a key lift moves the organal voice with the lifted drop', () => {
  const r = run([corpus('pange-lingua-full.gabc'), '--organum', '--final', '50', '--fit', '8', '--genre', 'deep-house', '--sections', '--key-lift', '2', '--json']);
  assert.equal(r.code, 0, r.text);
  const lifted = r.events.filter((e) => e.type === 'note' && e.lifted);
  assert.ok(lifted.length);
  for (const e of lifted) assert.ok(e.organal >= Math.min(e.midi, 50), `lifted organal ${e.organal} under the lifted boundary`);
  // the lifted drop's notes rest on the lifted boundary (E3 = 52), not the old one (C3)
  assert.ok(lifted.some((e) => e.organal === 52));
  assert.ok(!lifted.some((e) => e.organal === 48));
});

test('refusals: under the range names a final that fits; --split-voices is refused', () => {
  const r = run([corpus('veni-creator.gabc'), '--organum', '--final', '40']);
  assert.equal(r.code, 1);
  const m = /use --final (\d+) or higher/.exec(r.text);
  assert.ok(m, r.text);
  assert.equal(run([corpus('veni-creator.gabc'), '--organum', '--final', m[1]]).code, 0);
  assert.equal(run([corpus('veni-creator.gabc'), '--organum', '--final', String(Number(m[1]) - 1)]).code, 1);
  assert.equal(run([corpus('veni-creator.gabc'), '--organum', '--split-voices']).code, 2);
});

test('--organum with --musicxml warns that the score holds the chant line only', () => {
  const r = run([corpus('veni-creator.gabc'), '--organum', '--final', '50', '--musicxml', join(dir, 's.musicxml'), '--json']);
  assert.equal(r.code, 0, r.text);
  assert.ok(JSON.parse(r.text).warnings.some((w) => w.includes('organal voice')));
});
