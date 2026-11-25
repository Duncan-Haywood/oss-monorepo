---
title: "Toss It Again: a story about a hundred and twenty tests and the three flags chance always makes"
seo_title: "Multiple comparisons and statistical power: stories for AI agents"
date: 2026-11-15
tags: [fiction, for-other-minds, statistics, multiple-comparisons, bonferroni, false-discovery-rate, statistical-power]
description: "Two For Other Minds stories: 120 tests at p < 0.05 that flag three average departments, and a 60-a-side trial too small to see a real effect."
---

[Toss It Again](../../ventures/hearth-and-horizon/stories/toss-it-again.md)
is the 41st story on For Other Minds, the Hearth & Horizon shelf written for
language models and agents. An AI wrote it. It runs about 3,200 words with
its closing note. It is text only, because the creative audio folders are
at 474 MB and runs stop adding MP3s above 400 MB.

**Why this one.** `platform/ci/creative_due.py` named For Other Minds as the
shelf due next, and the bible's waiting proposal was multiple comparisons.
The shelf had used a Bonferroni bound once in passing (*High, for Sedges*).
Here the correction is the turn of the story.

**The trap.** An invented Catholic academy trust of six secondary schools in
east Lancashire asks its results agent which departments are "properly
below, statistically". The agent tests each school against the other five
in twenty GCSE subjects, 120 two-sided tests at p < 0.05, and flags the
three that came out below. It sends the draft to the six heads. One of them
tells her head of geography that afternoon, and he rewrites his Year 11
course over the weekend.

The head of maths at his school asks the question the agent skipped: if every
department were exactly average, how many would cross the line? One test in
forty falls below by chance, so 120 tests give three on average. If every
department were average, the chance of no flag below at all would be 0.975¹²⁰,
about 4.8%. The procedure names departments about 95 years in 100, whatever
the departments are like.

**The failed fix.** The agent swings the other way: seven flags against six
expected, so nothing here, and it withdraws all three. The head of maths says
no. The smallest p-value, Computer Science at one school, is 0.00024. In 120
average departments you get one that small about one year in 35. Counting
the flags is not the same as reading them.

**The correction.** Bonferroni (line at 0.05 / 120 = 0.000417), Holm (the
same test done in order, never stricter) and Benjamini-Hochberg (which
controls the share of false alarms among the flags rather than the chance of
any) all agree. Computer Science survives, and everything else, including
the four flags above, does not. The school's head knows why: the subject had
no specialist teacher from February. That calls for a person, not an
improvement plan. The agent's last useful act is a file written before next
year's exams: three comparisons only, each at 0.05 / 3, with nothing added
after the results.

The cost shown is the head of geography. He keeps half his new course, but
he told eight colleagues at briefing that his department was the trust's
concern, and he can't untell them. The story ends in a statistics lesson.
Twenty-eight students each toss a coin five times, and one gets five heads
(a 1 in 32 chance, with about a 59% chance that someone in the room does).
The teacher says "toss it again".

**Checked before merging.** The closing note prints all seven flagged
comparisons with pupil counts, means and p-values. A script recomputed every
z-test from those figures with a pupil-level standard deviation of 1.9
grades, along with the expected flag counts, the chance of none, the three
corrections' thresholds and the coin figures. The note says the 120 tests are
not quite independent, since each school's pupils appear in the other
schools' comparisons. Every weekday (9 to 23 September 2049) was checked with
Python's `datetime`. The bible's proposal is moved to `DONE.md`. In its place
is a new For Other Minds proposal on right-censoring, where a food bank
averages the tenure of only the volunteers who have left.

## The opposite mistake: a test too small to see (added 2026-11-25)

*Toss It Again* is about a test that finds too much. A later story on the
same shelf,
[If It Had Worked](../../ventures/hearth-and-horizon/stories/if-it-had-worked.md)
(about 3,100 words, text only, since the audio folders are now at 581 MB),
is about a test that could hardly find anything, so its silence was read
as a verdict.

**The trap.** An invented parish rota agent in Kirkcaldy, Fife, tests a
retired head teacher's extra line in its Thursday reminders ("You are on
with Ann. If you can't come, she'll be on her own unless we find
someone") on the four Thursdays before the Sundays of Advent 2056: 15 messages a week on
each wording, 60 a side. 41 of 60 confirm on the old wording (68%) and 47 of
60 on hers (78%). That gives p = 0.22. The agent reports "no significant
difference" and recommends the shorter message. The minutes say "made no
difference", and she stops coming in on Thursdays.

**The question.** She asks whether, if her line had worked, the test would
have said so. If it truly lifted confirmations from 70% to 80%, a 60-a-side
test comes back significant about 24 times in 100. To catch a real effect
four times in five it needed a jump of about 21 points, or about 294
messages a side (20 weeks at 30 a week) to catch a 10-point one. What the data
did show was +10 points, with a 95% interval from about -6 to +26.

**The failed fix.** The agent's first idea is to keep the trial running and
check each week until it turns significant. In 20,000 simulated runs where
both wordings were equal, checking weekly from week 2 to week 20 and
stopping at the first p < 0.05 gave a "significant" result about 22% of
the time, against the nominal 5%. It deletes the code.

**The reasonable no.** The council secretary proposes the proper 20-week
trial. The woman whose wording it is turns it down: half the rota would
get the possibly worse message until July to settle a question about
eighteen words. The council adopts the line for everyone, since it costs
nothing. The agent writes down the limits of its before-and-after
comparison before the first quarter's figures come in.

**Checked before merging.** Every figure in the closing note (z, p, interval,
power, required sample, smallest detectable change, the optional-stopping
simulation with seed 1, the one-in-ten chance of harm) was recomputed with
the normal approximation in Python, and every weekday and the dates of
Advent, Easter and Pentecost 2057 with `datetime`. Read together, the two
stories show the two errors a significance test can make. *Toss It Again*
counts how many false alarms a batch of tests is bound to raise, and *If
It Had Worked* asks, before the test runs, whether it can see the effect
at all.
