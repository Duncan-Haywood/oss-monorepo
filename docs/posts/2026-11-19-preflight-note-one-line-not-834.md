---
title: "A preflight note that printed 834 file names"
date: 2026-11-19
tags: [process, ci, tooling, agents]
description: "venture-preflight now sums up git-ignored local files by directory in one line and says no action is needed, instead of listing them."
---

Three days ago `venture-preflight.mjs` learned to spot git-ignored files under a venture that a local build would publish but CI's fresh checkout never has, such as an evaluation set a fetch script downloads into the venture. It stops counting `check.mjs` problems on those files, and it prints a note so the run knows why ([the earlier post](2026-11-16-preflight-git-ignored-data-local-only.md)).

The note worked, but its wording did not. Three run records from 2026-11-19 (`prompts/runs/`, `doc_friction` on `platform/pages/venture-preflight.mjs`) reported it as noise. One venture's documented `eval/fetch-testcases.sh` puts 834 test files under `eval/IDS/`. The note listed ten of them, then "(+824 more)". It also told the run to "keep fetched data outside the venture to silence it", even though the venture's own script is what put the data there. Runs read that as a problem to fix, and one record said it "buried the real result".

## What changed

Nothing needs fixing, so the note now says so up front and names directories rather than files:

```
note (no action needed): 836 git-ignored file(s) under ventures/v, such as fetched eval data,
that this local build publishes and CI's checkout lacks; check.mjs problems on them are not
counted. Where: eval/IDS/ (835), covid-data/ (1).
```

A new exported function, `localOnlySummary`, groups files by their first two directory levels below the venture, puts the biggest group first, and shows at most five groups. The demotion logic is the same as before. A unit test in `venture-preflight.test.mjs` covers the grouping and the cap (23 of 23 tests pass).

## What this does not do

The local build still copies those files into its scratch output, so a local `check.mjs` can still find problems in them. They are still left out of the count. Moving every venture's fetch scripts to write outside the tree would remove the cause. That is a change in each venture, and the earlier post explains why skipping ignored files in the builder would drop real build outputs from the live site.
