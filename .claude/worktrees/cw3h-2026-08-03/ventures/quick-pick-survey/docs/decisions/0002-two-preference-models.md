# 0002. Two preference models, not one

**Status:** accepted

## Context

The app asks two structurally different questions.

"Hiking or museums?" compares two **discrete, unordered** things. There is no
axis; the only way to learn anything is head-to-head results, and what you
want out of it is a ranking with a confidence interval.

"£90k and 50 hours a week, or £70k and 35?" compares two points in a
**continuous, multi-attribute** space. Treating each combination as a
discrete item would need an enormous number of comparisons to learn anything,
and would learn nothing transferable: it could tell you which of two salary
pairs you preferred, but never what an hour a week is worth to you in money.

Forcing both through one model means either giving up confidence intervals
on the discrete side or giving up marginal rates on the continuous side.

## Decision

Two models, chosen per survey `kind`:

- **`ITEMS` → Glicko-2** (`src/lib/glicko2.ts`). Rating, deviation and
  volatility per item per participant. Rankings come with real intervals.
- **`FINANCIAL` / `CONJOINED` → Davidson tie-extended Bradley-Terry**
  (`src/lib/conjoint.ts`, `src/lib/financialFit.ts`). A paired-comparison
  logit with an explicit "too close to call" outcome, fit by Newton-Raphson
  with a numerically estimated Hessian for the intervals.

The tie extension is not decoration. "Too close to call" is the honest
answer to a well-chosen trade-off, and forcing a pick would record noise as
signal on exactly the questions that carry the most information.

## Consequences

- Two code paths for the whole question loop: `/api/trials/*` and
  `/api/financial-trials/*`, two answer handlers, two notions of confidence.
  Anything touching "how a question is asked" has to be done twice.
- The continuous model yields marginal rates — what an extra hour a week is
  worth in money — which no ranking could produce. That is the "price of
  time" insight.
- Refitting from full history is expensive and grows with the number of
  answers. This is a known cost, tracked in IMPROVEMENT-PLAN.md; the fix is
  to refit on a threshold rather than on every answer.
- The `CONJOINED` survey fits against a participant's existing identity
  ratings, so it is meaningless until those exist. Hence the staging in
  `domainScheduler.ts` — it stays locked until the item surveys have
  produced signal.
