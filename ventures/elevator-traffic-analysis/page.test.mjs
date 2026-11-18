import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, run, report } from './cli.mjs';
import { EXAMPLE } from './engine.mjs';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = read('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];
const pages = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.html'));

test('every element the script looks up exists in the markup', () => {
  for (const [, id] of script.matchAll(/el\('([^']+)'\)/g)) assert.ok(ids.has(id), `missing #${id}`);
  for (const k of /const NUMS = \[([^\]]+)\]/.exec(script)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))) assert.ok(ids.has(k), `missing #${k}`);
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('every page carries the no-warranty clause; the tool carries privacy, opt-out, licence and sponsor', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /No warranty/, f);
    assert.match(html, /not engineering advice/, f);
    assert.match(html, /<html lang="en">/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(script, /recordUsage\(.*'analysis_run'\)/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/elevator-traffic-analysis/</loc>' : `/elevator-traffic-analysis/${f}`), f);
});

test('CLI runs the example, searches, simulates, and states it is an estimate', () => {
  const out = report(run(parseArgs(['--example', '--search', '--simulate'])));
  assert.match(out, /Round trip time: 147\.0 s/);
  assert.match(out, /5 x 1275 kg \(17 persons\) at 2\.5 m\/s/);
  assert.match(out, /Formula vs 20000 sampled trips/);
  assert.match(out, /not engineering advice/);
  assert.match(report(run(parseArgs(['b.json']), () => JSON.stringify(EXAMPLE))), /147\.0 s/);
  assert.match(run(parseArgs(['b.json']), () => '{oops').error, /as JSON/);
  assert.match(run(parseArgs([])).error, /Usage/);
  assert.match(run(parseArgs(['--frobnicate'])).error, /unknown option/);
});

test('bench/grid.md is exactly what bench/grid.mjs prints, and the explainer quotes it', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const fresh = execFileSync(process.execPath, ['bench/grid.mjs'], { cwd: dir, encoding: 'utf8' });
  const saved = read('bench/grid.md');
  assert.equal(fresh, saved);
  const page = read('how-it-works.html');
  const range = /Formula minus sampled-trip mean: (-?[\d.]+)% to (-?[\d.]+)%/.exec(saved);
  assert.ok(page.includes(`${range[1].replace('-', '')}% below`) && page.includes(`${range[2]}% above`), 'formula gap range');
  for (const [, dwell, share, ratio] of saved.matchAll(/^\| (\d+) \| ([\d.]+) \| ([\d.]+) \|/gm)) {
    assert.ok(page.includes(`<td>${ratio}</td>`), `dwell ${dwell} share ${share} ratio ${ratio}`);
  }
  const full = /\| 8 \| 1 \| [\d.]+ \| (\d+) of 27 \|/.exec(saved)[1];
  assert.match(page, new RegExp(`in ${full} of the 27 buildings`));
});
