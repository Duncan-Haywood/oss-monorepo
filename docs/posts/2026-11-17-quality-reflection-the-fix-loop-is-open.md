---
title: "Quality reflection 2: 250 audits list a fix, and none has been re-checked"
seo_title: "Quality reflection 2: the fix loop is open"
date: 2026-11-17
tags: [quality-audit, evaluation, process]
description: "No audited subject has been re-checked since a fix. 1,313 defects count as fixed only by assumption, and the bar's fall to 5% is mostly a stricter instrument."
---

Every week the quality programme reads its own audits and asks where the work
falls short. This week's reflection is
[`portfolio/quality/reflections/2026-11-17-the-fix-loop-is-open.md`](../../portfolio/quality/reflections/2026-11-17-the-fix-loop-is-open.md).
The data is the 382 audit files in
[`portfolio/quality/audits/`](../../portfolio/quality/audits/). Every number
below comes from `python3 platform/ci/quality_audit.py metrics --md` or from
a command quoted in the reflection.

## The bar fell, mostly because the ruler changed

Randomly sampled subjects meeting the senior-professional bar: **33 of 306,
Wilson 95% 8% to 15%**, down from 12% to 24% a week ago. Split by the evidence
format, the drop lines up with the 2026-11-11 schema change. That change made
auditors recompute at least three outputs against an outside source and seed
at least two bugs:

| sampled audit files | n | meet the bar |
|---|---|---|
| prose evidence, before 2026-11-11 | 151 | 26 (17%) |
| structured checks and mutations, from 2026-11-11 | 160 | 8 (5%, 3% to 10%) |

Under the stricter format, ventures passing the correctness gate fell from 74%
to 39%. Both halves are uniform draws from never-audited subjects, so the
likelier reading is that the earlier scores were generous. The 5% is the
better estimate of where the repository is.

## Four findings

1. **The mutation metric saturated.** "At least one seeded bug survived" is
   now true of 193 of 196 structured audits, because auditors seed about six
   each. The number that can still move is the share of seeded bugs a test
   kills: **548 of 1,162 (47%)**. It tracks the verification score (0.22,
   0.47 and 0.80 at scores 1, 2 and 3). `metrics` now prints it.
2. **Nothing re-checks a fix.** Audits listing a fix PR went from 12 to 250
   in a week, but no subject has been audited twice since 2026-11-10. Sample
   and census skip anything audited in the last 90 days, and no mode had the
   job. A new `reaudit` mode (10% of quality sessions) and command list the
   248 subjects waiting.
3. **Most "fixed" defects are assumed fixed.** 1,313 defects count as fixed
   only because their audit lists *some* fix PR. Eight highs drawn at random
   were all really addressed. But in 56 audits the subject's own README still
   lists the defects under "Known gaps": the "fix" PR was the audit round that
   wrote them down. One was a research note whose headline, "the
   collusion-proof stake falls as 1/m", fails once the stake drops below the
   point where checking pays at all. That is fixed in this PR, with a test
   pinned to the audit's counterexample.
4. **Last week's build-side fixes never shipped.** All five audit-side fixes
   landed. None of the build-side ones did (a test pinned to an outside
   source, one seeded bug before merge, a "Spec sources" line). Their metrics
   stayed flat: domain 2.11, fitness 2.05. Two of them are now lines in the
   [product playbook's definition of done](../../PRODUCT_PLAYBOOK.md), each
   with the number behind it. The research equivalent needs an owner-approved
   change to `research/CLAUDE.md`.

## What is not at the bar

Most of the repository. About one in twenty sampled subjects meets the bar
under the current instrument. Seeded bugs slip past the tests more often
than not in research (309 of 515 survive). The fix loop marks work done
without anyone confirming it. The next reflection checks whether re-audits
find the assumed fixes real.
