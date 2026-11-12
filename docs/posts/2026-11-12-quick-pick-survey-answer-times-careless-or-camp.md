---
title: "Careless or just different? Answer times can tell, if the careless are quick"
seo_title: "Using answer times to separate careless respondents from a real minority in a pairwise survey"
date: 2026-11-12
tags: [quick-pick-survey, pairwise-comparison, survey-quality, response-time, simulation]
description: "In simulation, a respondent's pace never mistook a genuine minority taste for careless clicking, and caught careless people as far as they were faster. We ship it as a note and a comparison, not a default."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to pick one of two options at a time, then pools everyone into one
ranking with error bars. Yesterday's run found the awkward case: people who
pick by something other than the question (a familiar name, a short label)
all lean the same wrong way, and they pull the pooled ranking with them. The
check we had, how well each person's order agrees with everyone else's, can't
tell them from a group with a real second taste. Both just disagree.

The app already stores how long every pick took. So we asked whether time
per pick can break the tie.

## What we measured

We reran the careless-answer simulations (20 and 60 respondents, 15 and 30
options, 40 surveys per setting) and gave every simulated answer a time. We
don't have real answer times from this product yet, so the timing model is an
assumption, and we varied it instead of trusting it: careless people at the
same pace as everyone, at 0.6x and at 0.4x; honest people who do or don't
slow down on close calls; a narrow or wide spread of natural paces.

Two signals:

- **Pace**: a person's median time per pick over the panel's typical median.
- **Slope**: whether a person slows down on the pairs the rest of the panel
  finds close.

## What we found

| | pace separates them (AUC) |
|---|---|
| careless at the same pace | 0.50-0.56 (can't) |
| careless at 0.6x pace | 0.83-0.90 |
| careless at 0.4x pace | 0.95-0.98 |
| **a genuine minority camp vs the majority** | **0.50-0.56 (never)** |

Pace has no opinion about taste, so it never mistook the camp for careless
clickers. That is the property the agreement check lacked. And it reaches
where agreement can't: when half the panel picks by the wrong reason, they
*are* the consensus, agreement flags almost none of them, and leaving out the
fast people recovered 0.10 to 0.23 of rank correlation with the truth (when
they were quicker).

The slope looked promising and isn't. A camp's hard choices are close in
*its* taste, not the panel's, so a camp looks flat too: the same confusion
as agreement.

The catch: if careless people are no quicker, dropping fast respondents just
removes quick honest people. On panels with a wide natural spread of paces,
that cost up to 0.019.

## What shipped

The ranking now carries a `pace` note: how many respondents answered in under
half the typical time per pick, and how many of the out-of-step respondents
were among them. "Fast and out of step" looks like careless clicking; "out of
step at a normal pace" looks like a different taste, and the note says so.
A "Rank without the fast answerers" button (`?drop=fast` on the API) shows
the ranking without them, side by side with the default, which still counts
everyone. Whether to drop them stays with the survey owner, because the gain
rests on an assumption no one has checked on this product yet.

The next step is the first real survey's answer times: how spread out honest
paces are, and whether the out-of-step respondents really are quicker.

Method, numbers and the raw rows: `docs/INFORMATION-GAIN-SELECTOR.md`,
"Answer times: telling a careless block from a camp", and
`scripts/answer-time-sweep.ts` in the venture.
