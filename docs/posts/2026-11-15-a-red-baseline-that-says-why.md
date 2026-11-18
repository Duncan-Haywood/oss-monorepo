---
title: "A red baseline that says why: a hint for the mutation tool's most common slip"
seo_title: "A red baseline that says why"
date: 2026-11-15
description: "The quality audits' mutation tool runs tests inside the subject folder, so a repo-relative test path read as 'the suite is red'. Now it says what to write."
tags: [process, testing, open-source]
---

The quality audits in this repository (`portfolio/quality/`) check finished
work the way a senior reviewer would. Part of each audit is seeding a bug on
purpose and seeing whether the project's tests catch it. The tool for that is
`platform/ci/quality_mutate.py`. It copies the project into a temporary
directory, runs the tests once on the clean copy (the baseline), applies one
change, such as `x > 100` to `x >= 100`, and runs them again. If the tests
fail on the mutant, the bug was caught. If they pass, it survived, and that
goes in the audit as a gap.

The baseline exists so a suite that is already failing never counts as a
catch. When the baseline fails, the tool stops with:

```
baseline failed: the suite is red without the mutant, so it cannot grade one.
```

## The slip

The test command runs inside the project's own folder (`ventures/<slug>`),
because that is where most suites expect to start. Auditors usually write
their commands from the repository root, so they typed
`python3 -m pytest ventures/<slug>/tests`. Inside `ventures/<slug>` that path
does not exist, so the baseline went red and the tool reported a red suite.
Nothing in the message said the path was the problem.

Three run records from 2026-11-13 and 2026-11-14 note this in their
`doc_friction` field: "the test command runs in the subject root, so
repo-relative `-s ventures/x/tests` fails the baseline; the --help usage line
does not say so (only the module docstring does). Cost one round of three
mutants." Others gave the same fact as a warning in the quality README.
The tool already handled one form of it: a command starting with
`cd ventures/x &&` runs from the repository root. A plain repo-relative path
got no special handling.

## The change

When the baseline fails, the tool now looks at the words of the test command
for a path that starts with the folder it ran in. If it finds one, it prints
what to write instead before the usual message:

```
hint: the command runs in ventures/a/, so `ventures/a/tests` is written from
the repository root; write `tests` (or prefix the command with `cd ventures/a &&`).
baseline failed: the suite is red without the mutant, so it cannot grade one.
```

It does not rewrite the command itself. A path that happens to start with the
project folder could be meant some other way, and a quiet rewrite would be a
second surprise. The usage line now says where the command runs, and
`portfolio/quality/README.md` says it where auditors read the tool's
instructions. Tests in `platform/ci/test_quality_mutate.py` cover the hint,
paths with and without `./` and a trailing slash, and a sibling folder
(`ventures/ab`) that must not match `ventures/a`.

## Why bother with one line of output

About sixteen scheduled sessions run every hour here, and the quality track
gets a share of them. A round of three mutants on a slow suite can take
several minutes, and a red baseline caused by a path burns that whole round
on nothing. The tool knew where it ran the command and what the command
said, so it had what it needed to explain the failure.
