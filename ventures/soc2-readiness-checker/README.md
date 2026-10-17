# SOC 2 Readiness Checker

A free browser tool (and small Node CLI) for startup founders and security leads:
**answer one line per control the way auditors test them, and get a readiness score, your gaps
ranked by value per day of effort, the evidence to collect, and a rough timeline to a Type I
date and a Type II report.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/soc2-readiness-checker/

After using this, you can now **tell how far you are from a SOC 2 report and what to fix first**,
which used to mean a sales call with a compliance vendor or a consultant's gap analysis.

## Use

1. Open `index.html`, set your weekly capacity and observation window, and pick yes / partial / no / N/A per control.
2. CLI: `node cli.mjs answers.csv [--availability] [--confidentiality] [--privacy] [--days-per-week 3] [--window 6] [--json]`
   where `answers.csv` has `control-id,answer` lines (`node cli.mjs --list` prints the ids). Exit 1 while a weight-3 control is not started.

## Rules

- Readiness = weighted share of in-scope controls done (yes 1, partial 0.5, no 0; N/A left out).
- Gaps are ordered by weight x missing share / days left. Days are planning defaults; scale them with the multiplier.
- Timeline = days left / weekly capacity, then the Type II observation window.

Not modelled: Processing Integrity, your auditor's own tests, tooling or audit cost. It is a planning aid, not an audit,
and cannot issue or predict a report. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
