import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * `scripts/ci/sast_scan.py` is the SAST gate and `.gitea/workflows/security.yml`
 * is the only thing that runs it. This holds the two together, the same way
 * `ci-workflow-tooling.test.mjs` holds `scripts/test-ci.sh` to `ci-cd.yml`.
 *
 * Without it the failure is silent in both directions: a job that stops
 * invoking the scanner, or one that invokes it without installing semgrep and
 * bandit, leaves a "Security" check that is green because it did nothing. The
 * scanner itself refuses to run with a missing tool — these tests are what make
 * that refusal reach a person rather than just failing the job forever.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKFLOW = path.join(REPO_ROOT, '.gitea/workflows/security.yml');
const SCANNER = path.join(REPO_ROOT, 'scripts/ci/sast_scan.py');
const REQUIREMENTS = path.join(REPO_ROOT, 'requirements-sast.txt');
const BASELINE = path.join(REPO_ROOT, 'platform/sast-baseline.yaml');

const workflow = fs.readFileSync(WORKFLOW, 'utf8');
const requirements = fs.readFileSync(REQUIREMENTS, 'utf8');

test('SAST workflow - the security workflow runs the SAST gate', () => {
  assert.match(
    workflow,
    /python3 scripts\/ci\/sast_scan\.py/,
    'security.yml no longer invokes scripts/ci/sast_scan.py',
  );
});

test('SAST workflow - the job installs the tools the gate shells out to', () => {
  assert.match(
    workflow,
    /pip install .*-r requirements-sast\.txt/,
    'the SAST job does not install requirements-sast.txt',
  );
  for (const tool of ['semgrep', 'bandit']) {
    assert.match(
      requirements,
      new RegExp(`^${tool}[><=]`, 'm'),
      `requirements-sast.txt does not pin ${tool}, which sast_scan.py invokes`,
    );
  }
});

test('SAST workflow - a failed scan opens a remediation issue', () => {
  // The `log-failure` job is what turns a red scheduled run into something a
  // person sees. A new scanning job that is not in its `needs` fails silently
  // on the weekly cron, where nobody is watching a PR.
  const needs = workflow.match(/needs: \[([^\]]+)\]/);
  assert.ok(needs, 'no `needs:` list found on the log-failure job');
  assert.ok(
    needs[1].split(',').map((entry) => entry.trim()).includes('sast'),
    'the log-failure job does not depend on the sast job, so a failed SAST run logs nothing',
  );
  assert.match(
    workflow,
    /needs\.sast\.result == 'failure'/,
    'the log-failure condition does not test the sast job result',
  );
});

test('SAST workflow - the scan retains evidence', () => {
  // docs/ENGINEERING-ROADMAP.md: a control is not complete on configuration
  // alone, it has to retain execution evidence.
  assert.match(workflow, /name: sast-report/, 'the SAST report is not uploaded as an artifact');
  assert.match(
    workflow,
    /path: sast-report\.md\n\s+if-no-files-found: error/,
    'a SAST run that produced no report would still pass the upload step',
  );
});

test('SAST gate - the scanner and its register both exist', () => {
  assert.ok(fs.existsSync(SCANNER), 'scripts/ci/sast_scan.py is missing');
  assert.ok(fs.existsSync(BASELINE), 'platform/sast-baseline.yaml is missing');
});

test('SAST gate - the scanner fails closed rather than skipping a missing tool', () => {
  // The single most important property, and the one most easily lost in a
  // refactor: every other scanner-shaped defect this repository has found was a
  // tool that quietly did not run. Both call sites must raise.
  const source = fs.readFileSync(SCANNER, 'utf8');
  const raises = source.match(/is not installed/g) ?? [];
  assert.equal(
    raises.length,
    2,
    'expected both semgrep and bandit to raise when absent; a missing tool must never return zero findings',
  );
});
