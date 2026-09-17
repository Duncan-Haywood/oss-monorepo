import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCheck } from './check.mjs';
import { AWS_EXPECTED_AUD, GITHUB_OIDC_HOST } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'check.mjs');
const PROVIDER = `arn:aws:iam::123456789012:oidc-provider/${GITHUB_OIDC_HOST}`;

function policyText(sub, extra = {}) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
            [`${GITHUB_OIDC_HOST}:sub`]: sub,
          },
          ...extra,
        },
      },
    ],
  });
}

/** Runs the CLI with stdin, returning stdout and the exit status rather than
 *  throwing, so the exit code is assertable. */
function runCli(args, input) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { input, encoding: 'utf8' });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('runCheck classifies a clean policy', () => {
  const report = runCheck(policyText('repo:my-org/my-repo:ref:refs/heads/main'));
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
});

test('runCheck reports a JSON syntax error rather than throwing', () => {
  const report = runCheck('{ nope');
  assert.equal(report.ok, false);
  assert.match(report.parseError, /not valid JSON/);
});

test('the CLI exits 0 and says nothing was found on a pinned policy', () => {
  const { status, stdout } = runCli(['-'], policyText('repo:my-org/my-repo:ref:refs/heads/main'));
  assert.equal(status, 0);
  assert.match(stdout, /None of the patterns this tool checks for were found/);
  assert.match(stdout, /Analysed 1 GitHub OIDC statement/);
});

test('the CLI exits 1 and names the finding on a wildcard policy', () => {
  const wide = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
          StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/*' },
        },
      },
    ],
  });
  const { status, stdout } = runCli(['-'], wide);
  assert.equal(status, 1);
  assert.match(stdout, /\[DANGER\]/);
  assert.match(stdout, /reaches past this repository/);
  assert.match(stdout, /1 danger, 0 notice\./);
});

test('the CLI emits machine-readable JSON with --json', () => {
  const { stdout } = runCli(['-', '--json'], policyText('repo:my-org/my-repo:*'));
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.findings.some((f) => f.id === 'sub-literal-wildcard'));
  // A literal `*` under StringEquals fails closed, so it is a notice and the
  // run still passes — the distinction this tool exists to draw, asserted
  // here at the exit-code boundary a CI gate would actually consume.
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dangerCount, 0);
});

test('the CLI exits 2 with no argument', () => {
  const { status, stderr } = runCli([], '');
  assert.equal(status, 2);
  assert.match(stderr, /Usage:/);
});

test('the CLI exits 2 on an unreadable path', () => {
  const { status, stderr } = runCli(['/nonexistent/trust-policy.json'], '');
  assert.equal(status, 2);
  assert.match(stderr, /Could not read/);
});

test('the CLI exits 2 on empty stdin', () => {
  const { status, stderr } = runCli(['-'], '   \n');
  assert.equal(status, 2);
  assert.match(stderr, /No policy content/);
});

test('the CLI explains itself when the policy federates nothing from GitHub', () => {
  const other = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'ec2.amazonaws.com' },
        Action: 'sts:AssumeRole',
      },
    ],
  });
  const { status, stdout } = runCli(['-'], other);
  assert.equal(status, 1);
  assert.match(stdout, /nothing to check/i);
});

test('CLI text output strips the backtick markers used by the browser report', () => {
  const { stdout } = runCli(['-'], policyText('repo:my-org/my-repo:pull_request'));
  assert.ok(!stdout.includes('`'), 'terminal output should not carry backticks');
});
