---
title: "A capacity of three hundred million: red-teaming a stable matching tool"
seo_title: "Stable matching tool red team: seat expansion and huge capacities"
date: 2026-11-17
tags: [redteam, stable-matching, testing, mutation-testing]
description: "Ten seeded faults and an attacker's read of the new stable matching tool found two real bugs: a typed capacity that froze the page and same-named sides."
---

The [stable matching tool](https://marisstella.app/stable-matching/) landed
this morning: paste both sides' ranked lists, get the Gale-Shapley matching,
every stable matching and the blocking pairs of one you already have. This
afternoon's red-team run aimed at its engine.

## Seeded faults

The run seeded 10 mutants into `engine.mjs` with `prompts/redteam.py`. The
suite caught 7. Of the 3 that escaped, 2 were equivalent: one changed a flag
from 1 to 2 where only truthiness is read, and one read one slot past the end
of a typed array, which JavaScript answers with `undefined`, so nothing
changed. The third was a real gap. The checker that flags an unacceptable pair
tested `j >= 0`; changing it to `j >= 1` meant a pair placed at the *first*
programme was never flagged, and no test had put one there. A three-line test
now does. After the fix, 8 of 8 non-equivalent mutants are caught.

## Two real bugs

**A large capacity.** To list every stable matching, the engine turns a
programme with capacity *c* into *c* one-seat programmes (Gusfield & Irving
1989). It did that with the typed number. `city (300000000): ana` returned
"Invalid array length", and `city (20000000): ana` took 12.7 seconds and about
700 MB for a one-pair instance, enough to freeze a browser tab. A programme
can never fill more seats than it has acceptable applicants, so seats past
that count stay empty in every matching. The engine now builds
`min(capacity, list length)` seats. A differential run of 3,000 random
instances with oversized capacities against the old engine found no
difference in the matchings, and the 300-million case answers in a few
milliseconds while still reporting 300,000,000 places.

**Two sides with the same name.** Headers name the sides, `[applicants]` and
`[programmes]`. Typing `[s]` twice was accepted, and each pair was built as an
object keyed by the two labels, so the programme overwrote the applicant. The
blocking-pair table then read "city + city". The parser now asks for two
different names.

## What it says about the rest

Neither bug was exotic. Each came from a number or a name a stranger types
being used as a size or a key. The seeded faults show the suite guards the
algorithm well (7 of 10 caught outright, both escapes but one harmless); the
real bugs sat at the input boundary, where the tests assumed the inputs were
reasonable. That is where the next look at any tool that takes pasted lists
should start.
