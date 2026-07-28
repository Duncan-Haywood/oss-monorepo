# How the measurement works

Read this before changing anything in `src/lib`. The numerical core is small,
pure, and easy to break silently — nothing throws, a number is just quietly
wrong, and the UI renders it with a confidence interval as if it meant
something.

## The shape of the thing

```
Person ──▶ Participant (one per survey, per perspective)
                │
                ├── Trial              a shown pair, filled in when answered
                ├── ParticipantItemRating   that person's Glicko-2 state per item
                └── SurveyFit          that person's fitted conjoint model
```

A `User` is an account. A `Participant` is one person answering one survey
under one perspective. Everything measured hangs off the participant, never off
the survey — that is what makes "her ranking" a thing the schema can express.

A `Couple` links exactly two `User` rows by invite code. Only aggregates cross
that boundary.

## The three perspectives

`SELF`, `PARTNER`, `PARTNER_GUESS` — declared once, in
[`src/lib/perspective.ts`](../src/lib/perspective.ts), together with the copy
the UI uses for each. They never share rating state.

The comparison that matters is `PARTNER_GUESS` (your guess at what they want)
against their real `PARTNER` — not what you each want, but where you are wrong
about each other. Anything that coerces one perspective into another destroys
that output *and* pollutes the ranking it lands in. Narrow the value with
`parsePerspective` at every edge it arrives through.

## Two models, because two kinds of question

### Discrete items → Glicko-2

Activities, professions, traits, values, behaviours, affection, relationship.
Each item carries a rating, a rating deviation and a volatility. The rating
deviation is the whole point: it is what lets the app say "we do not know yet"
instead of showing a confident ordering built on nine answers.

Thresholds that look arbitrary and are not:

- `rd >= 349` — the default. Means the item was never actually shown; excluded
  from any ranking, because it carries no signal at all.
- `rd < 200` — the bar for telling someone to *do* something. Confidently wrong
  advice is worse than saying nothing.

### Continuous attributes → Davidson tie-extended Bradley–Terry

Income, net worth, upside, hours. A paired-comparison logit with an explicit
"too close to call" outcome, fit by Newton–Raphson with a numerically estimated
Hessian for the intervals, and a small ridge penalty so sparse or perfectly
one-sided data stays finite.

Two properties worth preserving:

- **Convergence is judged per observation.** The log-likelihood is a sum over
  rows, so an absolute gradient threshold gets harder to satisfy the more data
  you have. A `converged` flag that turns false because someone answered more
  questions is worse than no flag.
- **The line search never steps downhill.** If no step size improves the
  likelihood, the direction is unusable at any scale and the fit stops where it
  is. Taking the step anyway walks the fit away from the maximum and then
  reports the result as if it were one.

Refits run every `REFIT_EVERY` answers rather than on every answer, because a
full refit is over the whole history and doing it in the request path makes
answer latency climb without bound.

## Choosing the next question

[`src/lib/pairing.ts`](../src/lib/pairing.ts). The chooser favours:

- items the model is least sure about (high rating deviation),
- pairs with close ratings — a near-toss-up is the most informative comparison,
- coverage balance, so nothing is left unmeasured,
- avoiding recent repeats,
- and it randomises which option lands on top, so screen position cannot bias
  the result.

It runs **coarse to fine**: early questions cross categories to fix the broad
shape fast, later ones stay within a category where the hard discriminations
are.

## Scheduling across domains

[`src/lib/domainScheduler.ts`](../src/lib/domainScheduler.ts). One continuous
session pulls from several surveys, staying in one for a short random streak so
it does not feel like context-switching, then moving to whichever domain has
the least confidence.

Domains are **staged**, and the reason is not cosmetic:

- The conjoined survey pairs an identity item with a money attribute and fits
  against that person's existing identity ratings. Before those exist, every
  identity rating is at the 1500 default, the identity half of the comparison
  is noise, and the answer teaches the model nothing. It stays locked.
- The financial survey is self-contained and fine from the start, but opening
  with money reads badly, so it unlocks slightly later.

## Client session state

[`src/lib/sessionStore.ts`](../src/lib/sessionStore.ts). Which participant id
backs each domain, and which perspective they belong to, kept in localStorage
and exposed as a real external store rather than copied into component state
inside an effect.

A bundle is only usable if at least one domain has a participant id behind it.
A half-written bundle from a failed start otherwise leaves the runner with
nothing to fetch, spinning on "Loading next…" with a hard refresh the only way
out.

Same-tab writes dispatch an event, because `storage` only fires in *other*
tabs; without it, switching perspective on the profile screen would leave a
mounted runner showing the old one.

## Where the risk is

| Area | What goes wrong | What protects it |
| --- | --- | --- |
| `glicko2.ts` | A sign error in the volatility solver is invisible | Property tests over simulated outcomes |
| `conjoint.ts` | Silent non-convergence, or a fit that walked downhill | Recovery-from-simulation tests, plus explicit tests for both failure modes |
| `perspective.ts` | A coerced value merging two rankings | `perspective.test.ts`, which names the exact regression |
| `sessionStore.ts` | A partial bundle wedging the runner | `sessionStore.test.ts` |
| API routes | Lost updates, double-applied answers | Claim-then-apply inside a transaction; `updateMany` guarded on `result: null` |
