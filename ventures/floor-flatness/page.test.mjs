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

test('every page carries the no-warranty clause and the privacy line', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /No warranty/, f);
    assert.match(html, /not engineering/, f);
    assert.match(html, /<html lang="en">/, f);
    assert.match(html, /never uploaded/, f);
  }
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/floor-flatness/</loc>' : `/floor-flatness/${f}`), f);
});

test('the marketing page worked example: 13 readings by hand give FF 48.3, and the CLI agrees', () => {
  const guide = read('ff-fl-for-concrete-contractors.html');
  const line = '0.00  0.04  0.06  0.04  0.00  -0.02  0.00  0.05  0.08  0.06  0.03  0.02  0.04';
  assert.ok(guide.includes(line));
  assert.match(guide, /= 48\.3</);
  // by hand: curvatures from the readings, then 4.57 / (3 S + |mean|)
  const z = line.split(/\s+/).map(Number);
  const q = []; for (let i = 2; i < z.length; i++) q.push((z[i] - z[i - 1]) - (z[i - 1] - z[i - 2]));
  const m = q.reduce((a, b) => a + b) / q.length;
  const s = Math.sqrt(q.reduce((a, b) => a + (b - m) ** 2, 0) / (q.length - 1));
  assert.equal((4.57 / (3 * s + Math.abs(m))).toFixed(1), '48.3');
  const r = run(parseArgs(['l.txt', '--format', 'lines']), () => line);
  assert.equal(r.error, undefined);
  assert.equal(r.result.sections[0].result.ff.F.toFixed(1), '48.3');
  assert.match(report(r), /FF 48\.3/);
});

test('CLI runs the example with a spec and a grind target', () => {
  const r = run(parseArgs(['--example', '--edge', '2', '--ff', '35', '--fl', '25', '--grind', '40']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /FAIL Overall FF/);
  assert.match(out, /PASS Overall FL/);
  assert.match(out, /Grind estimate to FF 40: reached/);
  assert.match(out, /Not engineering advice/);
});

test('CLI guesses formats and rejects bad input', () => {
  assert.match(run(parseArgs([])).error, /readings file/);
  assert.match(run(parseArgs(['x', '--unit', 'yd'])).error, /--unit/);
  assert.match(run(parseArgs(['x']), () => '1,2,oops\n').error ?? '', /not a number/);
  const grid = Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => ((r * 7 + c * 3) % 5) * 0.01).join(',')).join('\n');
  const g = run(parseArgs(['g.csv']), () => grid);
  assert.equal(g.result.format, 'grid');
  assert.equal(g.result.sections[0].survey.lines.length, 24);
});
