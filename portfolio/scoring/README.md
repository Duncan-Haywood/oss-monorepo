# Venture merit scoring

**What this answers: are the portfolio's own ventures any good?**

Eleven are scored. Ten are allocated to — `ai-first-markets` was reclassified
out of profit-seeking allocation after this pass and keeps its score row for the
record; see the amendment under Finding 1.

Nothing in this repository had answered that. The router
([`portfolio/router/`](../router/)) ranks ventures by whether a session can
*start* on one today. The pipeline ([`portfolio/pipeline/`](../pipeline/))
scores businesses the portfolio has **not** started. Between them sat the
eleven businesses the portfolio actually owns, unranked against each other on
anything but budget cap — a number the portfolio assigned, not evidence about
the venture.

```bash
python3 portfolio/scoring/score_ventures.py            # merit table + anchor comparison
python3 portfolio/scoring/score_ventures.py --check    # CI: derived fields and coverage
python3 portfolio/scoring/score_ventures.py --json
cd portfolio/scoring && python3 -m unittest test_score_ventures
python3 portfolio/scoring/ventures_summary.py          # regenerate VENTURES_SUMMARY.md
```

[`VENTURES_SUMMARY.md`](VENTURES_SUMMARY.md) lists every scored venture grouped
by the catalogue's categories (from `platform/pages/build.mjs`) and by product
type, each group ranked by composite. It adds no score of its own.

## Method

The six equal-weight dimensions from
[`ventures/ai-first-markets/src/lib/evaluation.ts`](../../ventures/ai-first-markets/src/lib/evaluation.ts),
0–10, composite = arithmetic mean. Using that venture's own scale rather than
the pipeline's eight is deliberate: it makes the portfolio's real ventures
directly comparable with the eight hypothetical ideas that product recommends,
and that comparison turned out to be the most informative thing here.

Liability and ethics are still gates on a real venture — they are just recorded
as `pass`/`fail` rather than scored, so they cannot be averaged away by a good
margin and cannot distort the comparison. A failed gate requires a stated
reason.

**Sandbox egress is not scored.** Per
[`rescore-2026-08-20.md`](../pipeline/rescore-2026-08-20.md), that this
environment cannot reach a host constrains what an agent can build and measure
here; it says nothing about what a deployed product could reach from ordinary
hosting. Channel *economics* are scored — a category whose price norm is zero
is a real property of the business on any host.

## The ranking

| # | Venture | Composite | Floor | Router |
|---:|---|---:|---:|---|
| 1 | local-site-studio | 6.00 | 3 | blocked |
| 2 | real-estate-agent-photo-app | 5.17 | 3 | blocked |
| 3 | photo-editing | 4.83 | 3 | blocked |
| 4 | quick-pick-survey | 4.83 | 3 | blocked |
| 5 | world-clock-widget | 4.67 | 1 | blocked |
| 6 | ai-first-markets | 4.50 | 2 | **reclassified** (see amendment) |
| 7 | garmin-world-traveler-watchface | 4.50 | 1 | blocked |
| 8 | retail-pilot-intel | 4.50 | 3 | blocked |
| 9 | ai-engineering-academy | 4.33 | 1 | blocked |
| 10 | photos-import-tools | 4.17 | 1 | **dispatchable** |
| 11 | print-atelier | 3.83 | 2 | blocked (liability gate **failed**) |

Derivations are in [`venture-scores.yaml`](venture-scores.yaml): every venture
carries a `basis` for its scores and a `floor_note` naming what its worst
dimension costs it.

## Finding 0 — two independent raters, and they agree

