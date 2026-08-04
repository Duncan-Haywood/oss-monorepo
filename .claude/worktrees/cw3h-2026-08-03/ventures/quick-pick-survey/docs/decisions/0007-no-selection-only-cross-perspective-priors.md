# 0007. Do not use other perspectives to choose questions, because it changes nothing

**Status:** accepted

## Context

[0006](0006-no-pooling-across-perspectives.md) rejected pooling a person's
three perspectives into their *estimates*: it works, and it works by pulling
PARTNER_GUESS onto SELF, manufacturing the exact egocentric bias the
blind-spots screen exists to detect.

That objection is about the estimator, and it left a narrower version of the
idea standing. [CONVERGENCE.md](../CONVERGENCE.md) named it as the last of
three ways to make the couple screen reachable inside a session someone will
actually sit through: use the other perspectives only to decide *which pair to
show next*. A paired-comparison likelihood does not depend on how the pair was
chosen, so selection on prior data is ignorable — the same argument that
already licenses every other adaptive term in `selectNextPair`. Nothing in 0006
touches it.

The motivation was concrete. The informativeness term prefers pairing items
with close ratings, because a near-toss-up shrinks Glicko-2's variance the
most. But it reads those ratings from the perspective being answered, and at
the start of a perspective every item sits at exactly 1500. Closeness is
identical for every candidate, so the term that decides how much each answer is
worth contributes nothing over the first several dozen questions — precisely
where the budget is tightest — and a person answering three perspectives
restarts from that flat state three times.

## Decision

Do not wire it in. `selectionRating` and the `priorRatings` option exist in
`src/lib/pairing.ts` and are exercised by
`src/lib/selectionPrior.simulation.test.ts`; no route passes them, and nothing
loads another perspective's ratings from the database.

## Consequences

**It was measured, not reasoned about.** Driving the real `selectNextPair` and
the real Glicko-2 update, 15 seeds, medians, each seed running the second
perspective twice from an identical starting state so the only difference is
the selection policy:

| Correlation between perspectives | Budget | Items under rd 150, without → with |
| --- | --- | --- |
| 0.37 (what POOLING.md plants) | 90 | 4 → 4 |
| 0.37 | 300 | 39 → 40 |
| 0.60 | 90 | 4 → 3 |
| 0.60 | 300 | 40 → 40 |
| 0.85 | 90 | 4 → 4 |
| 0.85 | 300 | 40 → 39 |
| **oracle — a prior that knows the truth exactly** | **90** | **4 → 4** |
| **oracle** | **300** | **40 → 38** |

**The oracle row is the decision.** A null result at a realistic correlation
would only mean the prior was too noisy, and the idea would be worth revisiting
with a better estimator. A null result against a *perfect* prior means the term
being improved has no leverage in the first place. Rating deviation is driven by
how many comparisons an item gets — the coverage term's and `activeSetSize`'s
decision — and `weightedPick` is soft enough that reshaping one multiplicative
factor barely moves the allocation.

**What this rules out, and it is more than the feature.** No question-selection
change can make the couple screen reachable. Progressive broadening
([CONVERGENCE.md](../CONVERGENCE.md)) moved items under rd 150 from 0 to 34 and
was the last such change with real headroom in it; this measures what is left
after it, and the answer is close to nothing. The remaining levers are the
number of items and the size of the promise, and both are the account owner's
call rather than an implementation detail.

**What it cost to find out:** an afternoon, and a small permanent addition —
`selectNextPair` now takes an injectable `rand`, so the simulations this repo's
convergence numbers come from are reproducible instead of re-rolled on every
run. That was a real gap; the same measurement run twice before the injection
disagreed with itself by more than the effect being measured.

**Before reversing this,** re-run `selectionPrior.simulation.test.ts` and look
at the oracle rows first. If a change to the coverage term or `activeSetSize`
has given the closeness term room it did not have, the oracle will show it
before any real prior does. Do not reverse on the strength of the argument that
selection cannot bias an estimate — that argument is correct, and it was never
the thing in doubt.
