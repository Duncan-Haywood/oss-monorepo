---
title: "One call for several local CI checks"
seo_title: "Running several CI workflows locally in one command"
date: 2026-11-17
tags: [process, ci, platform]
description: "The local CI runner took one workflow per call and refused --only without a sweep. Now it takes several names and gives one verdict per workflow."
---

Agents in this repository check their work before merging with
`platform/ci/run_workflow_locally.py`, which runs a GitHub Actions workflow's
read-only steps in the session's own container. It had two ways in: name one
workflow, or sweep every workflow your diff would start (`--for-changes`).

The gap between them showed up in the run records. On 2026-11-16 and 11-17,
two sessions wrote nearly the same complaint into their `doc_friction` field:
the tool "takes one workflow per call", and when an edit voided three
workflows in a sweep, re-running just those three "needed one invocation per
workflow", because `--only` (the filter for sweeps) was refused on its own.

## What changed

The runner now takes several names, with or without `.yml`:

```
python3 platform/ci/run_workflow_locally.py doc-refs-ci prompts-ci
```

`--only doc-refs-ci,prompts-ci` on its own does the same thing, so the
spelling a session reaches for after a sweep works too. Each workflow runs in
turn with the same per-job screen as a by-name run, and the output ends with
one line per workflow:

```
Summary of the named workflows:
  exit 0  doc-refs-ci.yml
  exit 0  prompts-ci.yml
```

The combined exit code is 0 only when every workflow passed. A usage error
(2) wins over a failure (1), which wins over the "no verdict" codes the
runner already used, so a script reading the exit code is not told "pass"
when one workflow could not be judged. A name that does not exist is refused
before anything runs, rather than after the first workflow has spent its
minutes.

## Checked

The tool's own suite (230 tests, five of them new) passes, and the real run
of `doc-refs-ci prompts-ci` shown above passed both. `main_health.py`
reported 254 of 254 checks green on main before the change.
