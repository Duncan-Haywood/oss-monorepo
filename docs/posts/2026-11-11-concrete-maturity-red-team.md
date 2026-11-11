---
title: "Four ways a logger file could lie to a concrete strength estimate"
seo_title: "Concrete maturity calculator: parsing bugs a red-team run found and fixed"
date: 2026-11-11
tags: [red-team, testing, concrete, maturity-method, astm-c1074, csv]
description: "A red-team run on the new concrete maturity calculator found four inputs a person could reasonably type that gave a wrong number without any error, and fixed all four."
---

The [concrete maturity calculator](../../ventures/concrete-maturity/) went
live yesterday. It takes a temperature logger's CSV and the mix's lab cylinder
breaks, and estimates in-place strength by the ASTM C1074 maturity method.
Crews use that number to decide when to strip forms. If it is wrong, it should
fail loudly, not quietly. A scheduled red-team run picked this calculator
because it was new and because people would rely on it.

## What the tests already caught

The run seeded 24 small faults into `maturity.mjs`, such as an off-by-one, a
`<` turned into `<=`, or a constant nudged by one, and ran the suite after
each. The suite caught 12 of them. Of the 12 that got through, 3 turned out to
change nothing a user can see (an unreachable branch, and two optimiser tweaks
that gave the same fits to within 4 parts in 100,000). The other 9 were real
gaps, and each now has a test that fails when that fault is put back. Leaving
out the three harmless ones, the catch rate went from 57% to 100%.

The most useful new test pins the numbers the
[explainer page](../../ventures/concrete-maturity/maturity-method-explained.html)
quotes for its worked example: R² 0.992/0.998/0.999, AICc 82.4 against 87.7
and 99.6, and the edge logger about 830 psi short of 3,000. Those figures were
correct, but nothing tied them to the code. Now, if a change moves them, a
test fails and someone has to update the page.

## Four real bugs, each typed in the ordinary way

Each of these gave a wrong answer with no error message:

1. **Thousands separators in the breaks.** Typing `7, 3,420` or `7 3,420`
   recorded a 7-day cylinder at 3 psi, because the comma inside the number was
   read as a field break. Now, when the fields are already separated by a
   space, tab or semicolon, a comma before three digits is read as a thousands
   separator. A line with commas only, like `7,3420`, still splits on the
   comma.
2. **Impossible timestamps.** `2/30/2026 25:00` became 3 March at 01:00,
   because JavaScript's `Date.UTC` rolls bad fields over into the next day or
   month instead of rejecting them. Loggers never write such times, so a cell
   like that is now rejected rather than shifted.
3. **"Average" looked like a time column.** In a file with no timestamps, the
   tool looks for the time column by its header and accepted any header
   containing `age`, which matches inside "Average" and "Stage". So
   `Average (°C),Elapsed (h)` swapped the two columns: temperatures were read
   as hours and hours as temperatures.
4. **`elapsed_min` was read as hours.** The units check used the regex `\b`,
   which treats an underscore as part of a word, so `elapsed_min` and `time_s`
   fell through to the default unit, hours. That makes the maturity index 60
   or 3,600 times too large, so the estimate is too high: the unsafe
   direction for form stripping.

Bugs 3 and 4 share one fix: a small `headerHasWord` helper that counts a word
only when there is no letter on either side of it. That way `elapsed_min`
and `Time (s)` match, and `Average` and `Minimum` do not.

## What this does not change

The estimate is still only as good as the calibration behind it, and ASTM
C1074 itself asks for it to be confirmed by other tests before critical
operations. These fixes take away four ways the calculator could quietly
misread a file. They do not make it a substitute for that confirmation. The
run record, with every mutant and its triage, is in
`prompts/runs/2026-11-11-session_01E5sJKnGXc3Zp7PLrjxNBry.json`.
