import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.gitea/workflows');
const VERIFY_COMPONENT = path.join(REPO_ROOT, 'scripts/ci/verify-component.sh');

/**
 * A workflow that publishes to production must reach production through the
 * same gate everything else reaches it through.
 *
 * `.gitea/workflows/ai-first-markets-deploy.yml` restated the gate sequence
 * inline instead of calling `scripts/ci/verify-component.sh`, and the copy had
 * lost `npm test`. Typecheck, lint, build and cf:build ran on every push to
 * main; the venture's unit tests did not, so a failing test could not stop a
 * release. The CI workflow next to it triggers on the same paths and does run
 * them, but the deploy job declared no `needs:` on it, so the two raced.
 *
 * docs/CI-CD-ARCHITECTURE.md calls verify-component.sh "the shared, fail-closed
 * local/CI contract so YAML and developer checks do not diverge". Restating its
 * steps in a workflow is how they diverge, and the direction of the drift found
 * here is the usual one: the copy was weaker than the original, and it was the
 * copy that guarded production.
 *
 * Scope of the first rule, stated plainly rather than implied: it checks
 * npm-script deploys (`npm run deploy`, `upload`, `cf:deploy`) and direct
 * Wrangler/OpenNext publishes.
 *
 * It used to stop there, on the reasoning that container/GitOps chains such as
 * pairwise-ci.yml "gate correctly through job `needs:` instead". That was true
 * of pairwise-ci.yml and false as a general claim, and the exemption was the
 * hiding place. `.gitea/workflows/homepage-ci.yml` built an image and rolled it
 * onto the production cluster with no gate anywhere in the chain: its `container`
 * job declared no `needs:` at all, and `deploy` needed only `container`. The
 * homepage's suite was declared in platform/ci/src/pipeline.mjs, which ci-cd.yml
 * runs — a different workflow, triggered by the same push, with no ordering
 * relationship to this one. A red suite and a rollout raced. This was the only
 * venture in the portfolio with live customers.
 *
 * So the third rule below checks the closure rather than trusting the shape:
 * whatever mutates production must have a job that runs a test suite somewhere
 * in its transitive `needs:`. Infrastructure applies are deliberately out of
 * scope — terraform-apply.yml gates through plan review and a protected
 * environment, which is a different control, not a weaker one.
 */

const DEPLOY_COMMAND_PATTERN =
  /npm\s+run\s+(?:deploy|upload|cf:deploy)\b|(?:wrangler|opennextjs-cloudflare)\s+(?:deploy|upload)\b/;

/** Venture directory -> the verify-component.sh case that gates it. */
function sharedGateComponents() {
  const script = fs.readFileSync(VERIFY_COMPONENT, 'utf8');
  const arms = script.split(/^\s{2}([a-z0-9-]+)\)$/m);

  // split() yields [preamble, name, body, name, body, ...].
  const byVenture = new Map();
  for (let index = 1; index < arms.length; index += 2) {
    const component = arms[index];
    const body = arms[index + 1] || '';
    for (const match of body.matchAll(/ventures\/([a-z0-9-]+)/g)) {
      byVenture.set(match[1], component);
    }
  }
  return byVenture;
}

/** Venture directories a workflow operates in, from its working directories. */
function venturesTouchedBy(workflow) {
  const ventures = new Set();
  for (const match of workflow.matchAll(
    /working-directory:\s*\$?\{?\{?[^\n]*?ventures\/([a-z0-9-]+)/g
  )) {
    ventures.add(match[1]);
  }
  for (const match of workflow.matchAll(/--prefix\s+ventures\/([a-z0-9-]+)/g)) {
    ventures.add(match[1]);
  }
  return ventures;
}

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(WORKFLOWS_DIR, name));
}

test('Deploy Gate Contract - a venture deploy runs the shared fail-closed gate', () => {
  const gateFor = sharedGateComponents();
  assert.ok(gateFor.size > 0, 'no case arms parsed out of scripts/ci/verify-component.sh');

  const violations = [];
  for (const file of workflowFiles()) {
    const workflow = fs.readFileSync(file, 'utf8');
    const deploySteps = workflow
      .split('\n')
      .filter((line) => DEPLOY_COMMAND_PATTERN.test(line));
    if (deploySteps.length === 0) continue;

    for (const venture of venturesTouchedBy(workflow)) {
      const component = gateFor.get(venture);
      if (!component) continue;

      const invokesGate = new RegExp(
        `verify-component\\.sh\\s+${component}\\b`
      ).test(workflow);
      if (!invokesGate) {
        violations.push(
          `${path.basename(file)} deploys ventures/${venture} ` +
            `(${deploySteps[0].trim()}) without running ` +
            `scripts/ci/verify-component.sh ${component}`
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    'Production deploys must go through the shared gate, not a copy of it:\n' +
      violations.map((line) => `  - ${line}`).join('\n')
  );
});

/** A command that changes what production serves. */
const PRODUCTION_MUTATION = [
  /platform\/ci\/deploy-[a-z-]+\.sh/,
  /kubectl\b[^\n]*\b(?:apply|rollout|set image|patch)\b/,
  /argocd\s+app\s+sync\b/,
  /docker\s+push\b/,
  DEPLOY_COMMAND_PATTERN,
];

/** A command that can fail a release because the code is wrong. */
const RUNS_A_SUITE = [
  /verify-component\.sh\s+[a-z0-9-]+/,
  /npm\s+test\b/,
  /npm\s+run\s+test:[a-z-]+/,
  /(?:pnpm|corepack pnpm)\s+run\s+ci\b/,
  /\bpytest\b/,
];

/**
 * The `jobs:` mapping of a workflow as `{ name, body, needs }`.
 *
 * Read by indentation rather than with a YAML parser, which this repository
 * does not vendor. Job keys sit at two spaces under `jobs:` and every workflow
 * here is written that way; a file that is not would parse as zero jobs, so
 * the caller asserts that it found some.
 */
export function jobsOf(workflow) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];

  const jobs = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim()) break; // back out to a top-level key
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      current = { name: header[1], body: '' };
      jobs.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }

  for (const job of jobs) {
    const inline = job.body.match(/^\s{4}needs:\s*\[([^\]]*)\]/m);
    const scalar = job.body.match(/^\s{4}needs:\s*([A-Za-z0-9_-]+)\s*$/m);
    const block = job.body.match(/^\s{4}needs:\s*\n((?:\s{6}-\s*[A-Za-z0-9_-]+\s*\n)+)/m);
    job.needs = inline
      ? inline[1].split(',').map((n) => n.trim()).filter(Boolean)
      : scalar
        ? [scalar[1]]
        : block
          ? [...block[1].matchAll(/-\s*([A-Za-z0-9_-]+)/g)].map((m) => m[1])
          : [];
  }
  return jobs;
}

