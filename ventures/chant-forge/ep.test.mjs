// EP builder (ep.mjs, ep-cli.mjs): plan in, release folder out, release check run on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { slugify, sourceOf, coverArt, diatonic, validatePlan, buildEp, OWNER_CHECK } from './ep.mjs';
import { run } from './ep-cli.mjs';
import { imageSize, checkRelease } from './release.mjs';
import { readWav, analyze } from './master.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const veni = join(here, 'corpus', 'veni-creator.gabc'); // first verse, cited 1908 source
const incipit = join(here, 'examples', 'dies-irae-incipit.gabc'); // demo, no source

// Decode our own PNG (8-bit RGB, filters 0 and 1 only) to read pixels back.
function pixels(png) {
  const s = imageSize(png);
  let i = 8, idat = [];
  while (i < png.length) { const len = png.readUInt32BE(i), type = png.toString('ascii', i + 4, i + 8); if (type === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len)); i += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), row = s.w * 3 + 1, out = new Uint8Array(s.w * s.h * 3);
  for (let y = 0; y < s.h; y++) {
    const f = raw[y * row];
    for (let x = 0; x < s.w * 3; x++) { const v = raw[y * row + 1 + x]; out[y * s.w * 3 + x] = f === 1 ? (v + (x >= 3 ? out[y * s.w * 3 + x - 3] : 0)) & 0xff : v; }
  }
  return { ...s, at: (x, y) => [...out.subarray((y * s.w + x) * 3, (y * s.w + x) * 3 + 3)] };
}

test('slugify and the source note a GABC header gives', () => {
  assert.equal(slugify('Veni Creator Spiritus (all seven verses)'), 'veni-creator-spiritus');
  assert.equal(slugify('Té Déum'), 'te-deum');
  const s = sourceOf({ book: 'Graduale Romanum, Vatican edition, 1908, p. 123* (In festo)', transcriber: 'A. H.' });
  assert.equal(s.year, 1908);
  assert.equal(s.edition, 'Graduale Romanum, Vatican edition, 1908');
  assert.match(s.rights, /public domain/);
  const late = sourceOf({ book: 'The Liber Usualis, 1961, p. 276 & Liber antiphonarius, 1960, p. 68' });
  assert.equal(late.year, 1960);
  assert.match(late.rights, /pre-1929/);
});

test('cover art: a square PNG, staff lines red, heads gold, at the pitch the note has', () => {
  const p = pixels(coverArt([50, 52, 54], { size: 400 }));
  assert.equal(p.type, 'png'); assert.equal(p.w, 400); assert.equal(p.h, 400);
  // corners are near black, the staff's top line is red
  assert.ok(p.at(2, 2).every((v) => v < 30));
  const space = 400 * 0.055, cy = 400 * 0.47, top = Math.round(cy - 1.5 * space);
  assert.deepEqual(p.at(200, top), [178, 34, 34]);
  // D3 E3 F#3: E3 (the middle step) in the middle space, D3 on the line under it, F#3 on the line over it
  const left = 400 * 0.12, head = space * 0.82, gap = (400 * 0.76 - 400 * 0.08 - head) / 2;
  const x = (i) => Math.round(left + 400 * 0.04 + i * gap + head / 2);
  assert.deepEqual(p.at(x(0), Math.round(cy + space / 2)), [226, 196, 120]);
  assert.deepEqual(p.at(x(1), Math.round(cy)), [226, 196, 120]);
  assert.deepEqual(p.at(x(2), Math.round(cy - space / 2)), [226, 196, 120]);
  assert.notDeepEqual(p.at(x(0), Math.round(cy - space / 2)), [226, 196, 120]);
  assert.equal(diatonic(62) - diatonic(60), 1);
  assert.equal(diatonic(61), diatonic(60));
});

test('a bad plan is refused before anything is built', () => {
  assert.deepEqual(validatePlan({ title: 'x', tracks: [{ gabc: 'a.gabc' }] }), []);
  assert.ok(validatePlan({ tracks: [] }).length >= 2);
  assert.match(validatePlan({ title: 'x', tracks: [{ gabc: 'a', args: ['-o', 'y'] }] }).join(), /leave -o/);
  const d = mkdtempSync(join(tmpdir(), 'ep-'));
  writeFileSync(join(d, 'plan.json'), '{ not json');
  assert.equal(run([join(d, 'plan.json'), '-o', join(d, 'out')]).code, 2);
  assert.equal(run([join(d, 'plan.json')]).code, 2);
  rmSync(d, { recursive: true });
});

