import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTrustPolicy,
  analyzeTrustPolicyText,
  classifySubPattern,
  findClaimConditions,
  splitConditionOperator,
  widestSub,
  AWS_EXPECTED_AUD,
  GITHUB_OIDC_HOST,
} from './analyze.mjs';

const PROVIDER = `arn:aws:iam::123456789012:oidc-provider/${GITHUB_OIDC_HOST}`;

/** Builds a trust policy around one set of conditions, so each test states
 *  only the thing it is actually about. */
function policy(condition, overrides = {}) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: condition,
        ...overrides,
      },
    ],
  };
}

const GOOD_CONDITION = {
  StringEquals: {
    [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
    [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/main',
  },
};

function ids(report) {
  return report.findings.map((f) => f.id);
}

// --- the true negative, which matters as much as any finding ---------------

test('a correctly pinned trust policy produces no findings', () => {
  const report = analyzeTrustPolicy(policy(GOOD_CONDITION));
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.statementsAnalysed, 1);
});

test('an environment-pinned sub is also clean', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:environment:production',
      },
    }),
  );
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test('a tag-pinned sub is clean', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/tags/v1.2.3',
      },
    }),
  );
  assert.deepEqual(report.findings, []);
});

// --- the headline danger: no sub condition at all --------------------------

test('aud pinned but no sub condition is a danger, not a clean report', () => {
  const report = analyzeTrustPolicy(
    policy({ StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD } }),
  );
  assert.ok(ids(report).includes('no-sub-condition'));
  assert.equal(report.ok, false);
  const f = report.findings.find((x) => x.id === 'no-sub-condition');
  assert.equal(f.severity, 'danger');
  assert.match(f.detail, /any repository on GitHub/i);
});

test('a statement with no Condition block at all reports both claims missing', () => {
  const report = analyzeTrustPolicy(policy(undefined));
  assert.ok(ids(report).includes('no-sub-condition'));
  assert.ok(ids(report).includes('aud-missing'));
  assert.equal(report.dangerCount, 2);
});

// --- wildcard breadth ------------------------------------------------------

test('a sub wildcard spanning an owner is any-repository', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/*' },
    }),
  );
  assert.ok(ids(report).includes('sub-any-repository'));
  assert.equal(report.ok, false);
});

test('a bare * sub is any-repository', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: '*' },
    }),
  );
  assert.ok(ids(report).includes('sub-any-repository'));
});

test('repo pinned but ref wildcarded is any-ref, and the detail names pull_request', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:*' },
    }),
  );
  assert.ok(ids(report).includes('sub-any-ref'));
  const f = report.findings.find((x) => x.id === 'sub-any-ref');
  assert.equal(f.severity, 'danger');
  assert.match(f.detail, /pull_request/);
  assert.match(f.detail, /fork/i);
});

test('an explicit pull_request context is its own danger', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:pull_request',
      },
    }),
  );
  assert.ok(ids(report).includes('sub-pull-request-context'));
});

test('a wildcard inside one repo ref space is only a notice', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/release/*' },
    }),
  );
  assert.deepEqual(ids(report), ['sub-scoped-wildcard']);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.ok, true);
});

// --- the operator-semantics distinction this tool exists for ---------------

test('a wildcard under StringEquals fails closed and is a notice, not a wildcard danger', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:*',
      },
    }),
  );
  assert.ok(ids(report).includes('sub-literal-wildcard'));
  assert.ok(!ids(report).includes('sub-any-ref'), 'must not report a literal * as an open wildcard');
  assert.equal(report.dangerCount, 0);
  const f = report.findings.find((x) => x.id === 'sub-literal-wildcard');
  assert.match(f.detail, /fails closed/i);
});

test('StringLike with no wildcard behaves as an exact pin', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/main' },
    }),
  );
  assert.deepEqual(report.findings, []);
});

// --- multi-value: the widest entry governs ---------------------------------

test('one wide value among tightly pinned ones still opens the role', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringLike: {
        [`${GITHUB_OIDC_HOST}:sub`]: [
          'repo:my-org/my-repo:ref:refs/heads/main',
          'repo:my-org/my-repo:ref:refs/heads/staging',
          'repo:my-org/my-repo:environment:production',
          'repo:my-org/my-repo:*',
        ],
      },
    }),
  );
  assert.ok(ids(report).includes('sub-any-ref'), 'the widest entry must govern');
  assert.ok(ids(report).includes('sub-multiple-values'));
  const note = report.findings.find((x) => x.id === 'sub-multiple-values');
  assert.match(note.detail, /repo:my-org\/my-repo:\*/);
  assert.equal(report.ok, false);
});

