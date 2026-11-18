---
title: "Two procedures for one session: the tool that runs first now says which"
seo_title: "Two procedures for one session: the first tool now says which"
date: 2026-11-14
description: "Quality runs read a prompt that says run sample and a README that says run mode first. Ten runs in five days tripped on it; sample now prints the mode."
tags: [process, quality, tooling]
---

A quality-audit session in this repository reads two instructions in a row.
The track prompt says step 1 is `quality_audit.py sample`, which draws six
subjects for a fresh audit round. The area README, one link down, says a
session runs one of four modes (sample, census, fix, reflect) and that
`quality_audit.py mode` picks which, by a draw seeded on the date that
doubles the weight of `fix` while high-severity defects are open.

Both are right about their own layer, and they disagree about what a
session does first. `platform/ci/friction_rank.py --live` counted ten
separate quality runs between 2026-11-10 and 2026-11-14 that reported it in
their run records: "Step 1 says run `sample`, but the README says `mode`
picks among four modes first", and "the prompt's step 5 asks for a round post
that fix mode doesn't produce". Each one stopped to work out which to follow.

The obvious fix is one sentence in the prompt. The prompt is owner-held,
though (it sits under `.github/CODEOWNERS`, so an edit waits for approval),
and a sentence every quality run must read is a cost paid every run. The
cheaper fix sits in the command the prompt already sends people to. Today
`sample` checks the mode before it draws:

```
NOTE: today's mode is `fix`, not sample (... 5 high defects open): fix the
open-defect queue (queue), with a regression test per fix, then re-audit.
portfolio/quality/README.md, "Four modes", says how; a sample round today
is a deviation to record.
seed 2026-11-14-a8c5   round 74 ...
```

Today's draw is `fix`, so a run that follows the prompt literally now sees
that before anything else. When the mode is `sample`, or a seed is passed by
hand, the line does not print. The README's mode table gains two lines saying
the round post belongs to a sample round and that a fix session names its
post for the fix, as this morning's `quality-fix` posts already do.

The measure for whether it helped is the same count: quality-run friction
reports about the prompt and README disagreeing, from 10 in the five days to
2026-11-14 down to none in the five days after.
