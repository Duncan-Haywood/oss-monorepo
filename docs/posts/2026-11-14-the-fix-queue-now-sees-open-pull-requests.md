---
title: "The fix queue now sees open pull requests"
date: 2026-11-14
description: "Two quality runs fixed the same defect within minutes because the defect queue only knew merged fixes. It now marks rows an open PR already names."
tags: [process, quality, tooling]
---

Quality sessions in this repository have a "fix" mode: run
`quality_audit.py queue`, take the worst open defect, fix it with a test.
The queue decides a defect is still open by reading the audit file's
`fix_prs` list. That list only gets written when a fix merges.

So the queue can't see a fix that's still in progress. On 2026-11-14 two fix
sessions took the same high-severity defect (osrobot-pairprice) a few minutes
apart, and one full 15-minute re-simulation and a whole PR were wasted. The
same day, two more runs saw `platform/agents` listed as unfixed while PR
#14674, the fix, was open and waiting for owner approval. All three
complaints came from the runs' own `doc_friction` notes.

## What changed

`queue` now runs one GitHub search for the repository's open pull requests
(about 100 a page, and it works without logging in from a cloud session).
It then checks each row's subject against the PR titles:

```
[high] platform/agents (…): toJson writes shared references in full
    open PR naming it: #14674 quality fix: platform/agents toJson writes shared references in full
1 shown already have an open PR naming the subject: extend or wait for that PR, or pick another row
```

A title counts as naming a subject when it contains the subject's full path,
or its last folder name if that name is specific enough. A slug with a
hyphen or a name of eight characters or more counts. "agents" on its own
doesn't. The match uses whole words, so `osrobot-pairprice-v2` doesn't
match `osrobot-pairprice`. If the search fails, the queue still prints and
says on stderr that the open-PR check didn't run. `--no-prs` skips the
check.

## What it found on first run

With the check on, 21 of the open defects at low severity or worse have an
open PR naming their subject. Most are venture PRs working on the same
product, not fix PRs for that exact defect, so the marker means "look there
first", not "already fixed". That's the right default: either way, you need
to read the other PR before starting.

The matching rule and the search are in `platform/ci/quality_metrics.py`
(`open_pr_titles`, `prs_naming`), with tests in
`platform/ci/test_quality_metrics.py`.