test('a list of uniformly pinned values reports only the multi-value notice', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST}:sub`]: [
          'repo:my-org/my-repo:ref:refs/heads/main',
          'repo:my-org/my-repo:environment:production',
        ],
      },
    }),
  );
  assert.deepEqual(ids(report), ['sub-multiple-values']);
  assert.equal(report.dangerCount, 0);
});

test('ForAnyValue:StringLike is recognised as a pattern operator', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      'ForAnyValue:StringLike': { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/*' },
    }),
  );
  assert.ok(ids(report).includes('sub-any-repository'));
});

// --- aud handling ----------------------------------------------------------

test('a missing aud condition is reported', () => {
  const report = analyzeTrustPolicy(
    policy({ StringEquals: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/main' } }),
  );
  assert.ok(ids(report).includes('aud-missing'));
});

test('a wildcarded aud is a danger', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/main' },
      StringLike: { [`${GITHUB_OIDC_HOST}:aud`]: '*' },
    }),
  );
  assert.ok(ids(report).includes('aud-wildcard'));
});

test('an unexpected aud value is a notice', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        [`${GITHUB_OIDC_HOST}:aud`]: 'my-custom-audience',
        [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/main',
      },
    }),
  );
  assert.deepEqual(ids(report), ['aud-unexpected-value']);
  assert.equal(report.dangerCount, 0);
});

// --- negated operators invert the meaning of a pin -------------------------

test('StringNotEquals on sub is a danger, not a pin', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD },
      StringNotEquals: { [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/other-repo:ref:refs/heads/main' },
    }),
  );
  assert.ok(ids(report).includes('sub-negated-condition'));
  assert.equal(report.ok, false);
});

// --- statement selection ---------------------------------------------------

test('a Deny statement is skipped rather than reported as an exposure', () => {
  const report = analyzeTrustPolicy({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Deny',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
      },
      {
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: GOOD_CONDITION,
      },
    ],
  });
  assert.deepEqual(report.findings, []);
  assert.equal(report.statementsSkipped, 1);
  assert.equal(report.statementsAnalysed, 1);
});

test('a non-GitHub federated principal is skipped', () => {
  const report = analyzeTrustPolicy({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Federated: 'arn:aws:iam::123456789012:oidc-provider/accounts.google.com' },
        Action: 'sts:AssumeRoleWithWebIdentity',
      },
    ],
  });
  assert.equal(report.statementsSkipped, 1);
  assert.equal(report.statementsAnalysed, 0);
  assert.match(report.parseError, /nothing to check/i);
});

test('GitHub claim keys on a non-GitHub principal are a danger', () => {
  const report = analyzeTrustPolicy({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Federated: 'arn:aws:iam::123456789012:oidc-provider/accounts.google.com' },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: GOOD_CONDITION,
      },
    ],
  });
  assert.ok(ids(report).includes('claims-without-github-principal'));
});

test('a sts:TagSession-only statement is skipped', () => {
  const report = analyzeTrustPolicy({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:TagSession',
      },
    ],
  });
  assert.equal(report.statementsAnalysed, 0);
});

test('several statements are each analysed and labelled', () => {
  const report = analyzeTrustPolicy({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'Deploy',
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: GOOD_CONDITION,
      },
      {
        Sid: 'Legacy',
        Effect: 'Allow',
        Principal: { Federated: PROVIDER },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: { StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: AWS_EXPECTED_AUD } },
      },
    ],
  });
  assert.equal(report.statementsAnalysed, 2);
  const f = report.findings.find((x) => x.id === 'no-sub-condition');
  assert.match(f.title, /Statement 2 \(Legacy\)/);
});

test('an array Action containing the assume action is recognised', () => {
  const report = analyzeTrustPolicy(
    policy(GOOD_CONDITION, { Action: ['sts:TagSession', 'sts:AssumeRoleWithWebIdentity'] }),
  );
  assert.equal(report.statementsAnalysed, 1);
  assert.deepEqual(report.findings, []);
});

test('condition keys are matched case-insensitively', () => {
  // IAM condition keys are case-insensitive, so a policy that spells the
  // issuer host in mixed case is the same policy and must read as clean.
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        'Token.Actions.GithubUserContent.com:aud': AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST.toUpperCase()}:SUB`]: 'repo:my-org/my-repo:ref:refs/heads/main',
      },
    }),
  );
  assert.deepEqual(report.findings, []);
});

