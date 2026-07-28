# 0006. Keep the three perspectives statistically separate

**Status:** accepted

## Context

A person rates the same items three times — what they want for themselves
(SELF), what they want in a partner (PARTNER), and what they think their
partner wants (PARTNER_GUESS) — and the three sets of answers share no state.
Someone answering 90 questions per perspective pays for 270 answers and gets
three separately-imprecise rankings.

The three are plainly correlated, so hierarchical shrinkage should let each
borrow strength from the other two. `docs/CONVERGENCE.md` carried this for
several sessions as "the largest untaken win, and the one most likely to be
got subtly wrong", and it is the obvious thing to reach for when the real
problem — every screen needs a precision the app does not reach in a session
anyone will sit through — comes up again.

It is obvious enough that it will be proposed again. That is what this record
is for.

## Decision

Do not pool evidence across perspectives, at any weight, in anything that
feeds a displayed estimate.

The implementation is kept, written and tested, in `src/lib/pooling.ts`,
imported by nothing, so the decision can be re-argued against a real estimator
rather than an imagined one.

## Consequences

Measured in `src/lib/pooling.simulation.test.ts` against the real pairing, the
real Glicko-2 update and the real `compareRankings`; the table is in
`docs/POOLING.md`.

- **A real gain is being given up.** At 90 answers per perspective, pooling
  takes items under rd 150 from 3–4 to 28–29. Nothing else in the backlog
  offers a sevenfold improvement on the quantity that gates every screen.
- **The reason is that it works by injecting the bias the app measures.** In
  the planted truth, A's guess about B correlates 0.37 with what A wants for
  themselves; the raw estimates recover 0.21–0.34; pooling returns 0.97–0.99.
  The pooled PARTNER_GUESS is A's SELF ranking with a new label. "Your guess
  about your partner is pulled toward what you want" is not an artefact to
  trade against precision — it is the definition of what the blind-spots
  screen exists to detect.
- **The estimated `tau` is not the safety valve it looks like.** It is meant
  to switch borrowing off when perspectives genuinely differ, and it does at
  300 answers. At 90 it collapses toward zero, because it is estimated as the
  observed spread minus `mean(rd^2)` and `rd` is still 200–300 — so the prior
  is at its most confident exactly where it should be most diffuse. This is
  not tunable; the information is not in the data.
- **The gain and the harm are one mechanism.** The precision gain is entirely
  at low budgets (3→28 at 90 answers, 40→41 at 300) and so is the bias
  (0.98 at 90, 0.86 at 300). There is no budget at which the trade is good.
- **The convergence problem stays open.** Shrinking the combined survey and
  making a smaller promise up front are the remaining options in
  `docs/CONVERGENCE.md`.

## What this does not rule out

Using other perspectives to decide **which questions to ask**, without letting
them touch the estimates. Question selection may use any information it likes;
it cannot bias a rating, because the rating still comes only from that
perspective's own answers. Nothing measured here applies to it. It is
unmeasured, and it needs its own simulation before anyone believes it.
