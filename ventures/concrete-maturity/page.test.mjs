import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, run, report } from './cli.mjs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = read('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('every element the script looks up exists in the markup', () => {
  for (const [, id] of script.matchAll(/el\('([^']+)'\)/g)) assert.ok(ids.has(id), `missing #${id}`);
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('every page carries the no-warranty clause, the privacy line and a link home', () => {
  for (const f of readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.html'))) {
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
  for (const f of readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.html'))) {
    assert.ok(sitemap.includes(f === 'index.html' ? '/concrete-maturity/</loc>' : `/concrete-maturity/${f}`), f);
  }
});

test('CLI runs the example and reports the lowest sensor', () => {
  const r = run(parseArgs(['--example', '--target', '3000']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /Lowest estimate: Slab edge/);
  assert.match(out, /not engineering advice/);
});

test('CLI reads files through the injected reader and reports bad calibration', () => {
  const files = { 'log.csv': 'Hours,T (C)\n0,20\n24,20\n48,20\n', 'cal.txt': '1,1000\n' };
  const r = run(parseArgs(['log.csv', '--cal', 'cal.txt']), p => files[p]);
  assert.match(r.error, /No usable strength-maturity fit/);
  files['cal.txt'] = '1,1000\n3,2000\n7,3000\n28,4000\n';
  const ok = run(parseArgs(['log.csv', '--cal', 'cal.txt', '--target', '1200', '--method', 'equivalent-age']), p => files[p]);
  assert.equal(ok.result.sensors.length, 1);
  assert.equal(ok.result.sensors[0].reached.status, 'reached');
});
