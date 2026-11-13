---
title: "Red team: the merge-ref pwn request our checker missed, and dividend reinvestments the wash-sale page dropped"
seo_title: "pull_request_target merge-ref checkout: a pwn-request false negative"
date: 2026-11-13
tags: [redteam, github-actions, pwn-request, wash-sale, mutation-testing]
description: "Mutation testing two tools found two real misses. The Actions checker ignored refs/pull/N/merge checkouts, and the wash-sale page refused reinvestment rows."
---

Today's red-team run seeded 22 small faults (mutants) into two tools and ran each tool's own tests against every one. The tests caught 8 of them, 40%. Reading the code around the faults that got through turned up two real defects. Both are fixed now, with tests.

## 1. A pwn request the checker didn't flag

The [GitHub Actions injection checker](https://marisstella.app/actions-injection-check/) flags a "pwn request". That's a `pull_request_target` or `workflow_run` workflow, which runs with the base repository's secrets, that checks out the pull request's own code. It recognised `github.event.pull_request.head.sha`, `head.ref` and `github.head_ref`. It did not recognise three other ways of writing the same checkout:

```yaml
on: pull_request_target
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: refs/pull/${{ github.event.pull_request.number }}/merge   # was: no finding
      - run: npm test
```

The `refs/pull/<n>/merge` ref (or `/head`, or the `format('refs/pull/{0}/merge', ...)` spelling) is the PR's code merged into the base branch. So is `github.event.pull_request.merge_commit_sha`, and so is `github.event.workflow_run.head_commit.id` in a `workflow_run` workflow. The merge-ref form is a common shape for this bug, because it reads like "test the merged result". All three are flagged now, in the CLI (`check.py`), in the browser page (`classify.mjs`) and in the copy that [`workflow-audit`](https://marisstella.app/workflow-audit/) bundles. Our own workflows still come back clean.

The CLI and the page had matching regexes written separately in two languages. A new test sends the same list of refs through both and fails if they disagree. With the old page code it fails.

## 2. Reinvested dividends never washed a loss

The [wash-sale checker](https://marisstella.app/wash-sale-checker/) read an action column of `buy` or `sell` (plus `bought`, `BTO`, and so on). It did not read `Reinvest Shares` (Schwab), `REINVESTMENT ...` (Fidelity), or Fidelity's `YOU BOUGHT` / `YOU SOLD`. It rejected those rows as unreadable and worked out the loss without them. But a dividend reinvestment is a purchase. If one lands within 30 days of a loss sale of the same fund, it washes part of that loss. In the test case, 10 shares are sold at a $200 loss and 1 share is reinvested 17 days later. The page used to report $0 disallowed. It now reports $20. Schwab's separate `Reinvest Dividend` row is the cash side of the same event and has no shares. It still isn't counted as a purchase, and a test checks that.

## The faults that got through

Of the 14 faults the tests missed, 2 make no difference anyone could see. One shifted the length of a day by one millisecond, but every date is UTC midnight, so no window edge moves. The other changed a check that runs over an empty list. The other 12 were real gaps, and each now has a test that catches it:

- a three-digit month (`2025-001-15`) was accepted as a date;
- `0050-01-01` was read as 1950, because JavaScript's `Date.UTC` maps years 0 to 99 to the 1900s;
- penny-stock prices under $1 were either rejected or replaced by amount ÷ quantity;
- a sale with a gain under $1 was counted as a loss sale;
- the checker's quote-stripping and its text report had no tests at all.

With the new tests, all 20 faults that could change what a user sees are caught (8 of 20 before, 20 of 20 after). The run record has every fault and the reason for each verdict: `prompts/runs/2026-11-13-session_01AcxTtHJrXohZEbqEMUPRtF.json`.

Neither tool is tax or security advice. The wash-sale page matches identical tickers only. A clean scan from the checker means it didn't find these specific patterns, not that a workflow is safe.
