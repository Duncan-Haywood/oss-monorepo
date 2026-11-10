---
title: "Where quality drops off: 901 audit defects, traced to the step that let them through"
seo_title: "Where AI-built software loses quality: 901 defects by process stage"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, ai-agents, process]
description: "Most audited subjects compute the right numbers. They miss the bar on claims and tests, and audit findings rarely become fixes. Data and process fixes."
---

Since 2026-11-07 this repository has audited its own work against a senior
professional's bar: [183 audit files](../../portfolio/quality/audits/), 158
subjects, 901 defects. Each round post reports a share. This post asks where in
the process quality is lost. The full reflection, with its limits, is
[`portfolio/quality/reflections/2026-11-10-where-quality-drops-off.md`](../../portfolio/quality/reflections/2026-11-10-where-quality-drops-off.md).
Every number below is printed by
`python3 platform/ci/quality_audit.py metrics --md`.

## The code is mostly right. Claims and tests are not.

25 of 147 randomly sampled subjects meet the bar (95% interval 12% to 24%),
but 138 of 147 are finished and 128 of 158 score 3 or more on correctness. Of
the 130 below the bar, 89 fail on claims, 84 on verification and only 30 on
correctness. **69 of the 130 are one point short on a single gate.**
Ventures mostly fail on claims (46 of 64). Research mostly fails on
verification (49 of 64).

## Five stages where it slips

1. **Tests check what the author believed.** In 65% of audits (57% to 72%),
   at least one bug seeded by hand in core logic survived the subject's own
   tests. Typical cases: tests that pin no number, tests that exercise a copy
   of the logic, tests built only from the author's own fixtures.
2. **Claims come before the evidence.** Overclaims and stale docs are the
   second-largest defect group. The worst are sentences a user acts on, such
   as "should never disagree with Lighthouse", which is false.
3. **Findings don't become fixes.** 12 of 183 audits list a fix PR, and 43
   high-severity defects are open. 37% of the defects in a repeated audit
   show up again. Meanwhile 12% of audit files re-audited an unchanged
   flagship within two days, and the scores came back identical.
4. **Nobody names the professional before building.** Domain and fitness
   average 2.22 of 4. The serious misses are rules a practitioner checks
   first: a Section 179 cap scaled by business use, rent priced for an entity
   that cannot pay its owner, RFC 8659 CNAME handling.
5. **Breadth outruns verification.** 159 of 2,423 subjects have ever been
   audited (6.6%), and the same input-parsing bugs repeat across copied
   calculator templates (133 defects).

The audits have problems of their own too. 8% of recorded defects were about
URLs that the build rewrites at deploy: the served pages were fine. No audit
had structured checks, and the pass/fail verdict flipped in 3 of 22 re-audits
of unchanged subjects.

## What changed today

- **More of the work goes to quality.** The quality track goes from 5% to 20%
  of scheduled runs, in a separate control-plane PR that needs the owner's
  approval.
- **Four modes**, picked by `quality_audit.py mode`: random `sample` rounds,
  a `census` that audits never-audited subjects first, a `fix` mode that
  works the open-defect `queue`, and a weekly `reflect`.
- **More detail in each audit.** From 2026-11-11 every audit records at least
  8 checks with expected and observed values, at least 2 seeded mutations,
  and a category, origin stage and location for each defect, so correctness
  becomes a pass rate and not only a score.
- **Detailed metrics:** the gates subjects fail on, score histograms, defects
  by category and stage, mutation survival, fix and reappearance rates,
  re-audit agreement, coverage and a weekly trend.
- **Flagships are not re-audited within a week**, and auditors load the
  served page before filing a URL defect.

The next reflection checks each fix against the metric it should move: 65%
of audits with a surviving mutation, 68% of below-bar subjects failing claims,
12 of 183 audits with a fix PR, and 6.6% coverage.
