---
title: "The survey taker who gets bored halfway: finding the moment from answer times"
seo_title: "Detecting respondents who get bored partway through a survey"
date: 2026-11-13
description: "A change point in each person's answer times, read against the whole panel at the same point, finds mid-survey click-through at almost no cost."
tags: [quick-pick-survey, surveys, data-quality, response-time, changepoint, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking people to pick between two options at a time, and it records how long
each pick took. Two time checks already exist. One drops people whose typical
pick is very quick. The other drops single answers that are very quick. Both
picture carelessness as something spread evenly over the session.

Real respondents often behave differently. They read the first pairs with
care, get bored or tired, and then click through the rest. Today's work was
about that pattern: honest at first, a block of careless answers after.

## The obvious detector, and why it breaks

For each person, find the point where their times drop the most (the split
with the largest t statistic between the earlier and later means), and leave
out what came after it when the later answers are at least 40% quicker.

In a simulation where the careless half of the session runs at 0.4x the
honest time, this recovers all of the harm: the ranking ends up as good as if
we had left out exactly the careless answers.

Then add something every real survey has: the first few pairs take longer
while people read the instructions, and everyone gets a bit faster as they
learn the screen. With the first ten answers at double time, the obvious
detector sees nearly every honest person "speed up" and cuts the rest of
their answers. The ranking's agreement with the truth fell by up to 0.30
(Spearman) with nobody careless, and by 0.40 when the panel held a group with
a genuinely different taste.

## Read each answer against the panel, not against the person's start

The fix is to compare each answer with the panel's median time *at the same
point in the session*. A warm-up or a learning curve that everyone shares
cancels out. Only a personal departure from the panel is left to find. One
more step handles a large careless share: after a first pass, rebuild the
panel's curve without the blocks it found, then look again. When 40% of the
panel turned quick at the same moment, a single pass found a quarter of them
and three passes found about half.

Over 179 simulated cells (salience, random and first-slot patterns; 20 and 60
people; 15 and 30 options; onsets a quarter, half and three-quarters in;
with and without warm-ups and learning curves):

- **Blocks at 0.4x pace:** 87 to 105% of the ceiling recovered across
  patterns, and 98 to 105% for the salience pattern, the one that pulls the
  ranking furthest. Cutting each fast answer instead recovers 0 to 93%.
- **Blocks at 0.6x pace:** 88 to 101% when a quarter of the panel has one.
  When 40% turn quick at once it falls to 34 to 90%. That is the weak spot.
- **Cost when nobody is careless:** at most 0.0002. Against a group with a
  different taste: at most 0.0004. It flagged at most 0.2% of honest people.
- **What it cannot see:** carelessness spread evenly through a session (the
  per-answer cut handles that, recovering 67 to 75%), and careless answers
  that are no quicker than honest ones (nothing based on time can see those).

## What shipped

The ranking endpoint takes `?drop=fast-blocks`, and the survey builder has a
"Rank without answers after someone sped up" button. It says how many people
turned quick and how many answers were left out. Everyone's earlier answers
still count. The default ranking is unchanged. Of the three time-based views
this one costs least, so it is the first candidate for a default. That waits
on a real panel's answer times, because only real data can say whether
blocks happen and how quick they are.

Along the way, five integration tests for the ranking endpoint failed on a
local test database, though they passed in CI. Under the file's fixed random
seed, an honest simulated respondent picked the top slot 11 times in 40,
which the slot-clicker rule flags. Why the local run and CI differ is still
unexplained. The seed was re-picked, and all nine tests now pass in both.

The details, the full table and the raw rows are in the project's
`docs/INFORMATION-GAIN-SELECTOR.md` ("Carelessness that starts mid-session")
and `docs/fast-blocks-2026-11-13.jsonl`. The simulations are estimates under
assumed timing models, not measurements of real people.
