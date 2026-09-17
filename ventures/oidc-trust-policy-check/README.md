# oidc-trust-policy-check

Reads an AWS IAM role trust policy that federates GitHub Actions over OIDC and
reports whether its conditions actually restrict **which repository, branch or
environment** can assume the role.

Two surfaces, one classifier:

- **A browser page** (`index.html`) — paste the policy, get a report. It runs
  entirely in your browser and uploads nothing, which matters here because a
  trust policy names your AWS account, your role and your repositories.
- **A zero-dependency Node.js CLI** (`check.mjs`) — the same checks as a CI
  gate. It makes **no network request** and needs **no AWS credentials**: it
  reads a file and exits.

```
node check.mjs trust-policy.json
node check.mjs trust-policy.json --json

# straight from the AWS CLI:
aws iam get-role --role-name my-deploy-role \
  --query Role.AssumeRolePolicyDocument | node check.mjs -
```

Exit code `0` when at least one GitHub OIDC statement was analysed and no
danger-level finding is present, `1` when there is one (or when nothing could
be analysed), `2` on a usage error.

## Why this exists

Moving GitHub Actions from a long-lived `AWS_SECRET_ACCESS_KEY` to OIDC is the
right call, and it moves the entire security boundary into one document: the
role's trust policy. The ways that document goes wrong all look approximately
correct while you read it.

The value here is not spotting an asterisk — `grep` does that. It is knowing
what GitHub's `sub` claim contains and what IAM's condition operators do with
it:

- **`aud` restricts nothing about *who*.** Every AWS/GitHub OIDC integration
  uses the audience `sts.amazonaws.com`; it identifies the service, not the
  repository. A policy that pins `aud` and leaves `sub` unconstrained is
  assumable by a workflow in **any repository on GitHub**. Treating `aud` as
  isolation is the most expensive misreading of this policy shape.
- **`repo:owner/name:*` includes `pull_request`.** GitHub's `sub` is
  `repo:<owner>/<repo>:<context>`, and a trailing `*` matches every branch,
  tag, environment *and* the `pull_request` context — which GitHub issues to
  workflows triggered by a pull request opened from a fork, by someone with no
  write access.
- **`*` is a wildcard under `StringLike` and a literal under `StringEquals`.**
  `StringEquals` with `repo:org/name:*` asks for a subject whose last character
  is an asterisk. No token carries one, so the role cannot be assumed at all.
  That fails **closed** — a broken deploy, not an exposure — and this tool
  reports it as a notice rather than a wildcard danger, because a checker that
  called it critical would send you to fix the opposite of the real problem.
- **The widest value in a list governs.** IAM grants when *any* listed value
  matches, so four pinned branches plus one `repo:org/name:*` is as open as the
  wildcard alone. Reading the list top-down finds the four good rows first.
- **A negated operator does not pin anything.** `StringNotEquals` on `sub`
  excludes what it lists and admits everything else.

## What it checks

| id | severity | what it means |
| --- | --- | --- |
| `no-sub-condition` | danger | No condition on `sub`: any repository on GitHub can assume the role |
| `sub-any-repository` | danger | A wildcard reaching past one `owner/name` pair |
| `sub-any-ref` | danger | Repository pinned, context open — includes `pull_request`, so forks |
| `sub-pull-request-context` | danger | `sub` explicitly permits the `pull_request` context |
| `sub-negated-condition` | danger | `StringNot*` on `sub` excludes rather than pins |
| `claims-without-github-principal` | danger | GitHub claim keys on a non-GitHub federated principal, so they never apply |
| `aud-missing` | danger | No audience condition |
| `aud-wildcard` | danger | Audience matched with a wildcard |
| `sub-multiple-values` | notice | Several `sub` values; names the widest, which governs |
| `sub-scoped-wildcard` | notice | Wildcard confined to one repository's ref space — often deliberate |
| `sub-literal-wildcard` | notice | `*` under an equality operator: fails closed, role unassumable |
| `sub-unrecognised-shape` | notice | Not `repo:owner/name:context` — expected if your org customises the claim |
| `sub-unexpected-operator` | notice | An operator this tool does not model; check by hand |
| `aud-unexpected-value` | notice | Audience is not `sts.amazonaws.com` |

`Deny` statements, statements that do not allow `sts:AssumeRoleWithWebIdentity`,
and statements federating a non-GitHub identity provider are skipped and
counted, not reported as findings.

## What it does not check

This reads the trust policy only — the door, not the room behind it. It cannot
see:

- what permissions the role grants once assumed;
- who is able to push to a branch you have pinned (a role pinned to
  `refs/heads/main` in a repo where any contributor can push to `main` is
  reachable by any contributor);
- whether an environment you pinned actually has required reviewers;
- whether your organisation has customised the OIDC subject claim, which
  legitimately changes the shape of a valid `sub` value.

It also covers **AWS** trust policies specifically. GCP Workload Identity
Federation and Azure federated credentials express the same trust boundary in
different documents and are out of scope here.

Treat the output as evidence about these specific conditions, not a
determination that the setup is secure.

## Files

| file | what it is |
| --- | --- |
| `analyze.mjs` | the classifier — pure, no I/O, shared by both surfaces |
| `check.mjs` | the CLI |
| `usage.mjs` | anonymous local-only usage counting |
| `index.html` | the browser tool |
| `sub-claim-and-wildcard-traps.html` | the longer walkthrough of each trap |

## Tests

```
node --test ventures/oidc-trust-policy-check/*.test.mjs
```

72 assertions across the classifier, the CLI, the page and the usage module,
covering true positives *and* true negatives — a correctly pinned policy must
come back with zero findings, or the tool is noise.

## Privacy

The browser page parses everything locally and uploads nothing. The only thing
stored is an anonymous count of which features were used and the day, in your
own browser's `localStorage` — no policies, no account ids, no repository
names, no cookies, no analytics vendor. There is an opt-out checkbox on the
page, and `Do Not Track` / `Global Privacy Control` are honoured without one.

## Licence and support

MIT (see `LICENSE`). Free to use, with no paid tier and no feature gates.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.
