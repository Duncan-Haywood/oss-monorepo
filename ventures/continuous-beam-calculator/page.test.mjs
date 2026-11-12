import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, run, report } from './cli.mjs';
import { parseLoadLines } from './beam.mjs';

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
    assert.match(html, /not engineering advice/, f);
    assert.match(html, /<html lang="en">/, f);
    assert.match(html, /href="LICENSE"/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/continuous-beam-calculator/</loc>' : `/continuous-beam-calculator/${f}`), f);
});

test('the default load box parses, and the page presets run', () => {
  const box = /<textarea id="loads"[^>]*>([\s\S]*?)<\/textarea>/.exec(markup)[1];
  assert.equal(parseLoadLines(box).length, 2);
  assert.throws(() => parseLoadLines('udl X:5'), /Load line 1/);
  assert.throws(() => parseLoadLines('beam L:5'), /start with udl, point or moment/);
});

test('the explainer quotes what the CLI prints for its two-span example', () => {
  const explainer = read('why-pattern-live-load-matters.html');
  const base = ['--spans', '12,12', '--supports', 'pin,pin,pin', '--E', '1600000', '--I', '1000', '--udl', 'L:400'];
  const pat = report(run(parseArgs(base))), all = report(run(parseArgs([...base, '--no-pattern'])));
  const firstSpan = t => t.split('Span 2')[0].split('\n');
  for (const line of [...firstSpan(pat).filter(l => /^\s+(\+M|-M|Support 1)/.test(l)), ...firstSpan(all).filter(l => /^\s+(\+M|-M)/.test(l))]) assert.ok(explainer.includes(line.trim()), line);
  assert.match(pat, /\+M 5,513 lb·ft at x = 5\.25 ft \(live on span 1\)/);
  assert.match(all, /\+M 4,050 lb·ft at x = 4\.50 ft/);
  assert.match(pat, /min -300 lb/);
});

test('CLI example runs and says it is not advice', () => {
  const r = run(parseArgs(['--example']));
  assert.equal(r.error, undefined);
  const out = report(r);
  assert.match(out, /Passes every check you gave it/);
  assert.match(out, /not engineering advice/);
});

test('CLI reads a JSON model through the injected reader, and reports errors without throwing', () => {
  const files = { 'b.json': JSON.stringify({ units: 'metric', spans: [5], supports: ['fixed', 'fixed'], E: 200, I: 8e7, loads: [{ type: 'udl', w1: 10, case: 'D' }] }) };
  const r = run(parseArgs(['--json', 'b.json']), p => files[p]);
  assert.equal(r.error, undefined);
  assert.match(report(r), /-M -21 kN·m/); // wL²/12 = 20.8
  assert.match(report(run(parseArgs(['--spans', '10', '--supports', 'pin,free', '--E', '1', '--I', '1']))), /^Error: The beam is unstable/);
  assert.throws(() => parseArgs(['--udl', 'Q:1']), /Cannot read/);
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
});
