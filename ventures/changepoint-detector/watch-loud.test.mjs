// Round 16: the spread floor with a loud column given its own k (eval/watch-skab-loud.mjs; README "Round 16"), and the
// hand-set `watch.mjs --min-spread` that ships either way. SKAB is GPL and not committed, so these tests check the
// round's rule on made-up data and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseMinSpread } from './watch.mjs';
import { loudSplit, ruleT12 } from './eval/watch-skab-loud.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const series = (n, steps, seed = 5) => { const g = gauss(lcg(seed)); return Array.from({ length: n }, (_, i) => steps.reduce((t, [at, h]) => t + (i >= at ? h : 0), 0) + g()); };
const ramp = (n, top) => Array.from({ length: n }, (_, i) => (top * (i + 1)) / n);

test('loudSplit: a column holding most of the lines that clear the common k gets its own k, the rest share a lower one', () => {
  const loud = Array.from({ length: 40 }, (_, i) => 8 + i / 10);
  const cols = [ramp(30, 4), ramp(30, 3), loud, ramp(10, 1), [], [], ramp(20, 5), ramp(5, 2)];
  const { ks, loud: split } = loudSplit(cols, 37);
  assert.deepEqual(split, [2]);
  assert.equal(cols[2].filter((r) => r >= ks[2]).length, 4, 'the loud column keeps its equal share, m = floor(37 / 8)');
  const shared = cols.filter((_, c) => c !== 2).flat();
  assert.equal(shared.filter((r) => r >= ks[0]).length, 33, 'the others share L - m');
  assert.ok(ks[0] < 8 && ks.every((k, c) => c === 2 || k === ks[0]));
});

test('loudSplit: no loud column leaves round 15\'s one k; unknown ratios count against the budget', () => {
  const cols = [0, 1, 2, 3].map((j) => ramp(10, 5).map((x) => x + j / 100));
  const { ks, loud } = loudSplit(cols, 8);
  assert.deepEqual(loud, []);
  assert.ok(ks.every((k) => k === ks[0] && k > 0));
  assert.deepEqual(loudSplit([[1, 2, 3], [null, null]], 10).ks, [0, 0], 'more budget than lines: no floor');
});

test('T12 on made-up totals', () => {
  const q = { caught: 33, share: 36.8 };
  assert.equal(ruleT12(q, { caught: 31, share: 36.8 }, 2).pass, true);
  assert.deepEqual(ruleT12(q, { caught: 30, share: 36.7 }, 2.01).parts, [false, false, false]);
});

test('--min-spread: a number, or column=number pairs; the mistakes it refuses', () => {
  assert.deepEqual(parseMinSpread('3'), { all: 3 });
  assert.deepEqual([...parseMinSpread('Temperature=4, flow=2').byColumn], [['temperature', 4], ['flow', 2]]);
  assert.throws(() => parseMinSpread('0'), /--min-spread: k takes a number above 0/);
  assert.throws(() => parseMinSpread('a=1,a=2'), /--min-spread: "a" is given twice/);
  assert.throws(() => parseMinSpread('--json'), /--min-spread takes a number/);
});

test('CLI --columns --min-spread column=k: a step of 3 noise sds alerts on a, and b with k = 10 stays quiet', async () => {
  const d = mkdtempSync(join(tmpdir(), 'spread-'));
  const a = series(200, [[170, 3]], 7), b = series(200, [[170, 3]], 8);
  const csv = (n) => 'date,a,b\n' + Array.from({ length: n }, (_, i) => `${i + 1},${a[i].toFixed(3)},${b[i].toFixed(3)}`).join('\n') + '\n';
  const f = join(d, 's.csv'), st = join(d, 'state.json');
  writeFileSync(f, csv(150));
  await main([f, '--columns', 'a,b', '--min-spread', 'b=10', '--state', st], { out: () => {} });
  writeFileSync(f, csv(199));
  await main([f, '--columns', 'a,b', '--min-spread', 'b=10', '--state', st], { out: () => {} });
  writeFileSync(f, csv(200));
  let text = '';
  await main([f, '--columns', 'a,b', '--min-spread', 'b=10', '--state', st], { out: (s) => { text += s; } });
  assert.match(text, /New changes in 1 of 2 columns: a\./);
  await assert.rejects(main([f, '--columns', 'a,b', '--min-spread', 'c=1', '--dry-run'], { out: () => {} }), /--min-spread: "c" is not one of the watched columns/);
  await assert.rejects(main([f, '--column', 'a', '--min-spread', 'a=1', '--dry-run'], { out: () => {} }), /--min-spread column=k,\.\.\. is for --columns/);
  // One column, one number: the step on a alone is dropped at k = 10 and sent at k = 2.
  const one = (k) => { const s2 = join(d, `one-${k}.json`); return [f, '--column', 'a', '--min-spread', String(k), '--state', s2]; };
  const run = async (k) => { writeFileSync(f, csv(150)); await main(one(k), { out: () => {} }); writeFileSync(f, csv(199)); await main(one(k), { out: () => {} }); writeFileSync(f, csv(200)); let t = ''; await main([...one(k), '--json'], { out: (s) => { t += s; } }); return JSON.parse(t); };
  assert.equal((await run(10)).alerts.length, 0);
  assert.ok((await run(2)).alerts.length >= 1);
});

test('the committed output carries the round\'s verdict', () => {
  const p = new URL('./eval/watch-skab-loud.out.txt', import.meta.url);
  assert.ok(existsSync(p));
  assert.match(readFileSync(p, 'utf8'), /T12 S vs Q: .*(PASSES|FAILS)\./);
});

test('round 16 as run: T12 fails on (a) and (b), and the help, the page and llms.txt say so', () => {
  const out = readFileSync(new URL('./eval/watch-skab-loud.out.txt', import.meta.url), 'utf8');
  assert.match(out, /T12 S vs Q: \(a\) pre-fault 2\.47 per 100 checks vs 2 FAIL; \(b\) 30 vs 33 - 2 FAIL; \(c\) 50\.5% vs 36\.8% PASS\. FAILS\./);
  assert.match(out, /R  round 15, one k in the watch \(re-run\) +150 +89 \(59\.3%\).*27\/33.*1\.40 \(42\/2997\)/, 'the re-run matches round 15');
  assert.match(readFileSync(new URL('./watch.mjs', import.meta.url), 'utf8'), /README "Round 16"; not offered/);
  assert.match(readFileSync(new URL('./llms.txt', import.meta.url), 'utf8'), /README "Round 16"/);
});
