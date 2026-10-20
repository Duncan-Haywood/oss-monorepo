import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { main, parseArgs, HELP } from './cli.mjs';
import { checkEpub } from './book.mjs';
import { mp3, jpeg } from './fixtures.mjs';

/** Runs the CLI in `cwd`, returning exit code and captured output. */
async function run(cwd, ...argv) {
  const lines = [];
  const code = await main(argv, { cwd, out: (s) => lines.push(s) });
  const text = lines.join('\n');
  let json = null;
  try { json = JSON.parse(text); } catch { /* text mode */ }
  return { code, text, json };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'publish-kit-'));

test('help, unknown command and missing project are usage errors with a pointer', async () => {
  const d = tmp();
  assert.equal((await run(d, '--help')).code, 0);
  assert.match(HELP, /No warranty/);
  assert.equal((await run(d)).code, 2);
  const unknown = await run(d, 'frobnicate');
  assert.equal(unknown.code, 2);
  const missing = await run(d, 'plan', '--json');
  assert.equal(missing.code, 2);
  assert.match(missing.json.error, /publish-kit init/);
  rmSync(d, { recursive: true });
});

test('parseArgs: flags with values, booleans, and --k=v', () => {
  assert.deepEqual(parseArgs(['podcast', 'add', 'a.mp3', '--title', 'T', '--json', '--date=2026-01-01']), {
    pos: ['podcast', 'add', 'a.mp3'], opts: { title: 'T', json: true, date: '2026-01-01' },
  });
});

test('podcast: init -> plan -> add -> build, ending with a validated feed', async () => {
  const d = tmp();
  assert.equal((await run(d, 'init', 'podcast', '--title', 'My Show')).code, 0);
  assert.equal((await run(d, 'init', 'podcast')).code, 2, 'refuses to overwrite');
  const before = await run(d, 'plan', '--json');
  assert.equal(before.code, 1);
  assert.equal(before.json.ready, false);
  assert.ok(before.json.next[0].startsWith('publish-kit podcast add'));

  const p = JSON.parse(readFileSync(join(d, 'publish.json'), 'utf8'));
  Object.assign(p.show, { description: 'About things.', author: 'Ada', owner: { name: 'Ada', email: 'a@example.com' } });
  writeFileSync(join(d, 'publish.json'), JSON.stringify(p));
  writeFileSync(join(d, 'ep1.mp3'), mp3(Array(200).fill(11)));
  const added = await run(d, 'podcast', 'add', 'ep1.mp3', '--title', 'Pilot', '--date', '2026-10-01T09:00:00Z', '--json');
  assert.equal(added.code, 0);
  assert.equal(added.json.bytes, 200 * 626);
  assert.equal(added.json.episode, 1);
  assert.match(added.json.guid, /^[0-9a-f-]{36}$/);
  assert.equal((await run(d, 'podcast', 'add', 'ep1.mp3')).code, 2, '--title required');

  assert.equal((await run(d, 'plan', '--json')).json.ready, true);
  const built = await run(d, 'podcast', 'build', '--json');
  assert.equal(built.code, 0, JSON.stringify(built.json?.findings));
  assert.deepEqual(built.json.findings, []);
  const feed = readFileSync(join(d, 'dist', 'feed.xml'), 'utf8');
  assert.match(feed, /<enclosure url="https:\/\/example.com\/podcast\/audio\/ep1.mp3" length="125200" type="audio\/mpeg"\/>/);
  assert.ok(existsSync(join(d, 'dist', 'audio', 'ep1.mp3')));
  assert.ok(existsSync(join(d, 'dist', 'index.html')));
  rmSync(d, { recursive: true });
});

