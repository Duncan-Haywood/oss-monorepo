---
title: "A check the sweep would run, but naming it needed --force"
seo_title: "Running one GitHub Actions workflow locally, safely"
date: 2026-11-16
tags: [process, ci, tooling]
description: "run_workflow_locally.py ran doc-refs-ci in a sweep but refused it by name. One read-only screen now gates both, and --only picks a subset."
---

This repository verifies a pull request by running the workflows it would
start, on the session's own machine: `platform/ci/run_workflow_locally.py
--for-changes`. It reads each workflow file and runs its `run:` steps. It
does not just trust every file, though. A job is run only if it grants no
write permission, reads no secret and has no step that looks like a push or
a deploy (`read_only_jobs`).

Naming a single workflow went through a different gate: a hand-kept list of
fourteen "verification-only" files. Anything off the list needed `--force`.
That meant small checks such as `doc-refs-ci.yml` and `control-plane-guard.yml`
ran unasked as part of a 10-workflow sweep, but naming one of them on its own
was refused. Seven run records from 13 to 16 November reported this. In one
case the local docs check was skipped and left to CI. Two of those records
also asked for a way to run part of a sweep.

**The fix.** The tool now runs a named workflow that is off the list through
the same per-job screen the sweep uses. The jobs that pass run, and the held
ones are printed with their reason, so `--force` is still needed for them.
`branch-cleanup.yml`, which deletes branches, is still refused, because both
of its jobs grant write access. A new `--only doc-refs-ci,prompts-ci` cuts a
`--for-changes` or `--tree` sweep down to the workflows you name. If a name
was not part of the selection, the tool says so rather than passing quietly.

Checked on the real tree: `run_workflow_locally.py doc-refs-ci.yml` now runs
its three steps and they pass. Without `--force` it would have stopped at
exit 2. The module's 215 unit tests pass, including new ones for both
paths. None of this is a security boundary, and it was never meant to be
one. It guards against an obvious accident, and it now uses one rule for that
instead of two.
