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
 * Scope, stated plainly rather than implied: this checks npm-script deploys
 * (`npm run deploy`, `upload`, `cf:deploy`) and direct Wrangler/OpenNext
 * publishes. It does not police container/GitOps release chains such as
 * pairwise-ci.yml, which gate correctly through job `needs:` instead — a rule
 * broad enough to cover those would fire on jobs that are already safe.
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
