---
title: "A show of hands picks the wrong shortlist more often than the model does. Combining a team's top 3"
seo_title: "How to combine a team's top 3 picks: vote count vs Bradley-Terry"
date: 2026-11-14
tags: [pairwise-comparison, bradley-terry, team-decisions, quick-pick-survey, simulation]
description: "On 432 simulated teams, a show of hands on everyone's top 3 named the group's true shortlist 72% of the time; the Bradley-Terry model, 78%."
---

The [rank-a-list page](https://marisstella.app/quick-pick-survey/rank.html) has
a "find my top k" mode: you ask "which 3 features this quarter?", send the link
to the team, everyone answers "this or that?" until their own shortlist
settles, and they paste result codes back. Until today, combining those codes
gave the team a full ranked table with rank ranges, and the team still had to
read its shortlist off it with no idea how sure to be.

Now a shortlist link's combine step leads with the answer: the team's top 3,
each with its chance of really being in the top 3 for these people and for the
wider group they stand for, the closest option left out, and how many people
had each one in their own top 3.

## The obvious method, measured

The obvious way for a team to pick a shortlist is a show of hands: everyone
names their own top 3 and the three most-named win. That is also what the page
could have shown as the headline. So before choosing, the run measured both on
simulated teams (`scripts/team-shortlist-sweep.mjs`): a wider group with true
scores, team members who each differ from it by a random amount per option
(tau, in logits), every member answering the page's own shortlist questions
until its own stop rule fires, 10 to 20 options, teams of 3, 5 and 8, 16
teams per cell, 432 teams in all.

| how the team's top 3 is picked | right for the team's average likes | right for the wider group |
|---|---|---|
| the model's group order | **338 / 432 (78%)** | 255 / 432 |
| show of hands on everyone's top 3 | 311 / 432 (72%) | 241 / 432 |

The gap is widest exactly where a team needs help: when people's likes differ
(tau 2: 108 against 90 of 144 teams) and when the team is small (teams of 3:
108 against 94). A show of hands throws away how close each person's own cut
was. Someone whose 3rd and 4th choices were a coin flip counts the same as
someone who would fight for their 3rd.

## Is the page honest about how sure it is?

The chances it prints came out close to calibrated and slightly cautious. When
people's likes differed most, the shortlist's average "chance for this group"
was 0.89 and 92% of those options really were in; the "wider group" chance
was 0.72 and 75% really were. That second number is the useful warning: a small team whose
members disagree strongly cannot tell you what your customers' top 3 is,
and in 95 of those 144 simulated teams the shown top 3 was not the wider group's.

The vote count is still on the page, as a number next to each option: a
shortlisted option most people left out of their own top 3 is worth a
conversation before anyone commits to it.

The full table, the calibration by tau and the tests are in
[`docs/RANK-PAGE.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md),
"A team's shortlist". Limits: simulated people with evenly spaced likes, no
ties or fatigue, and k = 3 only.
