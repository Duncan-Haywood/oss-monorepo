// The self-deploy workflow (deploy/watch-metric.yml), run as a deployer's repository would run it: the folder
// make-watch-repo.sh writes, pushed to a bare repository standing in for GitHub, then one scheduled run per
// simulated day with a new row committed before each (deploy/run-workflow.mjs runs the workflow's own shell
// steps under GitHub's default bash flags). Nothing here talks to GitHub or a chat service; a local HTTP
// server stands in for the webhook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkflow, parseSteps } from './deploy/run-workflow.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
// 60 days of history around 100 orders a day (sd 5), then 20 more days; from day 70 the level is 120.
function series(n = 80, at = 70, seed = 7) { const g = gauss(lcg(seed)); return Array.from({ length: n }, (_, i) => 100 + (i >= at ? 20 : 0) + 5 * g()); }
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
const row = (i, v) => `${day(i)},${v.toFixed(1)}\n`;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

// A deployer's repository: the made folder with `history` rows, pushed to a bare "GitHub" remote. `dev` is the
// deployer's own clone, where another job (or the person) appends a row each day and pushes.
function deployerRepo(values, history) {
  const root = mkdtempSync(join(tmpdir(), 'watch-wf-'));
  const dev = join(root, 'dev'), remote = join(root, 'remote.git');
  execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
  writeFileSync(join(dev, 'data/metric.csv'), 'date,orders\n' + values.slice(0, history).map((v, i) => row(i, v)).join(''));
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dev, 'init', '-q', '-b', 'main');
  git(dev, 'add', '.');
  git(dev, 'commit', '-qm', 'watch a metric');
  git(dev, 'remote', 'add', 'origin', `file://${remote}`);
  git(dev, 'push', '-q', '-u', 'origin', 'main');
  const addRow = (i) => { git(dev, 'pull', '-q', '--rebase'); appendFileSync(join(dev, 'data/metric.csv'), row(i, values[i])); git(dev, 'commit', '-qam', `data ${day(i)}`); git(dev, 'push', '-q'); };
  return { dev, remote, workflow: join(dev, '.github/workflows/watch-metric.yml'), addRow };
}
const stateOnRemote = (r) => { git(r.dev, 'pull', '-q', '--rebase'); return JSON.parse(readFileSync(join(r.dev, 'watch-state.json'), 'utf8')); };

test('the workflow file has the steps the runner emulation expects', () => {
  const steps = parseSteps(readFileSync(new URL('./deploy/watch-metric.yml', import.meta.url), 'utf8'));
  assert.deepEqual(steps.map((s) => s.uses || s.name), ['actions/checkout@v4', 'actions/setup-node@v4', 'Check for a new change', 'Save what was reported']);
  assert.equal(steps[3].if, 'always()');
  assert.match(steps[2].run, /node watch\.mjs "\$METRIC_CSV" --state watch-state\.json/);
});

test('without a webhook: a baseline run, quiet days, one red run for the new level, then quiet again', () => {
  const values = series();
  const r = deployerRepo(values, 60);
  const vars = { METRIC_CSV: 'data/metric.csv' };
  const first = runWorkflow({ workflow: r.workflow, remote: r.remote, vars });
  assert.ok(first.ok, JSON.stringify(first.steps));
  assert.match(first.summary, /Changes on record: 0\. Points: 60\./, 'the baseline run reports into the job summary');
  assert.ok(stateOnRemote(r), 'the baseline state reached the remote');
  const red = [];
  for (let i = 60; i < values.length; i++) {
    r.addRow(i);
    const run = runWorkflow({ workflow: r.workflow, remote: r.remote, vars });
    if (!run.ok) red.push({ day: i, out: run.steps[2].stdout });
    assert.equal(run.steps[3].code, 0, `day ${i}: the state was saved even on a red run`);
  }
  assert.equal(red.length, 1, JSON.stringify(red));
  // dated within --tolerance (5) of the true day 70, reported after --confirm (5) points on its far side
  const dated = Math.round((Date.parse(red[0].out.match(/changed from (\d{4}-\d\d-\d\d)/)[1]) - Date.UTC(2026, 0, 1)) / 864e5);
  assert.ok(Math.abs(dated - 70) <= 5, `dated day ${dated}`);
  assert.equal(red[0].day, dated + 4, `reported on day ${red[0].day}, the 5th point from day ${dated}`);
  const log = git(r.dev, 'log', '--format=%s');
  assert.ok((log.match(/^watch: state after/gm) || []).length >= 1);
});

