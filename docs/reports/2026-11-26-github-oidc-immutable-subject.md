---
kind: brief
topics: [hosting, everything-as-code]
date: 2026-11-26
title: GitHub's immutable OIDC subject and the AWS trusts
description: Why the first AWS apply was refused, what the trusts accept now, and what is left for the site and github-oidc stacks.
---

# GitHub's immutable OIDC subject and the AWS trusts (2026-11-26)

## What happened

The owner created the AWS account (management account `181079686226`, Paid plan, standalone),
ran the bootstrap and `platform/aws/github/configure.sh` from CloudShell, and started the first
*AWS apply* ([run 45905276526](https://github.com/Duncan-Haywood/oss-monorepo/actions/runs/45905276526)).
It stopped at the first AWS call: `AccessDenied ... AssumeRoleWithWebIdentity`.

CloudTrail (event history, `AssumeRoleWithWebIdentity`, 22:31:54Z) showed the token's subject:

    repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:environment:aws-prod

The trust named `repo:Duncan-Haywood/oss-monorepo:environment:aws-prod`. GitHub's OIDC
customization API for the repository read:

    {"use_default": true, "use_immutable_subject": true,
     "sub_claim_prefix": "repo:Duncan-Haywood@49566815/oss-monorepo@1315497858"}

Setting `use_default: false` with `include_claim_keys: ["repo", "context"]` left
`use_immutable_subject: true` and the same prefix, and a second apply
([run 45906725339](https://github.com/Duncan-Haywood/oss-monorepo/actions/runs/45906725339)) was
refused the same way. The repository's setting now reads `use_default: false`,
`include_claim_keys: ["repo","context"]`, `use_immutable_subject: true`. That produces the
same subject as the default, so it is harmless, but it is not the default.

## What the trusts accept now

Both forms, with no wildcard on any Allow:

| Where | Subjects |
|---|---|
| `bootstrap.yaml` `github-plan` | `repo:OWNER/REPO:pull_request`, `repo:OWNER@ID/REPO@ID:pull_request` |
| `bootstrap.yaml` `github-apply` | `...:environment:aws-prod`, both forms |
| `stacks/llm` `github-llm-gate` | `:ref:refs/heads/main` and `:environment:aws-llm`, both forms |
| `stacks/app-identity` sync role | `:environment:cloudflare`, both forms |
| `stacks/cutover-access` | `:environment:cutover-plan` / `:environment:cutover`, both forms |
| `stacks/org` payments RCP (Deny) | `repo:OWNER/REPO:*` and `repo:OWNER@ID/REPO@ID:*` |

The ID form is a variable: `immutable_github_repository` in the stacks (default
`Duncan-Haywood@49566815/oss-monorepo@1315497858`, validated as `OWNER@ID/REPO@ID`),
`public_repository_owner_id` / `public_repository_id` in `stacks/org`, and `GitHubOwnerId` /
`GitHubRepositoryId` in the bootstrap. The IDs come from the GitHub API (owner 49566815,
oss-monorepo 1315497858, private-monorepo 1441455568). The ID form is the stronger one: it
does not match a different repository that later takes the same name.

Two traps found on the way, both in CI's Checkov (`CKV_AWS_358`, which reads only the first
subject of a list, as text):

- A computed subject (`for` expression, or a local built with `split()`) is not rendered, so
  the check fails. Write the subjects out, name form first.
- Checkov substitutes `var.github_repository` by text, so a variable named
  `github_repository_<anything>` is corrupted. Hence `immutable_github_repository`.

And one in the *AWS plan* `check` job: it inherited `TF_VAR_region` from the repository
variable `AWS_REGION` (now `us-east-1`, the region the owner bootstrapped in), while the mocked
tests assert the stacks' default `us-east-2`; six stacks' tests failed. The job now pins the
defaults; the `plan` job still uses the variable.

The bootstrap is not applied by CI (github-apply is denied `UpdateStack` on it), so the owner
re-runs the bootstrap deploy from CloudShell once this merges. `aws cloudformation deploy`
keeps the existing parameter values and takes the new parameters' defaults.

## Left for later

- `stacks/github-oidc` (per-repo plan/apply roles, the findings reader) and `stacks/site` with
  `modules/static-site` (`publisher.subject` is one string) still build name-form subjects only.
  Neither is in the first apply's `STACKS`. They need the same change before they are applied;
  for private-monorepo the repository ID is 1441455568.
- `configure.sh` could print the repository's OIDC customization so the next account setup
  sees the form up front.
