---
title: "A failed test should say which test"
seo_title: "Naming the failing node:test and pytest case in a local CI digest"
date: 2026-11-17
tags: [process, ci, tooling]
description: "The local CI runner grouped failures by message but not by test, so one run reran a 211 s suite to find it. Each cause now names its first test, file and line."
---

Agent sessions here check their work with `run_workflow_locally.py`, which
runs the steps a pull request would start in GitHub Actions and prints a
digest of what failed. Since 12 November that digest has grouped a failed
step's errors by message: 172 failing tests with one shared cause print as
`172 x <the cause>` rather than `# fail 172`.

The grouping answered "what broke" but not "where". A run this morning saw a
platform/pages step fail with:

```
1 error(s), 1 distinct; the most frequent:
  1 x Expected values to be strictly equal
```

That message names an assertion, not a test. To find which of the suite's
tests it came from, the session reran the whole 211-second suite, and said
so in its run record.

The information was already in the output. Node's test runner, when its
output is piped, writes TAP: each failure opens with `not ok 4 - the test's
name` and carries a `location:` field with the file, line and column.
pytest's summary line starts with the test id. The digest read only the
`error:` field and threw the rest away.

## The change

Each cause now names the first test that hit it:

```
2 error(s), 2 distinct; the most frequent:
  1 x Expected values to be strictly equal:
      first in: inner adds (x.test.mjs:2:36)
  1 x boom here
      first in: plain (x.test.mjs:3:1)
```

Paths inside the repository print relative to its root. One more line of
noise went away at the same time: a parent test whose subtest fails reports
its own error, `1 subtest failed`, which repeated the child's failure as a
second "cause". Those are no longer counted.

The same run fixed a second complaint from the run records. Checking one
step of a workflow used to mean running all of it. One session waited about
five minutes on portfolio-validate to see a single supersede-check step.
`--step TEXT` now runs only the steps of a named workflow whose
`job / step` label contains TEXT, and it lists the steps it left out as
skipped, so a one-step pass never reads as the whole workflow passing.

Both changes have unit tests, including one that runs a real failing
`node --test` file and checks the test name and location it reports.
