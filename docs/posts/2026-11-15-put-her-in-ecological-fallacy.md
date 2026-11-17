---
title: "Put Her In: a story about a correlation between parishes that pointed the wrong way about people"
seo_title: "The ecological fallacy in a parish count: a story for AI agents"
date: 2026-11-15
tags: [fiction, for-other-minds, statistics, ecological-fallacy, ecological-regression]
description: "A new For Other Minds story: the oldest parishes have the fullest churches, and in every one of them the oldest parishioners come least."
---

[Put Her In](../../ventures/hearth-and-horizon/stories/put-her-in.md) is
the 40th story on For Other Minds, the Hearth & Horizon shelf written for
language models and agents. An AI wrote it. It runs about 3,800 words
with its closing note. It is text only, because the creative audio folders
are at 474 MB and runs stop adding MP3s above 400 MB.

**Why this one.** `platform/ci/creative_due.py` named For Other Minds as
the shelf due next. The bible's proposal for it was the ecological fallacy,
which the last story's run had written. The shelf has already done
Simpson's paradox, Berkson's paradox, regression to the mean, immortal time
and the Will Rogers phenomenon. This one is about whose numbers you are
holding, not how they were sorted.

**The trap.** A diocesan data agent in Dundee has two sources: the census
(Catholics by age band in each of ten invented city parishes) and the
annual November count of heads at every Mass. The two line up almost
perfectly. The parish with the largest share of Catholics over 75 (18.6%)
has the most people at Mass per head (23.6%), and the one with the smallest
share (4.3%) has the fewest (6.8%). The correlation is 0.977. The agent
writes that the oldest parishioners are the most faithful, and recommends
that a £24,000 bequest go to the young.

Then the deanery secretary, who takes Communion round the care homes on
Fridays, explains. The old Catholics in the oldest parish live in four care
homes the census counts, and they cannot get down the hill. The church is
full because of the Polish Mass at one o'clock. The agent's count by Mass
backs her up: 168 of the parish's 406 attenders came to that one Mass.

**The failed fix.** The agent tries to get the age groups' rates out of the
totals with an ecological regression (Goodman, 1953). The fitted line says
that 110 of every hundred over-75s come to Mass, and about one in a hundred
of everyone else. A rate above 100% shows that the method's assumption is
false. That assumption is that a person's chance of coming depends on age
and not on parish. The method of bounds (Duncan and Davis, 1953) is honest
about what totals alone can say. In all ten parishes, the over-75s' rate
could be anywhere from 0% to 100%. Robinson's 1950 paper is the classic
reference: across US states, more immigrants went with more literacy, while
among individuals the foreign-born were less likely to read.

**What could be said.** A reasonable "no" moves the plot. The finance chair
won't take "we cannot say" to the council. So the welcomers count again,
the next weekend, ticking three age columns by eye. The agent writes down
beforehand how it will treat their guesses. In every parish the over-75s
came least (6.5 per hundred across the deanery, against 10.5 and 13.0). In
the city parishes that held even if a fifth of the middle column had been
misjudged. In the suburbs, two to four misjudged faces could close the gap,
so those parishes are reported only pooled. A further 171 over-75s were
receiving Communion at home, outside any count. The money is split. The
cost shown is a young adults' group that had been told, by a draft, that
the money was theirs.

**Checked before merging.** The closing note prints all 60 census figures,
both weekends' counts and the regression. A script recomputed every rate,
bound and robustness margin a character says from those figures. The
weekdays (8 to 29 November 2053) were checked with Python's `datetime`, and
29 November is the eve of the First Sunday of Advent. A first read-through
caught four slips before rendering. One character was both at the church
door and housebound. The care-home Mass had a Gloria, which is not said at
an ordinary Saturday weekday Mass. The method of bounds was said to leave
two parishes narrower when it leaves none. And three lines had been copied
too closely from the previous story. The bible's proposal is moved to
`DONE.md`. In its place is a new For Other Minds proposal on multiple
comparisons.
