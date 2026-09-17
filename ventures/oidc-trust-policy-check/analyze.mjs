// Classifies an AWS IAM role trust policy that federates GitHub Actions over
// OIDC into named misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs) and the browser page (index.html) import, so the classification
// logic exists exactly once. A trust policy carries an AWS account id, so the
// browser half never transmits it anywhere; everything below runs on the
// visitor's own machine.
//
// The value here isn't spotting an asterisk -- grep does that. It's knowing
// what GitHub's `sub` claim actually contains and what IAM's condition
// operators actually do with it, which is where the real-world failures live:
//
//   * **`aud` restricts nothing about *who*.** Every AWS/GitHub OIDC
//     integration on the planet uses the audience `sts.amazonaws.com`, so a
//     policy that pins `aud` and leaves `sub` unconstrained is assumable by
//     any repository on GitHub. Pinning `aud` is necessary and is not
//     isolation, and treating it as isolation is the single most expensive
//     misreading of this policy shape.
//   * **`*` is a wildcard under `StringLike` and a literal under
//     `StringEquals`.** `StringEquals` with `repo:org/name:*` does not mean
//     "any ref" -- it means "a sub claim whose final character is literally
//     an asterisk", which no GitHub token ever carries. That policy fails
//     *closed*: it is not an exposure, it is a role nobody can assume, and a
//     checker that reports it as a wildcard exposure sends its reader to fix
//     the wrong thing.
//   * **The widest value in a multi-value condition governs.** IAM treats a
//     list of `sub` values as "any of these match". A list of four tightly
//     pinned branches plus one `repo:org/name:*` is exactly as open as the
//     `*` alone, and reading the list top-down finds four good rows first.
//   * **`repo:org/name:*` includes `pull_request`.** GitHub issues that
//     context to workflows triggered by a pull request, including one opened
//     from a fork by someone with no write access to the repository. A role
//     scoped that way is assumable by a stranger's pull request.
//
// GitHub's `sub` claim, in its default form, is:
//
//     repo:<owner>/<repo>:<context>
//
// where `<context>` is one of `ref:refs/heads/<branch>`,
// `ref:refs/tags/<tag>`, `environment:<name>`, `pull_request`, or
// `job_workflow_ref:<...>`. Organisations can customise which claims are
// included, so a policy written against a customised issuer may legitimately
// look different -- `unrecognisedSubShape` below reports that rather than
// guessing.

/** GitHub's OIDC issuer host, as it appears in the federated principal ARN. */
export const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

/** The audience AWS expects for `sts:AssumeRoleWithWebIdentity`. */
export const AWS_EXPECTED_AUD = 'sts.amazonaws.com';

const ASSUME_ACTION = 'sts:assumerolewithwebidentity';

/** IAM condition operators whose values are glob patterns (`*`, `?`). */
const PATTERN_OPERATORS = new Set(['stringlike', 'stringnotlike']);

/** Operators that compare literally -- a `*` in the value is just a `*`. */
const LITERAL_OPERATORS = new Set([
  'stringequals',
  'stringnotequals',
  'stringequalsignorecase',
  'stringnotequalsignorecase',
]);

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function hasGlob(value) {
  return typeof value === 'string' && /[*?]/.test(value);
}

/**
 * Strips an IAM set-operator prefix (`ForAnyValue:`, `ForAllValues:`) and
 * lowercases what is left, so `ForAnyValue:StringLike` and `StringLike` are
 * recognised as the same comparison.
 *
 * @returns {{setOperator: string|null, base: string}}
 */
export function splitConditionOperator(operator) {
  const raw = typeof operator === 'string' ? operator : '';
  const idx = raw.indexOf(':');
  if (idx === -1) return { setOperator: null, base: lower(raw) };
  return { setOperator: raw.slice(0, idx), base: lower(raw.slice(idx + 1)) };
}

/**
 * Finds every condition entry in a statement whose key is the given GitHub
 * claim (`sub`, `aud`, ...), regardless of which operator carries it. IAM
 * condition keys are case-insensitive, so the lookup is too.
 *
 * @returns {{operator: string, base: string, setOperator: string|null,
 *   key: string, values: string[]}[]}
 */
