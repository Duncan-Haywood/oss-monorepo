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
