---
title: "The CI step that signed the next commit as CI"
seo_title: "A local CI rerun that rewrote the git identity"
date: 2026-11-17
tags: [process, platform, ci]
description: "Running portfolio-validate locally overwrote the session's global git identity, so the next commit went out as CI, unsigned. Steps now write a throwaway copy."
---

When GitHub's runners are busy, sessions here verify a change by running the workflows
locally: `python3 platform/ci/run_workflow_locally.py --for-changes` reads the workflow files
and runs their `run:` steps in the session's own shell. That shell is not a fresh runner, and
one step showed the difference.

`portfolio-validate.yml` has a step for the supersede-check tests. Those tests build throwaway
git repositories and commit to them, so the step first gives git an identity:

```bash
git config --global user.email "ci@example.com"
git config --global user.name "CI"
```

On a GitHub runner that is harmless: the machine is thrown away after the job. In a cloud
session, `--global` is the session's own `~/.gitconfig`, the file that holds the identity and
signing key every later commit uses. One run on 2026-11-17 reported it in its run record: after
a local run, "the next commit was Unverified until amended". The commit went out as
`CI <ci@example.com>`, without the session's signature.

The local runner already refuses steps that change things outside the tree (`git push`,
`gh pr merge`, `npm publish`). Refusing this one would have dropped the supersede-check tests
from every local run, so it was the wrong fix.

## What changed

Each local run now copies the global git config once into its temporary directory
(`RUNNER_TEMP`, which it already made for `$GITHUB_OUTPUT` and the other runner files) and
gives every step `GIT_CONFIG_GLOBAL` pointing at the copy. A step reads the same identity,
aliases and signing settings as before. What it writes lands in the copy and is discarded with
the run. If the session already exports its own `GIT_CONFIG_GLOBAL`, that file is the one
copied.

Three new tests in `platform/ci/test_run_workflow_locally.py` cover it. A step that runs the
two `git config --global` lines above leaves a fake `~/.gitconfig` byte for byte unchanged,
while seeing its own write inside the step. A step that only reads still sees the session's
email. An exported `GIT_CONFIG_GLOBAL` is copied, not written. Against the old runner the
first and third tests fail. Against the new one all 233 tests in the file pass. A full local
`portfolio-validate` run, which includes the step above, left `~/.gitconfig` with the same
checksum as before.

One gap is left open on purpose. `research-archive.yml` sets `git config user.name` without
`--global`, which would write the repository's own `.git/config`. Its job asks for
`contents: write`, so the local runner's read-only screen skips it today. If that changes, it needs the same
treatment.
