import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EXPERIMENTS, coverSvg, agentPrompt, handoffScript, renderLabIndex, renderHandoffPage, buildLab } from './lab.mjs';

const tool = {
  slug: 'roof-bid-calculator',
  name: 'Roof bid calculator',
  url: 'https://example.test/site/roof-bid-calculator/',
  category: 'Trades',
  description: 'Price a roof job.',
};
const opts = { repoUrl: 'https://github.com/o/r', embedParam: 'pfEmbed', embedHeight: 1400 };

test('covers are deterministic, distinct and self-contained SVG', () => {
  assert.equal(coverSvg('a'), coverSvg('a'));
  assert.notEqual(coverSvg('a'), coverSvg('b'));
  assert.match(coverSvg('a'), /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(coverSvg('a'), /NaN|undefined|href=/);
});

test('the agent prompt names the tool, all three paths, the license and the disclaimer', () => {
  const md = agentPrompt(tool, opts);
  for (const s of [tool.name, tool.url, 'MIT', 'Path A', 'Path B', 'Path C', 'no warranty', 'describe roof-bid-calculator', '?pfEmbed=1', 'min-height:1400px']) {
    assert.ok(md.includes(s), `missing ${s}`);
  }
});

test('functions shipped to the browser as source still run on their own', () => {
  // The page inlines coverSvg/agentPrompt with Function#toString, so they must
  // not close over anything in this module.
  const sandbox = {};
  vm.runInNewContext(`cover=${coverSvg.toString()};prompt=${agentPrompt.toString()};`, sandbox);
  assert.equal(sandbox.cover('x'), coverSvg('x'));
  assert.equal(sandbox.prompt(tool, opts), agentPrompt(tool, opts));
});

test('the handoff script parses', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-'));
  const file = path.join(dir, 'handoff.js');
  await fs.writeFile(file, handoffScript());
  execFileSync(process.execPath, ['--check', file]);
});

test('lab pages are noindex experiments carrying the disclaimer and linking each live experiment', () => {
  for (const html of [renderLabIndex(), renderHandoffPage()]) {
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /no warranty/i);
  }
  const index = renderLabIndex();
  for (const x of EXPERIMENTS.filter((e) => e.status === 'live')) {
    assert.ok(index.includes(`href="${x.href ?? `${x.id}/`}"`), `${x.id} not linked`);
  }
  assert.equal(new Set(EXPERIMENTS.map((x) => x.id)).size, EXPERIMENTS.length);
});

test('buildLab writes the index and the handoff page', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-'));
  await buildLab(dir);
  await fs.access(path.join(dir, 'lab', 'index.html'));
  await fs.access(path.join(dir, 'lab', 'handoff', 'index.html'));
});
