// The studio page's "Build the release folder" (ep-core.mjs releaseKit) against ep-cli.mjs's folder:
// the same release.json, the same check, the same report but for the builder's name, the same cover
// pixels, the same audio bytes; and it runs with no Buffer, as in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { buildEp } from './ep.mjs';
import { renderMidi } from './render.mjs';
import { parseGabc } from './gabc.mjs';
import { readWav } from './master.mjs';
import { run as convert } from './cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const veni = join(here, 'corpus', 'veni-creator.gabc');
const ARGS = ['--genre', 'deep-house', '--fit', '8', '--auto-final', '--outro', '2'];
const TODAY = '2026-11-16';

function pngPixels(png) {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const w = v.getUint32(16), h = v.getUint32(20);
  let i = 8; const idat = [];
  while (i < png.length) {
    const len = v.getUint32(i), type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    if (type === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  return { w, h, raw: inflateSync(Buffer.concat(idat.map((b) => Buffer.from(b)))) };
}
function unzipStored(zip) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength), out = new Map();
  let i = 0;
  while (v.getUint32(i, true) === 0x04034b50) {
    const size = v.getUint32(i + 18, true), nl = v.getUint16(i + 26, true), xl = v.getUint16(i + 28, true);
    const name = new TextDecoder().decode(zip.subarray(i + 30, i + 30 + nl));
    out.set(name, zip.subarray(i + 30 + nl + xl, i + 30 + nl + xl + size));
    i += 30 + nl + xl + size;
  }
  return out;
}

test('the page builds the same release folder as ep-cli.mjs, without Buffer', { timeout: 300000 }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-page-'));
  const plan = { title: 'Veni', type: 'single', releaseDate: '2027-01-15', tracks: [{ gabc: veni, args: ARGS }] };
  const cli = buildEp(plan, here, join(d, 'out'), { coverSize: 3000, sing: false, today: TODAY });
  const out = (f) => readFileSync(join(d, 'out', f));
  // what the page holds after Convert: the MIDI, the timed lyrics, the GABC text, the melody
  const conv = convert([veni, ...ARGS, '-o', join(d, 'p.mid'), '--lrc', join(d, 'p.lrc'), '--json']);
  const midi = new Uint8Array(readFileSync(join(d, 'p.mid')));
  const lrc = readFileSync(join(d, 'p.lrc'), 'utf8');
  const gabcText = readFileSync(veni, 'utf8');
  const header = parseGabc(gabcText).header;
  const coverMidis = conv.events.filter((e) => e.type === 'note').map((e) => e.midi);
  const saved = globalThis.Buffer;
  delete globalThis.Buffer;
  let k, zip;
  try {
    const { releaseKit, EP_TARGET_LUFS, deflateStream } = await import('./ep-core.mjs');
    // Node's CompressionStream and Response are built on Buffer (a browser's are not): give it back for that call only
    const deflate = async (bytes) => { globalThis.Buffer = saved; try { return await deflateStream(bytes); } finally { delete globalThis.Buffer; } };
    const { wavBytes, zipStored } = await import('./files.mjs');
    const master = renderMidi(midi, { rate: 44100, targetLufs: EP_TARGET_LUFS, limit: true, sing: false });
    k = await releaseKit({ title: 'Veni', type: 'single', releaseDate: '2027-01-15' },
      [{ title: header.name, header, gabcText, gabcName: 'veni-creator.gabc', midi, wav: master, lrc, warnings: JSON.parse(conv.text).warnings }],
      { today: TODAY, coverMidis, wavBytes, deflate });
    zip = zipStored(k.files);
  } finally { globalThis.Buffer = saved; }
  const files = unzipStored(zip);
  assert.deepEqual([...files.keys()].sort(), ['REPORT.md', 'cover.png', 'release.json', 'sources/veni-creator.gabc',
    'tracks/01-veni-creator-spiritus.lrc', 'tracks/01-veni-creator-spiritus.mid', 'tracks/01-veni-creator-spiritus.wav']);
  // byte for byte: release.json, the audio, the MIDI, the lyrics, the source
  for (const f of ['release.json', 'tracks/01-veni-creator-spiritus.wav', 'tracks/01-veni-creator-spiritus.mid', 'tracks/01-veni-creator-spiritus.lrc', 'sources/veni-creator.gabc'])
    assert.ok(Buffer.from(files.get(f)).equals(out(f)), f);
  // the same check, line for line, and the same split into build faults and owner steps
  assert.deepEqual(k.check.checks.map((c) => [c.name, c.level]), cli.check.checks.map((c) => [c.name, c.level]));
  assert.equal(k.ready, true);
  assert.deepEqual(k.ownerSteps.map((c) => c.name), ['artist', 'p-line', 'c-line', 'track 1 ISRC']);
  // the report differs only in who built it
  assert.equal(new TextDecoder().decode(files.get('REPORT.md')).replace('the chant-forge studio page', "chant-forge's `ep-cli.mjs`"), cli.report);
  // the cover: another deflate, the same pixels
  const a = pngPixels(files.get('cover.png')), b = pngPixels(out('cover.png'));
  assert.equal(a.w, 3000); assert.equal(a.h, 3000);
  assert.ok(a.raw.equals(b.raw), 'cover pixels');
  // the -14 LUFS render reads back inside the release check's window from the ZIP's WAV
  assert.ok(Math.abs(k.tracks[0].analysis.lufs + 14) <= 0.1, `${k.tracks[0].analysis.lufs}`);
  assert.equal(readWav(Buffer.from(files.get('tracks/01-veni-creator-spiritus.wav'))).rate, 44100);
  rmSync(d, { recursive: true });
});

