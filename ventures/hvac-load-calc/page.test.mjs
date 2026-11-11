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
    assert.match(html, /not engineering advice and not an ACCA Manual J/, f);
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
    assert.ok(sitemap.includes(f === 'index.html' ? '/hvac-load-calc/</loc>' : `/hvac-load-calc/${f}`), f);
  }
});

test('CLI runs the example and states it is an estimate', () => {
  const r = run(parseArgs(['--example']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /Cooling load at the house peak/);
  assert.match(out, /not an ACCA Manual J/);
});

test('CLI reads a house file through the injected reader and reports bad input', () => {
  assert.match(run(parseArgs(['h.json']), () => '{oops').error, /Could not read h.json/);
  assert.match(run(parseArgs(['h.json']), () => '{"rooms":[]}').error, /at least one room/);
  const ok = run(parseArgs(['h.json']), () => JSON.stringify({ rooms: [{ name: 'A', areaFt2: 200, ceilingToAttic: true, walls: [{ facing: 'W', lengthFt: 14, windowFt2: 20 }] }] }));
  assert.equal(ok.result.rooms.length, 1);
  assert.ok(ok.result.house.heating.total > 0);
});

test('the worked example on the explainer matches the engine', () => {
  const r = run(parseArgs(['--example'])).result;
  const page = read('how-it-works.html');
  const n = x => Math.round(x).toLocaleString('en-US');
  for (const v of [r.house.cooling.sensible, r.house.cooling.latent, r.house.cooling.total, r.house.heating.total, r.house.cooling.sumOfRoomPeaks, ...Object.values(r.house.cooling.components)]) assert.ok(page.includes(n(v)), `explainer is missing ${n(v)}`);
});