test('a one-track single: audio at -14 LUFS, cover, sources and release.json pass; only owner steps fail', () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-'));
  const plan = { title: 'Test single', type: 'single', releaseDate: '2027-01-15',
    tracks: [{ gabc: veni, args: ['--genre', 'deep-house', '--fit', '8', '--auto-final', '--outro', '2'] }] };
  const r = buildEp(plan, here, join(d, 'out'), { coverSize: 1400, sing: false, today: '2026-11-16' });
  assert.equal(r.ready, true, r.buildFaults.map((c) => c.name).join());
  assert.deepEqual(r.ownerSteps.map((c) => c.name), ['artist', 'p-line', 'c-line', 'track 1 ISRC']);
  for (const f of ['release.json', 'cover.png', 'REPORT.md', 'tracks/01-veni-creator-spiritus.mid', 'tracks/01-veni-creator-spiritus.wav', 'tracks/01-veni-creator-spiritus.lrc', 'sources/veni-creator.gabc']) assert.ok(existsSync(join(d, 'out', f)), f);
  const a = analyze(readWav(readFileSync(join(d, 'out', 'tracks/01-veni-creator-spiritus.wav'))));
  assert.ok(Math.abs(a.lufs + 14) <= 0.1, `${a.lufs}`);
  assert.ok(a.truePeakDb <= -1, `${a.truePeakDb}`);
  const rel = JSON.parse(readFileSync(join(d, 'out', 'release.json'), 'utf8'));
  assert.equal(rel.tracks[0].language, 'la');
  assert.equal(rel.tracks[0].source.gabcFile, 'sources/veni-creator.gabc');
  assert.equal(rel.aiDisclosure.level, 'assisted');
  assert.match(readFileSync(join(d, 'out', 'REPORT.md'), 'utf8'), /Owner steps[\s\S]*track 1 ISRC/);
  // once the owner fills the name and ISRC in, the same folder passes the release check
  rel.artist = 'Name'; rel.pLine = '℗ 2027 Name'; rel.cLine = '© 2027 Name'; rel.tracks[0].isrc = 'QZ-ABC-27-00001';
  const c = checkRelease(rel, join(d, 'out'), { today: '2026-11-16' });
  assert.equal(c.pass, true, c.checks.filter((x) => x.level === 'FAIL').map((x) => x.name).join());
  rmSync(d, { recursive: true });
});

test('an artist in the plan fills the p- and c-lines; a small cover is a build fault, not an owner step', () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-'));
  writeFileSync(join(d, 'plan.json'), JSON.stringify({ title: 'T', artist: 'Name', releaseDate: '2027-02-01',
    tracks: [{ gabc: veni, isrc: 'QZABC2700002', args: ['--auto-final'] }] }));
  const o = run([join(d, 'plan.json'), '-o', join(d, 'out'), '--no-sing', '--cover-size', '600', '--today', '2026-11-16']);
  assert.equal(o.code, 1);
  assert.match(o.text, /FAIL  cover at least 3000 px/);
  assert.doesNotMatch(o.text, /OWNER/);
  const rel = JSON.parse(readFileSync(join(d, 'out', 'release.json'), 'utf8'));
  assert.equal(rel.pLine, '℗ 2027 Name');
  assert.ok(!OWNER_CHECK.test('cover at least 3000 px'));
  rmSync(d, { recursive: true });
});

test('a GABC file that names no source edition is a build fault: nothing uncited reaches a release', () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-'));
  const r = buildEp({ title: 'T', artist: 'Name', releaseDate: '2027-02-01', tracks: [{ gabc: incipit, isrc: 'QZABC2700003', args: ['--auto-final'] }] },
    here, join(d, 'out'), { coverSize: 3000, sing: false, today: '2026-11-16' });
  assert.equal(r.ready, false);
  assert.ok(r.buildFaults.some((c) => c.name === 'track 1 source edition named'));
  rmSync(d, { recursive: true });
});
