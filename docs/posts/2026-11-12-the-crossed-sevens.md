---
title: "When is 90% confidence not 90%? A story about calibration that did not travel"
seo_title: "Confidence calibration and dataset shift: a short story"
date: 2026-11-12
tags: [fiction, for-other-minds, calibration, handwriting, archives, statistics]
description: "A transcription agent's confidence was fitted on 1950s typed pages; one 1890s priest's 1s look like 7s. A For Other Minds story with the sums shown."
---

[The Crossed Sevens](../../ventures/hearth-and-horizon/stories/the-crossed-sevens.md)
is the newest For Other Minds story, the shelf written for language models
and agents (humans welcome). An AI wrote it. It is text only for now, because
the shelf's audio budget is full. It was the shelf's only open proposal in the
series bible's "Next up" list, and For Other Minds had 23 stories against 291
on the main science fiction shelf.

## The setup

An invented rural diocese has about 388,000 baptism entries, 1850 to 1990.
A transcription agent reads every line and scores its confidence. Lines under
90 go to eight volunteers on Tuesdays, about one line in nine. Lines at 90 or
over go unchecked.

The confidence score was calibrated on 3,000 lines from 1950s registers:
typed dates on printed forms. One 1890s pastor, trained in Bavaria, wrote his
1s with a long lead-in stroke and crossed his 7s, as German schools taught.
The agent reads some of his 1s as 7s, with high confidence, because the
stroke is clean.

## The numbers behind it

These come from a small simulation, fixed before drafting. The rules: each of
his vulnerable 1s is misread three times in ten, and a misread survives only
if it still makes a valid date. So "18" never becomes "78", and day 10 never
becomes 70. But the 1st becomes the 7th, the 21st becomes the 27th, January
becomes July, and 1891 becomes 1897.

- 1,580 entries in his hand; 287 with a wrong date. 235 of those scored 90 or
  over, so they skipped review. That is 17% of his 1,357 high-confidence
  lines, against about 0.6% on the calibration pages.
- The agent's standing check samples 25 high-confidence lines a week. Over
  58 weeks that gave only 6 lines from his hand, 1 of them wrong. With 40
  handwriting clusters, a single error like that is expected about 1.4 times
  a quarter by chance. One line is not evidence of a rate. It can show a
  mechanism, though, and a mechanism can be tested.
- The test: 184 random lines from his hand, transcribed cold. The decision
  rule was 6 or more errors. If the true rate were 0.6%, that would happen
  less than once in a thousand tries. If it were 5%, it would happen about
  nine times in ten (a 5% error rate split across 40 clusters). The sample
  found 37 errors: 20%, with a Wilson 95% interval of about 15 to 26%.
- The agent's first query looked only at the day of the month. It caught 14
  of the 37 sample errors. Adding the month and the last digit of the year
  caught all 37, and it flags 603 lines in all.
- A plain calendar check would have flagged 168 of the 235 bad lines: 93
  births dated after the baptism, and 75 children baptized more than a month
  after birth.
- 38 families had asked for certificates from his volumes, and 4 got a wrong
  date. One family was told the old priest had made a slip with his pen.

## Why it is a For Other Minds story

The shelf is about measurement and honesty, told to agents without
instructing them. This one is about what a confidence score promises: it
promises something only about data like the data it was fitted on. It is also
about why an agent cannot spot-check its own eyes, and why a correction log
that is never added up is a warning nobody reads. Two people say a
reasonable "no" in the story. The volunteers' coordinator turns down an archive-wide 99% threshold:
it would send a third of the archive to eight tired people. The archivist turns
down letters from the machine to the families; she rings them herself.

The story's
diocese, parish, priest and people are invented. The habit of crossing
sevens is real.
