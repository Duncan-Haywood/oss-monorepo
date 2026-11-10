import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { main } from './cli.mjs';

const run = async (argv, input = '') => {
  let s = '';
  const code = await main(argv, { stdin: Readable.from([input]), out: (t) => { s += t; } });
  return { code, s };
};

test('--example prints the Nile change in plain words', async () => {
  const { code, s } = await run(['--example']);
  assert.equal(code, 0);
  assert.match(s, /From 1899 \(after 1898\) the mean moves down/);
  assert.match(s, /1871 – 1898/);
});

test('reads stdin and prints JSON', async () => {
  // A step from 1 to 5 plus LCG noise in [-0.5, 0.5).
  let seed = 42;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  const csv = 'v\n' + Array.from({ length: 60 }, (_, i) => (i < 30 ? 1 : 5) + noise()).join('\n');
  const { s } = await run(['--json'], csv);
  const r = JSON.parse(s);
  assert.deepEqual(r.pelt.changepoints.map((c) => c.index), [30]);
});

test('--help cites both papers; bad flags fail', async () => {
  const { s } = await run(['--help']);
  assert.match(s, /Adams and David J\. C\. MacKay/);
  assert.match(s, /Killick/);
  await assert.rejects(run(['--nope']), /Unknown option/);
});

test('rejects a --hazard or --threshold that cannot work instead of silently ignoring it', async () => {
  const csv = 'a,b\n1,1\n2,1\n3,2\n4,9\n5,9\n6,9\n';
  for (const bad of [['--hazard', 'abc'], ['--hazard', '0'], ['--hazard', '-5'], ['--threshold', '2'], ['--threshold', '0'], ['--threshold', '-0.1'], ['--threshold', 'x']]) {
    await assert.rejects(run(bad, csv), /--(hazard|threshold)/, bad.join(' '));
  }
  assert.equal((await run(['--hazard', '50', '--threshold', '0.9'], csv)).code, 0);
});

test('the level model text leads with the changes every setting agrees on, as the page does', async () => {
  const { s } = await run(['--example']);
  const lines = s.split('\n');
  assert.match(lines[0], /^Agreed changes: Every one of 6 settings agrees on 1 change: 1899 \(down\)\. On 7 labelled real series held out/);
  assert.match(s, /Level model alone[^\n]*\nPELT splits the 100 points/);
  const plain = (await run(['--example', '--no-agreed'])).s;
  assert.match(plain, /^PELT splits/);
  assert.match((await run(['--example', '--model', 'meanvar'])).s, /^PELT splits/, 'other models are not the panel, so no agreed line');
});

test('a CSV with its own options feeds the panel those options, and an unset option keeps its default', async () => {
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  const csv = 'day,v\n' + Array.from({ length: 80 }, (_, i) => `d${i},${(i < 40 ? 2 : 9) + noise()}`).join('\n');
  const { s } = await run(['--column', 'v'], csv);
  assert.match(s, /^Agreed changes: Every one of 6 settings agrees on 1 change: d40 \(up\)\./);
});

test('a series longer than the cap says the panel was not run instead of running it', async () => {
  const { AGREED_MAX_POINTS } = await import('./cli.mjs');
  const csv = 'v\n' + Array.from({ length: AGREED_MAX_POINTS + 1 }, (_, i) => (i % 7) + (i > 1000 ? 20 : 0)).join('\n');
  const { s } = await run([], csv);
  assert.match(s, new RegExp(`^Agreed changes: not run on ${AGREED_MAX_POINTS + 1} points .*--consensus`));
});
