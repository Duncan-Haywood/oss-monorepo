---
title: "Milestone 1 is not Milestone 12: red team on a P6 contract specification check"
seo_title: "P6 schedule specification check: matching contract milestones by whole word"
date: 2026-11-24
tags: [redteam, testing, mutation-testing, xer-schedule-check, primavera-p6, construction-scheduling, javascript, ventures]
description: "Red team on a day-old P6 contract-spec checker: 7 of 11 seeded bugs caught, one real defect that would pass a schedule missing a contract milestone."
---

Yesterday the [XER schedule checker](https://marisstella.app/xer-schedule-check/#spec)
gained a contract specification check. An owner's reviewer types the limits
from the contract's scheduling section (longest duration, longest lag, no
leads, allowed constraints, required activity codes, cost loading, the
contract milestones and so on). It then reports met or not met for each one,
listing every activity behind a miss. Today's red-team run went at that new
module, `spec.mjs`, while it was still one day old.

## Seeded bugs

| File | Seeded | Caught | Equivalent | Gaps closed |
|---|---|---|---|---|
| `ventures/xer-schedule-check/spec.mjs` | 12 | 7 | 1 | 4 of 4 |

Catch rate went from 7 of 11 to 11 of 11 once the equivalent mutant was set
aside. The one equivalent mutant turned `d > limit + 1e-9` into `>=`; it can
only differ when a duration equals the limit plus a billionth of a day. The
four gaps:

- **Zero-cost assignments.** A mutant that read a missing cost as 1 instead of
  0 survived, because no test had an activity whose resource assignment was
  budgeted at zero. The specification asks for budgeted cost, so a zero-cost
  assignment fails "cost loaded" while still passing "resource loaded". There
  is now a test for exactly that.
- **Sort order.** Reversing the sort on over-long activities went unnoticed.
  The longest offenders are meant to come first.
- **The saved rules file.** Flipping an `&&` to `||` made the saved JSON write
  out `"noLeads": false` and empty code lists. That is harmless to load back
  in, but it is noise in a file reviewers keep under version control.
- **The "note" pill.** A rule that can't be read from the file (a cost cap on
  a schedule with no costs) can show as "not met" in the HTML table and no test
  catches it.

## The real defect

The milestone check matched a contract milestone to any milestone whose name
*contained* it. If a contract lists "Milestone 1" and the schedule holds only
"Milestone 12 complete", the check said `Milestone 1 = MS12` and reported the
rule as met. Contracts often number their milestones, and it is easy to miss
one on a long list, so the check would pass a submittal that is missing a
contract milestone. A requirement typed as nothing but punctuation was worse:
it normalised to an empty string and matched the first milestone in the file.

The fix keeps the loose matching people expect (case, spacing and punctuation
ignored, "substantial  completion" still finds "Substantial Completion") but
matches whole words only, and a requirement that normalises to nothing matches
nothing. The hint that points out an ordinary activity with the right name
("matches but is not a milestone") uses the same rule. The failing test came
first; the venture's 522 tests pass.

We also checked the module for the same substring pattern in other places.
The only other one is the duration exemption list, which is meant to match
word stems ("fabricat" exempts "Fabricate steel"), so it stays as it is.
