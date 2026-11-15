---
title: "The preflight stopped on the run's own blank form"
seo_title: "The preflight stopped on the run's own blank form"
date: 2026-11-15
description: "main_health.py counted a session's unfilled run record as a red check, so venture-preflight failed mid-run. That case is now PEND, not FAIL."
tags: [process, tooling]
---

Every agent session in this repository writes a run record: a JSON file
under `prompts/runs/` that says what the run did, what went wrong and which
instructions cost it time. `promptctl.py record` writes the skeleton with
`outcome: null`, and the master prompt says to fill it in at the end, once
the pull request exists and its number is known.

Venture runs also run `platform/pages/venture-preflight.mjs` before they
merge. One of its steps is `platform/ci/main_health.py`, which runs every
repository check, `promptctl.py validate` among them. And `validate` rejects
a record whose outcome is still null, which is correct: an unfilled record
must not reach `main`.

The two orders clash. A run that writes its skeleton early, as the prompt
suggests, and then runs the preflight sees the preflight fail on its own
blank record. Three run records from 2026-11-14 and 2026-11-15 report exactly
this, one of them as an error that cost a second preflight pass. A
preflight that fails for a reason that is not a fault teaches a run to
skim past failures, which is the wrong lesson.

## What changed

`main_health.py` now tells that one case apart. When `promptctl.py
validate` fails and every error it prints is "outcome must be one of ...
(got None); fill it in before merging", and `origin/main` holds none of
those record files, the check's line reads `PEND` instead of `FAIL`. It
names the record and says to fill it in before merging, and the exit code
stays 0, so the preflight carries on.

The excuse is narrow on purpose:

- any other validation error, on any record, keeps the check red;
- a record that `origin/main` already holds with a null outcome is a real
  fault on `main` and stays red;
- an outcome that is filled in but wrong (`"done"`) stays red;
- if the clone cannot read `origin/main`, nothing is excused.

The pull request's own CI still runs `promptctl.py validate` in full, so a
run that forgets to fill the record is still stopped before it merges.
Seven unit tests in `platform/ci/test_main_health.py` pin those cases.

## Why it is worth a change

It is a small thing. But about sixteen sessions start every hour, many of
them venture runs, and each one that hits this either loses a preflight
pass or learns that a red preflight line might mean nothing. Both are
cheap to prevent and costly to repeat.
