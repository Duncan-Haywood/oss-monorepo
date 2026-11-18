import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { composeKit, plan, render, run, DEFAULT_MAX } from './launch-kit.mjs';
import { toolUrl } from './bluesky.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Log business miles privately. Second sentence.">';

test('composeKit links the canonical page, discloses, and respects venue length limits', () => {
  const k = composeKit({ title: 'Mileage Log — Free Tracker', description: 'Log business miles privately. Second sentence.' }, toolUrl('mileage-log'), 'mileage-log');
  assert.ok(k.showHn.title.startsWith('Show HN: Mileage Log'));
  assert.ok(k.showHn.title.length <= 80);
  assert.ok(k.productHunt.tagline.length <= 60);
  assert.ok(k.productHunt.description.length <= 260);
  assert.match(k.showHn.text, /MIT/);
  assert.match(k.showHn.text, /not professional advice/);
  assert.ok(k.awesomeListLine.includes(toolUrl('mileage-log')));
  assert.ok(!/upvote/i.test(k.reddit.body + k.showHn.text));
});

test('plan caps the run, skips pages without metadata, and honours --slug', async () => {
  const launched = { a: '2026-10-15', b: '2026-10-15', c: '2026-10-15', d: '2026-10-15', gone: '2026-10-15' };
  const readPage = async (s) => (s === 'gone' ? null : page);
  const kits = await plan({ launched, today: '2026-10-16', readPage });
  assert.equal(kits.length, DEFAULT_MAX);
  const one = await plan({ launched, today: '2026-10-16', readPage, slug: 'd' });
  assert.deepEqual(one.map((k) => k.url), [toolUrl('d')]);
});

test('render tells the owner nothing was sent and to read venue rules', async () => {
  const kits = await plan({ launched: { a: '2026-10-15' }, today: '2026-10-16', readPage: async () => page });
  const md = render(kits);
  assert.match(md, /Nothing here was sent/);
  assert.match(md, /rules on the day/);
});

test('every venue limit holds exactly, across word lengths, and clipped text keeps its start', () => {
  for (let w = 1; w <= 12; w++) {
    for (let pad = 0; pad < w + 1; pad++) {
      const words = Array.from({ length: 200 }, (_, i) => String.fromCharCode(97 + (i % 26)).repeat(w)).join(' ');
      const description = `${'z'.repeat(pad)} ${words}.`.trim();
      const k = composeKit({ title: 'T', description }, 'https://example.org/t/', 't');
      assert.ok(k.showHn.title.length <= 80, `Show HN title ${k.showHn.title.length} > 80`);
      assert.ok(k.productHunt.tagline.length <= 60, `tagline ${k.productHunt.tagline.length} > 60`);
      assert.ok(k.productHunt.description.length <= 260 && k.productHunt.description.length >= 250, `PH description ${k.productHunt.description.length}`);
      assert.ok(k.alternativeTo.description.length <= 300 && k.alternativeTo.description.length >= 290, `AlternativeTo ${k.alternativeTo.description.length}`);
      assert.ok(k.productHunt.description.startsWith(description.slice(0, 40)));
      assert.ok(k.alternativeTo.description.startsWith(description.slice(0, 40)));
      assert.ok(k.productHunt.description.endsWith('…'));
    }
  }
});

test('a first word longer than the limit is cut hard, never past the limit (Product Hunt rejects a 61-character tagline)', () => {
  const long = 'Supercalifragilisticexpialidocious-and-a-very-long-hyphenated-compound-word-indeed';
  const k = composeKit({ title: 'X', description: `${long} for all.` }, 'u', 'x');
  assert.ok(k.productHunt.tagline.length <= 60, `tagline is ${k.productHunt.tagline.length} characters`);
  assert.ok(k.productHunt.tagline.startsWith('Supercalifragilistic'));
});

test('run honours --days and --max', async () => {
  const lines = [];
  const now = new Date('2100-01-01T00:00:00Z');
  const n = await run({ argv: ['--days', '100000', '--max', '2'], now, log: (s) => lines.push(s) });
  assert.equal(n, 2, 'a 100000-day window from 2100 reaches every launch, capped at --max 2');
  assert.equal(await run({ argv: [], now, log: () => {} }), 0, 'the default 7-day window from 2100 reaches none');
});

test('the CLI entry point runs and reads its own flags', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./launch-kit.mjs', import.meta.url)), '--slug', 'shift-roster-builder'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^# Launch kit/m);
  assert.match(r.stdout, /shift-roster-builder\//);
});
