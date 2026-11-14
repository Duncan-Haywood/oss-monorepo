# The weigh-criteria page (`site/decide.html`)

**Live (after merge):** https://marisstella.app/quick-pick-survey/decide.html (landed 2026-11-14).

A weighted decision matrix filled in by pairwise picks. The list ranker
answers "which of these do I like most?"; this page answers "which of these
should I choose, given several things I care about?" (a flat on rent,
commute, space and light; a vendor on price, support and fit; a laptop).

## Why someone would use it

The usual tools, and what this does differently:

- **A spreadsheet decision matrix** (free): you type a weight per criterion
  ("price 30%") and a 1-10 score per cell. People are poor at stating
  weights directly and the result gives no sense of how fragile it is. Here
  nothing is typed; every number comes from "which matters more?" and "which
  is better on this?", and the result shows rank ranges that include doubt
  about the weights.
- **AHP calculators** (free online, or paid suites such as Expert Choice):
  ask every pair of criteria and every pair of options on every criterion
  (for 8 options and 4 criteria, 6 + 4 x 28 = 118 comparisons) on a 1-9
  scale, then check consistency. Here the picker asks only the comparisons
  expected to change the overall order and skips criteria whose weight is
  too small to matter.
- **Conjoint and PAPRIKA tools** (1000minds and similar, paid): the right
  tool for many respondents and formal studies. This page is for one person
  or a small team, free, in the browser, nothing uploaded.

## The model

- Criteria: a Bradley-Terry fit over the criteria from "which matters
  more?" answers (`rank-core.mjs` `fit`, the app's `src/lib/btRefit.ts`
  refit, prior sd 2.0 logits). A criterion's weight is its Luce share,
  `exp(s_c) / sum exp(s)`, so the weights add to 1 and "A beats B 3 times
  in 4" reads as A counting about 3 times as much as B.
- Options: one Bradley-Terry fit per criterion from "on C, which is
  better?" answers. Scores are centred per criterion.
- Overall score: `sum_c w_c * score_c(option)`. This is on the logit scale,
  so a criterion where the options differ strongly (to this person) moves
  the order more than one where they are all about the same; that is the
  "swing weight" reading of the "matters more" question, stated on the page.
- Uncertainty: `sampleDecision` draws from every fit's Gaussian posterior
  at once (1,500 draws for results, 400 per question for the progress
  read). Rank ranges are the middle 90% of each option's rank; "Best" is how
  often it came first; weight ranges are the middle 90% of each weight.
- Stop: the posterior mean Spearman between a drawn order and the order
  shown reaches 0.9 (`STOP_CONFIDENCE`, as on the list ranker), with at least
  one answer of each kind, or the cap `decisionMax(n, C)` (half of a full
  list-ranker budget for the criteria plus one per criterion).

## The next question

`nextQuestion` scores every criteria pair and every option pair on every
criterion together. For each neighbouring pair (i, j) in the overall order
it linearises the gap `g = S_i - S_j` in all parameters (option scores enter
with weight `w_c`; criterion logits through the softmax,
`dg/ds_a = w_a (D_a - g)`), and scores a question with answer variable `d`
by

    sum over neighbours of  P(pair wrong way round) * cov(g, d)^2 * I / (1 + I var d) / var g,   I = p(1 - p)

the share of each gap's variance the answer is expected to remove, weighted
toward neighbours that could still swap. A small penalty per repeat spreads
questions; the last question is never asked twice in a row; sides are a coin
flip. With no answers every option sits at 0, so the first questions are
about options (a weight cannot move a zero gap); weight questions follow once
criteria disagree.

## Measured (simulated people, 2026-11-14)

`node scripts/decide-sim.mjs --runs 12` (seeds 1000-1011; every row in
`docs/decide-sim-2026-11-14.jsonl`). Each person: true criterion logits
`s ~ N(0, 1)`, true option scores per criterion `N(0, (spread/4)^2)`,
answers with Bradley-Terry odds on the truth; the truth is the overall order
of the model above. Shown order's Spearman with the true order, at a quarter,
half and all of the cap, adaptive picker against uniformly random questions:

