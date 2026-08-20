# Does the ai-first-markets scoring method transfer to real ventures?

**Question.** `ventures/ai-first-markets` scores eight hypothetical business
ideas on six dimensions (AI leverage, autonomous ops, time-to-revenue, gross
margin, defensibility, distribution). Its own second hypothesis asks whether
that method *transfers*: if you score the portfolio's own 11 ventures on the
same six dimensions, does the ranking come out **consistent with the router's
dispatchable-vs-blocked split**?

**Finding: no — refuted, and not marginally.** The six-dimension composite
orders the two dispatchable ventures *below* the blocked ones. Rank-biserial
correlation between the groups is **−0.44** (AUC 0.28 over 18 pairs): a
randomly chosen dispatchable venture outscores a randomly chosen blocked one
only ~28% of the time, the opposite of what "consistent" predicts. Mean
composite is **4.50** for dispatchable ventures and **4.96** for blocked ones.

This is the honest, useful outcome. The scoring method measures *business
attractiveness*; the router's split measures *whether an agent session can
settle the next hypothesis without a customer*. Those are different axes, and
in this sample they are mildly anti-correlated — so the market-map score
cannot be used as a proxy for the router, and vice versa.

## Why they diverge (the mechanism, not just the number)

The router calls a venture dispatchable when its first untested hypothesis is
tagged `evidence: in-repo` rather than `customer-contact` (see
`portfolio/router/allocate.py`, `Venture.blocker`). That tag is about *what
kind of evidence settles the claim*, which has nothing to do with how good the
business is:

- **`ai-first-markets`** (dispatchable, composite 4.67) is a hand-authored
  static idea library with no model in the delivery path and no channel — a
  low-scoring *business* whose next claim happens to be checkable against code
  in this repo.
- **`photos-import-tools`** (dispatchable, composite 4.33) is deterministic
  macOS file tooling: near-zero AI leverage, no audience.
- The top-scored ventures — **`local-site-studio`** (6.17),
  **`real-estate-agent-photo-app`** (5.67), **`quick-pick-survey`** (5.33) —
  are all blocked, because their next claim is "a customer will pay", which is
  unobservable while nothing is published.

So the very thing that makes a venture attractive (a real buyer who would pay)
is the thing that makes its next hypothesis `customer-contact`, hence blocked.
Attractiveness and dispatchability pull in opposite directions here by
construction.

## The result table

| # | venture | composite | dispatchable |
|--:|---|--:|:--:|
| 1 | local-site-studio | 6.167 | |
| 2 | real-estate-agent-photo-app | 5.667 | |
| 3 | quick-pick-survey | 5.333 | |
| 4 | ai-engineering-academy | 5.167 | |
| 5 | photo-editing | 5.000 | |
| 6 | ai-first-markets | 4.667 | **YES** |
| 7 | retail-pilot-intel | 4.667 | |
| 8 | world-clock-widget | 4.667 | |
| 9 | photos-import-tools | 4.333 | **YES** |
| 10 | garmin-world-traveler-watchface | 4.167 | |
| 11 | print-atelier | 3.833 | |

## How much to trust it

The scores in `scores.yaml` are agent judgment — the same standing as the
screening estimates in `portfolio/pipeline/candidates.yaml`, not measurement.
So the sign of the finding matters more than any single number, and the script
reports the **flip margin**: how far the scores would have to be wrong to erase
the sign.

Here the margin is **0** — but read it the right way. The finding is already
that dispatchable ranks *below* blocked (statistic negative), so no
perturbation is needed to reach "not the positive separation the hypothesis
claims". The hypothesis predicted a clearly positive statistic; the data
delivered a clearly negative one, with the two dispatchable ventures sitting at
ranks 6 and 9 of 11. To rescue "transfers", you would have to move both
dispatchable ventures above most of the blocked field — a swing of several
points across several ventures, far outside plausible scoring error. The
refutation is robust; it is the *support* case that would have been fragile.

## What this changes

- **`ai-first-markets`'s second hypothesis is refuted**, recorded in its
  `VENTURE.yaml`. The market-map scoring is a tool for ranking *business
  ideas*, and this measures that it does not double as a predictor of what the
  router can dispatch. That is a boundary on the product's claim, found in
  repo, at zero external cost — exactly the `in-repo` evidence the router said
  a session could produce.
- **The router keeps its own basis.** This is evidence *against* wiring
  composite business scores into `rank()`; they would fight the
  dispatchable-first ordering the router deliberately uses.

## Reproduce

```bash
pip install -r portfolio/router/requirements.txt   # PyYAML only
python3 portfolio/research/venture-score-transfer/measure_transfer.py
python3 portfolio/research/venture-score-transfer/measure_transfer.py --json
cd portfolio/research/venture-score-transfer && python3 -m unittest test_measure_transfer
```

`measure_transfer.py` reads the composites from `scores.yaml` and imports
`portfolio/router/allocate.py` for the dispatchable/blocked labels, so the two
halves cannot drift apart. Read-only, standard-library plus PyYAML, no network,
no credentials, writes nothing.

## Files

- `scores.yaml` — the 11 ventures scored on the six dimensions, one checkable
  rationale per dimension. Dispatchability is deliberately *not* an input.
- `measure_transfer.py` — computes the rank-biserial statistic and flip margin.
- `test_measure_transfer.py` — 9 tests locking the statistic and margin logic.
