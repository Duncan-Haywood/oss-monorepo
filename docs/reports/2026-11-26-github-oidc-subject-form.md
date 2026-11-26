# GitHub OIDC subject form: keep name-only, pinned by the template

2026-11-26. For whoever next touches an AWS trust, `platform/aws/github/configure.sh`
or the payments resource control policy.

## What happened

The first AWS apply (`priv-aws-apply.yml`, run 45905276526, `workflow_dispatch`
on main) failed at `configure-aws-credentials` with
`AccessDenied ... AssumeRoleWithWebIdentity`. CloudTrail in the management
account showed this subject on the `aws-prod` job's token:

    repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:environment:aws-prod

Every trust in the tree expects the name-only form
`repo:Duncan-Haywood/oss-monorepo:environment:aws-prod`:

| Where | Subjects |
|---|---|
| `platform/aws/bootstrap/bootstrap.yaml` (github-plan, github-apply) | `repo:${GitHubRepository}:pull_request`, `:environment:${ApplyEnvironment}` |
| `stacks/github-oidc/account-roles` (every per-stack role, both repos) | `repo:<owner>/<repo>:pull_request`, `:environment:aws-prod` |
| `stacks/github-oidc` (findings reader) | `repo:<owner>/oss-monorepo:ref:refs/heads/main` |
| `stacks/llm` | `:ref:refs/heads/main`, `:environment:aws-llm` |
| `stacks/site`, `stacks/app-identity`, `stacks/cutover-access` | `:environment:<env>` |

The ID-qualified token matched none of them, so it was refused. The failure
was safe (it failed closed). The owner's interim fix, from CloudShell, set the
repository's OIDC subject template to `{"use_default": false,
"include_claim_keys": ["repo", "context"]}`. That template yields
`repo:<owner>/<name>:<context>`.

## Decision: keep name-only subjects, pin the template as code

Moving every trust to the ID-qualified form would be the stronger design: an
ID survives a rename and cannot be squatted. We still keep name-only for now,
for four reasons.

1. **The fix that is known to work.** The template `["repo","context"]` is the
   long-standing, documented way to get `repo:<owner>/<name>:<context>`. The
   ID-qualified form we have seen once, in one CloudTrail event. This session
   could not reach docs.github.com or github.blog (blocked by the network
   policy), so we cannot confirm how GitHub decides to emit it, whether a
   template can request it on purpose, or what it looks like for
   `pull_request` and `ref:` contexts. Writing every trust against a guessed
   format risks a second lockout, this time with the bootstrap's
   github-apply role, which only the owner can repair.
2. **The bootstrap is hand-applied.** The github-plan and github-apply trusts
   live in `bootstrap.yaml`, which the owner deploys from CloudShell. Any edit
   there is also a blocking `aws-guardrail-weakened` finding by design. Moving
   the form would take two owner actions in the right order (re-deploy the
   bootstrap, change the template) plus a gate exception, against one
   `configure.sh` run.
3. **The squatting risk is small here.** To impersonate
   `repo:Duncan-Haywood/oss-monorepo`, an attacker needs a repository of that
   name under the `Duncan-Haywood` account. That requires the owner to delete
   or rename the repository *and* the user name to be released and
   re-registered. That is a real risk, but a slow one the owner controls. A
   squatter could create its own `aws-prod` environment, so the environment
   limits do not help: do not rename or delete either repository, or the
   owner account, while name-only trusts exist.
4. **Drift fails closed.** If the template is ever reset, tokens go back to
   whatever GitHub's default is and the trusts refuse them, as on
   2026-11-26. Nothing opens up.

## The deny was the real hole

Allow-side trusts fail closed on an unexpected form. Deny-side patterns fail
open. `stacks/org/rcps.tf`'s `payments-no-public-repo` denied
`repo:Duncan-Haywood/oss-monorepo:*` only, so an ID-qualified token from the
public repository did not match it. The payments trusts' exact `StringEquals`
on `repo:Duncan-Haywood/private-monorepo:...` still refused such a token, but
the RCP exists for the day a trust is written wrongly. It now carries a
second Deny statement for:

- `repo:Duncan-Haywood@*/oss-monorepo@*:*`, the ID-qualified form by name;
- `repo:*/*@1315497858:*`, any subject carrying the public repository's ID,
  which still holds after a rename (`var.public_repository_id`).

Lesson for any future deny on `sub`: match every form GitHub can emit, not
only the form the trusts use.

## What is now code

- `platform/aws/github/configure.sh` pins `["repo","context"]` on
  oss-monorepo and private-monorepo (its payments roles in
  `stacks/github-oidc` trust it). It runs on every full run and on its own
  with `--oidc-sub`, reads the setting back, prints it, and exits non-zero if
  the template did not take.
- `platform/aws/tests/test_oidc_subject.py` fails if any trust subject in
  `bootstrap.yaml`, `stacks/` or `modules/` is written ID-qualified or in an
  unexpected shape, or if `configure.sh` stops pinning that template on both
  repositories.
- `docs/runbooks/aws-cutover.md`, owner step 3, names the template and the
  symptom of a missing one.

## Still to confirm

- Whether the interim template took effect: the next run of
  `priv-aws-apply.yml` (merging this PR under `platform/aws/` triggers one)
  either assumes `github-apply` or fails as before. If it still fails with
  `AccessDenied`, read the new `sub` in CloudTrail before changing anything.
- Whether private-monorepo already has the template set. Run
  `configure.sh --oidc-sub` once; it covers both repositories.

## When to switch to the ID form

Switch when GitHub's documentation, readable from a session, says how to
request the ID-qualified subject on purpose, and gives its exact format for
`pull_request`, `environment:` and `ref:` contexts. Then, in one PR:

- change `bootstrap.yaml`'s `GitHubRepository` pattern and both trusts. During
  the move, accept both forms (a list under `StringEquals`) so CI keeps
  working between the bootstrap re-deploy and the template change;
- update every tofu stack and its tests, and flip
  `test_oidc_subject.py`'s rule;
- change `OIDC_SUB_KEYS` in `configure.sh`;
- add the gate exception first, as a separate PR.

Then drop the name-only form from the trusts.
