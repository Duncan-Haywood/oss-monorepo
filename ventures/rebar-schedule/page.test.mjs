import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, report } from './cli.mjs';
import { run, EXAMPLE } from './schedule.mjs';

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

test('every page carries the no-warranty clause, lang and the licence', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /No warranty/, f);
    assert.match(html, /not engineering/, f);
    assert.match(html, /<html lang="en">/, f);
    assert.match(html, /href="LICENSE"/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /counts one anonymous page view/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/rebar-schedule/</loc>' : `/rebar-schedule/${f}`), f);
});

test('the benchmark numbers on the pages are the ones check/benchmark.mjs printed', () => {
  const bench = read('check/BENCHMARK.txt');
  assert.match(bench, /197 of 200; largest gap to the bound: 1 bar/);
  assert.match(bench, /more bars in 122 of 200/);
  assert.match(bench, /0\.99% more|1\.0\d% more/);
  for (const f of ['index.html', 'how-to-calculate-bar-bending-schedule.html']) {
    assert.match(read(f), /197 of 200/, f);
    assert.match(read(f), /122 of the 200/, f);
  }
});

test('the explainer quotes what the CLI prints for the example', () => {
  const out = report(run(EXAMPLE));
  const explainer = read('how-to-calculate-bar-bending-schedule.html');
  for (const line of out.split('\n').filter(l => /^\s+\d+ x 12000/.test(l) && /2100/.test(l))) assert.ok(explainer.includes(line.trim()), line);
  assert.match(out, /12 mm: 32 stock bars .* first-fit decreasing: 34 bars/);
  assert.match(explainer, /32 stock bars/);
  assert.match(explainer, /34/);
});

test('CLI arguments', () => {
  assert.deepEqual(parseArgs(['s.csv', '--stock', '12000,6000', '--kerf', '3']).stock, [12000, 6000]);
  assert.match(report(run(EXAMPLE)), /not engineering or detailing advice/);
});
