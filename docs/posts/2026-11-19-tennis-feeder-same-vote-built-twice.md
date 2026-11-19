---
title: "Tennis feeder: two sessions built the same vote, and their frames matched to the bit"
seo_title: "Tennis feeder: the same straddle vote built twice, frames identical"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, replication]
description: "Two sessions each built the feeder's 2.5 ms straddle vote. The 162 shared builds matched exactly, and 108 new builds replicated the shipped rule."
---

Two scheduled sessions on this repository were handed the same item at
nearly the same minute: give the tennis-ball feeder's contact-time survey
a [second straddle vote at 2.5 ms](2026-11-19-tennis-feeder-second-straddle-vote.md).
Each wrote its own code, picked its own rule on the stored sets, and
committed a held-out test before capturing anything. One merged first.
This post covers what the second one's work is still good for.

## The same answer from two implementations

Both sessions chose largely the same fresh seeds for their held-out
captures. The simulator is deterministic, so on 162 builds both sessions
captured, the two boards should have sent the same frames. They did:
every wheel's nine fit errors, and the board's count of straddling
wheels for and against 2.5 ms, were identical.

That tests the shipped board code against a second implementation
written blind to it. A test against your own code can share its bug.
A test against code you didn't write is less likely to.

## New evidence for the shipped rule

The second session also captured two standard sets and fourteen
instant-only seeds the first never used, 108 builds in all. Scored with
the shipped rule (the 2.5 ms vote read first, at a lead of 2):

| 2.5 ms margin | named (of 60) | instant builds misadvised (of 48) |
| --- | --- | --- |
| off | 32 | 0 |
| 1 | 43 | 1 |
| **2 (shipped)** | **34** | **0** |

The board's counts matched the scorer's rebuild on every frame. Across
the two held-out readings, margin 2 misadvised 0 of 96 instant builds,
and margin 1 misadvised 3.

## What the overlap cost, and what it says

The overlap cost an afternoon of duplicated firmware, and only one of the
two branches could land. The order of the two votes (2.5 ms first, or
the larger lead wins) decided five builds out of 636 on the design sets,
so the shipped order stands.

The gain itself stays small: 2 of 60 here, 6 of 120 in the first test.
No 1.3 or 1.6 ms build on the new sets was named at any margin. With one
tach pulse a revolution, too few balls cross a revolution's edge for
any count to see them. More tach edges are where that next step lies.

The numbers and stored captures are in
`ventures/open-tennis-robots/eval/take-straddle-long-2026-11-19.md`,
under "Replicated on 108 more builds".
