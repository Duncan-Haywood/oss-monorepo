import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { areaOf, asksOn, collectEditions, editionDays, parseMessage, primaryArea, snapshotOf } from './collect.mjs';
import { composeBrief, composeShow, seed, within, wordCount, wordOfTheDay } from './compose.mjs';
import { renderEdition, renderFeed } from './render.mjs';

const NOW = Date.parse('2026-10-21T08:00:00Z');

function fixtureRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'daily-'));
  const run = (args, env = {}) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com', ...env } });
  run(['init', '-q', '-b', 'main']);
  const commit = (when, files, message) => {
    for (const [f, body] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), body);
    }
    run(['add', '-A']);
    run(['commit', '-q', '-m', message], { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
  };
  commit('2026-10-12T10:00:00Z', { 'README.md': 'x\n' }, 'init');
  commit('2026-10-19T09:00:00Z', { 'ventures/widget-calc/VENTURE.yaml': 'a: 1\n', 'ventures/widget-calc/index.html': '<p>\n' }, 'widget-calc: free widget calculator (#101)\n\n* widget-calc: free widget calculator\n\nA calculator for widget makers. It prices a batch.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nPrompt-Version: ventures/2');
  commit('2026-10-20T09:15:00Z', { 'ventures/widget-calc/index.html': '<p>2\n', 'prompts/runs/a.json': '{}\n' }, 'widget-calc: add a CSV export (#102)\n\n* widget-calc: add a CSV export\n\nExports every batch as CSV.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');
  commit('2026-10-20T09:40:00Z', { 'research/kettle-heat/README.md': '# k\n', 'research/kettle-heat/run.py': 'print(1)\n' }, 'research/kettle-heat: how fast does a kettle boil? (#103)\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>');
  commit('2026-10-20T15:00:00Z', { 'platform/pages/x.mjs': '1\n' }, 'Revert "pages: something" (#104)');
  commit('2026-10-20T16:00:00Z', { 'docs/posts/2026-10-20-a.md': '# a\n' }, 'writing: what the kettle study found (#105)');
  mkdirSync(path.join(dir, 'prompts', 'runs'), { recursive: true });
  writeFileSync(path.join(dir, 'prompts', 'runs', 'r1.json'), JSON.stringify({
    date: '2026-10-20', track: 'ventures', outcome: 'success', model: 'claude-opus-5-5',
    notes: 'Added a CSV export to widget-calc; the batch table had no download before this change.',
    doc_friction: [{ file: 'AGENTS.md', issue: 'Long.' }],
    usage: { measured_by: 'x', totals: { api_equivalent_usd: 1.25 }, time: { active_minutes: 10 } },
  }));
  return dir;
}

const repo = fixtureRepo();
const asks = [
  { id: 'payout-rail', action: 'Decide the binary. More text.', gates: 'revenue', opened: '2026-08-19', blocked_by: [] },
  { id: 'deploy-settings', action: '**GRANTED — measured.** Nothing to do.', opened: '2026-08-19' },
];
const stats = { generated_at: '2026-10-21T07:00:00Z', ci: { available: true, red_on_main_now: [{ workflow: 'Portfolio Pages', hours: 3 }], pass_share: 0.9, totals: { failed: 12 }, workflows: [{ name: 'Portfolio Pages', failed: 4 }], main_recovery_hours: { p50: 1.5 } }, github: { available: true, open_prs: { count: 5, drafts: 1, older_than_7d: 2, oldest_days: 9 }, pr_cycle_hours: { p50: 0.4 }, ci_pr: { first_try_green_share: 0.7 }, branches: { count: 40 } } };
const facts = collectEditions(repo, { now: NOW, days: 2, asks, stats });
const today = facts.editions[0];

test('editions are the complete UTC days before now, newest first', () => {
  assert.deepEqual(editionDays(NOW, 3), ['2026-10-20', '2026-10-19', '2026-10-18']);
  assert.deepEqual(facts.editions.map((e) => e.day), ['2026-10-20', '2026-10-19']);
});

test('a day counts its merges, areas, additions, reverts and lines from git', () => {
  assert.equal(today.merges, 4);
  assert.equal(today.products[0].name, 'widget-calc');
  assert.equal(today.research[0].name, 'kettle-heat');
  assert.deepEqual(today.new_research, ['kettle-heat']);
  assert.deepEqual(today.new_posts, ['2026-10-20-a']);
  assert.equal(today.reverts.length, 1);
  assert.equal(facts.editions[1].new_ventures[0], 'widget-calc');
  assert.deepEqual(Object.fromEntries(today.agents), { unattributed: 2, 'Claude Opus 5.5': 1, 'Claude Sonnet 5.5': 1 });
  assert.ok(today.lines_added >= 5);
  assert.equal(today.busiest_hour.hour, 9);
  assert.equal(today.baseline_merges_per_day, 0.1); // 10-13..10-19 hold one merge
});

test('run records for the day are summarised, cost as an equivalent', () => {
  assert.equal(today.runs.runs, 1);
  assert.equal(today.runs.api_usd, 1.25);
  assert.equal(today.runs.friction[0].file, 'AGENTS.md');
  assert.equal(facts.editions[1].runs.runs, 0);
});

