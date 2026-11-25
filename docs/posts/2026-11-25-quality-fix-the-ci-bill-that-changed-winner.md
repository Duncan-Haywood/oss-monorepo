---
title: "Quality fix: the cheapest CI provider at high volume was the wrong one"
seo_title: "CI cost per build minute in 2026: GitHub, CircleCI, GitLab, Buildkite"
date: 2026-11-25
tags: [quality-audit, ci-minutes-pricing-calculator, ci-costs]
description: "Two CI rate cards were stale. At 2026 list prices GitHub Actions, not CircleCI, is cheapest above about 14,750 Linux minutes a month."
---

The [CI minutes pricing calculator](https://marisstella.app/ci-minutes-pricing-calculator/)
compares what five hosted CI services charge for one month's build minutes.
The [quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-ci-minutes-pricing-calculator.json)
found the arithmetic exactly right but the rate card stale. GitHub's rate was
corrected soon after the audit. Bitbucket and Buildkite were left alone,
because their pricing pages could not be fetched at the time. Both pages
loaded today.

| provider (Linux, 1 user) | was | now (vendor page, 2026-11-25) |
|---|---|---|
| Bitbucket Pipelines Standard | $3 a user, 2,500 min, $10 per 1,000 more | **$3.65** a user, 2,500 min, $10 per 1,000 more |
| Buildkite hosted agents | $0.013 a minute, no fee | **$30 Pro fee** per active user, including 4,000 vCPU-min (2,000 on the small agent), then **$0.008** a minute; Free plan 1,000 small-agent minutes |
| CircleCI, GitLab | | unchanged: 30,000 free credits, then $15 per 25,000 credits at 10 credits a minute; GitLab Premium $29 a user with 10,000 minutes |

**What it changes.** At 10,000 minutes a month Buildkite drops from $130 to
$94, and GitLab Premium ($29) is still cheapest. Above 14,749 minutes GitHub
Actions is cheapest. Check it by hand: GitHub's bill is 0.006 × (v − 2,000)
and GitLab's is 29 + 0.01 × (v − 10,000), and the two are equal at
v = 14,750. The calculator's crossover table now gives the same answer.

**Also fixed.** A malformed `--prices` file now exits with code 2, "bad
input". It used to exit with 1, the over-budget code, so a CI budget gate
would read a broken config as a budget breach. So does a mistyped flag such
as `--grwoth 50`, which used to be silently ignored. Each fix has a test,
and a seeded bug in each was caught.

**Still not at the bar.** Seats are fixed at one, so per-seat plans look
cheaper than they are for a team. GitLab Free's pay-per-pack minutes are not
offered as a plan, and macOS and Windows multipliers are not modelled. The
audit's scores stand until a later round re-audits.