test('on the page, an artist and ISRC leave nothing to do; a pasted chant with no source is a build fault', { timeout: 120000 }, async () => {
  const { releaseKit } = await import('./ep-core.mjs');
  const { wavBytes } = await import('./files.mjs');
  const d = mkdtempSync(join(tmpdir(), 'ep-page-'));
  const go = (gabcFile, extra) => {
    const r = convert([gabcFile, '--auto-final', '-o', join(d, 'x.mid'), '--lrc', join(d, 'x.lrc'), '--json']);
    const midi = new Uint8Array(readFileSync(join(d, 'x.mid')));
    const gabcText = readFileSync(gabcFile, 'utf8');
    return releaseKit({ title: 'T', type: 'single', releaseDate: '2027-02-01', ...extra.plan },
      [{ header: parseGabc(gabcText).header, gabcText, midi, wav: renderMidi(midi, { targetLufs: -14, limit: true }), lrc: readFileSync(join(d, 'x.lrc'), 'utf8'), isrc: extra.isrc }],
      { today: TODAY, coverSize: 3000, coverMidis: r.events.filter((e) => e.type === 'note').map((e) => e.midi), wavBytes });
  };
  const full = await go(veni, { plan: { artist: 'Name' }, isrc: 'QZ-ABC-27-00001' });
  assert.equal(full.check.pass, true, full.check.checks.filter((c) => c.level === 'FAIL').map((c) => c.name).join());
  assert.equal(full.release.pLine, '℗ 2027 Name');
  assert.match(full.report, /No owner steps left/);
  const uncited = await go(join(here, 'examples', 'dies-irae-incipit.gabc'), { plan: { artist: 'Name' }, isrc: 'QZABC2700002' });
  assert.equal(uncited.ready, false);
  assert.ok(uncited.buildFaults.some((c) => c.name === 'track 1 source edition named'));
  assert.ok(uncited.files.some((f) => f.name === 'sources/dies-irae.gabc'), 'a source named after the chant when the page has no file name');
  await assert.rejects(releaseKit({ title: '' }, [], { wavBytes }), /title/);
  rmSync(d, { recursive: true });
});

test('index.html offers the release folder from ep-core.mjs', () => {
  const html = readFileSync(join(here, 'index.html'), 'utf8');
  assert.match(html, /id="dlrel"/);
  assert.match(html, /import \{ releaseKit, EP_TARGET_LUFS, slugify \} from "\.\/ep-core\.mjs"/);
  assert.match(html, /"dllearn", "dlrel"\]/);
});
