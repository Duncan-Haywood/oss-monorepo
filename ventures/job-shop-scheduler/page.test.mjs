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
  assert.ok(used.length > 12);
  for (const id of used) assert.ok(ids.has(id), `missing #${id}`);
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('every page carries the no-warranty clause; the tool carries privacy, opt-out, licence and sponsor', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /No warranty/, f);
    assert.match(html, /not engineering or operations advice/, f);
    assert.match(html, /<html lang="en">/, f);
  }
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(script, /recordUsage\(.*'schedule_run'\)/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /href="LICENSE"/);
});

test('sitemap lists every published page', () => {
  const sitemap = read('sitemap.xml');
  for (const f of pages) assert.ok(sitemap.includes(f === 'index.html' ? '/job-shop-scheduler/</loc>' : `/job-shop-scheduler/${f}`), f);
});

test('the pages, llms.txt and the post quote the committed benchmark output, not hand-typed numbers', () => {
  const bench = read('bench/jsplib.md');
  const page = read('how-it-works.html');
  const n = /Instances: (\d+)\./.exec(bench)[1];
  const agree = /Same value as JSPLIB's recorded optimum: (\d+) of (\d+)/.exec(bench);
  const proved = /Proved optimal by this engine within the limits: (\d+) of (\d+)/.exec(bench);
  const worse = /Worse than JSPLIB's optimum or upper bound: (\d+); better than its upper bound: (\d+); below its lower bound: (\d+)/.exec(bench);
  const gap = /Mean gap to JSPLIB's optimum or upper bound: ([\d.]+)%/.exec(bench)[1];
  assert.equal(worse[3], '0', 'never below a published lower bound');
  assert.match(page, new RegExp(`id="bAgree">${agree[1]} of ${agree[2]}<`));
  assert.match(page, new RegExp(`id="bProved">${proved[1]} of ${proved[2]}<`));
  assert.match(page, new RegExp(`id="bWorse">${worse[1]}<`));
  assert.match(page, new RegExp(`id="bBetter">${worse[2]}<`));
  assert.match(page, new RegExp(`id="bGap">${gap}%<`));
  const rows = [...bench.matchAll(/^\| [a-z]+\d+ \| \d+x\d+ \|/gm)].length;
  assert.equal(String(rows), n);
  assert.ok(markup.includes(`${n} published benchmark instances`));
  const llms = read('llms.txt');
  assert.ok(llms.includes(`${agree[1]} of ${agree[2]}`), 'llms.txt');
  const post = readFileSync(new URL('../../docs/posts/2026-11-14-a-job-shop-scheduler-that-shows-its-bound.md', import.meta.url), 'utf8');
  assert.ok(post.includes(`${agree[1]} of ${agree[2]}`) && post.includes(`${proved[1]} of ${proved[2]}`) && post.includes(`${gap}%`), 'post');
});

test('links one hop to its sibling tool, so crawlers reach both', () => {
  assert.match(markup, /href="\.\.\/assembly-line-balancer\/"/);
});

test('CLI: example, JSON, Gantt, files, errors, and the disclaimer', () => {
  const out = report(run(parseArgs(['--example', '--ms', '1500'])));
  assert.match(out, /Makespan 38 \(proved shortest possible/);
  assert.match(out, /not engineering or operations advice/);
  const json = JSON.parse(report(run(parseArgs(['--example', '--ms', '1500'])), true));
  assert.equal(json.makespan, 38);
  assert.match(json.disclaimer, /not engineering/);
  assert.match(report(run(parseArgs(['--example', '--ms', '500'])), false, true), /Key: A=Bracket/);
  const csv = 'job,machine,time\nA,Saw,3\nA,Mill,2\nB,Mill,4\nB,Saw,1\n';
  assert.match(report(run(parseArgs(['shop.csv']), () => csv)), /Makespan 6 \(proved/);
  assert.match(report(run(parseArgs(['ft.txt']), () => '2 2\n0 3 1 2\n1 4 0 1\n')), /Makespan 6 \(proved/);
  assert.match(run(parseArgs([])).error, /Usage/);
  assert.match(run(parseArgs(['--frobnicate'])).error, /unknown option/);
  assert.match(run(parseArgs(['x.csv']), () => 'A, Saw, 3\nB, Mill, x\n').error, /could not read x\.csv/);
});
