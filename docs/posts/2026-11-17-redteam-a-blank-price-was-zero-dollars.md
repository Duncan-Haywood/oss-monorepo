---
title: "A blank price was read as $0 in 109 bid calculators"
seo_title: "Why Number('  ') is 0: a whitespace bug in 109 JavaScript calculators"
date: 2026-11-17
tags: [redteam, testing, javascript, calculators]
description: "A red-team run on the landscape lighting bid calculator found that a price of spaces counted as $0. The same check had been copied into 108 other calculators."
---

Most of the bid calculators in this repository have an optional field called "price you are
considering". Leave it empty and the calculator shows its own price and nothing else. Type a number
and it also tells you the margin that price leaves, or how much the job loses if the price is below
cost.

Today's red-team run aimed at the
[landscape lighting bid calculator](https://marisstella.app/landscape-lighting-bid-calculator/)
and found that one kind of empty value was not treated as empty.

## Seeded faults: 6 of 10 caught, now 10 of 10

The run made twelve small edits to `calc.mjs` and ran its tests after each one. Six edits broke a
test and six did not. Two of the six that got through only changed an example yard in the preset
list: 120 feet of trench became 121. No page quotes that number, and any length is a valid example,
so they don't count. That leaves 6 of 10 caught.

The other four were real gaps in the tests:

- If a rate such as "path light each" was missing from the input, the engine used $0. A changed
  default of $1 passed every test. A shared link saved before a field was added to the form arrives
  without that field, so this default decides the price someone sees. A test now drops two fields
  and checks that they count as zero.
- Nothing tested the split of crew hours by task (travel, fixtures, trench and so on) that the page
  draws. Dividing where the code multiplies passed. A test now checks that the shares add up to 100%
  and that the trench share is trench hours over total hours.

With those tests added, all ten edits now fail the suite.

## The real bug: `Number('  ')` is `0`

This is how the engine decided whether a price had been given:

```js
const hasProposed = input.proposedPrice !== null
  && input.proposedPrice !== undefined
  && input.proposedPrice !== '';
```

A string of spaces passes all three checks, and JavaScript's `Number('  ')` is `0`. So an agent, a
script or an MCP tool call that sends `"proposedPrice": " "` got a $0 bid
scored against the job's cost: a 0% margin, or a verdict that the job loses everything. It should
have got no comparison. The web form can't produce this because a number input never holds spaces.
Calls from code can.

The same three lines appeared, word for word, in 101 other calculators, and seven more had their
own versions of the check (the snow-removal calculator has two, one for the seasonal price and one
for the per-push price). All 109 now use

```js
const hasProposed = String(input.proposedPrice ?? '').trim() !== '';
```

All 109 venture test suites pass with the change.

## A check so it doesn't come back

New calculators here usually start as copies of old ones, so fixing these 109 files only lasts
until someone copies an old one again. `platform/ci/test_proposed_price_blank.py` now fails if any
venture engine checks a `proposed…` field against `''` without trimming it first. It fails on the
code from before this fix and passes on the code after it. CI runs it on every pull request that
touches `ventures/`.
