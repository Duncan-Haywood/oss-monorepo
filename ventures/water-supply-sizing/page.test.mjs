import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, run, report } from './cli.mjs';
import { designCount } from './demand.mjs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = read('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];
const pages = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.html'));

test('every element the script looks up exists in the markup', () => {
  for (const [, id] of script.matchAll(/el\('([^']+)'\)/g)) assert.ok(ids.has(id), `missing #${id}`);
  for (const k of /const NUMS = \[([^\]]+)\]/.exec(script)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1))) assert.ok(ids.has(k), `missing #${k}`);
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('every page carries the no-warranty clause and the disclaimer; the tool carries privacy, opt-out, licence and sponsor', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /No warranty/, f);
    assert.match(html, /not engineering advice and not a plumbing code sizing method/, f);
    assert.match(html, /<html lang="en">/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(script, /recordUsage\(.*'demand_sized'\)/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/water-supply-sizing/</loc>' : `/water-supply-sizing/${f}`), f);
});

test('CLI runs the example and states it is an estimate', () => {
  const r = run(parseArgs(['--example']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /Whole building: design flow 10\.8 gpm/);
  assert.match(out, /not a plumbing code sizing method/);
  assert.match(report(run(parseArgs(['--example', '--trim']))), /Trimmed: 2 size step/);
});

test('CLI reads a file through the injected reader and reports bad input', () => {
  assert.match(run(parseArgs(['s.json']), () => '{oops').error, /Could not read s.json/);
  assert.match(run(parseArgs(['s.json']), () => '{"segments":[]}').error, /at least one pipe segment/);
  assert.match(run(parseArgs([])).error, /Usage/);
});

test('the explainer\'s numbers match the engine', () => {
  const page = read('how-it-works.html');
  const { result: r, whole } = run(parseArgs(['--example']));
  for (const v of [whole.allAtOnceGpm, whole.sumOfTypesAloneGpm, whole.designGpm]) assert.ok(page.includes(`${v.toFixed(1)} gpm`), `missing ${v}`);
  assert.ok(page.includes(r.allowablePsiPer100.toFixed(2)));
  const t = run(parseArgs(['--example', '--trim'])).result;
  assert.ok(page.includes(`${t.ends.find(e => e.end === 'Hall bath').pressurePsi.toFixed(1)} psi at the hall bath`));
  // The Hunter comparison table: the exact-rule column is what the engine gives.
  const rows = [...page.matchAll(/<tr><td>(Flush valves|Bathtubs)[^<]*<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)];
  assert.equal(rows.length, 14);
  for (const [, kind, m, , exactN] of rows) {
    const p = kind === 'Bathtubs' ? 1 / 15 : 0.03;
    assert.equal(designCount(Number(exactN), p), Number(m), `${kind} m=${m}`);
    assert.ok(designCount(Number(exactN) - 1, p) < Number(m), `${kind} m=${m}: not the first n`);
  }
});

test('the page links to its siblings and the explainer', () => {
  assert.match(markup, /href="\.\.\/hvac-load-calc\/"/);
  assert.match(markup, /href="\.\.\/water-heater-bid-calculator\/"/);
  assert.match(markup, /href="\.\/how-it-works\.html"/);
});
