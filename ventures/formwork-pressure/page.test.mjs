import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, run, report } from './cli.mjs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = read('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];
const pages = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.html'));

test('every element the script looks up exists in the markup', () => {
  for (const [, id] of script.matchAll(/el\('([^']+)'\)/g)) assert.ok(ids.has(id), `missing #${id}`);
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('every page carries the no-warranty clause and is English', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /No warranty/, f);
    assert.match(html, /not engineering/, f);
    assert.match(html, /<html lang="en">/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/formwork-pressure/</loc>' : `/formwork-pressure/${f}`), f);
});

test('the explainer worked example matches the engine', () => {
  const r = run(parseArgs(['--wall', '--height', '10', '--rate', '5', '--temp', '70', '--tie', '3000', '--tie-across', '2']));
  const out = report(r);
  assert.match(out, /Design lateral pressure: 793 psf/);
  assert.match(out, /resultant 5,833 lb\/ft/);
  assert.match(out, /at most 1\.89 ft up/);
  const ex = read('formwork-pressure-explained.html');
  for (const s of ['793 psf', '5,833 lb', '3.78 ft²', '1.89 ft', '1,275 psf', '1,530 psf']) assert.ok(ex.includes(s), s);
});

test('CLI reports bad input as an error, and metric output in kPa', () => {
  assert.match(report(run(parseArgs(['--wall', '--height', 'x', '--rate', '1', '--temp', '70']))), /^Error: Placement height must be a number/);
  assert.match(report(run(parseArgs(['--rate', '1', '--height', '3', '--temp', '70']))), /wall or a column/);
  assert.match(report(run(parseArgs(['--wall', '--bogus']))), /Unknown argument/);
  assert.match(report(run(parseArgs(['--wall', '--height', '3', '--rate', '1.5', '--temp', '21', '--si']))), /37\.6 kPa/);
});
