import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, run, report } from './cli.mjs';

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
    assert.match(html, /not financial or legal advice/, f);
    assert.match(html, /<html lang="en">/, f);
    assert.match(html, /Not affiliated/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(script, /recordUsage\(.*'analysis_run'\)/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('loading the page does not count as a use', () => {
  assert.match(script, /loadExample\(false\);\s*<?\/?$|loadExample\(false\);/);
  assert.match(script, /if \(count\) recordUsage\(localStorage, el\('optOut'\)\.checked, 'analysis_run'\)/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/texas-electricity-plan-checker/</loc>' : `/texas-electricity-plan-checker/${f}`), f);
});

test('CLI runs the example and the three-price reading, and says it is an estimate', () => {
  const out = report(run(parseArgs(['--example'])));
  assert.match(out, /Example B: \$125 credit at 1,000-2,000 kWh: \$2465\.35 .* cheapest, credit in 7 of 12 months, label matches/);
  assert.match(out, /not financial advice/);
  assert.match(report(run(parseArgs(['--shape', '21.0', '8.1', '14.1']))), /gap \$83\.00 \(dip\)/);
  const files = { 'u.txt': 'Jan 1000\nFeb 900', 'p.json': '[{"name":"X","energy":[{"cents":10}]}]', 'e.txt': 'Y plan\nEnergy Charge: 12.0¢ per kWh' };
  const r = run(parseArgs(['--usage', 'u.txt', '--plan', 'p.json', '--efl', 'e.txt']), (f) => files[f]);
  assert.equal(r.results.length, 2);
  assert.match(r.notes.join(' '), /no TDU/);
  assert.match(run(parseArgs(['--usage', 'u.txt', '--plan', 'bad.json']), () => '{oops').error, /as JSON/);
  assert.match(run(parseArgs([])).error, /Usage/);
  assert.match(run(parseArgs(['--frobnicate'])).error, /unknown option/);
});

test('check/resstock-results.md is exactly what check/resstock-check.mjs prints, and the explainer quotes it', { skip: !existsSync(new URL('./check/resstock_tx_usage.json', import.meta.url)) }, () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const fresh = execFileSync(process.execPath, ['check/resstock-check.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(fresh, read('check/resstock-results.md'));
  const page = read('how-it-works.html');
  const credit = /Plan B's credit: median ([\d.]+) of 12 months collected/.exec(fresh)[1];
  assert.ok(page.includes(`median home collected it in ${credit} of 12 months`), 'credit months quoted');
  const bCheapest = /\| B credit \| (\d+) of 200 \|/.exec(fresh)[1];
  assert.ok(page.includes(`cheapest of the three for ${bCheapest} of the 200 homes`), 'B cheapest count quoted');
});