test('a data commit pushed while the run is in progress does not lose the state (push is retried on top)', () => {
  const values = series();
  const r = deployerRepo(values, 60);
  const vars = { METRIC_CSV: 'data/metric.csv' };
  assert.ok(runWorkflow({ workflow: r.workflow, remote: r.remote, vars }).ok);
  let i = 60;
  for (; i < 76; i++) r.addRow(i); // the step at 70 is now 6 points old
  // another job appends tomorrow's row between the check and the save
  const run = runWorkflow({ workflow: r.workflow, remote: r.remote, vars, beforeStep: (name) => { if (name === 'Save what was reported') r.addRow(i); } });
  assert.equal(run.ok, false, 'the new level turns the run red');
  assert.equal(run.steps[3].code, 0, run.steps[3].stderr);
  const st = stateOnRemote(r);
  assert.ok(JSON.stringify(st).includes(day(70).slice(0, 7)), 'the reported change is on record at the remote');
  // so the next run does not report it a second time
  r.addRow(i + 1);
  const next = runWorkflow({ workflow: r.workflow, remote: r.remote, vars });
  assert.ok(next.ok, next.steps[2].stdout);
});

// runWorkflow blocks this process while a run is going, so the stand-in webhook runs in a child process: it logs
// each POST to a file and answers with the status written in another file.
const HOOK_SERVER = `
const { createServer } = require('node:http'); const fs = require('node:fs'); const [log, status] = process.argv.slice(1);
const s = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
  const code = Number(fs.readFileSync(status, 'utf8')); fs.appendFileSync(log, JSON.stringify({ status: code, body: JSON.parse(b) }) + '\\n');
  res.writeHead(code); res.end(); }); });
s.listen(0, '127.0.0.1', () => console.log(s.address().port));`;

test('with a webhook: alerts go to chat once and the run stays green; a failing webhook retries the next day', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hook-'));
  const log = join(dir, 'posts.jsonl'), status = join(dir, 'status');
  writeFileSync(log, ''); writeFileSync(status, '500');
  const child = spawn(process.execPath, ['-e', HOOK_SERVER, log, status], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const port = await new Promise((ok) => child.stdout.once('data', (d) => ok(Number(String(d).trim()))));
    const posts = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const values = series();
    const r = deployerRepo(values, 60);
    const vars = { METRIC_CSV: 'data/metric.csv' };
    const secrets = { WATCH_WEBHOOK_URL: `http://127.0.0.1:${port}/hook` };
    assert.ok(runWorkflow({ workflow: r.workflow, remote: r.remote, vars, secrets }).ok);
    const results = [];
    for (let i = 60; i < values.length; i++) {
      r.addRow(i);
      if (posts().length) writeFileSync(status, '200'); // the chat service recovers the day after it first failed
      const run = runWorkflow({ workflow: r.workflow, remote: r.remote, vars, secrets });
      results.push({ day: i, ok: run.ok, err: run.steps[2].stderr });
    }
    const all = posts();
    assert.deepEqual(all.map((p) => p.status), [500, 200], 'one failed post, retried once the next day, delivered once');
    const red = results.filter((x) => !x.ok);
    assert.equal(red.length, 1, 'only the run whose webhook failed is red');
    assert.match(red[0].err, /webhook answered 500; the state was not saved/);
    assert.equal(all[1].body.text, all[1].body.content);
    const dated = (p) => p.body.text.match(/changed from (\S+):/)[1];
    assert.equal(dated(all[1]), dated(all[0]), 'the retry sends the same change, re-measured with one more point');
  } finally { child.kill(); }
});

test('an unset METRIC_CSV fails the first step with the instruction, and saves nothing', () => {
  const r = deployerRepo(series(), 60);
  const run = runWorkflow({ workflow: r.workflow, remote: r.remote });
  assert.equal(run.ok, false);
  assert.equal(run.steps[2].code, 2);
  assert.match(run.steps[2].stdout, /Set the METRIC_CSV variable/);
  assert.equal(run.steps[3].code, 0);
});
