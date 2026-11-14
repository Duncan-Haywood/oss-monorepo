import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs, run, report } from './cli.mjs';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = read('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];
const pages = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.html'));

test('every element the script looks up exists in the markup', () => {
  const used = [...script.matchAll(/el\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `missing #${id}`);
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
  assert.match(script, /recordUsage\(.*'balance_run'\)/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/assembly-line-balancer/</loc>' : `/assembly-line-balancer/${f}`), f);
});

test('the explainer quotes the committed benchmark output, not hand-typed numbers', () => {
  const bench = read('bench/salbp1.md');
  const page = read('how-it-works.html');
  const agree = /Same value as the published optimum: (\d+) of (\d+)/.exec(bench);
  const proved = /Proved optimal by this engine within the limits: (\d+) of (\d+)/.exec(bench);
  const worse = /Worse than the published best: (\d+); better than the published upper bound: (\d+)/.exec(bench);
  assert.match(page, new RegExp(`id="b1agree">${agree[1]} of ${agree[2]}<`));
  assert.match(page, new RegExp(`id="b1proved">${proved[1]} of ${proved[2]}<`));
  assert.match(page, new RegExp(`id="b1worse">${worse[1]}<`));
  assert.equal(worse[2], '0', 'never fewer stations than a published optimum');
  const rows = [...bench.matchAll(/^\| [A-Za-z-]+\d* \| \d+ \|/gm)].length;
  assert.equal(rows, Number(agree[2]));
  const llms = read('llms.txt');
  assert.ok(llms.includes(`${agree[1]} of ${agree[2]}`));
  assert.ok(markup.includes(`matched the published optimum on ${agree[1]} within four seconds`), 'FAQ number');
  const b2 = read('bench/salbp2.md');
  const a2 = /Same value as the published optimum: (\d+) of (\d+)/.exec(b2);
  const p2 = /Proved optimal by this engine within the limits: (\d+) of (\d+)/.exec(b2);
  const w2 = /Worse than the published best: (\d+); better than the published upper bound: (\d+)/.exec(b2);
  assert.equal(w2[2], '0', 'never a shorter cycle than a published optimum');
  assert.ok(page.includes(`${a2[1]} of ${a2[2]}`) && page.includes(`${p2[1]} of ${p2[2]}`) && page.includes(`longer on ${w2[1]}`), 'SALBP-2 numbers');
});

test('links one hop to its sibling tool, so crawlers reach both', () => {
  assert.match(markup, /href="\.\.\/spc-control-charts\/"/);
  assert.match(markup, /href="\.\.\/job-shop-scheduler\/"/);
});

test('CLI: example, stations mode, takt, JSON, errors, and the disclaimer', () => {
  const out = report(run(parseArgs(['--example'])));
  assert.match(out, /Cycle time 10: 5 stations \(proved fewest possible\)/);
  assert.match(out, /not engineering advice/);
  assert.match(report(run(parseArgs(['--example', '--stations', '4']))), /4 stations: cycle time 12 \(proved shortest possible\)/);
  assert.match(report(run(parseArgs(['--example', '--takt', '27000,2700']))), /Cycle time 10: 5 stations/);
  const json = JSON.parse(report(run(parseArgs(['--example'])), true));
  assert.equal(json.stationCount, 5);
  assert.match(json.disclaimer, /not engineering advice/);
  const csv = 'task,time,predecessors\nA,4,\nB,3,A\nC,5,A\n';
  assert.match(report(run(parseArgs(['line.csv', '--cycle', '8']), () => csv)), /2 stations/);
  assert.match(report(run(parseArgs(['g.IN2', '--cycle', '9']), () => '3\n4\n5\n3\n1,2\n1,3\n')), /2 stations/);
  assert.match(run(parseArgs(['line.csv']), () => csv).error, /--cycle, --stations or --takt/);
  assert.match(run(parseArgs([])).error, /Usage/);
  assert.match(run(parseArgs(['--frobnicate'])).error, /unknown option/);
  assert.match(run(parseArgs(['x.json', '--cycle', '5']), () => '{oops').error, /could not read x\.json/);
});

test('the launch post quotes the committed benchmark output', () => {
  const post = readFileSync(new URL('../../docs/posts/2026-11-14-a-line-balancer-that-says-when-it-has-proved-it.md', import.meta.url), 'utf8');
  const get = (f) => {
    const b = read(f);
    return [/Same value as the published optimum: (\d+)/, /Proved optimal by this engine within the limits: (\d+)/, /Worse than the published best: (\d+)/].map((r) => r.exec(b)[1]);
  };
  const [a1, p1, w1] = get('bench/salbp1.md');
  const [a2, p2, w2] = get('bench/salbp2.md');
  assert.ok(post.includes(`| Same answer as the published optimum | ${a1} | ${a2} |`));
  assert.ok(post.includes(`| Proved optimal by this engine | ${p1} | ${p2} |`));
  assert.ok(post.includes(`| Worse than the published optimum | ${w1} | ${w2} |`));
  assert.ok(post.includes(`optimum on ${a1} of 269`));
});