export function findClaimConditions(statement, claim) {
  const condition = statement?.Condition;
  if (!condition || typeof condition !== 'object') return [];
  const wanted = `${GITHUB_OIDC_HOST}:${claim}`.toLowerCase();
  const found = [];
  for (const [operator, entries] of Object.entries(condition)) {
    if (!entries || typeof entries !== 'object') continue;
    for (const [key, rawValues] of Object.entries(entries)) {
      if (lower(key) !== wanted) continue;
      const { setOperator, base } = splitConditionOperator(operator);
      found.push({
        operator,
        base,
        setOperator,
        key,
        values: asArray(rawValues).filter((v) => typeof v === 'string'),
      });
    }
  }
  return found;
}

/**
 * Classifies one `sub` pattern by how much of GitHub it lets through.
 *
 * `literal` selects `StringEquals` semantics, where `*` and `?` are ordinary
 * characters rather than wildcards -- the distinction this whole tool exists
 * to get right.
 *
 * Breadth, widest first:
 *   `any-repository`    any repo on GitHub, or any repo under some owner
 *   `any-ref`           one repo, but any branch/tag/environment/pull request
 *   `pull-request`      one repo, the pull_request context (forks included)
 *   `scoped-wildcard`   one repo, a wildcard inside one ref/environment space
 *   `pinned`            one repo, one fully-specified context
 *   `never-matches`     a literal `*`/`?` under an equality operator
 *   `unrecognised`      not in GitHub's documented `repo:owner/name:...` shape
 *
 * @returns {{breadth: string, pattern: string, owner: string|null,
 *   repo: string|null, context: string|null}}
 */
export function classifySubPattern(pattern, { literal = false } = {}) {
  const value = typeof pattern === 'string' ? pattern.trim() : '';
  const base = { pattern: value, owner: null, repo: null, context: null };

  if (value === '') return { ...base, breadth: 'unrecognised' };

  // Under an equality operator a glob character is data, not a pattern, so the
  // condition can never be satisfied by a real token. That fails closed.
  if (literal && hasGlob(value)) return { ...base, breadth: 'never-matches' };

  if (!literal && (value === '*' || value === 'repo:*')) {
    return { ...base, breadth: 'any-repository' };
  }

  const parts = value.split(':');
  if (lower(parts[0]) !== 'repo' || parts.length < 2) {
    return { ...base, breadth: 'unrecognised' };
  }

  const slug = parts[1];
  const context = parts.length > 2 ? parts.slice(2).join(':') : null;
  const slash = slug.indexOf('/');
  const owner = slash === -1 ? slug : slug.slice(0, slash);
  const repo = slash === -1 ? null : slug.slice(slash + 1);

  const enriched = { ...base, owner, repo, context };

  if (!literal && (hasGlob(owner) || repo === null || hasGlob(repo))) {
    // A wildcard anywhere in `owner/repo` -- or no `/` at all, which makes the
    // whole slug a pattern -- reaches past this one repository.
    return { ...enriched, breadth: 'any-repository' };
  }

  if (context === null) {
    // `repo:owner/name` with nothing after it matches no real token (every
    // GitHub sub carries a context) but also pins nothing; treat as unpinned.
    return { ...enriched, breadth: 'any-ref' };
  }

  if (!literal && (context === '*' || context === '')) {
    return { ...enriched, breadth: 'any-ref' };
  }

  if (lower(context) === 'pull_request') {
    return { ...enriched, breadth: 'pull-request' };
  }

  if (!literal && hasGlob(context)) {
    return { ...enriched, breadth: 'scoped-wildcard' };
  }

  return { ...enriched, breadth: 'pinned' };
}

/** Widest-first ordering: IAM grants if ANY value matches, so the widest
 *  value in a list is what the statement actually permits. */
const BREADTH_RANK = {
  'any-repository': 0,
  'any-ref': 1,
  'pull-request': 2,
  'scoped-wildcard': 3,
  pinned: 4,
  unrecognised: 5,
  'never-matches': 6,
};

