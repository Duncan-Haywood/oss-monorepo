# Branch Protection Drift Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/branch-protection-drift-check/>

Free browser + CLI tool that compares a GitHub repository's *actual*
branch protection settings against a *declared policy*, and flags every
rule that has drifted weaker than the policy requires — a review
requirement disabled for one hotfix and never re-enabled, force pushes
quietly turned back on, admin enforcement silently off.

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. Run the tests with:

```
node --test ventures/branch-protection-drift-check/*.test.mjs
```

## Why this exists

Branch protection lives in repository settings, not in a file under
version control. Changing it is a UI action or an API call, not a commit
— it produces no diff, no pull request, and no review. Nothing compares
the live settings to what your team actually agreed the policy should be,
because GitHub has no concept of a declared policy at all, only of
whatever the toggles currently say.

The ordinary way a rule weakens: someone disables required reviews or
turns on force pushes during an incident to ship a fix directly, meaning
to revert it afterward. The revert is easy to forget once the pressure is
off, and nothing on the settings page reminds anyone a rule is still off.
See [`why-branch-protection-drifts.html`](why-branch-protection-drifts.html)
for the full explanation.

## What it checks

Given the actual settings (paste the JSON from `gh api
repos/:owner/:repo/branches/:branch/protection`) and a declared policy
(JSON, or plain `key: value` lines), it compares:

- Required approving review count
- Require review from Code Owners
- Require approval of the most recent push
- Enforce for administrators
- Allow force pushes
- Allow deletions
- Require conversation resolution before merging
- Require linear history
- Require signed commits
- Require branches to be up to date before merging (`strict` status checks)
- Required status check names (a policy-declared context missing from
  actual is named individually)

A rule your policy does not mention is reported **not policed**, never
silently treated as a pass or a fail. A rule where the actual setting is
*more* protective than the policy requires is reported **stronger than
policy**, never as drift — drift specifically means weaker than declared.

## What it is not

Not a security audit, a compliance attestation, or a judgment on whether
your policy itself is any good. It answers one narrow, mechanical
question — does the live setting still match what you wrote down — and
it never reads your branch protection settings for you: you fetch and
paste both inputs yourself. It makes no network calls of its own anywhere
in the code.

## CLI

```
gh api repos/:owner/:repo/branches/:branch/protection > actual.json
node cli.mjs --actual actual.json --policy policy.txt
node cli.mjs --actual actual.json --policy policy.txt --format json
node cli.mjs --actual actual.json --policy policy.txt --fail-on-drift   # exit 2 on any drift
```

Zero dependencies — Node.js only, no packages to install. Wire the
`--fail-on-drift` form into CI right after a branch-protection or policy
change to catch drift before it is needed.
