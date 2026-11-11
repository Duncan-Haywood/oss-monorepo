// The CLI's agreed-changes panel on worker threads (consensus-threads.mjs) gives the one-thread
// consensus() result exactly, with or without the CLI's own level run standing in for setting 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { analyze } from './engine.mjs';
import { consensus, consensusText, mergeConsensus, levelRunFromMain, agreedText, PANEL } from './consensus.mjs';
import { runPanelThreaded, SLOWEST_FIRST } from './consensus-threads.mjs';
import { main } from './cli.mjs';

let seed = 11;
const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
// Three steps and a slow drift, so the settings disagree somewhere.
const csv = 't,v\n' + Array.from({ length: 2400 }, (_, i) => `${i},${(i < 600 ? 0 : i < 1500 ? 3 : i < 2000 ? 1 : 4) + i / 2000 + 2 * noise()}`).join('\n');

test('every setting is handed out once, slowest first', () => {
  assert.deepEqual([...SLOWEST_FIRST].sort(), PANEL.map((_, i) => i));
});

test('threads give the one-thread consensus exactly', async () => {
  const one = consensus({ csv });
  assert.deepEqual(mergeConsensus(await runPanelThreaded({ csv }, { threads: 3 })), one);
  assert.deepEqual(mergeConsensus(await runPanelThreaded({ csv }, { threads: 1 })), one, 'one thread runs here');
  const runs = await runPanelThreaded({ csv }, { skip: [0] });
  assert.equal(runs[0], undefined, 'a skipped setting is left for the caller');
  runs[0] = levelRunFromMain({ csv, model: 'mean' }, analyze({ csv, model: 'mean' }));
  assert.deepEqual(mergeConsensus(runs), one, 'the main level run stands in for setting 0');
});

test('the CLI runs the panel above the old 2,000-point cap and says what consensus() says', async () => {
  let s = '';
  await main([], { stdin: Readable.from([csv]), out: (t) => { s += t; } });
  assert.equal(s.split('\n')[0], `Agreed changes: ${agreedText(consensus({ csv }))}`);
  let c = '';
  await main(['--consensus'], { stdin: Readable.from([csv]), out: (t) => { c += t; } });
  assert.equal(c, consensusText(consensus({ csv })) + '\n');
});

test('options that move a cut stop the reuse, and the panel still matches', async () => {
  let s = '';
  await main(['--ar1'], { stdin: Readable.from([csv]), out: (t) => { s += t; } });
  assert.equal(s.split('\n')[0], `Agreed changes: ${agreedText(consensus({ csv }))}`);
});
