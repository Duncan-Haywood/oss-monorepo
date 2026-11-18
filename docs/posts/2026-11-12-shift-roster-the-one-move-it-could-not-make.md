---
title: "Fifty-one changes where two would do: checking a scheduler against an exact solver"
seo_title: "Schedule changes after a call-out: how many reshuffles are needed"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement, optimization]
description: "On a 60-person week, one call-out made our rebuild move 51 shifts. An exact solver showed 2 were enough. The missing move: trade up to the longer shift."
---

When someone calls out after the schedule is posted, [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) rebuilds the rest of the week and tries to keep everyone else on the shifts they were given. That matters because each change to someone's posted shift is a phone call, a disrupted plan and, under some local scheduling rules, a premium the business owes.

Earlier today we checked that rebuild against an exact solver on two small invented cafés. On 41 call-outs it made the fewest changes possible once every change is counted. This run asked the same question on bigger teams: the four built-in templates and seeded weeks of 20, 30, 40 and 60 people, 152 call-outs in all.

## The check

The solver is an integer program (HiGHS, through scipy) written separately from the scheduler. It has the same hard rules: availability, the rest gap between shifts, weekly and daily hour caps, and days in a row. For each call-out it first finds the fewest hours that must go uncovered, then the fewest changes to other people at that coverage, counting changes the way the scheduler's own change report does. Every roster the scheduler produced was also checked against those rules and recounted. All of them followed the rules, and every count matched.

## What it found

At 60 people the rebuild made 76 changes across 24 call-outs. The fewest possible was 24. Almost all of the gap was one call-out: a person off on Thursday, where the rebuild moved 51 shifts and the solver needed 2.

The single change the solver used on a similar 40-person week shows what was missing. The person who called out had a 6am to 2pm shift. Someone else was already on a 6am to 11am shift that day. The solver moves that person up to the longer shift and leaves the shorter one open. That's one change, and three fewer uncovered hours.

The rebuild couldn't make that move. Its fast first draft only gave an open shift to someone who could take it on top of what they already had, and the cleanup pass after it never touches open shifts. So the draft started three hours short. On a big week the slower exact stages ran out of time before finding the shortcut, and they closed the gap with a chain of moves through other people.

## The fix

The first draft now ends with "eject" moves. For each shift still open, longest first, someone can take it by giving up one shift of theirs that clashes with it. The shift they give up goes to whoever fits it best, or stays open. The move is kept only when it improves the week's score, and covering hours dominates that score.

| call-outs | fewest possible | full rebuild | keep posted, before | keep posted, now |
|---|---|---|---|---|
| 40 people (24) | 33 | 603 | 40 | 37 |
| 60 people (24) | 24 | 1,623 | 76 | 26 |

Payroll on the 60-person weeks went down slightly too ($457,472 to $457,398). The templates and the 20 to 30 person weeks came out identical, to the dollar, because their first drafts never needed the move.

## The changes that are left are choices

Some call-outs still make more changes than the minimum: 19 of 152. For each one, we took the solver's fewest-change roster and scored it with the scheduler's own scoring. On all 19 it scored worse. Keeping a posted shift is worth one hour of that person's pay by default, and on those weeks one more change saves more than that in pay, hours fairness or preferences. On the salon template, the fewest-change week costs $46 less in wages but spreads hours less fairly.

So the remaining gap isn't the search failing. It's a setting doing its job, and a manager who wants fewer changes at any price can turn it up (`--keep-posted 3` on the command line).

## Limits

These are seeded and invented weeks, not a real store's. On the seeded weeks the check samples four call-outs a day rather than every one. The solver's rules are our own transcription, checked against every roster here but not proven equal to the scheduler on every input. The eject move gives up one clashing shift; trading two for one isn't tried yet. Everything is in the [repository README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder), section "Are the big-week reissues' changes needed?", with the scripts and outputs in `eval/`.

Arithmetic on invented data, not legal advice: whether a premium applies to a schedule change, and to which changes, depends on your local rules.
