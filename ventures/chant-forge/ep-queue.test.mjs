// The studio page's EP queue (ep-queue.mjs) against ep-cli.mjs: two queued tracks with their own
// settings build the same release.json, audio, MIDI, lyrics, sources and check as a two-track plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { buildEp } from './ep.mjs';
import { renderMidi } from './render.mjs';
import { parseGabc } from './gabc.mjs';
import { run as convert } from './cli.mjs';
import { wavBytes } from './files.mjs';
import { addTrack, removeTrack, moveTrack, sourceNames, releaseType, buildQueue, queueToJson, queueFromJson, QUEUE_MAX } from './ep-queue.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-11-16';
const deflate = async (b) => deflateSync(b, { level: 9 });

// what the page holds after Convert, built with the command line's converter
function converted(d, gabcFile, args, extra = {}) {
  const mid = join(d, `${Math.random().toString(36).slice(2)}.mid`), lrcFile = mid.replace(/\.mid$/, '.lrc');
  const r = convert([gabcFile, ...args, '-o', mid, '--lrc', lrcFile, '--json']);
  assert.equal(r.code, 0, r.text);
  const gabcText = readFileSync(gabcFile, 'utf8');
  return { header: parseGabc(gabcText).header, gabcText, gabcName: gabcFile.split('/').pop(), midi: new Uint8Array(readFileSync(mid)),
    lrc: readFileSync(lrcFile, 'utf8'), warnings: JSON.parse(r.text).warnings || [], coverMidis: r.events.filter((e) => e.type === 'note').map((e) => e.midi),
    sing: false, settings: args.join(' '), ...extra };
}

test('queue: add, move, remove, the release type, and a localStorage round trip', () => {
  const t = (n) => ({ header: { name: n }, midi: new Uint8Array([77, 84, 104, 100, 0, 255]), lrc: '[00:00.00]x', gabcText: n });
  let q = [];
  assert.throws(() => addTrack(q, { header: {} }), /convert/);
  q = addTrack(q, t('A')); q = addTrack(q, t('B')); q = addTrack(q, t('C'));
  assert.deepEqual(q.map((x) => x.id), ['t1', 't2', 't3']);
  q = moveTrack(q, 't3', -1);
  assert.deepEqual(q.map((x) => x.header.name), ['A', 'C', 'B']);
  assert.equal(moveTrack(q, 't1', -1), q, 'the first track cannot move up');
  q = removeTrack(q, 't1');
  q = addTrack(q, t('D'));
  assert.deepEqual(q.map((x) => x.id), ['t3', 't2', 't4'], 'ids stay unique after a removal');
  const back = queueFromJson(queueToJson(q));
  assert.deepEqual(back.map((x) => [x.id, x.header.name, [...x.midi]]), q.map((x) => [x.id, x.header.name, [...x.midi]]));
  assert.ok(back[0].midi instanceof Uint8Array);
  assert.deepEqual(queueFromJson('not json'), []);
  assert.deepEqual(queueFromJson('{"v":2,"tracks":[]}'), []);
  assert.deepEqual([1, 3, 4, 6, 7].map(releaseType), ['single', 'single', 'ep', 'ep', 'album']);
  let full = [];
  for (let i = 0; i < QUEUE_MAX; i++) full = addTrack(full, t(`x${i}`));
  assert.throws(() => addTrack(full, t('one more')), /at most/);
});

test('queue: one chant twice shares a source file; two texts with one name do not', () => {
  const q = [{ header: { name: 'Veni' }, gabcText: 'v1', gabcName: 'veni.gabc' }, { header: { name: 'Veni' }, gabcText: 'v1', gabcName: 'veni.gabc' },
    { header: { name: 'Veni' }, gabcText: 'v2', gabcName: 'veni.gabc' }, { header: { name: 'Pasted (first line)' }, gabcText: 'p' }];
  assert.deepEqual(sourceNames(q), ['veni.gabc', 'veni.gabc', 'veni-2.gabc', 'pasted.gabc']);
});

test('a two-track queue builds the same folder as a two-track ep-cli.mjs plan', { timeout: 300000 }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-queue-'));
  const veni = join(here, 'corpus', 'veni-creator.gabc'), dies = join(here, 'corpus', 'dies-irae.gabc');
  const A = ['--genre', 'deep-house', '--fit', '8', '--auto-final', '--outro', '2'];
  const B = ['--genre', 'metal', '--bpm', '170', '--halftime', '--fit', '8', '--auto-final'];
  const plan = { title: 'Two', releaseDate: '2027-01-15', artist: 'Name', tracks: [{ gabc: veni, args: A, isrc: 'QZ-ABC-27-00001' }, { gabc: dies, args: B, isrc: 'QZ-ABC-27-00002' }] };
  const cli = buildEp(plan, here, join(d, 'out'), { sing: false, today: TODAY });
  let q = [];
  q = addTrack(q, converted(d, dies, B, { isrc: 'QZ-ABC-27-00002' }));
  q = addTrack(q, converted(d, veni, A, { isrc: 'QZ-ABC-27-00001' }));
  q = moveTrack(q, q[1].id, -1); // the page's Up button: Veni first, as in the plan
  const seen = [];
  const k = await buildQueue({ title: 'Two', releaseDate: '2027-01-15', artist: 'Name' }, queueFromJson(queueToJson(q)),
    { render: renderMidi, wavBytes, deflate, today: TODAY, onTrack: (i, n, title) => seen.push(`${i + 1}/${n} ${title}`) });
  assert.deepEqual(seen, ['1/2 Veni Creator Spiritus', '2/2 Dies irae']);
  const files = new Map(k.files.map((f) => [f.name, f.bytes]));
  const out = (f) => readFileSync(join(d, 'out', f));
  const want = ['release.json', 'cover.png', 'tracks/01-veni-creator-spiritus.wav', 'tracks/01-veni-creator-spiritus.mid', 'tracks/01-veni-creator-spiritus.lrc',
    'tracks/02-dies-irae.wav', 'tracks/02-dies-irae.mid', 'tracks/02-dies-irae.lrc', 'sources/veni-creator.gabc', 'sources/dies-irae.gabc'];
  assert.deepEqual([...files.keys()].sort(), [...want, 'REPORT.md'].sort());
  for (const f of want) assert.ok(Buffer.from(files.get(f)).equals(out(f)), f);
  assert.equal(k.release.type, 'single');
  assert.equal(k.check.pass, true, k.check.checks.filter((c) => c.level === 'FAIL').map((c) => c.name).join());
  assert.deepEqual(k.check.checks.map((c) => [c.name, c.level]), cli.check.checks.map((c) => [c.name, c.level]));
  assert.equal(new TextDecoder().decode(files.get('REPORT.md')).replace('the chant-forge studio page', "chant-forge's `ep-cli.mjs`"), cli.report);
  rmSync(d, { recursive: true });
});

test('index.html wires the EP queue to ep-queue.mjs', () => {
  const html = readFileSync(join(here, 'index.html'), 'utf8');
  for (const id of ['epadd', 'dlep', 'epclear', 'eplist']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /from "\.\/ep-queue\.mjs"/);
  assert.match(html, /"dlrel", "epadd"\]/);
});

await assert.rejects(buildQueue({ title: 'x' }, [], {}), /empty/);
