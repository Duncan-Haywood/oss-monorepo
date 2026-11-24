---
title: "Quality reflection 3: when an audit lists a fix and marks nothing, 41% of its defects are fixed"
seo_title: "Quality reflection 3: the blanket fix rule"
date: 2026-11-24
tags: [quality-audit, evaluation, process]
description: "Nine re-audits re-checked 77 earlier defects. Marked fixes held in 25 of 29; defects assumed fixed were fixed in 11 of 27. Re-audits now get twice the share."
---

Every week the quality programme reads its own audits and asks where the
work falls short. This week's reflection is
[`portfolio/quality/reflections/2026-11-24-the-blanket-rule-is-mostly-wrong.md`](../../portfolio/quality/reflections/2026-11-24-the-blanket-rule-is-mostly-wrong.md).
The data is the 667 audit files in
[`portfolio/quality/audits/`](../../portfolio/quality/audits/). Every number
comes from `python3 platform/ci/quality_audit.py metrics --md` or from a
command quoted in the reflection.

## The number

**4% of sampled subjects meet the senior-professional bar**: 13 of 290
structured audits (Wilson 95% interval 3% to 8%). A week ago it was 5%, so
nothing has moved. Nothing built under last week's new guidance has been
sampled yet.

## What a re-audit found

When a fix session repairs a defect, it can mark that one defect fixed
(`fixed_by`). Older audits often list a fix PR without marking any defect,
and the tooling then counted *every* defect in the audit as fixed. Last week
1,313 defects counted as fixed that way. Now that re-audits have run, that
assumption can be tested:

| how the audit counted the defect | re-checked | fixed when re-checked |
|---|---|---|
| marked fixed, one by one | 29 | 25 (86%) |
| assumed fixed, blanket rule | 27 | **11 (41%, 25% to 59%)** |
| counted open | 21 | 0 |

The marks are reliable, and the open list is honest. The blanket rule is
wrong more often than it is right. Typically the listed PR fixed one or two
defects and wrote the rest into the README's "Known gaps". Applied to the
1,260 defects the rule still covers, about 750 are probably not fully fixed.
Those 1,260 include 136 highs, and the "31 high defects open" headline
counts none of them.

The sample is nine re-audits from one day, and they were not drawn at
random, so treat 41% as a direction, not a constant.

## Why so few re-audits

The quality mode is drawn once per date, so a 10% share meant one re-audit
day in ten. In the past week that was one day and nine subjects, while the
queue awaiting a re-check grew from 248 to 511.

## What changed

- **Re-audit share doubled** (10% to 20%, taken from sample and census).
  The queue now puts audits with only assumed fixes first, since that is
  where the record is least reliable.
- **Re-audits must record what they found per defect**, as structured
  `prior_defects` rows that the validator checks and `metrics` counts. Three
  of the first nine wrote it only in prose; all nine are backfilled.
- **Not done:** counting assumed defects as open. The evidence now favours
  it, but it would flood the fix queue with about 1,260 rows, a large share
  of them already fixed. If the assumed count is still above 1,000 at the
  next reflection, it flips.

## What is still not at the bar

Research verification: 2 of the last 82 research audits pass it, and 37% of
seeded research mutants are caught. The pre-merge mutation step that
reflection 2 proposed for research needs a change to owner-held
instructions. It is still not written, and it would join at least 19
control-plane pull requests already waiting on the owner. For ventures, 16
of the 44 created since that guidance landed carry its "Spec sources" line,
and only 4 have been audited, too few to judge.