This pass was built without knowledge of [#321](https://github.com/Duncan-Haywood/monorepo-projects/pull/321),
which landed on `main` the same day: another scheduled session, given the same
hypothesis, scored the same eleven ventures on the same six dimensions from the
same repository evidence, in
[`ventures/ai-first-markets/src/data/portfolio-ventures.ts`](../../ventures/ai-first-markets/src/data/portfolio-ventures.ts).
Neither session saw the other's work.

They agree:

| | |
|---|---:|
| Ventures scored by both | 11 |
| Largest composite disagreement | **0.334** of a point |
| Mean absolute disagreement | **0.167** |
| Rank 1 (`local-site-studio`) | same |
| Rank 11 (`print-atelier`) | same |
| Verdict on the hypothesis | same (refuted) |
| Explanation of *why* | same (structural, see Finding 1) |

Reproduce with `python3 portfolio/scoring/score_ventures.py`; #321's composites
are pinned per venture as `rater_b` in
[`venture-scores.yaml`](venture-scores.yaml).

This matters more than either pass's numbers. Hand-assigned scores are the
weakest evidence in this repository, and the standing objection to them —
*this is one agent's opinion* — is exactly right. An accidental inter-rater
reliability check is the only cheap answer to it available, and it came out
strong. **The ranking below is not arbitrary.** It is still an estimate, and
[`rescore-2026-08-20.md`](../pipeline/rescore-2026-08-20.md)'s finding still
applies — measurement moves these numbers down, never up — but two raters
converging on rank 1 and rank 11 is a real reason to act on the top of the
list rather than treat the whole exercise as noise.

The two datasets are deliberately **not** reconciled into one. Forcing them
equal would destroy the measurement. `rater_b` is a frozen snapshot of #321 as
merged, so it cannot drift; #321's TypeScript remains that venture's own
transfer experiment, and this directory is the portfolio's operational score —
the one `allocate.py` reads.

Worth noting separately, because it is the *third* time this repository has
recorded it: two sessions spent full budgets on the same question within the
same hour, neither able to see the other. [CLAUDE.md](../../CLAUDE.md) opens
with this failure mode. It was caught here only because `main` was re-fetched
before committing, which is the practice that turned a duplicate into the
agreement measurement above.

## Finding 1 — the hypothesis is refuted, and in the worse direction

`ai-first-markets` carried this untested claim:

> Scoring the portfolio's own 11 ventures on the same six dimensions ranks them
> consistently with the router's dispatchable-vs-blocked split.

It does not. The two dispatchable ventures sit at merit ranks **6 and 10 of
11**, and their mean composite (4.33) is *below* the blocked ventures' (4.74).

The mechanism is not a coincidence, and it is the part worth acting on. A
venture is dispatchable when its next hypothesis can be settled `in-repo`
rather than by `customer-contact`. But a venture only *has* an in-repo next
question when nobody is currently trying to sell it:

- **`ai-first-markets`** is deployed behind Cloudflare Access restricted to a
  single email address. It has no price, no buyer, and no route to one. It is
  internal decision infrastructure, which is genuinely useful — and is why its
  remaining questions are all in-repo.
- **`photos-import-tools`** has no packaging, no pricing, and no monetization
  language anywhere in the venture. `budget.protected` is `false` and its kill
  criteria are purely technical. There is no launch to block.

> **Dispatchability anti-selects for commercial intent, by construction.** The
> queue every session reads steers effort toward the two ventures nobody is
> trying to sell, because trying to sell something is exactly what makes a
> venture's next question unanswerable from here.

### Amendment — Finding 1 acted on, and the score row kept

Finding 1 diagnosed `ai-first-markets` as internal decision infrastructure.
[#337](https://github.com/Duncan-Haywood/monorepo-projects/pull/337) acted on
it, giving the directory a
[`NOT-A-VENTURE`](../../ventures/ai-first-markets/NOT-A-VENTURE) marker: the
router, the scorer, and `validate.py` now skip it, its $50/mo protected explore
budget is released, and the queue no longer hands sessions "write the next
hypothesis" for a tool with no buyer. **10 allocated ventures, 11 scored.**

#337 also had to delete this venture's row from `venture-scores.yaml`, and said
why: `--check` required the scored set to equal the allocated set exactly, so
keeping the row failed CI with `scored but no such venture directory`. That was
a real constraint, and it had a cost the deletion could not avoid — **seven of
the numbers in Finding 2 below, and Finding 0's inter-rater count, are computed
over whatever this file contains.** Removing one of eleven rows silently
restated all of them (`ai_leverage` 4.64 → 4.70, composite 4.67 → 4.68, pairs
11 → 10) while the prose kept the old figures. No check catches that: `--check`
validates this file's internal consistency, not the README's arithmetic.

The constraint is now gone. `check()` distinguishes the **allocated** set (every
one must be scored) from the **documented** set (any directory with a
`VENTURE.yaml`, marker or not, may be scored), so a reclassified venture keeps
its row. The row is restored, every figure below is once again what the script
prints, and the eleventh inter-rater pair is back.

A score is a record *about* a business, not an input to allocation. That is the
principle worth keeping: reclassifying a venture should change what the
portfolio spends on, not erase what it learned.

`score_ventures.py` now reports the venture as `reclassified` and excludes it
from the ranking positions and the dispatchable/blocked means — so the router
column above is the only thing about it that moved. `photos-import-tools` is now
the only dispatchable venture, at merit rank 9 of 10, which strengthens Finding
1 rather than altering it. The directory is deliberately **not** moved to
`platform/`; that remains open.

This is not an argument for deleting the dispatchable field — a queue that
hands every session impossible work is how the router came to be ignored in the
first place, and that is well documented in
[`portfolio/router/README.md`](../router/README.md). It is an argument that
dispatchability was never a proxy for value and must not be read as one. The
router now reports both: `allocate.py` prints a `merit` column, orders
otherwise-tied ventures by merit instead of by budget cap, and names the
highest-merit venture when it is blocked. Merit deliberately sorts *below*
dispatchability, so blocked work still cannot occupy the top of the queue.

## Finding 2 — margin and automation survive contact with reality; nothing else does

Scoring the real ventures on the same scale as the eight hypothetical ideas
gives a controlled comparison: same rubric, same scorer-type, pitches versus
positions. Reproduce it with `python3 portfolio/scoring/score_ventures.py`.

| Dimension | 8 ideas | 11 ventures | Delta |
|---|---:|---:|---:|
| ai_leverage | 8.50 | 4.64 | **−3.86** |
| autonomous_ops | 8.62 | 6.73 | −1.90 |
| time_to_revenue | 7.00 | 2.91 | **−4.09** |
| gross_margin | 8.00 | 7.36 | −0.64 |
| defensibility | 6.38 | 3.00 | **−3.38** |
| distribution | 6.75 | 3.36 | **−3.39** |
| **Composite** | **7.54** | **4.67** | **−2.88** |

The two dimensions that hold up — gross margin and autonomous ops — are the two
that follow from *choosing to build software*. They are decided by the
technology and cost nothing to be right about. The four that collapse are the
four that require a *market* to cooperate.

Two consequences the portfolio can act on without anyone's permission:

1. **The portfolio has drifted off its own brief.** The standing constraint is
   AI-heavy or software. Measured, `ai_leverage` averages 4.64, and four of the
   eleven ventures score 1–3 on it (`world-clock-widget`,
   `garmin-world-traveler-watchface`, `photos-import-tools`,
   `quick-pick-survey`). Those are competent software with no model work in
   them. That is a portfolio-composition fact, not a defect in any one venture,
   and the honest response is to judge them on the other five dimensions rather
   than to bolt a model on.
2. **`time_to_revenue` at 2.91 is the portfolio's real position.** Only
   `local-site-studio` scores above 4. This is the number that says the
   portfolio is nowhere near revenue — more directly than `mrr: null` does,
   because `null` is ambiguous between "not measured" and "not close".

This also re-confirms the pattern
[`rescore-2026-08-20.md`](../pipeline/rescore-2026-08-20.md) established from
the candidate side: *estimates about a business fall when anyone checks*. The
eight ideas were scored as pitches and average 7.54; nothing in this portfolio
scores above 6.00 once it has to exist. Read the pipeline's unmeasured
candidates as upper bounds accordingly — and read the numbers in this file the
same way, because they are estimates too.

## Finding 3 — the decision queue is ordered by cost, not by value

[Issue #139](https://github.com/Duncan-Haywood/monorepo-projects/issues/139)
lists the account owner's asks "cheapest first". That ordering is sensible when
nothing is known about what each ask unblocks. Something is now known:

- The **highest-merit venture in the portfolio** (`local-site-studio`, 6.00) is
  the one with a coded, tested Stripe checkout, a concrete price ladder
  ($500 setup, then $99–199/mo), and the only buyer in the portfolio who holds
  a *business budget* rather than a consumer wallet. What it needs is a payout
  rail and production configuration — **Ask 2**, the ask currently ranked last
  because it is the most expensive.
- The **cheap asks unblock the low-merit end**. Ask 0 (one registry signup) and
  Ask 5 (free-listing approval) serve developer-audience channels that map onto
  pipeline *candidates*, not onto the ventures scoring at the top here. Ask 5
  is separately recorded as inert.

That is not an argument to skip the cheap asks — Ask 8 in particular costs
nothing and answers the cost half of "maximize profit". It is an argument that
the queue should carry **what each ask unblocks, weighted by merit**, next to
what it costs. On current evidence, one payout rail plus production
configuration is worth more than every cheap ask combined, because it is the
only one that reaches the 6.00.

## Finding 4 — one gate failure, flagged not acted on

`print-atelier` fails the liability gate. It hosts third-party artwork
(copyright and DMCA exposure, in a market where infringing uploads are the
normal failure mode) and moves money to third parties on a contracted 30%
net-profit share (a royalty-accounting obligation to people who can sue over
it). Both are on [CLAUDE.md](../../CLAUDE.md)'s human-gated list, and being
wrong costs a lawsuit rather than a refund. It also carries the portfolio's
lowest composite and lowest gross margin, structurally — physical prints have
real COGS.

**This is recorded as a flag for the account owner, not as a kill decision.** No
session should retire a venture on the strength of its own scoring pass. The
narrower version that clears the gate is licensed or owner-supplied artwork
with a flat fee rather than a profit share.

## Status of these numbers, and how to change one

**Agent estimates from repository evidence, 2026-08-20. Not one is a customer
measurement**, because the portfolio has zero customer contacts. They are good
enough to rank eleven ventures against each other and against the eight ideas;
they are not good enough to spend against. Every `basis` field cites what in the
repo the score rests on, so a disagreement can be argued with specifically
rather than in general.

To rescore: edit the dimension in `venture-scores.yaml`, update `composite`,
`floor`, and `floor_dimension`, then run
`python3 portfolio/scoring/score_ventures.py --check`. It recomputes every
derived field, enforces the floor-note and gate-note rules, and checks coverage
in both directions — every *allocated* venture must be scored, and a scored slug
must name a directory carrying a `VENTURE.yaml` — so a venture added or removed
without a score fails CI rather than vanishing from the ranking, while a
directory reclassified with a `NOT-A-VENTURE` marker keeps its row. `.github/workflows/portfolio-validate.yml` runs it and the unit
suite on every change to this directory.
