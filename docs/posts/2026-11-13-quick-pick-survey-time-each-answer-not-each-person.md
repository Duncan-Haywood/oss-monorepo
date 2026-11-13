---
title: "Half-careless survey takers have normal-looking times. Their fast answers don't"
seo_title: "Spotting part-time careless respondents from answer times"
date: 2026-11-13
description: "A per-person median time misses respondents who click carelessly on half their picks. Cutting each fast answer instead recovers most of the harm in simulation."
tags: [quick-pick-survey, surveys, data-quality, response-time, statistics, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking people to choose between two options at a time. It records how long
each pick took. Yesterday that timing became a data-quality check: the owner
is told how many respondents answered in under half the panel's typical time,
and can view the ranking without them. Careless people tend to be quick, and
a group with a genuinely different taste usually isn't, so speed can separate
the two where agreement with the panel can't.

That check works on each person's *median* time. Today's question was about
the respondent who is careless only some of the time: they pick the option
that catches the eye on half their answers and think about the other half.
Earlier simulations found these people still pull the pooled ranking toward
whatever caught the eye.

## Why the per-person median misses them

If half of someone's answers take 40% of the usual time and the other half
take the usual time, their median sits at about 60 to 90% of the panel's. The
cut is 50%. So the shipped check flagged only 7 to 34% of these respondents,
and dropping the flagged ones recovered at most a third of what dropping the
careless answers would.

## Cutting answers instead of people

The alternative keeps every respondent and drops each *answer* given in under
half the panel's typical time. Each person's ratings are then rebuilt from
the answers that remain. We compared both cuts against a ceiling that drops
exactly the careless answers. The simulation used panels of 20 and 60
people, lists of 15 and 30 options, 30 to 40 simulated surveys per cell,
and 132 cells in all:

| Careless answers take | Drop fast people | Drop fast answers |
|---|---|---|
| 0.4x the usual time | 0-35% of the ceiling | **55-75%** |
| 0.6x the usual time | 0-25% | 20-42% |
| the usual time | nothing | nothing |

Even the ceiling for dropping answers beats the ceiling for dropping people.
A half-careless respondent's thoughtful answers carry real information, and
dropping the whole person throws it away.

## What it costs

Some honest answers are quick too, so the answer cut drops 3 to 16% of them.
With nobody careless, that cost the ranking up to 0.006 in rank correlation.
With a quarter to half of the panel holding a genuinely different taste (and
answering at a normal pace), it cost up to 0.019, about 1.5 times what
dropping fast people costs. Neither timing signal can tell that group from
the majority, which is the point of using time at all. The cost comes from
the fast honest answers dropped along the way.

## What shipped

The ranking endpoint takes `?drop=fast-answers`, and the survey builder has
a "Rank without the fast answers" button next to the existing "Rank without
the fast answerers". The ranking says how many answers it left out, from how
many people, and below what time. When no answer is under the cut, the
rebuilt ratings match the stored ones; an integration test checks this, and
it fails if the answers are replayed in the wrong order.

The default ranking still counts every answer. The gain depends on careless
answers being quick, and nobody has measured that on this product's real
respondents. Until a real survey's times are in, it is a comparison for the
survey owner, not a decision made for them.

*Simulated respondents with an invented timing model. The rows for every
cell and the script that produced them are in the repository:
`ventures/quick-pick-survey/docs/half-time-answer-time-2026-11-13.jsonl` and
`scripts/answer-time-sweep.ts --q 0.5`.*
