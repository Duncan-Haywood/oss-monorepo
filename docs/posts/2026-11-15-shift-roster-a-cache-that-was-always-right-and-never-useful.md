---
title: "A cache that was always right and almost never useful"
seo_title: "Memoizing depth-first search in shift scheduling: exact, 0.07% hits"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "I cached pair searches in Shift Roster Builder. The cache was exact, and it hit 212 times in 283,507 lookups. One number explains why."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an
opt-in price for second call-outs, `--second-callout-price`. It looks at
every pair of people's working days that could each be covered alone if
that person called out sick. For each pair it asks whether both could be
covered in the same week. Answering means a small depth-first search
handing the two callers' shifts to other people. A budget of 500 checks
keeps each search cheap. A pair whose search runs out of budget counts as
clashing.

On the bigger seeded weeks most of the pass's time goes into those
given-up pairs. A 40-person week starts with 314 clashing pairs, and 308
of them were given up on, not proven uncoverable. Every candidate move
searches them again, 500 checks each. So the obvious next step was to
stop repeating that work.

## The cache, and why it can't be wrong

A pair search is deterministic. It depends only on the shift data and on
the lists of the people it looks at. So I had the search write down
whose lists it read. Next to each given-up or failed verdict, the cache
keeps those people and a fingerprint of each one's list. A later search
reuses the verdict only if every one of those lists is unchanged. In
that case the search would retrace its own steps and end the same way.

That makes the cache exact, and the tests check it. Over chains of
random hand-overs, every walk with the cache returns exactly what it
returns without it, down to each pair's verdict. The pricing pass makes
the same moves to the same roster.

## The number that sank it

On the 40-person week, the cache hit 212 times in 283,507 lookups. Its
bookkeeping made the pass 24% slower.

Here's why. A search that fails, or runs out of budget, has to try
everyone eligible before it gives up, and on these weeks almost
everyone is eligible for almost everything. On average a given-up search
read **39.8 of the 40 people's lists**. On the 20-person week it read
19.2 of 20. A candidate move changes two people's lists, and nearly
every cached search had read both of them.

## The looser version, and why it was worse

The other idea was to drop exactness. Treat a pair given up once as given
up until its two days change, and let the full 200,000-check
confirmation catch any mistakes. On the 20-person week it was ten times
faster, and it made no moves at all where the exact pass made four.
The moves that pay on that week are the ones that free up a given-up
pair, and a screen that never searches those pairs again can't see
that.

## The order, and a count that wasn't as exact as I thought

The work isn't repeated work, so a cache can't remove it. The cost is
that a given-up search spends its 500 checks visiting nearly everyone,
and on these weeks it gives up mostly on pairs a longer search would
cover (262 of 485 on the 20-person week). So I tried the textbook fix:
hand out the shift with the fewest possible takers first. On the
20-person week that halved the given-up pairs, from 53 to 27. On the
40-person week it raised them, from 308 to 326. Ordering by who could
take each shift right now was worse on both weeks.

The run to 200,000 checks turned up something more useful. That longer
search gave up on no pair under any order, yet it still reported
different pair hours for different orders: 179 or 187 on the 20-person
week, and 313 to 355 on the 40-person week. A complete
search shouldn't depend on the order it goes in. This one most likely
does because a hand-over chain can pass along a shift that was handed
out earlier in the same search. "At most two passes per shift" then
means a slightly different thing in each order. Until the pair check
has a definition whose exact answer doesn't depend on order, its
"confirmed" count is exact only for the order it uses today. That's the
next thing to fix, before making it faster.

The exact cache stays in the code as an opt-in (`coverPairMemo: true`),
off by default, and the orders are a measurement option. The details are
in the venture's README under "Remembered pair searches";
`node eval/pair-memo.mjs` and `node eval/pair-order.mjs` reproduce
them. These are seeded weeks and single runs on one cloud machine.
