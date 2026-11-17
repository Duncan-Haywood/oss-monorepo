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
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/earthwork-cut-fill/</loc>' : `/earthwork-cut-fill/${f}`), f);
});

test('the explainer quotes what the CLI prints for its worked example', () => {
  let s = '';
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) s += `${i * 5 + j + 1},${j * 25},${i * 25},${100 + 0.1 * i * 25},EG\n`;
  const out = report(run(parseArgs(['lot.csv', '--pad', '105', '--shrink', '20', '--swell', '25', '--truck', '12']), () => s));
  const explainer = read('how-to-calculate-cut-and-fill.html');
  for (const line of out.split('\n').filter(l => /^(Cut|Fill|Import):/.test(l))) assert.ok(explainer.includes(line), line);
  const bal = report(run(parseArgs(['lot.csv', '--balance', '--shrink', '20']), () => s));
  assert.match(bal, /balanced pad at 104\.721 ft/);
  assert.match(explainer, /balanced pad at 104\.721 ft/);
});

test('CLI example runs and says it is not advice', () => {
  const r = run(parseArgs(['--example', '--balance', '--shrink', '15']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /Balanced: no export or import/);
  assert.match(out, /not engineering advice/);
});

test('CLI two-surface run through the injected reader', () => {
  const files = {
    'eg.csv': 'X,Y,Z\n0,0,100\n100,0,100\n100,100,100\n0,100,100\n',
    'fg.csv': 'X,Y,Z\n0,0,101\n100,0,101\n100,100,101\n0,100,101\n',
  };
  const r = run(parseArgs(['eg.csv', '--proposed', 'fg.csv', '--units', 'm']), p => files[p]);
  assert.equal(r.volumes.fill, 10000);
  assert.match(report(r), /Fill: 10,000\.0 m³/);
});
