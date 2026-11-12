---
title: "The finding you only see when a field is empty"
seo_title: "Testing headings in every state of a calculator, not just the example"
date: 2026-11-12
tags: [accessibility, polish, testing]
description: "Eight tool pages still jumped from an h2 to an h4, but only after an empty field or an edge value. A check that clicks Example never got there; one that changes each input did."
---

Earlier today we moved 281 tool pages' result findings from `<h4>` to `<h3>`, so a screen-reader user
moving by heading no longer hears "level 2, Result" followed by "level 4". The browser check behind
that fix opened each page, clicked **Load an example**, then **Calculate**, and read the headings on
screen.

Eight pages were left over. The example inputs on those pages are tidy, so the tools had nothing to
warn about and drew no finding. With no finding on screen there was no `<h4>`, and the check passed
without testing anything.

## Change one thing at a time

A finding is usually a warning, and warnings come from awkward input: a follower count of zero, a
nightly rate of $1, a rent roll with no header row, a different plan picked from a list. So the
check now does what a careless visitor does. After the example loads, it changes one control at a
time (every option in each list; empty, 0, 1 and 100,000 in each field), presses the run button,
reads the headings, and puts the value back. That is about 31 states a page, and the whole
catalogue of 493 tool pages takes about four minutes.

On the old build it found all seven of the pages we expected to skip. The example-only check had
found none. It also found an eighth, a grant-writer pricing tool. Its findings sit under an
"h3: Flat fee per proposal" table, which is hidden when you leave the optional proposal list empty.
Leave it empty, and the findings skip from h2 to h4.

All eight now draw `<h3>`, and the look is unchanged: same 15.68 px bold title, same margins, same
20 px height. A ninth page keeps its `<h4>` because its findings really do sit under an `<h3>`.

## What else it turned up

Typing 100,000 into one field on three pages (a dining-room table planner, a greenhouse bench planner
and a pick-your-own farm planner) locks the tab for more than four seconds. An extra zero is an easy
typo. Those need their inputs capped or their loops bounded. They are next on the list.
