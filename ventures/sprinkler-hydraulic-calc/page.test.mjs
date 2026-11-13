import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, run, report } from './cli.mjs';
import { analyze, solve, EXAMPLE, EPANET } from './hydraulics.mjs';
import { serialize } from './format.mjs';
import { table } from './check/grid_vs_tree.mjs';

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
    assert.match(html, /not engineering advice and not a stamped hydraulic calculation/, f);
    assert.match(html, /<html lang="en">/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(script, /recordUsage\(.*'system_calculated'\)/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/sprinkler-hydraulic-calc/</loc>' : `/sprinkler-hydraulic-calc/${f}`), f);
});

test('CLI runs the example, reads text and JSON, and states it is an estimate', () => {
  const r = run(parseArgs(['--example']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /Demand at the source \(BOR\): 27\.2 psi/);
  assert.match(out, /not a stamped hydraulic calculation/);
  const text = run(parseArgs(['--print-example'])).text;
  assert.match(report(run(parseArgs(['s.txt']), () => text)), /27\.2 psi/);
  assert.match(report(run(parseArgs(['s.json']), () => JSON.stringify(EXAMPLE))), /27\.2 psi/);
  assert.match(run(parseArgs(['s.txt']), () => 'node A\nvalve').error, /not "valve"/);
  assert.match(run(parseArgs(['s.json']), () => '{oops').error, /as JSON/);
  assert.match(run(parseArgs([])).error, /Usage/);
});

test('the explainer\'s numbers match the engine', () => {
  const page = read('how-it-works.html');
  const r = analyze(EXAMPLE);
  const f1 = x => x.toFixed(1);
  for (const s of [`${f1(r.demand.psi)} psi</b> at <b>${f1(r.demand.sprinklerGpm)} gpm`, `${f1(r.demand.totalGpm)} gpm`, `${f1(r.supply.availablePsi)} psi</b>`, `margin of <b>${f1(r.supply.marginPsi)} psi`, `${f1(r.supply.operating.totalGpm)} gpm, hose included, at ${f1(r.supply.operating.psi)} psi`, `over-discharge by ${f1(r.overdischargeGpm)} gpm`, `${r.demand.remote} is the most demanding at ${r.solution.sprinklers.find(h => h.id === r.demand.remote).psi.toFixed(2)} psi`]) assert.ok(page.includes(s), s);
  assert.ok(page.includes(`the solve takes ${solve(EXAMPLE, r.demand.psi).iterations} Newton steps`));
  assert.ok(page.includes(`constant is ${EPANET.coef.toFixed(3)}`));
  assert.ok(page.includes(`${r.demand.psi.toFixed(2)} psi with the NFPA form and ${analyze(EXAMPLE, { formula: EPANET }).demand.psi.toFixed(2)} psi`));
  const rows = [...page.matchAll(/<tr><td>(\d)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><\/tr>/g)];
  const t = table();
  assert.equal(rows.length, t.length);
  rows.forEach(([, n, g, tr, g10, t10], i) => {
    assert.equal(Number(n), t[i].heads);
    assert.deepEqual([g, tr, g10, t10], [t[i].gridPsi, t[i].treePsi, t[i].grid10Psi, t[i].tree10Psi].map(f1));
  });
});

test('the page loads the example through the same text format the CLI reads', () => {
  assert.match(script, /serialize\(/);
  assert.match(serialize(EXAMPLE), /^source BOR\nsupply static=65 residual=45 at=800\n/);
  assert.match(markup, /href="\.\.\/water-supply-sizing\/"/);
  assert.match(markup, /href="\.\/how-it-works\.html"/);
});
