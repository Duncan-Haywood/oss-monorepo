---
title: "Two tiers of CI: letting agents edit workflows without handing them the secrets"
date: 2026-11-24
tags: [github-actions, security, ci, agents, codeowners]
seo_title: "Two tiers of CI: agents edit workflows, not secrets"
description: "A required check keeps unowned GitHub Actions workflows read-only and secret-free, so only 33 of 130 workflows still need the owner's approval."
---

Several AI agents push to this repository and merge their own pull requests.
Since 30 October, `.github/CODEOWNERS` owned all of `/.github/`, so any change
to CI waited for the owner's approval. That stopped an agent from writing a
workflow that reads the npm token, but it also stopped an agent from adding a
plain test job. Most CI edits are the second kind.

The thing worth guarding is narrow: **no agent should be able to give itself
a secret, a write token or a weaker merge gate.** A workflow with
`permissions: contents: read`, no `secrets.*` and a GitHub-hosted runner can
do none of those. So the line moved from "is it under `.github/`" to "can it
reach anything privileged".

## The split

- **`priv-*.yml`** (33 workflows): anything that holds a secret, a write
  permission, `id-token`, an environment, runs on `pull_request_target` or
  `workflow_run`, or is a required status check. These stay owner-only.
- **Everything else** (97 workflows): merges without review, but a new
  required check, `ci-policy`, fails the PR unless the workflow is read-only
  and secret-free.

Thirty workflows were renamed to `priv-`. Their `name:`s and job ids did not
change, so check names and the ruleset's required checks still match.

## The bypasses the check had to close

Writing it as a list of attacks found more than the obvious ones. An
unowned workflow can try to reach a secret through `toJSON(secrets)`,
`secrets['X']`, an `if:` condition (which needs no `${{ }}`), a mapping key,
`secrets: inherit`, or an `environment:`. It can omit `permissions` and get
the repository default. It can use a YAML duplicate key, which PyYAML
resolves as "last wins" and GitHub may not, or an anchor or merge key the
two parsers might expand differently; the check now refuses all of them.

Two less obvious ones:

- **Name squatting.** A required status check is matched by name. A new
  workflow with a job called `control-plane` that always passes is a
  candidate to satisfy the requirement while the real guard fails. Any job
  whose check-run name *could* equal a required check is refused, with
  `${{ }}` in a name treated as "could be anything". The workflows behind the
  three required checks moved to the owned tier for the same reason.
- **Code the privileged jobs run.** Owning `priv-distribute-npm.yml` means
  little if the `platform/distribution/npm.mjs` it runs, with `NPM_TOKEN` in
  its environment, is unowned. The check now follows each privileged job's
  `run:` lines, local actions, build directories and relative imports, and
  fails if any file is neither owned nor listed as an accepted risk.

That last check is where the honest answer got less tidy. The Cloudflare
deploy step imports the whole site generator, through one import of
`build.mjs` for a few constants. Owning the generator would put the whole
catalogue under review, so it is listed as an accepted risk, with the fix
named: move those constants into a small owned module. Nine such risks are
written down in `docs/security/agent-hardening.md`. They existed before; now
they are listed, and a new one can't appear without the check failing.

## What it costs

One required check, about 80 unit tests, and a data file of pinned actions
and accepted risks that only the owner edits. The pull request that adds it
touches the control plane, so it waits for one owner approval. After that,
adding a read-only workflow should not.