/** A job and everything it waits for, transitively. */
function needsClosure(job, byName, seen = new Set()) {
  if (seen.has(job.name)) return seen;
  seen.add(job.name);
  for (const name of job.needs) {
    const upstream = byName.get(name);
    if (upstream) needsClosure(upstream, byName, seen);
  }
  return seen;
}

test('Deploy Gate Contract - nothing reaches production ahead of a test suite', () => {
  const violations = [];
  let deployJobsSeen = 0;

  for (const file of workflowFiles()) {
    const name = path.basename(file);
    if (name === 'terraform-apply.yml') continue; // infrastructure; see the note above

    const workflow = fs.readFileSync(file, 'utf8');
    const jobs = jobsOf(workflow);
    if (jobs.length === 0) continue;
    const byName = new Map(jobs.map((job) => [job.name, job]));

    for (const job of jobs) {
      if (!PRODUCTION_MUTATION.some((pattern) => pattern.test(job.body))) continue;
      deployJobsSeen += 1;

      const closure = [...needsClosure(job, byName)].map((n) => byName.get(n));
      const gate = closure.find((upstream) =>
        RUNS_A_SUITE.some((pattern) => pattern.test(upstream.body))
      );
      if (!gate) {
        violations.push(
          `${name}: job "${job.name}" changes production, and neither it nor ` +
            `anything in its needs: (${job.needs.join(', ') || 'none'}) runs a test suite`
        );
      }
    }
  }

  assert.ok(deployJobsSeen > 0, 'no production-mutating job found; the detector has stopped detecting');
  assert.deepEqual(
    violations,
    [],
    'A release must wait for a gate that can fail it:\n' +
      violations.map((line) => `  - ${line}`).join('\n')
  );
});

test('Deploy Gate Contract - the needs-closure detector still detects', () => {
  // The rule above is a text scan over YAML. If jobsOf() silently stopped
  // finding jobs or needs:, every workflow would pass it vacuously — which is
  // exactly how the gap it closes went unnoticed. These are the two shapes.
  const ungated = [
    'jobs:',
    '  container:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: docker push example/image:sha',
    '  deploy:',
    '    needs: container',
    '    steps:',
    '      - run: platform/ci/deploy-homepage.sh',
    '',
  ].join('\n');

  const gated = ungated.replace(
    '  container:\n    runs-on: ubuntu-latest',
    '  verify:\n    steps:\n      - run: npm test\n  container:\n    needs: verify\n    runs-on: ubuntu-latest'
  );

  for (const [label, workflow, expected] of [
    ['ungated', ungated, false],
    ['gated', gated, true],
  ]) {
    const jobs = jobsOf(workflow);
    assert.ok(jobs.length >= 2, `${label}: jobsOf parsed ${jobs.length} jobs`);
    const byName = new Map(jobs.map((job) => [job.name, job]));
    const deployJob = byName.get('deploy');
    assert.deepEqual(deployJob.needs, ['container'], `${label}: needs: was not parsed`);

    const closure = [...needsClosure(deployJob, byName)].map((n) => byName.get(n));
    const gatedNow = closure.some((job) => RUNS_A_SUITE.some((p) => p.test(job.body)));
    assert.equal(gatedNow, expected, `${label}: the detector reported the wrong verdict`);
  }
});

test('Deploy Gate Contract - the shared gate runs the venture unit tests', () => {
  const script = fs.readFileSync(VERIFY_COMPONENT, 'utf8');
  const arms = script.split(/^\s{2}([a-z0-9-]+)\)$/m);

  // The rule above is only worth anything if the gate it points at tests. An
  // arm that typechecks, lints and builds without running the suite would let
  // the same hole reopen inside the file this test treats as authoritative.
  const untested = [];
  for (let index = 1; index < arms.length; index += 2) {
    const component = arms[index];
    const body = arms[index + 1] || '';
    if (component === '*') continue;
    if (!/npm\s+test\b|run\s+(?:test|ci)\b/.test(body)) {
      untested.push(component);
    }
  }

  assert.deepEqual(
    untested,
    [],
    `verify-component.sh arms that never run a test suite: ${untested.join(', ')}`
  );
});
