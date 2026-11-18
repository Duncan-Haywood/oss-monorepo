---
title: "Could the call-out rebuild have moved fewer people? An exact answer on 41 weeks"
seo_title: "Fewest schedule changes after a call-out, checked with an ILP"
date: 2026-11-12
tags: [shift-roster-builder, product, optimisation, scheduling, integer-programming]
description: "An independent integer program finds the fewest late changes after 41 call-outs. The default rebuild matches it on all 41 once the caller counts too."
---

Earlier today the [shift roster builder](https://marisstella.app/shift-roster-builder/) learned to [rebuild a posted week without reshuffling it](2026-11-12-shift-roster-keep-the-posted-week.md). When someone calls out, the rebuild holds the shifts that have already started and gives a small bonus for every posted shift that stays where it was. On 41 test call-outs, late changes to other people fell from 190 to 91, and so did the premiums owed under a short-notice rule.

That left an open question in the README: is 91 the least possible, or just better than before? The builder's search proves its roster is best *for its own score*. But the score counts kept shifts, not changes, and those aren't quite the same thing. So we checked from outside.

## The check

A second program writes each of the 41 weeks as an integer linear program and solves it with HiGHS, an open-source solver, through scipy. It shares no code with the builder. It solves each week twice:

1. **Fewest open hours** under the hard rules alone: who is available (with the caller off and the started shifts pinned), one person per shift, the rest gap between shifts, weekly and daily hour caps, and days in a row. These are the same rules an earlier check matched against the builder on 59 call-out weeks.
2. **Fewest changes at exactly that many open hours.** Changes are counted the way the builder's own `scheduleChanges` report counts them: a shift kept at the same start and end is free. On each day a person's leftover old and new shifts pair off as moves, and anything left over is a cancellation or an addition.

As a cross-check, it also scores every roster the builder produced, 123 in all, by the same count. All 123 counts match the report's, and none breaks a rule.

## What it found

| 41 call-outs, same open hours (431 h) | changes, caller exempt (the study's count) | changes, caller counted too |
|---|---|---|
| fewest possible | 88 | 153 |
| rebuild from scratch | 190 | 269 |
| **keep the posted shifts (default)** | 91 | **153** |

The two columns tell different stories, and the difference matters.

The original study exempted every change made to the person who called out. Under that count, the fewest possible is 88, three below the builder's 91. On each of those three weeks, the integer program takes the same shortcut: it shuffles the caller's *other* shifts, which count for nothing, to save one change for someone else. For example, Gus calls out for Wednesday. The program moves Gus onto Thursday and Friday late shifts so that Ben gives up only one of his. Counted over everyone, both rosters make six changes.

When every change counts, the caller's included, the default rebuild reaches the fewest possible on all 41 weeks.

We think the second column is the right target. Calling out for Wednesday is a request to change Wednesday, not a request to have your Thursday and Friday rearranged. Whether a particular scheduling rule excuses those other changes is for the operator to decide; we didn't read any ordinance for this. But counting them is the stricter reading, and under it there's nothing left to gain. So the builder stays as it is.

## What didn't help

We also tried a second bonus for a shift on a day the person was already scheduled, at a different time. In theory, that makes the score fall by exactly one step per change. It didn't change a single one of the 41 rosters, so it wasn't kept.

## Limits

These are two invented cafés and 41 call-outs. The integer program's rules are our own transcription, cross-checked against the builder rather than proven equal to it on every input. Its second stage ignores pay and fairness, so a roster with the fewest changes can cost more. A real posted schedule and a real call-out log would tell us more than any of this.

The scripts are `eval/reissue-ilp-export.mjs` and `eval/reissue-ilp-check.py` in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder). The tool is free and MIT licensed. It does arithmetic on the rules you enter and is not legal advice.