/** Picks the governing (widest) classification from a list. */
export function widestSub(classifications) {
  let widest = null;
  for (const c of classifications) {
    if (widest === null || BREADTH_RANK[c.breadth] < BREADTH_RANK[widest.breadth]) widest = c;
  }
  return widest;
}

function principalMentionsGitHub(statement) {
  const principal = statement?.Principal;
  if (!principal || typeof principal !== 'object') return false;
  return asArray(principal.Federated).some((arn) => lower(arn).includes(GITHUB_OIDC_HOST));
}

function statementAllowsWebIdentity(statement) {
  return asArray(statement?.Action).some((a) => lower(a) === ASSUME_ACTION);
}

function finding(id, severity, title, detail, evidence) {
  return { id, severity, title, detail, evidence };
}

/**
 * @param {unknown} policy - a parsed IAM trust policy document
 * @returns {{ok: boolean, findings: object[], dangerCount: number,
 *   noticeCount: number, statementsAnalysed: number, statementsSkipped: number,
 *   parseError: string|null}}
 */
export function analyzeTrustPolicy(policy) {
  const findings = [];
  let analysed = 0;
  let skipped = 0;

  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      ok: false,
      findings,
      dangerCount: 0,
      noticeCount: 0,
      statementsAnalysed: 0,
      statementsSkipped: 0,
      parseError: 'The policy must be a JSON object with a Statement array.',
    };
  }

  const statements = asArray(policy.Statement);
  if (statements.length === 0) {
    return {
      ok: false,
      findings,
      dangerCount: 0,
      noticeCount: 0,
      statementsAnalysed: 0,
      statementsSkipped: 0,
      parseError: 'No Statement entries found. Paste the role’s trust policy, not its permissions policy.',
    };
  }

  statements.forEach((statement, index) => {
    const label = `Statement ${index + 1}${statement?.Sid ? ` (${statement.Sid})` : ''}`;

    // Only Allow statements grant anything; a Deny is a guardrail, not an
    // exposure, and reporting one as a finding would invert its meaning.
    if (lower(statement?.Effect) !== 'allow') {
      skipped += 1;
      return;
    }

    const isGitHubPrincipal = principalMentionsGitHub(statement);
    const subConditions = findClaimConditions(statement, 'sub');
    const audConditions = findClaimConditions(statement, 'aud');

    // A statement that federates some other identity provider is out of scope
    // rather than a defect -- unless it carries GitHub's own claim keys, which
    // means the conditions can never apply to the principal being trusted.
    if (!isGitHubPrincipal) {
      if (subConditions.length > 0 || audConditions.length > 0) {
        analysed += 1;
        findings.push(
          finding(
            'claims-without-github-principal',
            'danger',
            `${label}: GitHub OIDC conditions on a non-GitHub principal`,
            'The statement conditions on GitHub’s claim keys but its Principal.Federated is not ' +
              'GitHub’s OIDC provider, so those conditions never apply to the identity actually ' +
              'being trusted. Point the federated principal at the GitHub OIDC provider ARN, or move ' +
              'these conditions to the statement that does.',
            JSON.stringify(statement.Principal ?? null),
          ),
        );
      } else {
        skipped += 1;
      }
      return;
    }

    if (!statementAllowsWebIdentity(statement)) {
      skipped += 1;
      return;
    }

    analysed += 1;

    // --- the `sub` claim: the only thing that says WHICH repository ---------
    if (subConditions.length === 0) {
      findings.push(
        finding(
          'no-sub-condition',
          'danger',
          `${label}: no condition on the sub claim`,
          'Nothing in this statement restricts which repository, branch or environment may assume ' +
            'the role. Any GitHub Actions workflow, in any repository on GitHub, can request a token ' +
            'for this role. Add a StringEquals condition on ' +
            `\`${GITHUB_OIDC_HOST}:sub\` naming the exact repo and ref, for example ` +
            '`repo:my-org/my-repo:ref:refs/heads/main`.',
          'Condition: ' + JSON.stringify(statement.Condition ?? null),
        ),
      );
    }

    for (const condition of subConditions) {
      const literal = LITERAL_OPERATORS.has(condition.base);
      const isPattern = PATTERN_OPERATORS.has(condition.base);

      // A negated operator ("not like", "not equals") reads as an exclusion.
      // Anything the statement does not exclude is still allowed, so treating
      // it as a pin would be exactly backwards.
      if (condition.base.includes('not')) {
        findings.push(
          finding(
            'sub-negated-condition',
            'danger',
            `${label}: sub is constrained with a negated operator`,
            `\`${condition.operator}\` excludes the values it lists and permits everything else, so ` +
              'this does not pin the role to a repository. Use StringEquals with the exact sub value ' +
              'instead.',
            `${condition.operator} ${condition.key}: ${JSON.stringify(condition.values)}`,
          ),
        );
        continue;
      }

      if (!literal && !isPattern) {
        findings.push(
          finding(
            'sub-unexpected-operator',
            'notice',
            `${label}: sub compared with ${condition.operator}`,
            'This tool understands the string operators IAM documents for this claim ' +
              '(StringEquals, StringLike and their case-insensitive forms). Check by hand that ' +
              `\`${condition.operator}\` constrains the sub claim the way you intend.`,
            `${condition.operator} ${condition.key}: ${JSON.stringify(condition.values)}`,
          ),
        );
        continue;
      }

      const classifications = condition.values.map((v) => classifySubPattern(v, { literal }));
      const governing = widestSub(classifications);
      if (!governing) continue;

      if (classifications.length > 1) {
        findings.push(
          finding(
            'sub-multiple-values',
            'notice',
            `${label}: sub accepts ${classifications.length} values — the widest one governs`,
            'IAM grants when ANY listed value matches, so the least restrictive entry decides what ' +
              `this statement permits. Here that is \`${governing.pattern}\`. Read the list for the ` +
              'widest row, not the first one.',
            `${condition.operator} ${condition.key}: ${JSON.stringify(condition.values)}`,
          ),
        );
      }

      const evidence = `${condition.operator} ${condition.key}: ${JSON.stringify(governing.pattern)}`;

      if (governing.breadth === 'any-repository') {
        findings.push(
          finding(
            'sub-any-repository',
            'danger',
            `${label}: sub wildcard reaches past this repository`,
            `\`${governing.pattern}\` matches repositories other than one specific ` +
              'owner/name pair. Any repository it matches — including one created later, or one ' +
              'an attacker can get a workflow into — can assume this role. Pin the owner and the ' +
              'repository name exactly.',
            evidence,
          ),
        );
      } else if (governing.breadth === 'any-ref') {
        findings.push(
          finding(
            'sub-any-ref',
            'danger',
            `${label}: sub allows any ref in the repository`,
            `\`${governing.pattern}\` pins the repository but not the context, so every branch, ` +
              'every tag, every environment **and the `pull_request` context** can assume the role. ' +
              'GitHub issues that context to pull requests opened from forks, so this is assumable ' +
              'by someone with no write access to the repository. Pin the ref, for example ' +
              '`repo:owner/name:ref:refs/heads/main`, or an environment.',
            evidence,
          ),
        );
      } else if (governing.breadth === 'pull-request') {
        findings.push(
          finding(
            'sub-pull-request-context',
            'danger',
            `${label}: sub permits the pull_request context`,
            `\`${governing.pattern}\` grants the role to workflows running in the pull_request ` +
              'context. On a public repository, or any repository that accepts forks, that includes ' +
              'pull requests opened by people with no write access. Unless this role is deliberately ' +
              'scoped to untrusted PR builds, pin a branch or an environment instead.',
            evidence,
          ),
        );
      } else if (governing.breadth === 'scoped-wildcard') {
        findings.push(
          finding(
            'sub-scoped-wildcard',
            'notice',
            `${label}: sub uses a wildcard inside one repository`,
            `\`${governing.pattern}\` keeps the role inside a single repository but still matches a ` +
              'range of refs. That is often deliberate (a release-branch prefix, say). Confirm the ' +
              'pattern cannot also match a ref an untrusted contributor can create.',
            evidence,
          ),
        );
      } else if (governing.breadth === 'never-matches') {
        findings.push(
          finding(
            'sub-literal-wildcard',
            'notice',
            `${label}: a wildcard under ${condition.operator} is matched literally`,
            `\`${condition.operator}\` compares the value character for character, so the \`*\` in ` +
              `\`${governing.pattern}\` is an ordinary character rather than a wildcard. No GitHub ` +
              'token carries a literal asterisk, so this statement grants nothing and the role ' +
              'cannot be assumed. This fails closed — it is a broken deploy, not an exposure. ' +
              'Use StringLike if you meant a pattern, or StringEquals with the exact sub value if ' +
              'you meant a pin.',
            evidence,
          ),
        );
      } else if (governing.breadth === 'unrecognised') {
        findings.push(
          finding(
            'sub-unrecognised-shape',
            'notice',
            `${label}: sub value is not in GitHub’s documented shape`,
            `\`${governing.pattern}\` does not look like \`repo:owner/name:context\`. That is ` +
              'expected if your organisation customises the OIDC subject claim; otherwise the ' +
              'condition will never match a real token. This tool cannot judge breadth for a ' +
              'customised claim — check it by hand.',
            evidence,
          ),
        );
      }
    }

    // --- the `aud` claim: necessary, and not isolation ----------------------
    if (audConditions.length === 0) {
      findings.push(
        finding(
          'aud-missing',
          'danger',
          `${label}: no condition on the aud claim`,
          'Without an audience condition the role accepts a GitHub token minted for a different ' +
            'audience, which widens what an attacker who can cause a token to be issued elsewhere ' +
            `can replay here. Add \`StringEquals\` on \`${GITHUB_OIDC_HOST}:aud\` with the value ` +
            `\`${AWS_EXPECTED_AUD}\`.`,
          'Condition: ' + JSON.stringify(statement.Condition ?? null),
        ),
      );
    } else {
      for (const condition of audConditions) {
        const literal = LITERAL_OPERATORS.has(condition.base);
        if (!literal && condition.values.some((v) => hasGlob(v))) {
          findings.push(
            finding(
              'aud-wildcard',
              'danger',
              `${label}: aud is matched with a wildcard`,
              `\`${condition.operator}\` with a wildcard accepts audiences other than ` +
                `\`${AWS_EXPECTED_AUD}\`. Pin the audience exactly with StringEquals.`,
              `${condition.operator} ${condition.key}: ${JSON.stringify(condition.values)}`,
            ),
          );
        } else if (!condition.values.some((v) => v === AWS_EXPECTED_AUD)) {
          findings.push(
            finding(
              'aud-unexpected-value',
              'notice',
              `${label}: aud is not ${AWS_EXPECTED_AUD}`,
              `AWS expects the audience \`${AWS_EXPECTED_AUD}\` for ` +
                'sts:AssumeRoleWithWebIdentity. A different value is correct only if your workflow ' +
                'sets a custom audience explicitly; otherwise the role cannot be assumed.',
              `${condition.operator} ${condition.key}: ${JSON.stringify(condition.values)}`,
            ),
          );
        }
      }
    }
  });

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    ok: dangerCount === 0 && analysed > 0,
    findings,
    dangerCount,
    noticeCount,
    statementsAnalysed: analysed,
    statementsSkipped: skipped,
    parseError:
      analysed === 0
        ? 'No statement in this policy federates GitHub Actions over OIDC, so there was nothing to check.'
        : null,
  };
}

/** Parses JSON and analyses it in one step, turning a syntax error into the
 *  same report shape rather than an exception. */
export function analyzeTrustPolicyText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      findings: [],
      dangerCount: 0,
      noticeCount: 0,
      statementsAnalysed: 0,
      statementsSkipped: 0,
      parseError: `That is not valid JSON: ${err.message}`,
    };
  }
  return analyzeTrustPolicy(parsed);
}
