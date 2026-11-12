// Run deploy/watch-metric.yml's own shell steps the way a GitHub-hosted runner does, without GitHub:
// a fresh clone of the repository per run (actions/checkout), the local `node` in place of
// actions/setup-node, each `run:` block under GitHub's default shell (bash --noprofile --norc -eo pipefail),
// `${{ vars.X }}` and `${{ secrets.X }}` substituted (empty when unset, as on GitHub), GITHUB_STEP_SUMMARY a
// file, and `if: always()` honoured. Used by watch-workflow.test.mjs to replay weeks of daily runs against a
// local bare repository standing in for the GitHub remote. It reads only the subset of YAML the workflow uses.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function parseSteps(yml) {
  const lines = yml.split('\n');
  const steps = [];
  let cur = null, block = null, blockIndent = 0, inEnv = false, envIndent = 0;
  for (const raw of lines) {
    if (block != null) {
      const ind = raw.match(/^ */)[0].length;
      if (raw.trim() === '' || ind >= blockIndent) { cur.run += (raw.trim() === '' ? '' : raw.slice(blockIndent)) + '\n'; continue; }
      block = null;
    }
    const m = raw.match(/^(\s*)- (\w[\w-]*):\s*(.*)$/);
    if (m && /^\s{6}$/.test(m[1])) { cur = { env: {} }; steps.push(cur); inEnv = false; setKey(m[2], m[3], m[1].length + 2); continue; }
    if (!cur) continue;
    const k = raw.match(/^(\s*)(\w[\w-]*):\s*(.*)$/);
    if (!k) continue;
    if (inEnv && k[1].length > envIndent) { cur.env[k[2]] = k[3].replace(/^['"]|['"]$/g, ''); continue; }
    inEnv = false;
    setKey(k[2], k[3], k[1].length);
  }
  function setKey(key, val, indent) {
    if (key === 'run' && val.trim() === '|') { cur.run = ''; block = true; blockIndent = indent + 2; }
    else if (key === 'run') cur.run = val + '\n';
    else if (key === 'env') { inEnv = true; envIndent = indent; }
    else cur[key] = val.replace(/^['"]|['"]$/g, '');
  }
  return steps;
}

const subst = (s, ctx) => s.replace(/\$\{\{\s*(vars|secrets)\.(\w+)\s*\}\}/g, (_, kind, name) => ctx[kind][name] ?? '');

// One scheduled run. `remote` is a bare repository; `beforeStep(name, workdir)` lets a test act between steps
// (for instance push a data commit while the run is in progress, as another job or a person can).
export function runWorkflow({ workflow, remote, vars = {}, secrets = {}, beforeStep = () => {}, env = {} }) {
  const steps = parseSteps(readFileSync(workflow, 'utf8'));
  const work = mkdtempSync(join(tmpdir(), 'wf-run-'));
  const repo = join(work, 'repo');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${remote}`, repo]);
  const summary = join(work, 'summary.md');
  writeFileSync(summary, '');
  const results = [];
  let failed = false;
  for (const step of steps) {
    if (step.uses) { results.push({ name: step.uses, skipped: false, code: 0 }); continue; }
    if (!step.run) continue;
    const cond = step.if || 'success()';
    if (failed && !/always\(\)/.test(cond)) { results.push({ name: step.name, skipped: true }); continue; }
    beforeStep(step.name, repo);
    const stepEnv = Object.fromEntries(Object.entries(step.env).map(([k, v]) => [k, subst(v, { vars, secrets })]));
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', subst(step.run, { vars, secrets })], {
      cwd: repo, encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_STEP_SUMMARY: summary, GIT_TERMINAL_PROMPT: '0', ...env, ...stepEnv },
    });
    results.push({ name: step.name, code: r.status, stdout: r.stdout, stderr: r.stderr });
    if (r.status !== 0) failed = true;
  }
  return { ok: !failed, steps: results, summary: readFileSync(summary, 'utf8'), repo };
}
