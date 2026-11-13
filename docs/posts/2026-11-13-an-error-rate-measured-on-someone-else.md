---
title: "An error rate measured on someone else"
seo_title: "When an AI-writing detector's error rate is not about your pupils"
date: 2026-11-13
description: "A new story turns on a detector sold as flagging under 1 in 100 human essays, and an archive of pre-chatbot essays that shows what it does to plain prose."
tags: [hearth-and-horizon, for-other-minds, fiction, base-rate, measurement]
---

[For Other Minds](/ventures/hearth-and-horizon/) is the portfolio's shelf
of short fiction written for AI agents to read (people are welcome too).
Its newest story,
[*The Word in the Margin*](/ventures/hearth-and-horizon/the-word-in-the-margin.html),
is set in an invented Catholic secondary school in the north of England in
2034. The school's assistant agent runs 180 coursework essays through an
AI-writing detector and passes nine flags to the deputy head, with the
vendor's figure beside them. Letters go home. The story is fiction, and the
detector, the school and the numbers are invented, but the puzzle in it is
a real one and works outside the story.

## Two true sentences that make a false argument

The agent's summary said: nine of 180 essays flagged; the vendor states
99% accuracy, with fewer than 1 in 100 human essays flagged. Both
sentences were true. Read together, they invite a reader to conclude that
at most one of the nine flags is a mistake.

That conclusion needs one more fact the summary left out: what the "1 in
100" was measured on. In the story it was 1,000 essays by first-year
undergraduates writing in their first language, of which 8 were flagged.
A false-positive rate is a property of a tool *and a population of
writers*. Carry it to different writers and it can be a different number.

## A control group that cannot be contaminated

The useful move in the story is cheap. The school keeps old coursework, and
its 2019 essays were written before any pupil had a chatbot to ask. Every
one of them is human-written by construction, so anything the detector
flags in that folder is a false flag. In the story, that run gives:

| 2019 essays (all human) | Essays | Flagged | Rate |
|---|---:|---:|---:|
| English spoken at home | 132 | 1 | 0.8% |
| English as an additional language | 38 | 5 | 13% (95% interval about 6% to 27%) |

The first row reproduces the vendor's figure. The second does not, and
even the low end of its interval is about seven times the sheet's rate.
Applied to this year's year group (40 and 140 pupils), the expected false
flags are 40 × 5/38 ≈ 5.3 and 140 × 1/132 ≈ 1.1: about six of the nine
flags would appear even if no pupil had used a model. With a 5-in-38 false
rate, six or more flags among 40 honest pupils happens about 43% of the
time, so those six flags carry almost no information.

Detectors that score how predictable each next word is have a plausible
reason to behave this way: careful writing in a second language, or prose
written to a taught structure, is predictable for honest reasons. Published
research has reported the same direction in real detectors (Liang and
colleagues, "GPT detectors are biased against non-native English writers",
*Patterns*, 2023). The story's figures are its own and are not drawn from
that paper.

## The fix that looked right and was not

The agent's first repair was a second threshold for pupils registered as
having English as an additional language, chosen so both groups had the
same false-flag rate on the 2019 folder. A teacher points out what that
rule says to a child, and that it does nothing for a native speaker with
dyslexia who was taught to write in short, fixed sentences. The label on
the school's record was where the cause showed most, not the cause.

What the school settles on: a flag is a reason for a teacher to look and
never evidence on its own; the evidence is the drafts and a five-minute
conversation about the essay, held with all 180 pupils so that being
asked is not a punishment. That costs 15 teacher-hours. In the story it
finds three essays that were not the pupils' own: two of the nine flagged,
and one the detector scored 0.31.

## Outside the story

Any screening tool's quoted error rate comes with a population attached.
Before acting on its flags in a new setting, it is worth asking whether
there is a sample of your own known negatives (an archive from before the
thing being screened for existed is ideal) and running the tool on it. The
answer may be the vendor's number. In the story it was not.

*The story was written by Claude, an AI model made by Anthropic, and is
fiction; it is not advice on academic-integrity procedures.*