test('ebook: init -> build writes an EPUB that passes the container checks', async () => {
  const d = tmp();
  await run(d, 'init', 'ebook', '--title', 'Small Book');
  const p = JSON.parse(readFileSync(join(d, 'publish.json'), 'utf8'));
  Object.assign(p.book, { author: 'Ada', description: 'Tiny.' });
  p.chapters = ['chapters/01.md', 'chapters/02.md'];
  writeFileSync(join(d, 'publish.json'), JSON.stringify(p));
  writeFileSync(join(d, 'chapters', '02.md'), '# Two\n\n![pic](pic.jpg)\n');
  writeFileSync(join(d, 'chapters', 'pic.jpg'), jpeg(10, 10));
  writeFileSync(join(d, 'cover.jpg'), jpeg(1600, 2560));
  const r = await run(d, 'ebook', 'build', '--json');
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.deepEqual(r.json.chapters.map((c) => c.title), ['Chapter One', 'Two']);
  const epub = new Uint8Array(readFileSync(r.json.epub));
  assert.deepEqual(checkEpub(epub, { inflateRaw: (x) => new Uint8Array(inflateRawSync(x)) }), []);
  assert.match(JSON.parse(readFileSync(join(d, 'publish.json'), 'utf8')).book.identifier, /^urn:uuid:/, 'identifier saved for rebuilds');
  const check = await run(d, 'ebook', 'check', r.json.epub, '--json');
  assert.equal(check.code, 0);

  const interior = await run(d, 'print', 'interior', '--json');
  assert.equal(interior.code, 0);
  assert.match(readFileSync(interior.json.html, 'utf8'), /@page \{ size: 6in 9in;/);
  const cover = await run(d, 'print', 'cover', '--pages', '200', '--json');
  assert.equal(cover.json.paper, 'cream', 'paper comes from publish.json');
  assert.equal(cover.json.spineIn, 0.5);
  rmSync(d, { recursive: true });
});

test('audiobook: check, m4b script and private feed from tracks', async () => {
  const d = tmp();
  await run(d, 'init', 'audiobook', '--title', 'Heard');
  mkdirSync(join(d, 'audio'));
  writeFileSync(join(d, 'audio', '00-opening-credits.mp3'), mp3(Array(40).fill(11)));
  writeFileSync(join(d, 'audio', '01 - Arrival.mp3'), mp3(Array(80).fill(11)));
  writeFileSync(join(d, 'audio', '02 - Leaving.mp3'), mp3([11, 9, 11]));
  const p = JSON.parse(readFileSync(join(d, 'publish.json'), 'utf8'));
  Object.assign(p.book, { author: 'Ada', description: 'Listen.' });
  p.feed.email = 'a@example.com';
  p.tracks = [{ file: 'audio/00-opening-credits.mp3', title: 'Opening Credits' }, { file: 'audio/01 - Arrival.mp3' }, { file: 'audio/02 - Leaving.mp3' }];
  writeFileSync(join(d, 'publish.json'), JSON.stringify(p));

  const check = await run(d, 'audiobook', 'check', '--json');
  assert.equal(check.code, 1, 'the VBR track blocks');
  assert.ok(check.json.findings.some((f) => f.field === 'audio/02 - Leaving.mp3' && /Variable bitrate/.test(f.message)));

  const m4b = await run(d, 'audiobook', 'm4b', '--json');
  assert.equal(m4b.code, 0);
  assert.match(readFileSync(m4b.json.metadata, 'utf8'), /title=Arrival/);
  assert.match(m4b.json.command, /^ffmpeg .* -map_chapters 1 /);

  const feed = await run(d, 'audiobook', 'feed', '--json');
  assert.equal(feed.code, 0, JSON.stringify(feed.json.findings));
  const xml = readFileSync(join(d, 'dist', 'feed.xml'), 'utf8');
  assert.match(xml, /<itunes:type>serial<\/itunes:type>/);
  assert.match(xml, /<itunes:complete>Yes<\/itunes:complete>/);
  assert.equal((xml.match(/<item>/g) || []).length, 3);
  const again = await run(d, 'audiobook', 'feed', '--json');
  assert.equal(readFileSync(join(d, 'dist', 'feed.xml'), 'utf8').match(/<guid[^>]*>([^<]+)/)[1], xml.match(/<guid[^>]*>([^<]+)/)[1], 'guids are stable across rebuilds');
  assert.equal(again.code, 0);
  rmSync(d, { recursive: true });
});

test('probe and cover commands', async () => {
  const d = tmp();
  writeFileSync(join(d, 'a.mp3'), mp3(Array(10).fill(11)));
  writeFileSync(join(d, 'small.jpg'), jpeg(500, 500));
  const pr = await run(d, 'probe', 'a.mp3', '--json');
  assert.equal(pr.json[0].bitrateKbps, 192);
  const cv = await run(d, 'cover', 'small.jpg', '--for', 'podcast', '--json');
  assert.equal(cv.code, 1);
  assert.equal((await run(d, 'cover', 'small.jpg')).code, 2, '--for required');
  rmSync(d, { recursive: true });
});