| options x criteria | spread | budgets | adaptive | random | best right (adaptive / random, of 12, at the cap) |
|---|---|---|---|---|---|
| 5 x 3 | 6 | 10 / 21 / 41 | 0.39 / 0.63 / 0.85 | 0.45 / 0.44 / 0.60 | 9 / 6 |
| 5 x 3 | 3 | 10 / 21 / 41 | 0.34 / 0.55 / 0.57 | 0.31 / 0.38 / 0.41 | 7 / 7 |
| 8 x 4 | 6 | 26 / 52 / 104 | 0.42 / 0.55 / 0.70 | 0.33 / 0.36 / 0.59 | 4 / 2 |
| 8 x 4 | 3 | 26 / 52 / 104 | 0.29 / 0.44 / 0.67 | 0.25 / 0.33 / 0.41 | 6 / 3 |
| 12 x 5 | 6 | 58 / 115 / 230 | 0.49 / 0.63 / 0.78 | 0.47 / 0.45 / 0.56 | 5 / 1 |

Adaptive is ahead at every half and full budget (by 0.11 to 0.26 Spearman at
the cap); at a quarter of the cap the two are level within noise (5 x 3,
spread 6, random was ahead, 0.45 against 0.39).

The stop rule, checked after every answer (adaptive picker):

| options x criteria | spread | picks (cap) | runs at cap | confidence read | true Spearman |
|---|---|---|---|---|---|
| 5 x 3 | 6 | 40.9 (41) | 11 / 12 | 0.736 | 0.850 |
| 5 x 3 | 3 | 41 (41) | 12 / 12 | 0.685 | 0.567 |
| 8 x 4 | 6 | 104 (104) | 12 / 12 | 0.761 | 0.702 |
| 8 x 4 | 3 | 104 (104) | 12 / 12 | 0.748 | 0.669 |
| 12 x 5 | 6 | 225 (230) | 11 / 12 | 0.830 | 0.781 |

**Honest reading.** The 90% stop is almost never reached inside the cap:
nearly every run ends at the cap, with the progress read at 0.69-0.83. The
read is roughly calibrated (within 0.12 of the truth, conservative at 5 x 3
spread 6, optimistic by 0.05-0.12 elsewhere). The truth here is hard by
construction: a weighted average of several independent criteria pulls the
options' overall scores together, so many neighbours are near-ties.

**Where the cost is.** A diagnostic at 8 x 4, spread 6, 104 answers (12
people): the shown order scored 0.70; with the person's true weights put in
and the estimated option scores kept, 0.77; with the true option scores and
the estimated weights, 0.90. The per-criterion option scores, not the
weights, are the bottleneck (the picker spent 15% of its questions on
weights). That sets the next step below.

## Checks

- `node --test site/decide-core.test.mjs` (10 tests, under 1 s): setup
  parsing and refusals, link and code round trips and refusals (another
  decision, damaged, wrong prefix), weights follow "matters more" answers and
  flipping them flips the winner, nothing settled with no answers and the
  stop waits for both kinds, the picker never repeats the last question and
  asks about weights once criteria disagree, adaptive beats random on 20
  simulated people at 8 x 3 x 50 answers (0.773 against 0.661; red with the
  adaptive picker swapped for random, checked), CSV formula guard, team
  agreement (identical 1, opposite below 0), and the page's imports,
  disclaimer, opt-out and canonical URL.
- Browser (Playwright, 390 px): the example decision answered by a scripted
  person who puts Rent first: 72 picks (the cap), Rent's weight 86% (range
  28-96%), Rent's favourite option first with an 88% chance of being best;
  a second person opening the shared link and answering 12 picks; combining
  their code with a damaged one named the damaged code; no console errors.
  That run found "Strongest on" naming the least-liked option for three
  criteria the picker had barely asked about; `bestPerCriterion` now needs a
  75% lead over the runner-up (test pinned).

## Open, most valuable first

1. **Graded option answers.** The diagnostic says option scores cost the
   most. A "much better / a bit better" answer carries more than one bit;
   AHP uses a 1-9 scale. Measure whether a two-level answer (a strong pick
   as two Bradley-Terry wins, or an ordinal model) closes the 0.70 to 0.90
   gap, and whether real people use it consistently.
2. **Per-person prior on the criteria.** The fixed prior sd 2.0 on
   criterion logits allows extreme weights; the list ranker's
   empirical-Bayes second check could narrow it the same way.
3. **Team weights as a random-effects fit**, as the list ranker's team
   ranges do, so a team result has ranges too.
4. **Ready decisions** (flats, vendors, laptops, job offers framed safely)
   that open the page filled in, like the list ranker's ready lists.
5. A real person's answers: none yet.
