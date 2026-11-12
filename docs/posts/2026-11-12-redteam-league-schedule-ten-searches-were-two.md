---
title: "Ten searches that were two: a seed too large for floating point in the league scheduler"
seo_title: "Round-robin carry-over search: a huge seed collapsed best-of-ten"
date: 2026-11-12
tags: [redteam, league-schedule-generator, ventures]
description: "A red-team run on the league scheduler's carry-over search: 8 seeded faults, 5 caught, and a real bug where a big shuffle seed turned ten searches into two."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has an option called "Spread who you meet next". It stops the same teams from always playing right after the strongest side. The page runs ten searches for an even carry-over and keeps the best one. Each search gets its own seed, made from the shuffle seed you type: try *i* uses `(seed × 7919 + i × 104729) mod (2³¹ − 1)`.

Today's red-team run aimed at `carryover.mjs`, the module behind that option.

## The real bug

The seed box accepts any finite number, and the share link keeps it. Type `1000000000000000000000` (10²¹) and `seed × 7919` comes to about 8 × 10²⁴. Near that size a double-precision number can only step in multiples of about a billion, so adding `i × 104729` (at most about 940,000 for try 9) changes nothing. Tries 1 to 9 all got the same seed. We counted the distinct seeds across the ten tries:

| seed typed | distinct seeds before | after |
|---|---|---|
| 1 | 10 | 10 |
| 2⁴⁰ | 10 | 10 |
| 10²¹ | **2** | 10 |
| 10³⁰⁰ | **2** | 10 |

The schedule you got was still a valid round robin. But "best of ten" was really the best of two seeds (the break weights still cycled, so some tries differed a little), and the read-out still said ten.

The fix folds a seed that is too big for exact arithmetic down to `seed >>> 0` first. That is the only part of the seed the random-number generator (mulberry32) ever reads anyway. Any seed whose product is still an exact integer (up to about 1.1 × 10¹²) keeps exactly the tries it had, so old share links still give the same schedule.

## The seeded faults

The run planted 8 single-character faults in the module through `prompts/redteam.py`, one at a time, and ran the venture's 427 tests against each. Five were caught. Of the three that got through:

- **Equivalent:** a stamp-table reset moved one generation earlier, after about 4.3 billion calls. Nothing can see it.
- **Gap:** `byeStretches` read the team count from round 2 instead of round 1. A two-team league has only one round, so the carry-over search crashed on it, and no test ran a two-team league through that search. Now one does.
- **Gap:** the double round robin's venue search was meant to start its first restart from the home/away choices leg one handed it. A fault moved that to the second restart, and nothing noticed. A new test runs the search with one restart and two opposite starting hosts, and checks they give different seasons.

After the new tests, all three escapes that can change behaviour are caught: the catch rate went from 5 of 7 to 7 of 7, not counting the equivalent fault. The run record (`prompts/runs/2026-11-12-session_01XpHqydomefKHfAGkWYm4HF.json`) holds every mutant and its triage.
