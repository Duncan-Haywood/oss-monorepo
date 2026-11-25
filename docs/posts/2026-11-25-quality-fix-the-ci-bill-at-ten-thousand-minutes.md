---
title: "Quality fix: Buildkite and Bitbucket CI prices, checked on the vendors' own pages"
seo_title: "CI cost per build minute: GitHub, CircleCI, GitLab, Buildkite (2026)"
date: 2026-11-25
tags: [quality-audit, ci-minutes-pricing-calculator, ci, pricing]
description: "Buildkite small Linux agents are $0.008 a minute plus a $30 Pro seat; Bitbucket Standard is $3.65 a user. GitHub Actions is cheapest above 14,750 minutes."
---

The [CI minutes pricing calculator](../../ventures/ci-minutes-pricing-calculator/)
compares what five hosted CI services charge for one month of Linux build
minutes. The [quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-ci-minutes-pricing-calculator.json)
marked its rate card as a high-severity defect. That session could not load
the vendors' pricing pages, so it fixed GitHub's rate and left the other
four alone. Today the pages loaded, and two of the four were wrong.

| provider (Linux, one seat) | before | checked 2026-11-25 |
|---|---|---|
| Buildkite hosted agents, small (2 vCPU) | $0.013 a minute, no fee | $0.008 a minute ($0.004 per vCPU minute). The Free plan stops at 2,000 vCPU minutes (1,000 small-agent minutes). Above that you need Pro at $30 an active user, which includes 4,000 vCPU minutes |
| Bitbucket Pipelines Standard | $3 a user, 2,500 min | $3.65 a user, 2,500 min, then $10 per 1,000 |
| CircleCI Performance, Linux medium | 3,000 free, $6 per 1,000 | unchanged: 30,000 free credits at 10 credits a minute, then $15 per 25,000 credits |
| GitLab Premium | $29, 10,000 min, $10 per 1,000 | unchanged |
| GitHub Actions, Linux 2-core | $0.006 a minute (fixed 2026-11-19) | unchanged |

## What it changes for a buyer

- **At 10,000 minutes a month** GitLab Premium is still cheapest at $29 for one
  seat, and Buildkite is now the most expensive at $94. That is a $30 Pro seat
  plus 8,000 minutes at $0.008. The old table showed $130 with no seat fee.
  The guide said the cheapest and dearest differ "by more than four times".
  The real gap is a little over three times, and the guide now says so. A
  test reads that sentence and checks it against the engine, so the next
  price change cannot leave it stale.
- **Above 14,749 minutes a month** GitHub Actions is cheapest. At 150,000
  minutes it costs $888, against $897 for CircleCI and $1,214 for Buildkite.
  The audit got the same crossover and the same $888 with its own
  arithmetic, before any code changed.
- **Per-seat plans still cost more for teams.** The calculator prices one
  seat. A 10-person team on GitLab Premium pays $290 before minutes. Seat
  input is still an open defect in the audit file.

## How it was checked

- 29 of 29 tests pass. Two seeded bugs were tried: putting back the old
  $0.013 Buildkite rate, and putting back $3 for Bitbucket. Tests failed both
  times (`platform/ci/quality_mutate.py`).
- This fix closes audit defects 0 and 1 (PR #19007). The rest stay open in
  the audit file: seats, a malformed `--prices` file that exits with the
  over-budget code, and budget-boundary tests. A later round will re-audit
  the tool. Its scores are not raised in this round.

These are list prices for comparing options. They are not a quote. Each
vendor bills macOS, Windows and larger runners at a multiple of the Linux
rate, so check the vendor's own page before you sign.
