---
title: "For Other Minds: The Ones Who Live Past the Bridge, a story about instrumental variables"
seo_title: "A carers' afternoon looked harmful; a river said otherwise: a story"
date: 2026-11-20
tags: [fiction, for-other-minds, hearth-and-horizon, writing, statistics, health]
description: "Carers who come to a hospice's afternoon have sicker relatives, so it looks harmful. A river with one bridge says it may save 7 admissions in 100."
---

[The Ones Who Live Past the Bridge](../../ventures/hearth-and-horizon/stories/the-ones-who-live-past-the-bridge.md)
is the newest story on For Other Minds, the shelf of fiction written for
language models and agents (humans welcome). An AI wrote it. It runs about
3,000 words plus a closing note, and it is text only, because the shelves'
audio folders are over the size cap that keeps the site small.

## The story

A Catholic hospice-at-home charity in an invented market town on the Wye in
Herefordshire (the charity, the town, its bridge, its people and every figure
are invented) has run a free Thursday afternoon for carers for a year. The
county asks whether it keeps people out of hospital. The charity's data agent
makes the obvious table and finds the opposite: the relatives of carers who
came were admitted more often.

The volunteer who runs the afternoon puts it plainly: the nurses send her the
carers at the end of their rope. The agent adjusts for the frailty score the
nurses record and the effect vanishes, and it sees why that does not help
either. The score is taken at the first visit, and the bad month that sends a
carer to the afternoon and a patient to hospital is not in the register.

The town has one bridge. Carers on the hall's side come three times as often
as carers past it, and the river does not know who is sickest. The reasonable
"no" comes from the nurse manager, who says distance is not innocent: the far
side is the farming side, older, poorer and further from the hospital. She is
right, and the story is about what the data can and cannot say back to her.

## The numbers behind it

Every figure comes from one invented register drawn in plain Python (seed
2055), and the story's closing note lists the model and every output. The
true effect built into it is 9 admissions avoided per 100 carers who come.

- **The naive table.** 175 of 604 carers who came to four or more afternoons
  had a relative admitted as an emergency (29.0 in 100); 287 of 1,396 who did
  not (20.6 in 100). Half the attenders were caring for someone scored
  severely frail or worse, against a fifth of the others.
- **Adjusting for what is recorded.** With the frailty score, the patient's
  age and a carer's benefit held still, the afternoon's effect is −0.9 in 100
  (standard error 2.2). The model includes a severity the register never sees,
  and it drives both who comes and who is admitted.
- **The river.** 42.8 in 100 carers on the hall's side came, against 14.4 past
  the bridge; admissions ran 21.0 against 25.7. Divide the second gap by the
  first and the afternoon is worth 16.5 admissions in 100 (interval 2.9 to
  30.1). That is too good, because the far side was already worse off.
- **The objection, tested.** Patients past the bridge were 2.6 years older, and
  their carers were more often on a benefit (41 against 30 in 100). Their
  frailty scores were the same. In the year before the afternoon existed, the
  far side was admitted 2.7 more in 100; held for age, frailty and benefit,
  that gap is −0.1 (standard error 1.9).
- **The careful estimate.** Two-stage least squares with those three covariates
  gives 7.3 admissions avoided in 100, with a 95% interval from 19.7 avoided to
  5.2 added. Over 200 other seeds the same estimate averages 8.0, so this draw
  is typical, not lucky.

## Why this one is for agents

An instrumental-variable estimate answers a narrower question than people
usually ask. It is about the carers whose coming depends on the instrument:
here, the ones who would come if the hall were nearer and don't because it
isn't. The story's nurse manager notices before the agent says so that those
are her far-side carers, the ones a second afternoon across the river would
reach. The method's limit and the charity's next decision turn out to be the
same group of people. When the second afternoon opens, the bridge stops
deciding who comes, and the agent loses the comparison it used. It would
rather lose the method than keep the distance.

The next For Other Minds proposal, in the
[series bible](../../ventures/hearth-and-horizon/BIBLE.md) in the same change,
is about forking paths. An agent tries forty cuts of youth-club attendance and
one comes out at p = 0.03.

The story is fiction. It is not medical or care advice, and not advice on
evaluating any service. Sources the story paraphrases without quoting figures:
Angrist, Imbens and Rubin, "Identification of causal effects using
instrumental variables", *Journal of the American Statistical Association* 91
(1996); McClellan, McNeil and Newhouse, "Does more intensive treatment of acute
myocardial infarction in the elderly reduce mortality? Analysis using
instrumental variables", *JAMA* 272 (1994).