test('a genuinely misspelled issuer host is not matched, so the claim reads as absent', () => {
  const report = analyzeTrustPolicy(
    policy({
      StringEquals: {
        // `githubusercontents` — one character off, which is a real typo class
        // here and silently drops the condition rather than erroring.
        'token.actions.githubusercontents.com:aud': AWS_EXPECTED_AUD,
        [`${GITHUB_OIDC_HOST}:sub`]: 'repo:my-org/my-repo:ref:refs/heads/main',
      },
    }),
  );
  assert.ok(ids(report).includes('aud-missing'));
  assert.ok(!ids(report).includes('no-sub-condition'));
});

// --- malformed input -------------------------------------------------------

test('a non-object policy reports a parse error rather than throwing', () => {
  for (const bad of [null, 42, 'a string', []]) {
    const report = analyzeTrustPolicy(bad);
    assert.equal(report.ok, false);
    assert.ok(report.parseError);
  }
});

test('a policy with no Statement reports a helpful parse error', () => {
  const report = analyzeTrustPolicy({ Version: '2012-10-17' });
  assert.match(report.parseError, /permissions policy/);
});

test('analyzeTrustPolicyText turns a JSON syntax error into a report', () => {
  const report = analyzeTrustPolicyText('{ not json');
  assert.equal(report.ok, false);
  assert.match(report.parseError, /not valid JSON/);
  assert.deepEqual(report.findings, []);
});

test('analyzeTrustPolicyText parses and analyses valid JSON', () => {
  const report = analyzeTrustPolicyText(JSON.stringify(policy(GOOD_CONDITION)));
  assert.equal(report.ok, true);
});

// --- unit-level helpers ----------------------------------------------------

test('splitConditionOperator strips a set-operator prefix', () => {
  assert.deepEqual(splitConditionOperator('ForAnyValue:StringLike'), {
    setOperator: 'ForAnyValue',
    base: 'stringlike',
  });
  assert.deepEqual(splitConditionOperator('StringEquals'), { setOperator: null, base: 'stringequals' });
});

test('findClaimConditions collects the claim across operators', () => {
  const statement = {
    Condition: {
      StringEquals: { [`${GITHUB_OIDC_HOST}:sub`]: 'a' },
      StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: ['b', 'c'] },
    },
  };
  const found = findClaimConditions(statement, 'sub');
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.flatMap((f) => f.values).sort(),
    ['a', 'b', 'c'],
  );
});

test('classifySubPattern reports owner and repo for a pinned value', () => {
  const c = classifySubPattern('repo:my-org/my-repo:ref:refs/heads/main');
  assert.equal(c.breadth, 'pinned');
  assert.equal(c.owner, 'my-org');
  assert.equal(c.repo, 'my-repo');
  assert.equal(c.context, 'ref:refs/heads/main');
});

test('classifySubPattern flags a customised claim shape as unrecognised', () => {
  assert.equal(classifySubPattern('job_workflow_ref:my-org/my-repo/.github/workflows/x.yml@refs/heads/main').breadth, 'unrecognised');
});

test('widestSub picks the least restrictive classification', () => {
  const widest = widestSub([
    classifySubPattern('repo:o/r:ref:refs/heads/main'),
    classifySubPattern('repo:o/*'),
    classifySubPattern('repo:o/r:environment:prod'),
  ]);
  assert.equal(widest.breadth, 'any-repository');
});