test('only the newest edition carries the CI snapshot', () => {
  assert.equal(today.snapshot.red_on_main[0].workflow, 'Portfolio Pages');
  assert.equal(facts.editions[1].snapshot, null);
  assert.equal(snapshotOf({ ci: { available: false }, github: { available: false } }), null);
});

test('granted rows are dropped from the decision queue and the tool order is kept', () => {
  const a = asksOn(asks, '2026-10-20');
  assert.deepEqual(a.map((x) => x.id), ['payout-rail']);
  assert.equal(a[0].age_days, 62);
  assert.equal(asksOn(null, '2026-10-20'), null);
});

test('commit messages give title, PR, model, track and a first-sentence detail', () => {
  const m = parseMessage('widget-calc: thing (#12)', '* widget-calc: thing\n\nDoes a thing well. And more.\n\nPrompt-Version: ventures/2\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');
  assert.equal(m.title, 'widget-calc: thing');
  assert.equal(m.pr, 12);
  assert.equal(m.agent, 'Claude Opus 5.5');
  assert.equal(m.track, 'ventures');
  assert.equal(m.detail, 'Does a thing well.');
  const merge = parseMessage('Merge pull request #7 from o/branch', 'Real title\n');
  assert.equal(merge.pr, 7);
  assert.equal(merge.title, 'Real title');
  assert.equal(parseMessage('x', 'It wires this in:\n- a').detail, null);
});

test('files map to areas; noise and catalogue-wide sweeps are handled', () => {
  assert.deepEqual(areaOf('ventures/a/b.js'), { kind: 'product', name: 'a' });
  assert.deepEqual(areaOf('research/_homepage/x'), { kind: 'process', name: 'research' });
  assert.equal(areaOf('docs/posts/a.md').kind, 'writing');
  assert.equal(primaryArea([{ path: 'prompts/runs/x.json' }, { path: 'platform/pages/a.mjs' }]).name, 'pages');
  assert.equal(primaryArea(['a', 'b', 'c', 'd'].map((v) => ({ path: `ventures/${v}/index.html` }))).name, 'several products at once');
});

test('the brief covers health, decisions, areas, fleet and a watch list, within fifteen-ish minutes', () => {
  const b = composeBrief(today);
  const ids = b.sections.map((s) => s.id);
  for (const id of ['bottom-line', 'health', 'decisions', 'products', 'research', 'writing', 'platform', 'fleet', 'watch']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(b);
  assert.match(text, /Portfolio Pages, red for 3 hours/);
  assert.match(text, /payout-rail, waiting 62 days/);
  assert.doesNotMatch(text, /deploy-settings/);
  assert.match(text, /\$1\.25 at API list prices, an equivalent rather than a charge/);
  assert.ok(b.words <= 2400 && b.minutes >= 1);
  const archived = composeBrief(facts.editions[1]);
  assert.match(JSON.stringify(archived), /from the archive/);
});

test('a huge day is trimmed to the word budget', () => {
  const big = structuredClone(today);
  const m = today.products[0].merges[0];
  big.products = Array.from({ length: 60 }, (_, i) => ({ name: `p${i}`, merges: Array.from({ length: 10 }, (_, j) => ({ ...m, title: `p${i}: change number ${j} with a fairly long description of what it does`, detail: 'A detail sentence that goes on for a while to use up words.' })) }));
  assert.ok(composeBrief(big).words <= 2400);
});

test('the show quotes real facts and is stable for a day', () => {
  const s = composeShow(today);
  const text = JSON.stringify(s);
  assert.match(text, /merged 4 pull requests/);
  assert.match(text, /Plot twist: 1 change got reverted/);
  assert.deepEqual(composeShow(today), s);
  assert.notEqual(seed('2026-10-20:open'), seed('2026-10-21:open'));
  assert.deepEqual(wordOfTheDay(['kettle boils fast', 'kettle heat', 'other']), { word: 'kettle', n: 2 });
  assert.equal(wordOfTheDay(['one title only']), null);
  assert.equal(within('research/kettle-heat: how fast', 'kettle-heat'), 'How fast');
  assert.equal(wordCount({ sections: [{ heading: 'A b', blocks: [{ text: 'c d e' }, { items: [{ text: 'f' }] }] }] }), 6);
});

test('pages render the script, the listen player, PR links and the disclaimer', () => {
  const b = composeBrief(today);
  const html = renderEdition(b, { toDaily: '', toRoot: '../../', archive: ['2026-10-20', '2026-10-19'], latest: true, generatedAt: facts.generated_at, baseUrl: 'https://example.org/site/' });
  assert.match(html, /<title>Engineering brief, Tuesday,? 20 October 2026<\/title>/);
  assert.match(html, /id="listen" data-kind="brief"/);
  assert.match(html, /speechSynthesis/);
  assert.match(html, /href="https:\/\/github.com\/Duncan-Haywood\/oss-monorepo\/pull\/102"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.org\/site\/dev\/daily\/2026-10-20\/">/);
  assert.match(html, /not by a person or a language model/);
  assert.match(html, /data-pf-slug="dev-daily-brief"/);
  assert.match(html, /href="2026-10-19\/"/);
  const feed = renderFeed([{ brief: b, show: composeShow(today) }], { baseUrl: 'https://example.org/site', generatedAt: facts.generated_at });
  assert.equal((feed.match(/<entry>/g) ?? []).length, 2);
  assert.match(feed, /https:\/\/example.org\/site\/dev\/daily\/2026-10-20\/show\//);
});
