// The several-column CLI (--columns) runs every column's six-setting panel on worker threads
// (consensus-threads.mjs runColumnPanelsThreaded). The merged answer must equal the one-thread
// columnConsensus() exactly, on threads, on one thread, and through the CLI's text and JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { PANEL } from './consensus.mjs';
import { runColumnPanelsThreaded, runJobsThreaded } from './consensus-threads.mjs';
import { columnConsensus, analyzeMulti, multiText, parseColumns } from './multivariate.mjs';
import { main } from './cli.mjs';

let seed = 7;
const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
// Three columns: a shared step at 150, a step at 300 in one column only, a slow drift in the last.
const csv = 't,a,b,c\n' + Array.from({ length: 400 }, (_, i) =>
  `${i},${(i < 150 ? 0 : 2) + noise()},${(i < 150 ? 1 : i < 300 ? 3 : 0) + noise()},${i / 100 + (i < 150 ? 0 : 1.5) + noise()}`).join('\n');

test('every column gets every setting, in panel order', async () => {
  const { cols } = parseColumns(csv);
  const runs = await runColumnPanelsThreaded(cols, { threads: 3 });
  assert.equal(runs.length, 3);
  for (const r of runs) assert.deepEqual(r.map((x) => x.name), PANEL.map((p) => p.name));
});

test('threads give the one-thread column consensus exactly', async () => {
  const { cols, names, labels } = parseColumns(csv);
  const one = columnConsensus(cols, { names, labels });
  assert.ok(one.changes.length > 0, 'the fixture has agreed changes to compare');
  for (const threads of [1, 2, 4]) {
    const runs = await runColumnPanelsThreaded(cols, { threads });
    assert.deepEqual(columnConsensus(cols, { names, labels, runs }), one, `${threads} thread(s)`);
  }
});

test('analyzeMulti with runs done elsewhere equals analyzeMulti alone', async () => {
  const parsed = parseColumns(csv);
  const columnRuns = await runColumnPanelsThreaded(parsed.cols);
  assert.deepEqual(analyzeMulti({ ...parsed, columnRuns }), analyzeMulti({ csv }));
});

test('the CLI text and JSON equal the one-thread result', async () => {
  let s = '';
  await main(['--columns'], { stdin: Readable.from([csv]), out: (t) => { s += t; } });
  assert.equal(s, multiText(analyzeMulti({ csv })) + '\n');
  let j = '';
  await main(['--columns', 'a,c', '--json'], { stdin: Readable.from([csv]), out: (t) => { j += t; } });
  assert.deepEqual(JSON.parse(j), JSON.parse(JSON.stringify(analyzeMulti({ csv, columns: ['a', 'c'] }))));
});

test('the currency example: the CLI on threads still names the franc floor and the Brexit vote', async () => {
  const fx = readFileSync(new URL('./data/fx-daily-returns.csv', import.meta.url), 'utf8');
  let s = '';
  await main(['--columns', '--model', 'meanvar'], { stdin: Readable.from([fx]), out: (t) => { s += t; } });
  assert.equal(s, multiText(analyzeMulti({ csv: fx, model: 'meanvar' })) + '\n');
  assert.match(s, /2015-01-20 {2}1\/3 columns: chf/);
  assert.match(s, /2016-06-24 {2}1\/3 columns: gbp/);
});

test('a job pool with no jobs, or one thread, runs here', async () => {
  assert.deepEqual(await runJobsThreaded([]), []);
  const r = await runJobsThreaded([{ base: { values: [1, 1, 1, 5, 5, 5, 5, 1, 1, 1] }, setting: 0 }], { threads: 4 });
  assert.equal(r[0].name, PANEL[0].name);
});

test('--columns file.csv reads the file, not a column named file.csv', async () => {
  const path = new URL('./data/german-unemployment.csv', import.meta.url).pathname;
  let a = '', b = '';
  await main(['--columns', path], { out: (t) => { a += t; } });
  await main([path, '--columns'], { out: (t) => { b += t; } });
  assert.equal(a, b);
  assert.match(a, /^2 columns, 120 points/);
});
