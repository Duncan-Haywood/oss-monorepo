# The list ranker page (`site/rank.html`)

**Live:** https://marisstella.app/quick-pick-survey/rank.html (landed 2026-11-14).

Until this page, the venture's only public surface was a description: using
Quick Pick meant deploying the Next.js and Postgres app. The list ranker is the
same model in the browser, for one person or a small team, with nothing
uploaded.

## What it does

- Paste 3 to 60 options (`parseList`: bullets, blanks and case-insensitive
  repeats dropped, each option cut to 120 characters). `parseList` is
  idempotent, because the shared link is parsed again on the respondent's
  side and any change there would give respondents a different list
  fingerprint from the creator's (fixed 2026-11-14). Pick between two at a time; "About equal" is a tie, Undo
  and arrow keys work.
- After every answer it refits all answers with `refitRatings` from
  `src/lib/btRefit.ts` (Bradley-Terry, Laplace posterior, the app's prior).
  `site/engine/*.mjs` is **generated** from `src/lib/` by
  `node scripts/build-rank-engine.mjs` (Node's own type stripper, no
  dependency); `rank-core.test.mjs` fails if it is stale.
- Next pair: the pair maximising p(1 - p) times the posterior variance of the
  difference, with a small repeat penalty, the last pair never repeated, and
  sides by coin flip.
- Results: posterior-mode order, a 90% rank range per option and its chance of
  being the favourite, from 1,500 seeded posterior draws. CSV download.
- Team: the list travels in the URL fragment (never sent to a server). Each
  person copies a `QP1.` result code (answers as index pairs plus the list's
  FNV fingerprint, so a code for another list is refused). Pasting codes
  combines them: each person refit alone, centred scores averaged (equal
  weight per person), mean pairwise Spearman as "agreement", and each option's
  best-to-worst place across people.

## Stop rule, and why not "every neighbour settled"

The first version stopped when every neighbouring pair in the order had at
least a 90% posterior chance of being the right way round. On a simulated
respondent who never makes a mistake (8 options), every neighbouring pair had
been asked 4 times and they still sat at 0.87-0.92: the model allows for
lapses, so a few consistent answers never make a pair certain. With ordinary
noise (true scores spread over 6 logits) it hit the 2 n log2 n cap in 8 of 8
runs at every threshold from 0.75 to 0.85, at 8 and at 15 options. It never
stopped.

It now stops on `orderConfidence` (with a second check at the person's own prior since 2026-11-14, below): the posterior mean Spearman correlation
between a drawn order and the order shown, at 0.9 (`STOP_CONFIDENCE`), with
the cap kept. Mean over 6 simulated respondents per row, picks fixed (not
stopped), confidence against the order's true Spearman with the respondent's
real order:

| options | true spread (logits) | picks | confidence | true Spearman |
|---|---|---|---|---|
| 8 | 100 (never wrong) | 24 / 36 / 48 | 0.89 / 0.95 / 0.98 | 1.00 |
| 8 | 6 | 24 / 36 / 48 | 0.84 / 0.90 / 0.93 | 0.91 / 0.94 / 0.97 |
| 8 | 3 (very noisy) | 24 / 36 / 48 | 0.77 / 0.84 / 0.87 | 0.66 / 0.79 / 0.84 |
| 15 | 6 | 59 / 88 / 118 | 0.88 / 0.92 / 0.94 | 0.93 / 0.94 / 0.96 |
| 15 | 3 | 59 / 88 / 118 | 0.87 / 0.89 / 0.90 | 0.80 / 0.86 / 0.90 |
| 25 | 6 | 117 / 175 / 233 | 0.91 / 0.94 / 0.95 | 0.94 / 0.96 / 0.97 |

It is conservative for consistent people and somewhat optimistic for very
noisy ones on short lists (0.77 read against 0.66 true). In the browser
end-to-end run (a scripted consistent respondent, 8 options) the page now
finishes in 25 picks; before the change it ran to the 48-pick cap.

## Noisy answerers: a second check at the person's own prior (2026-11-14)

The table above showed the stop rule reading 0.77 where the true Spearman
was 0.66 (8 options, spread 3). A wider sweep found the overclaim is worst
on long lists: 25 options, spread 3, the page stopped at 115 picks reading
0.90 while the order's true Spearman was 0.79; at spread 1.5 (near coin
flips) it stopped at 111 picks reading 0.90 against 0.56.

**Cause: the prior, not optional stopping.** Checking every pick and
stopping at the first pass could bias the read upward, so two rules that
need the 0.9 held for 3 or 6 picks in a row were run too: they moved the
true Spearman by 0.01 at most (25 x 3: 0.78 and 0.79). The fixed prior sd
(2.0 logits, Glicko's 350) is far wider than a noisy person's spread of
likes, so answer noise reads as real separation.

**Fix** (`stopCheck` in `site/rank-core.mjs`): once the fixed-prior
confidence passes 0.9, refit at the person's own empirical-Bayes prior sd
(`empiricalPriorPhi`, the insights route's favourite-set prior: sampled
evidence, golden section on log phi in [0.3, 2.01], 8 steps) and stop only
if that refit also reads 0.9. The status line then shows the lower read and
says many picks are close calls. A fixed narrower prior was the obvious
alternative and was rejected: at sd 1.0 a never-wrong respondent with 15
options needed 93 picks instead of 51, at 0.6 every consistent run hit the
cap.

Mean of 12 simulated respondents per row (`node
scripts/rank-stop-calibration.mjs --runs 12`, seeds from 1000; every rule
in `docs/rank-stop-eb-2026-11-14.jsonl`). Picks to stop / confidence read /
true Spearman (runs that hit the 2 n log2 n cap count at the cap):

| options | spread | fixed rule (before) | with the second check | runs at cap before / after |
|---|---|---|---|---|
| 8 | 100 | 25.7 / 0.904 / 1.000 | same | 0 / 0 |
| 8 | 6 | 34.8 / 0.900 / 0.938 | same | 1 / 1 |
| 8 | 3 | 47.3 / 0.853 / 0.913 | 47.8 / 0.851 / 0.915 | 10 / 11 |
| 15 | 100 | 51.3 / 0.902 / 1.000 | same | 0 / 0 |
| 15 | 6 | 67.3 / 0.901 / 0.948 | 69.8 / 0.902 / 0.947 | 0 / 0 |
| 15 | 3 | 98.0 / 0.894 / 0.905 | 107.5 / 0.887 / 0.909 | 4 / 10 |
| 15 | 1.5 | 103.3 / 0.833 / 0.661 | 109.3 / 0.830 / 0.669 | 8 / 9 |
| 25 | 100 | 91.8 / 0.901 / 0.996 | same | 0 / 0 |
| 25 | 6 | 109.8 / 0.901 / 0.925 | 123.8 / 0.904 / 0.932 | 0 / 0 |
| 25 | 3 | 115.3 / 0.901 / 0.786 | 160.2 / 0.875 / 0.834 | 0 / 5 |
| 25 | 1.5 | 111.3 / 0.901 / 0.561 | 189.8 / 0.886 / 0.645 | 0 / 8 |

The gap between read and truth at 25 options drops from 0.115 to 0.041
(spread 3) and from 0.340 to 0.241 (spread 1.5). Consistent respondents pay
nothing; ordinary noise at 25 options pays 14 more picks. **Still open:** one
person's empirical-Bayes estimate is noisy, so some near-coin-flip
respondents get an estimate at the ceiling and stop as before (3 of 10
seeds at 25 x 1.5 in a spot check). The 8 x 1.5 row is unchanged because
every run hits the cap either way. A pooled prior across a team's codes
would steady it; not built.

Cost: the search runs only after the fixed check passes, about 64 ms at 8
options, 110 ms at 25 x 150 answers and 330 ms at 60 x 350 in Node. In a
browser run (Chromium, a scripted consistent respondent, 8 options) the page
still finished in 25 picks; a coin-flipping respondent on 25 options ran to
the 233-pick cap with the "close calls" note shown and "Some places are
still close" on the results. Pinned by three tests in
`site/rank-core.test.mjs`. The last one fails if `stopCheck` returns the
fixed read alone (checked).

## Honest results for close calls (2026-11-15)

The stop rule rechecks at the person's own prior (above), but the results
table did not: its 90% rank ranges and "chance of being the true favourite"
were still drawn from the fixed-prior fit (sd 2.01 logits). For a person
whose picks are close calls that prior reads answer noise as real
separation, so the table was too sure exactly where it matters.

**Measured** (`node scripts/rank-range-coverage.mjs`: simulated
respondents through the page's own picker and stop rule, scored at the
moment the page shows results; seeds from 2000, 12 per row, and from 3000,
24 per row, in `docs/rank-range-coverage-2026-11-15.jsonl` and
`docs/rank-range-coverage-seed3000-2026-11-15.jsonl`). Coverage is the
share of options whose true rank sits inside its 90% range; "favourite"
is the mean chance the table gives its top option against how often that
option really is the favourite. Fixed prior (before) / own prior (now):

| options | spread | picks (runs at cap) | 90% coverage | mean range width | favourite said / right (fixed) -> said (own) |
|---|---|---|---|---|---|
| 8 | 100 | 25.5 (0 of 12), seeds 2000 | 1.00 / 1.00 | 4.1 / 4.1 | 0.75 / 1.00 -> 0.75 |
| 8 | 100 | 26 (0 of 24), seeds 3000 | 1.00 / 1.00 | 4.1 / 4.1 | 0.77 / 1.00 -> 0.77 |
| 8 | 6 | 34.8 (1 of 12), seeds 2000 | 1.00 / 1.00 | 3.9 / 4.0 | 0.71 / 0.83 -> 0.71 |
| 8 | 6 | 38.5 (4 of 24), seeds 3000 | 1.00 / 1.00 | 3.8 / 3.9 | 0.73 / 0.83 -> 0.72 |
| 8 | 3 | 44.7 (9 of 12), seeds 2000 | 1.00 / 1.00 | 4.1 / 4.5 | 0.64 / 0.58 -> 0.60 |
| 8 | 3 | 44.8 (17 of 24), seeds 3000 | 0.96 / 0.97 | 4.2 / 4.9 | 0.66 / 0.67 -> 0.59 |
| 8 | 1.5 | 46.8 (11 of 12), seeds 2000 | 0.80 / 0.90 | 4.9 / 5.9 | 0.60 / 0.25 -> 0.49 |
| 8 | 1.5 | 47.2 (23 of 24), seeds 3000 | 0.92 / 0.98 | 5.2 / 6.5 | 0.62 / 0.50 -> 0.46 |
| 15 | 100 | 51.3 (0 of 12), seeds 2000 | 1.00 / 1.00 | 6.9 / 6.9 | 0.65 / 1.00 -> 0.65 |
| 15 | 100 | 51.3 (0 of 24), seeds 3000 | 1.00 / 1.00 | 6.9 / 6.9 | 0.63 / 1.00 -> 0.63 |
| 15 | 6 | 75.4 (0 of 12), seeds 2000 | 0.98 / 0.99 | 6.4 / 6.6 | 0.58 / 0.58 -> 0.57 |
| 15 | 6 | 75.3 (2 of 24), seeds 3000 | 0.99 / 0.99 | 6.5 / 6.7 | 0.63 / 0.46 -> 0.62 |
| 15 | 3 | 101.6 (7 of 12), seeds 2000 | 0.89 / 0.92 | 6.5 / 7.7 | 0.54 / 0.50 -> 0.49 |
| 15 | 3 | 110.1 (16 of 24), seeds 3000 | 0.92 / 0.96 | 6.5 / 7.9 | 0.60 / 0.33 -> 0.53 |
| 15 | 1.5 | 118 (12 of 12), seeds 2000 | 0.80 / 0.96 | 7.8 / 10.7 | 0.60 / 0.17 -> 0.40 |
| 15 | 1.5 | 108 (19 of 24), seeds 3000 | 0.81 / 0.89 | 7.6 / 9.8 | 0.56 / 0.29 -> 0.40 |
| 25 | 100 | 91 (0 of 12), seeds 2000 | 1.00 / 1.00 | 10.8 / 10.8 | 0.58 / 1.00 -> 0.58 |
| 25 | 6 | 116.8 (0 of 12), seeds 2000 | 0.96 / 0.97 | 10.3 / 10.6 | 0.58 / 0.50 -> 0.57 |
| 25 | 3 | 191.3 (5 of 12), seeds 2000 | 0.85 / 0.89 | 9.6 / 11.4 | 0.51 / 0.42 -> 0.44 |
| 25 | 1.5 | 202.6 (8 of 12), seeds 2000 | 0.70 / 0.83 | 10.9 / 15.3 | 0.56 / 0.00 -> 0.37 |

Consistent answerers (spread 100) get exactly the same table: their own
prior sits at the ceiling, so nothing is refit (pinned by a test). For
near-coin-flip answerers the ranges now hold the true rank about as often
as they claim (80-81% to 89-96% at 15 options), and the favourite chance comes
down towards how often it is right. At 25 options and spread 1.5 the ranges
still fall short (0.70 to 0.83). **Not fixed:** the favourite chance
still overclaims for ordinary answerers on 15 options on one seed set (63%
said, 46% right on the 3000 seeds; 58% / 58% on the 2000 seeds), where the own prior barely differs from the fixed one;
the likeliest cause is the Gaussian (Laplace) posterior's tails rather than
the prior (untested; a sampled posterior is the next read to try). Consistent answerers are
told 58-77% when the favourite is always right: the model allows for
lapses, the same conservatism as the stop rule's.

**What changed** (`resultsTable` in `site/rank-core.mjs`): the results
table, the verdict's favourite chance and the CSV are drawn from the
answers refit at the person's own prior sd and pile noise (the stop rule's
second read, `ownPrior`), with the rows kept in the fixed fit's order (the
order the stop rule measured; the two can differ by a swap of near-ties).
When the own prior is narrower than the fixed one the verdict adds "Many of
your picks were close calls, so the ranges and chances below allow for
that." The search costs one empirical-Bayes fit when results are shown (64
to 330 ms, "Noisy answerers"). The shortlist percentages in top-k mode and
the favourite mode's own stop (`favourite >= 0.9` at the fixed prior) are
unchanged and unmeasured here.

**Rejected: averaging over the prior sd.** Weighing a grid of six prior sds
by the answers' evidence (`scripts/phi-mixture.mjs`) widened the ranges
further, but for consistent answerers too (25 options, never wrong: mean
width 10.8 to 17.8 places, favourite said 40% when right 100%). As a stop
rule it cost consistent answerers 20-40% more picks (8 options: 25.7 to
31.3; 25 options, spread 6: 110 to 170) for a smaller overclaim at 15 x 1.5
(0.17 to 0.11): `docs/rank-stop-mixture-2026-11-15.jsonl`, 10 of the 12
cells (the 25 x 3 and 25 x 1.5 cells were stopped unfinished).

**Checks.** Two tests in `site/rank-core.test.mjs`: a consistent chain's
results table equals the fixed-prior table; a simulated near-coin-flip
respondent (15 options, spread 1.5, 118 picks) gets wider ranges and a
lower favourite chance with rows in the fixed order (fails with
`resultsFit` returning the fixed fit, checked). Browser (Playwright,
390 px, 8 options): a consistent respondent finished in 25 picks with "75%
chance" and no note; a coin-flipping one ran to the 48-pick cap and read
"26% chance ... Many of your picks were close calls", ranges 1-7 and 1-8;
no console errors.

## Favourite mode: more questions, not fewer

The page first offered "Just find the favourite (fewer questions)". Measured
(10 options, scores spread over 6 logits, 30 respondents): at a fixed 15 or
25 picks it named the true favourite 18 and 17 times against 17 and 18 for
full-order picking, so no gain at a fixed budget. With each mode's own stop
rule (12 respondents, spread 10 logits):

| options | mode | mean picks to stop | favourite right |
|---|---|---|---|
| 10 | full order (confidence 0.9) | 37.0 | 8/12 |
| 10 | favourite (90% chance) | 49.0 | 12/12 |
| 20 | full order | 80.0 | 6/12 |
| 20 | favourite | 128.4 | 12/12 |

So the label now says what it does: "Be sure of the favourite (more questions
on the front-runners)". The finding worth keeping: the full-order stop can
leave the top two unresolved, and the results line says so by printing the
top pick's chance.

## Checks

- `node --test site/rank-core.test.mjs` (11 tests, about 0.5 s): engine not
  stale, parsing, link and code round trips and refusals, adaptive beats
  random pairs on simulated respondents (mean Spearman above 0.9), 90% rank
  ranges hold the true rank more than 80% of the time on simulated
  respondents, favourite mode spends more of its questions on the top three
  (red with the mode switched off, checked), CSV quoting, team combine.
- Browser: a Playwright run on a 390 px viewport through example list,
  picks, results, a second person opening the shared link with the opposite
  taste, code paste with one damaged code, combine: agreement -1.00, the
  damaged code named, no console errors.

## Open

- A real person's answers: none yet. The page counts anonymous local events
  only (`site/usage.mjs`); site page views come from the shared beacon.
- Team combine's tau read low until the Laplace fix; see "Team ranges", "Laplace, not PQL".
- `orderConfidence` overstated certainty for very noisy respondents; the
  stop rule's second check ("Noisy answerers") and the own-prior results
  table ("Honest results for close calls") correct most of it. The
  favourite chance still overclaims for ordinary answerers on 15 options.

## Team ranges (2026-11-14)

`combine` gave a team order with no uncertainty. The team table now has two
90% rank ranges per option, because "where does it sit?" has two answers:

- **Group** (`groupFit`): the order of *these* people's average likes. Their
  differences are the answer, not noise, so only each person's own
  uncertainty (a limited number of picks) counts. Under the refit's
  independent priors the members' mean score has posterior mean = the mean of
  their refits and covariance = the sum of their covariances / m^2.
- **Wider** (`populationFit`): the order for the group they stand for
  (customers, a department). Each person's scores are the group's plus their
  own N(0, tau^2) deviation per option, the random-effects model the app's
  survey ranking uses (`groupRanking.ts` `pool`), done jointly over options.
  tau is fitted by marginal likelihood (golden section on log tau over
  0.05-5 logits, and tau = 0), with each person's Bradley-Terry likelihood
  linearised at their mode under the current group estimate
  (`modeAround`, 4 passes): an iterated Laplace approximation.

**A bug found on the way.** Linearised once at each person's own refit, the
marginal likelihood put tau near 0 for 10 simulated people who truly
differed by 2 logits (0.03), and the estimate *fell* as people were added.
The same formula on Gaussian pseudo-data with the same curvatures recovered
tau, so the formula was right and the expansion point wrong: the refit's
prior pulls every score toward 0, so p(1 - p) and the curvature come out too
high and each person looks surer than they are. Relinearising fixed the
direction. tau was still read low (true 2 read 0.6-0.9); the cause was a
second bug, fixed the same day (below, "Laplace, not PQL"). The page states
tau in words ("about the same / somewhat different / clearly different
likes"), because logits mean nothing to a reader.

**Measured** (`node scripts/team-ranges-calibration.mjs --runs 40`, every
cell in `docs/team-ranges-2026-11-14.jsonl`): group true scores spread over 4
logits; each of m people adds N(0, tau^2) per option and answers the page's
own `nextPair` questions for n log2 n picks (24 at 8 options, 59 at 15).
Coverage is the share of options whose true rank falls in the 90% range; the
"group" truth is the members' mean scores, every other column's is the wider
group's. "Naive" is the Group range read as if it were the Wider one;
"tau = 0" is every answer read as one person's.

| options | people | true tau | Group: cover / width | naive cover | tau = 0: cover / width | Wider: cover / width | tau read |
|---|---|---|---|---|---|---|---|
| 8 | 3 | 0 | 0.994 / 3.4 | 0.994 | 0.997 / 3.4 | 0.997 / 3.4 | 0.17 |
| 8 | 3 | 1 | 0.972 / 3.6 | 0.928 | 0.934 / 3.8 | 0.950 / 4.0 | 0.45 |
| 8 | 3 | 2 | 0.988 / 4.1 | 0.850 | 0.916 / 4.7 | 0.953 / 5.1 | 0.81 |
| 8 | 5 | 0 | 1.000 / 2.9 | 1.000 | 1.000 / 2.8 | 1.000 / 2.8 | 0.13 |
| 8 | 5 | 1 | 0.997 / 3.1 | 0.953 | 0.963 / 3.4 | 0.969 / 3.6 | 0.45 |
| 8 | 5 | 2 | 0.994 / 3.6 | 0.887 | 0.925 / 4.2 | 0.956 / 4.4 | 0.71 |
| 8 | 10 | 0 | 0.997 / 2.2 | 0.997 | 0.997 / 2.1 | 0.997 / 2.2 | 0.10 |
| 8 | 10 | 1 | 0.997 / 2.5 | 0.969 | 0.969 / 2.7 | 0.972 / 2.8 | 0.39 |
| 8 | 10 | 2 | 0.991 / 3.1 | 0.863 | 0.950 / 3.8 | 0.959 / 4.0 | 0.67 |
| 15 | 3 | 0 | 0.955 / 5.2 | 0.955 | 0.958 / 5.4 | 0.965 / 5.5 | 0.16 |
| 15 | 3 | 1 | 0.950 / 5.8 | 0.853 | 0.913 / 7.0 | 0.928 / 7.3 | 0.49 |
| 15 | 3 | 2 | 0.972 / 6.3 | 0.745 | 0.860 / 8.5 | 0.903 / 9.0 | 0.85 |
| 15 | 5 | 0 | 0.967 / 4.4 | 0.967 | 0.968 / 4.6 | 0.973 / 4.6 | 0.15 |
| 15 | 5 | 1 | 0.967 / 4.9 | 0.872 | 0.930 / 6.0 | 0.943 / 6.2 | 0.45 |
| 15 | 5 | 2 | 0.978 / 5.8 | 0.742 | 0.908 / 8.3 | 0.920 / 8.5 | 0.75 |
| 15 | 10 | 0 | 0.982 / 3.4 | 0.982 | 0.985 / 3.6 | 0.985 / 3.6 | 0.06 |
| 15 | 10 | 1 | 0.983 / 3.9 | 0.895 | 0.952 / 4.8 | 0.960 / 4.9 | 0.36 |
| 15 | 10 | 2 | 0.985 / 4.7 | 0.820 | 0.940 / 6.8 | 0.955 / 6.9 | 0.61 |

- The Group range holds what it claims: 0.95-1.00 in every cell (it is
  conservative, like the one-person ranges).
- Read as the wider group's range, it would mislead exactly when people
  disagree: 0.74-0.89 at tau = 2. That is why the page shows both and says
  which to read.
- The Wider range holds 0.90-1.00 in every cell, widening with
  disagreement (15 options, 3 people, tau 2: 6.3 places wide against 9.0).
  Pooling everyone's answers as one person (tau = 0) already widens a lot,
  because conflicting answers compress the scores, but falls to 0.86 at 15 x 3
  x tau 2 and 0.92 at 8 x 3; the fitted tau brings those to 0.90 and 0.95.
- The order itself does not change: the shown order is still `combine`'s
  (its Spearman with the members' and the wider group's true orders match
  `groupFit`'s and `populationFit`'s to 0.01).

The table above is the PQL read, kept as the record of what shipped first.
The Wider and tau columns after the fix are in the next section.

### Laplace, not PQL (2026-11-14, later)

The low tau was not the "usual Laplace bias". The marginal likelihood
dropped each person's quadratic constant k = l(c) - grad'c - c'Jc/2 as "a
constant that does not depend on tau". It does: the expansion point c is each
person's mode given the group and tau, so it moves with tau. Without k the
read is penalised quasi-likelihood (PQL), whose downward bias on variance
components with binary answers is well known (Breslow and Clayton 1993;
Rodriguez and Goldman 1995). Keeping k makes it the Laplace approximation at
the joint mode. `linearize` now returns k; `populationFromInfos` adds it (the
`laplace: false` option restores the old read, for comparison only). k also
made tau = 0 and tau > 0 comparable: the two branches expand at different
points, so their log likelihoods differed by unrelated constants before.

Measured with the same script and seeds (`node
scripts/team-ranges-calibration.mjs --runs 40`, every cell in
`docs/team-ranges-laplace-2026-11-14.jsonl`; Group, naive and tau = 0 columns
are unchanged, as they do not use the fitted tau):

| options | people | true tau | Wider: cover / width (PQL) | Wider: cover / width (Laplace) | tau read (PQL) | tau read (Laplace) |
|---|---|---|---|---|---|---|
| 8 | 3 | 0 | 0.997 / 3.4 | 0.997 / 3.6 | 0.17 | 0.34 |
| 8 | 3 | 1 | 0.950 / 4.0 | 0.969 / 4.5 | 0.45 | 1.02 |
| 8 | 3 | 2 | 0.953 / 5.1 | 0.978 / 6.1 | 0.81 | 2.17 |
| 8 | 5 | 0 | 1.000 / 2.8 | 1.000 / 2.9 | 0.13 | 0.23 |
| 8 | 5 | 1 | 0.969 / 3.6 | 0.981 / 4.0 | 0.45 | 1.07 |
| 8 | 5 | 2 | 0.956 / 4.4 | 0.984 / 5.4 | 0.71 | 1.99 |
| 8 | 10 | 0 | 0.997 / 2.2 | 0.997 / 2.2 | 0.10 | 0.20 |
| 8 | 10 | 1 | 0.972 / 2.8 | 0.994 / 3.2 | 0.39 | 0.97 |
| 8 | 10 | 2 | 0.959 / 4.0 | 0.991 / 4.8 | 0.67 | 2.03 |
| 15 | 3 | 0 | 0.965 / 5.5 | 0.965 / 5.7 | 0.16 | 0.30 |
| 15 | 3 | 1 | 0.928 / 7.3 | 0.962 / 8.4 | 0.49 | 1.14 |
| 15 | 3 | 2 | 0.903 / 9.0 | 0.955 / 10.9 | 0.85 | 2.27 |
| 15 | 5 | 0 | 0.973 / 4.6 | 0.977 / 4.8 | 0.15 | 0.31 |
| 15 | 5 | 1 | 0.943 / 6.2 | 0.965 / 7.1 | 0.45 | 1.20 |
| 15 | 5 | 2 | 0.920 / 8.5 | 0.968 / 10.1 | 0.75 | 2.27 |
| 15 | 10 | 0 | 0.985 / 3.6 | 0.985 / 3.6 | 0.06 | 0.15 |
| 15 | 10 | 1 | 0.960 / 4.9 | 0.985 / 5.4 | 0.36 | 0.98 |
| 15 | 10 | 2 | 0.955 / 6.9 | 0.980 / 8.1 | 0.61 | 2.08 |

- tau now reads within 0.15 of the truth at 8 options and within 0.3 at 15
  (true 0.5 reads 0.40-0.72), against 30-60% of it before. At true 0 it reads
  0.15-0.34: tau is bounded below, and a few noisy answers look like spread.
- The Wider range covers 0.955-1.00 in every cell (0.90-1.00 before) and is
  wider by 0.1-2 places: at 15 options and 3 strongly different people, 10.9
  places of 15. That width is the honest answer; the PQL range was too narrow
  for the claim at 15 x 3 x tau 2 (0.903) and only just held.
- The page's word thresholds moved with it: under 0.4 "about the same", under
  0.8 "somewhat different", else "clearly different" (were 0.2 and 0.5, set
  for the low read).
- Cost is the same order: 0.18 s at 25 options x 5 people, 0.9 s at 60 x 5,
  2.0 s at 60 x 10 (this container). Pinned by two more tests in
  `site/rank-core.test.mjs`: tau = 2 over 10 people reads 1.4-3 (the PQL read,
  0.57-0.84, fails it; checked), and the quadratic with k equals the log
  likelihood at its expansion point, ties included.

Cost in Node: 0.2 s at 25 options x 5 people, 0.8 s at 60 x 5, 1.2 s at
60 x 10, run once per Combine click. Pinned by four tests in
`site/rank-core.test.mjs`; the disagreement one fails with tau forced to 0
(checked). Browser: Chromium at 390 px, 3 agreeing codes and 1 reversed:
Group ranges 1-2 ... 5-6, Wider 1-3 ... 4-6, no horizontal scroll, no console
errors.

Open: tau's slight high read at true 0 (0.15-0.34; a REML-style or
bias-corrected read could pull it down); the Wider range assumes the members are a random draw
from the wider group, which a team that picked itself is not.

## Ready-list pages (2026-11-14)

Four landing pages, each a common job a pairwise ranking does well, with a
starter list and one link that opens the ranker filled in:
`site/use-feature-backlog.html`, `use-personal-values.html`,
`use-name-shortlist.html`, `use-trip-shortlist.html`. They are generated by
`node scripts/build-use-pages.mjs` (the list, question, copy and
alternatives live there), and the link's fragment (`#l=<list>`, a form the Pages link checker reads as state, not a section id) is made by the ranker's
own `encodeList`, so the pages are plain HTML and the list never reaches a
server. `site/use-pages.test.mjs` fails if a page is stale or its link does
not decode back to its list. Each page counts `use_page_viewed:<slug>` and
`use_page_start:<slug>` in local storage (same opt-outs as the ranker). They
are the first step on the flagship's "get the rank page in front of people"
item: search entry points for intents the generic page does not name.
Checked in Chromium at 390 px: no horizontal scroll, and each link opens the
ranker on its own question and list.

### Six more, and a hub (2026-11-14, later)

Six more ready-list pages, each aimed at a question people search where a
pairwise ranking is a better answer than the usual one: `use-team-goals`
(quarterly goals or OKRs), `use-customer-pain-points` (the forced choice of a
paid MaxDiff module, free, for a handful to a few dozen respondents who paste
codes back; the page says it is not a panel), `use-wedding-priorities`,
`use-home-must-haves`, `use-book-club-next-read` and `use-todo-priorities`
(an Eisenhower-matrix alternative). Each names the alternatives and what it
does not do. `site/ready-lists.html` is a generated hub (CollectionPage
JSON-LD) that links all ten; every use page links back to it and the landing
page, rank page and picks page link it, so search engines reach all ten from
any one. `use-pages.test.mjs` fails if the hub is stale, misses a page, or a
page or the landing page drops its link (checked red with the hub file
removed). The use pages' footer now says they count a page view as well as a
start, which they always did. Checked in Chromium at 390 px: no horizontal
scroll on the seven new pages, and the pain-points link opens the ranker on
its own question. No visitor count yet: the pages are entry points, and
whether search sends anyone is item (r)'s open measurement.

## How many picks it takes (2026-11-14)

The ranker's status line said "Lists of n usually take n log2 n to 1.5 n
log2 n picks". Nobody had measured it. `scripts/picks-needed.mjs` runs the
page's own loop (`nextPair`, `stopCheck`, `suggestedMax`) on simulated people
at 4 to 60 options and three kinds of answerer: clear-cut (never wrong),
ordinary (true scores over 6 logits) and close calls (3 logits), 24 people a
cell, and, for the same people, the order from asking every pair exactly once
and refitting the same way. Rows: `docs/picks-needed-2026-11-14.jsonl`.

`node scripts/build-picks-page.mjs` turns the rows into the public answer
page `site/how-many-pairwise-comparisons.html` (every number and every
verdict sentence there is computed from the rows) and `site/picks-measured.mjs`,
which the status line now reads ("Lists of 15 took about 51 picks for someone
sure of every answer, 73 typically and 104 when the options are close calls,
in simulations"). `site/picks-page.test.mjs` fails if either is stale.

What it found, ordinary answerers unless said:

- **Long lists: about half to a fifth of the questions, a slightly worse
  order.** 20 options: 93 picks (Spearman 0.94) against 190 for every pair
  once (0.95). 40: 204 (0.92) against 780 (0.97). 60: 366 (0.94) against
  1,770 (0.98). Every pair once is more accurate from about 15 options up;
  it is also more questions than anyone answers.
- **Short lists: more questions than every pair, and a better order for
  them.** Below 12 options the ranker asked more than n(n-1)/2 (5 options: 21
  against 10), because it re-asks close pairs. Those extra questions bought
  0.07 Spearman on average over every pair once (5 options: 0.98 against
  0.88). An earlier idea, stopping as soon as every pair had been answered
  once with no cycle, was tried and dropped: the picker rarely covers every
  pair (it re-asks neighbours instead), so the rule fired only at 4 options,
  where it saved 2-3 picks and cost 0.025 Spearman on close calls.
- **Close calls often never settle.** At 4 to 6 options, 78% of close-call
  runs hit the cap without reaching 0.9; at 20 to 40 about half did.
- **Clear-cut people run into, then under, the sorting bound.** log2(n!) is
  the fewest questions that sort exactly. At 30 options the ranker asked 112
  against 108; from 40 options it stops below it (150 against 160; 229
  against 273 at 60), because it stops at a 90%-settled order (Spearman
  0.99), not an exact one.
- The old status-line range was roughly right for clear-cut and ordinary
  people on mid-length lists and low for close calls (15 options: it said
  59-88; measured 51, 73 and 104).

The 60-option close-call cell was not run to the end (each 50-60 option
close-call cell takes 35 minutes or more: a prior search on every pick up to
a 565-709 cap), so the page's tables stop at 50 options and the status line
quotes the 50-option numbers, labelled "the longest measured", for longer
lists; the 60-option clear-cut and ordinary rows are in the data.

Limits: simulated people only, evenly spaced true scores, no ties, no
fatigue, warm-up or position habits. The favourite mode was not measured
here.

## Find my top k (2026-11-14)

A common job is not "rank all 20" but "which 3 go on the shortlist": three
candidates to interview, five features for the quarter, three names to test.
The full-order mode was a poor fit for it, measured below: its stop rule
counts every place equally, so it stops with the cut between place k and k+1
often wrong.

**The mode** ("Find my top k" on the setup screen, k from 2 to one less than
the list; `site/rank-core.mjs`):

- `topKChances`: each option's chance of being in the top k, from 600
  posterior draws.
- `nextPair(..., { mode: "top", k })` pairs only options that could still be
  either side of the cut (1% to 99% chance of being in; `TOP_POOL`
  "boundary"), with the usual information score inside that pool. A "live"
  pool (everything with at least 1%) was measured too and was level or
  slightly behind.
- `topStopCheck`: stops when the shortlist is 90% settled, read as the mean
  share of the shown k that a plausible order also puts in its top k
  (`topSetConfidence`, `TOP_MEASURE` "overlap"), rechecked at the person's
  own empirical-Bayes prior as `stopCheck` does. The exact-set chance was
  tried first and almost never passed 0.9 for anyone who ever errs (the same
  lapse allowance that sank "every neighbour settled", above).
- The results line names the k with each one's chance of really being in
  the top k, and the closest option left out with its chance.

**The sweep** (`node scripts/top-k-sweep.mjs --runs 16`, rows in
`docs/top-k-2026-11-14.jsonl`): 10, 15, 20 and 30 options, k = 3 and 5,
spreads 100 (never wrong), 6 (ordinary) and 3 (close calls), 16 simulated
people a cell, every arm on the same people and the same answer stream.
Totals over the cells (exact = the shown top k is exactly the true top k as a
set; share = the mean share of the shown k truly in it):

| people | options | full order: exact / share / picks | full-order picker, shortlist stop | shortlist mode |
|---|---|---|---|---|
| never wrong | 10 | 32/32, 1.00, 66 | 32/32, 1.00, 85 | 32/32, 1.00, 78 |
| never wrong | 15-30 | 91/96, 0.99, 465 | 96/96, 1.00, 1,013 | 96/96, 1.00, 558 |
| ordinary | 10 | 26/32, 0.955, 102 | 28/32, 0.971, 109 | 27/32, 0.956, 98 |
| ordinary | 15-30 | 25/96, 0.757, 656 | 31/96, 0.791, 1,146 | **54/96, 0.883, 1,039** |
| close calls | 10 | 8/32, 0.768, 116 | 7/32, 0.768, 124 | 12/32, 0.833, 117 |
| close calls | 15-30 | 12/96, 0.685, 905 | 15/96, 0.704, 1,171 | 23/96, 0.755, 1,164 |

(picks are the sum of the cells' mean picks, so the columns compare directly.)

What it says:

- **Ordinary answerers on 15-30 options: the right shortlist twice as
  often**, 56% against 26%, at about 1.6 times the questions. E.g. 20
  options, top 3: 12/16 exact at 161 picks against 4/16 at 86; 20 options,
  top 5: 7/16 against 0/16.
- **The picker does the work, not just the stricter stop.** The full-order
  picker run to the same shortlist stop reached 31/96 at 1,146 picks; the
  shortlist picker 54/96 at 1,039.
- **Clear-cut people pay about a fifth more questions** (558 against 465 on
  15-30 options) for a shortlist the full order mostly had right anyway (the
  full order missed 5 of 16 at 30 options, top 5).
- **10 options: no gain for ordinary answerers**, a small one for close calls
  (12/32 against 8/32). Short lists are already asked nearly every pair.
- **Close calls on long lists: most runs hit the 2 n log2 n cap** in every
  mode; the shortlist mode still gets more of it right (23/96 against 12/96).
- **A looser stop (0.8) was rejected** (`docs/top-k-level-0.8-2026-11-14.jsonl`,
  10-20 options, top 3): it asks about as many questions as the full order
  (15 options, ordinary: 68 against 73) and is right about as often (5/16
  against 4/16), so it buys nothing.
- The stop reads 0.9 where the true share was 0.88 (ordinary, 15-30): close to
  calibrated. Near coin flips never read settled (pinned by a test).

Checks: three tests in `site/rank-core.test.mjs` (the picker asks about the
options at the cut more than the full-order picker, red with the shortlist
pool switched off; chances sum to k and a blank list is unsettled; the stop
skips the prior search until the fixed read passes, reports the lower read,
and never calls a 25-option coin-flip run settled). Browser (Chromium, 390 px):
a k larger than the list is refused with a message; a scripted consistent
respondent on 10 options stopped at 39 picks naming the true top 3; no
horizontal scroll, no console errors. The page counts the mode chosen
(`mode:<order|favourite|top>`, local only).

Limits: simulated people, evenly spaced scores, no ties or fatigue. (A shared
link opened in full-order mode until the section below.)

## Shortlist links and the shortlist's numbers (2026-11-14, k2)

The shortlist mode is most useful for a team ("which 3 features this
quarter?"), and until now the link the sender copied dropped the mode: every
respondent ranked the full order and the shortlist question was lost.

- **The link carries the mode.** `encodeList({ title, items, mode, k })` adds
  `m` ("favourite" or "top") and, for "top", `k` to the fragment's JSON. A
  full-order link is byte-for-byte what it was, so old links and the ready-list
  pages are unchanged. `decodeList` returns `mode` and `k` only when they fit
  the de-duplicated list (k from 2 to n-1). A mode it does not know, or a k
  that does not fit, is not guessed at: the list opens in the full order and
  `modeIgnored` says why, and the page shows that sentence above the first
  question. The respondent sees "Whoever sent this link asked for your top k";
  the sender's share box says the link asks for the same cut.
- **The status line quotes the shortlist mode's own numbers.** It used to say
  "a shortlist takes more picks" with no figure. `site/picks-measured.mjs`
  (generated) now also holds `TOP_MEASURED`, the shortlist arm of
  `docs/top-k-2026-11-14.jsonl`, and `topPicksGuide(n, k)` reads it at the
  nearest measured k (3 or 5, the larger on a tie), interpolating between 10,
  15, 20 and 30 options and holding at the ends; the line says when it used a
  different k or length.
- **The answer page has a shortlist section.**
  `site/how-many-pairwise-comparisons.html` ("Only need a shortlist?") shows
  every measured cell, full order against shortlist mode, picks, exact
  shortlists and runs at the cap, with four findings summed from the rows
  (54/96 against 25/96 for ordinary people on 15-30 options at 1.6x the picks;
  20% more picks for clear-cut people; little gain at 10 options; close calls
  on long lists mostly at the cap and mostly wrong) and an FAQ entry ("How many
  comparisons does it take to find the top 3 of 20?"). All of it is generated
  by `scripts/build-picks-page.mjs`, and `site/picks-page.test.mjs` fails if
  the page or module is stale.
- **Three ready lists offer the shortlist link**: feature backlog, name
  shortlist and customer pain points (`shortlist: { k: 3 }` in
  `scripts/build-use-pages.mjs`), counted as `use_page_shortlist:<slug>`.

Checks: `site/rank-core.test.mjs` (a full-order link is unchanged; top and
favourite round-trip, also with `l=`; k of 5, 1, 2.5, "3", null and 99 on five
options and an unknown mode open the full order with a reason; k is checked
against the de-duplicated list), `site/picks-page.test.mjs` (the shortlist rows
are the `order` and `boundary` arms, one cell cross-checked against the raw
row; the lead finding holds in the data; `topPicksGuide` at measured cells,
nearest k, held ends, interpolation) and `site/use-pages.test.mjs` (each
shortlist link decodes to top mode with its k on the same list). Browser
(Chromium, 390 px): a sender's top 4 of 12 stopped at 53 picks naming the true
top 4; the copied link opened on a fresh page in top-4 mode with the note; a
hand-made link with k = 7 on 3 options opened in full order with the reason;
no horizontal scroll, no console errors.

Limits: the saved progress for a list wins over a link's mode (someone who
already ranked that list keeps their own mode); the measured k are only 3 and
5, so a top 8 quotes the top-5 numbers and says so.

## A team's shortlist (2026-11-14, k3)

A shortlist link asks everyone for the same top k, but until now the combine
step answered a different question: it showed the team's whole order with
rank ranges, and the team had to read its shortlist off the table with no
sense of how sure it was. Now, when the link asked for a top k, the team box
leads with the team's answer:

- **The team's top k**: the group order's first k (`groupFit`, the same order
  as the table), each with two chances of really being in the top k: for these
  people's average likes (`groupFit`) and for the wider group they stand for
  (`populationFit`, which is less sure when people disagree). The closest
  option left out gets the same numbers.
- **A show of hands**: how many people have the option in their own top k.
  It is printed for the conversation, not used to pick.
  `teamRanges(items, people, { k })` returns it as `shortlist`
  (`teamShortlist` alone, `approvalShortlist` for the tally).

**Why the model picks, not the vote count.** `node
scripts/team-shortlist-sweep.mjs --runs 16` (rows in
`docs/team-shortlist-2026-11-14.jsonl`): a wider group with true scores over 6
logits; each of m members likes those plus their own N(0, tau^2) per option
and answers the page's own top-k questions until its stop rule or the cap;
10, 15 and 20 options, k = 3, teams of 3, 5 and 8, tau
0.5, 1 and 2; 16 teams a cell, 432 in all. Exact = the shown set is exactly the
true top 3.

| truth | group order (shown) | show of hands | wider-group order |
|---|---|---|---|
| this group's average likes | **338 / 432** | 311 / 432 | 338 / 432 |
| the wider group's | 255 / 432 | 241 / 432 | 260 / 432 |

- **The tally loses most when people differ.** At tau 2 the group order got
  this group's shortlist in 108 of 144 teams, the tally in 90; at tau 0.5,
  118 against 113. A tally throws away how strongly each person likes an
  option and how close their own cut was.
- **Small teams lose most to the tally**: teams of 3, 108 against 94; of 8,
  116 against 111. The tally and the model disagreed in 71 of 432 teams.
- **Picking by the wider-group fit instead buys nothing** (260 against 255
  for the wider truth), so the page shows one shortlist, the group order's.
- **Small teams cannot name a wider group's shortlist when people differ.**
  At tau 2 the true wider top 3 was named in 49 of 144 teams by the group
  order, 50 by the wider-group order and 44 by the tally.
  The wider chance says so: it averaged 0.72 there.
- **The chances are close to calibrated, slightly cautious.** Mean chance
  shown for the shortlist against the share that really was in:
  this group 0.943 / 0.940 (tau 0.5), 0.917 / 0.926 (tau 1), 0.894 / 0.917
  (tau 2); wider 0.912 / 0.928, 0.830 / 0.880, 0.718 / 0.752.

People answered about 57, 99 and 140 picks each at 10, 15 and 20 options.

Checks: three tests in `site/rank-core.test.mjs` (a team that agrees gets
its shared top k, chances that sum to k, votes, and no shortlist without k;
a 3-2 split leaves the wider chances less sure than the group's, red with
`wider` read from the group fit, checked; the tally counts own top k and
breaks ties by the group order). Browser (Chromium, 390 px): a top-3 link on
8 options, one scripted respondent (31 picks) plus two pasted codes; the box
led with "The team's top 3" and the closest left out; no horizontal scroll,
no console errors.

Limits: simulated people with evenly spaced scores, no ties or fatigue; k = 3
only in the sweep; a full-order or favourite link still combines as before
(no shortlist), and a person who ranked in another mode is combined the same
way.

## Pictures (2026-11-15)

The ranker now ranks pictures as well as words: "Or rank pictures" on
`rank.html` takes 3 to 60 image files (photos to cull, logo drafts, design
options), and each pair shows the two pictures with their names. Landing page:
`site/pick-the-best-photo.html`.

**Why.** Choosing the best of a set of pictures is a very common "this or
that" there is, and the usual tools rate each picture alone (stars and flags
in a photo manager or design review tool, which can drift over a long
session) or send the pictures to strangers (paid panel polls, which answer a
different question: what a market likes, not what you and your team like).
Pairwise picks keep the judgement relative, and the page already had the
picker, stop rule, rank ranges and team combine.

**How it stays upload-free.** A picture list *is* a list of file names
(`site/image-items.mjs`). The names go through the same `parseList`
normalising as a typed line and are sorted, so the order a file picker returns
them in never changes `listId`, and links, result codes and the team combine
work unchanged. The pictures themselves are object URLs of the person's own
files, held in memory only. A shared link carries the names and a flag
(`g: 1` in the fragment, `encodeList({ images: true })`); whoever opens it is
asked to select the same files (a shared drive folder works), which are
matched back by name, case-blind (`matchImages`), and any picture not yet
attached shows as its name. A reload keeps the answers (local storage, as
before) and asks for the pictures again. Non-images, a second file whose name
normalises to one already taken, and names past the 60 cap are listed back
rather than dropped silently. HEIC is accepted and named (Safari draws it,
other browsers do not; the page says so).

**What it does not do.** It does not look at the pictures: there is no
quality scoring, only the person's preferences. The order is an estimate from
a limited number of picks, as for any list.

**Checks.** `node --test site/image-items.test.mjs` (7 tests): picker order
does not change the list or its fingerprint; non-images, case repeats and the
cap are reported; MIME type counts with an odd extension; names survive the
link round trip and stay `parseList`-idempotent; a typed list's link carries
no picture flag; attached files match by name with gaps and extras named; the
landing page carries disclaimer, canonical and usage counter and is linked
from the ranker and the landing page. Browser, Playwright at 390 px: five
PNGs and a `.txt` selected (the `.txt` named as left out), 15 picks to a
result with five thumbnails and no horizontal scroll; a second person in a
fresh browser opens the link, sees names until they attach 3 of 5 files ("2
of 5 are not attached yet", naming them), then the rest; their opposite picks
and the first person's code combine to agreement -1.00 with thumbnails in the
team table; a reload asks for the pictures again; no console errors.

**Open.** Whether people use it (`pictures_loaded`, `picture_list_started`,
`pictures_attached`, `photo_page_viewed`, `photo_page_start` count locally);
whether picture comparisons are
noisier than word comparisons (more "about equal"), which a real session's
answers would show.


## Pictures on a phone, and "Look closer" (2026-11-15)

**Why.** Side by side in a 390 px wide browser, a pair of 3:2 landscape photos
was drawn 135 by 90 px each: too small to see focus, eyes or fine detail, the
things a cull turns on. And side by side is not how photographers compare
frames anyway: culling tools flip between two frames in the same place,
because a difference you cannot spot across a gap jumps out when the picture
changes under your eye.

**What changed.**

1. *Stacking when it clearly wins.* Once both pictures have loaded, the page
   works out each one's drawn size in either layout (`pairLayout` in
   `site/image-items.mjs`: object-fit contain in the box the CSS gives it,
   side by side at up to min(48vh, 380 px) tall, stacked at up to min(30vh,
   300 px)) and stacks the pair only when the smaller picture comes out at
   least 1.5 times the area (`STACK_GAIN`), since side by side is easier to
   take in at a glance. Measured in Chromium (`scripts/picture-compare-browser-check.mjs`):

   | viewport | pictures | layout | each drawn at |
   |---|---|---|---|
   | 390 x 844 | 3:2 landscape | stacked (was side by side) | 299 x 199 px (was 135 x 90: 4.9x the area) |
   | 390 x 844 | 9:16 portrait | side by side (unchanged) | 135 x 240 px |
   | 1280 x 900 | 3:2 landscape | side by side (unchanged) | 370 x 247 px |

   A pair cut off at the top or bottom of the screen is scrolled into view
   (the first stacked pair used to open with its top picture half above the
   screen, because the page kept the scroll from the Start button).
2. *Look closer.* A button (and the F key) shown only when both pictures are
   attached opens one picture full screen. Space or "Flip to the other"
   swaps it for the other picture in the same place; left and right arrows
   show a given side. A tap zooms 3x on that spot, and the zoom point is kept
   as percentages of the picture (`zoomOrigin`), so flipping shows the same
   part of the other picture (exactly the same part when the two share an
   aspect ratio, as frames from one camera do). "Choose this one" (Enter) or
   "About equal" (down arrow) answers for the picture on screen and opens the
   next pair full screen, so a whole cull can run there; it closes on Esc,
   Close, or when the pairs end and the results show. Counted locally as
   `closer_opened` and `closer_pick` (same opt-outs). Typed lists never show
   the button.

**Checks.** `node --test site/image-items.test.mjs` (10 tests; 3 new): the
fitted size; the layout choice at the phone and desktop boxes (a landscape
pair stacks on the phone with a gain over 4 and stays side by side on the
desktop; a 9:16 pair stays side by side on the phone; the smaller picture
decides a mixed pair; a picture with no size yet never stacks); the zoom
origin's mapping and clamping. Browser, Playwright with five generated 1500
x 1000 PNGs and four 900 x 1600 ones: the table above; no horizontal scroll;
open, flip, tap-zoom at (80%, 20%), flip keeps the origin, choose records the
shown picture's pick and opens the next pair unzoomed; Enter and down arrow
answer and Esc closes; picking with Enter to the end closes the view on the
results; the typed list shows no "Look closer"; no console errors. The first
browser run caught a real fault: `.closer{display:flex}` overrode `.hidden`,
so the invisible overlay swallowed every click on the page; fixed with
`.closer.hidden`.

**What it does not know.** Whether flipping changes what people choose or
how fast; `closer_pick` against `pick` counts on real sessions would show how
much of a cull runs full screen. Pinch zoom is the browser's own; the 3x tap
zoom has one level.

## Sort into piles first (2026-11-15)

Lists of 8 or more now start with an optional step: each option is shown on
its own and the person taps "near the top", "in the middle" or "near the
bottom" (keys 1, 2, 3). Then the pairs start, as before. "Skip sorting" at any
point keeps what was sorted and goes to the pairs.

**Why.** The ranker's own measurements ("How many picks it takes") put an
ordinary answerer at 93 picks for 20 options and 204 for 40. A rough sort is
the step people do by hand before a long list anyway (a MoSCoW pass, high /
medium / low), it costs one tap per option instead of reading two, and it
should tell the picker where not to spend questions.

**How the piles enter the model.** A pile is weaker evidence than a pick and
can be wrong, so it enters the refit as each option's prior, not as answers
(`pilePrior` in `site/rank-core.mjs`). The model: an option's score is
s ~ N(0, phi^2) as in the plain refit; the person sees s + e, e ~ N(0, tau^2),
and cuts that at two thresholds placed so the piles come out the sizes they
did (someone who puts half the list on top gets a lower top cut). The prior of
an option in a pile is the truncated-normal regression of s on its pile: mean
(phi^2/so^2) E[o | pile] and the matching variance, so^2 = phi^2 + tau^2.
`site/pile-first.test.mjs` checks those moments against 400,000 Monte Carlo
draws of the model. The engine's refit (`src/lib/btRefit.ts`, regenerated into
`site/engine/`) gained optional per-option `priorMean` and `priorScale` for
this; with neither it is unchanged. The team combine reads the piles in the
same model, as a Gaussian pseudo-likelihood on top of the plain prior
(`pileTerms`), and result codes carry them (`p`, one character per option;
an older code without them still decodes, a pile string of the wrong length is
refused as damaged).

**Two problems found on the way, both fixed before shipping.**

1. *The stop rule's own-prior check fought the piles.* The second read refits
   at the person's own prior sd, estimated from their picks. After a pile step
   the picks fall mostly inside a pile, so read alone they look like close
   calls, and the estimate went to its floor: half of 15-option runs with
   perfect piles hit the question cap (4 runs, 113 picks against 90 with no
   piles). The check now estimates the prior sd with the piles in the model
   (`pileEvidence`, a Laplace evidence that agrees with the engine's own
   estimate to 0.04 on plain picks) and, since 2026-11-15 later, the person's
   pile noise tau too, from a grid of 0.5, 1.28, 3 and 8 logits
   (`pilePriorFit`): a careless sorter's picks pick a large tau and the piles
   count for less. `site/pile-first.test.mjs` goes red with the old check.
2. *The pile prior confirmed itself.* It calls pairs from different piles
   settled, so the picker never asks one, and a misplaced option is never
   tested. On close-call people (3 logits over the list) with piles at the
   assumed noise, the stop claimed 0.90 for orders whose true Spearman was
   0.79 at 20 options (0.86 with no piles). Every 4th pair is now chosen as if
   there were no piles (`pairFit`, `PILE_AUDIT_EVERY`); the same people's
   stop then showed 0.86 against a claim of 0.88, as honest as no piles, for
   122 picks instead of 99. Rows before the check pairs:
   `docs/pile-first-no-check-pairs-2026-11-15.jsonl.gz`.

**What it measured.** `node scripts/pile-first.mjs` runs the page's own loop
(picker, check pairs, stop rule, cap) twice on each simulated person, with the
same true scores and the same coin for every pick: picks only, and after a pile
step. The person sorts by their own noisy view of each option (tau 0: never
misplaces; 1.28: the noise the prior assumes; 3.85: three times as careless)
at their own thirds. 24 people per cell at 8 to 20 options, 8 at 30 (the 30-option close-call cell took about 25 minutes on one core). Rows:
`docs/pile-first-2026-11-15.jsonl.gz` (each with the true Spearman after every
pick, so any budget can be read back). "Actions" counts a tap like a pick,
which flatters picks-only (a tap is one option to read, a pick two).

| answerer | options | sort | people | actions (taps + picks) | true Spearman at stop | stop claimed | hit cap | Spearman at 2n / 4n / 6n actions |
|---|---|---|---|---|---|---|---|---|
| ordinary | 8 | no sort | 24 | 39 | 0.945 | 0.900 | 21% | 0.856 / 0.944 / 0.969 |
| ordinary | 8 | careful (tau 0) | 24 | 26 (8 + 18) | 0.957 | 0.905 | 0% | 0.944 / 0.963 / 0.974 |
| ordinary | 8 | ordinary (tau 1.28) | 24 | 30 (8 + 22) | 0.950 | 0.904 | 0% | 0.900 / 0.951 / 0.970 |
| ordinary | 8 | careless (tau 3.85) | 24 | 44 (8 + 36) | 0.937 | 0.897 | 21% | 0.607 / 0.905 / 0.945 |
| ordinary | 12 | no sort | 24 | 59 | 0.947 | 0.903 | 0% | 0.872 / 0.921 / 0.955 |
| ordinary | 12 | careful (tau 0) | 24 | 37 (12 + 25) | 0.945 | 0.902 | 0% | 0.947 / 0.944 / 0.963 |
| ordinary | 12 | ordinary (tau 1.28) | 24 | 40 (12 + 28) | 0.932 | 0.903 | 0% | 0.899 / 0.937 / 0.956 |
| ordinary | 12 | careless (tau 3.85) | 24 | 70 (12 + 58) | 0.928 | 0.901 | 4% | 0.582 / 0.893 / 0.933 |
| ordinary | 20 | no sort | 24 | 93 | 0.933 | 0.903 | 0% | 0.823 / 0.915 / 0.943 |
| ordinary | 20 | careful (tau 0) | 24 | 64 (20 + 44) | 0.929 | 0.902 | 0% | 0.927 / 0.942 / 0.958 |
| ordinary | 20 | ordinary (tau 1.28) | 24 | 87 (20 + 67) | 0.937 | 0.904 | 0% | 0.849 / 0.932 / 0.959 |
| ordinary | 20 | careless (tau 3.85) | 24 | 120 (20 + 100) | 0.933 | 0.904 | 0% | 0.552 / 0.840 / 0.937 |
| close calls | 8 | no sort | 24 | 47 | 0.872 | 0.862 | 88% | 0.710 / 0.835 / 0.877 |
| close calls | 8 | careful (tau 0) | 24 | 35 (8 + 27) | 0.912 | 0.898 | 13% | 0.886 / 0.892 / 0.928 |
| close calls | 8 | ordinary (tau 1.28) | 24 | 45 (8 + 37) | 0.893 | 0.891 | 50% | 0.725 / 0.848 / 0.900 |
| close calls | 8 | careless (tau 3.85) | 24 | 53 (8 + 45) | 0.824 | 0.842 | 83% | 0.248 / 0.700 / 0.817 |
| close calls | 12 | no sort | 24 | 79 | 0.854 | 0.881 | 71% | 0.679 / 0.781 / 0.841 |
| close calls | 12 | careful (tau 0) | 24 | 44 (12 + 32) | 0.905 | 0.902 | 4% | 0.899 / 0.902 / 0.911 |
| close calls | 12 | ordinary (tau 1.28) | 24 | 79 (12 + 67) | 0.868 | 0.885 | 50% | 0.677 / 0.814 / 0.866 |
| close calls | 12 | careless (tau 3.85) | 24 | 89 (12 + 77) | 0.871 | 0.869 | 67% | 0.399 / 0.726 / 0.842 |
| close calls | 20 | no sort | 24 | 135 | 0.857 | 0.883 | 42% | 0.635 / 0.784 / 0.851 |
| close calls | 20 | careful (tau 0) | 24 | 86 (20 + 66) | 0.906 | 0.902 | 4% | 0.903 / 0.896 / 0.901 |
| close calls | 20 | ordinary (tau 1.28) | 24 | 142 (20 + 122) | 0.860 | 0.879 | 42% | 0.636 / 0.786 / 0.847 |
| close calls | 20 | careless (tau 3.85) | 24 | 168 (20 + 148) | 0.820 | 0.882 | 63% | 0.349 / 0.618 / 0.766 |
| ordinary | 30 | no sort | 8 | 123 | 0.918 | 0.901 | 0% | 0.825 / 0.922 / 0.944 |
| ordinary | 30 | careful (tau 0) | 8 | 99 (30 + 69) | 0.935 | 0.901 | 0% | 0.920 / 0.938 / 0.959 |
| ordinary | 30 | ordinary (tau 1.28) | 8 | 112 (30 + 82) | 0.926 | 0.902 | 0% | 0.839 / 0.926 / 0.959 |
| ordinary | 30 | careless (tau 3.85) | 8 | 200 (30 + 170) | 0.926 | 0.902 | 0% | 0.536 / 0.819 / 0.920 |
| close calls | 30 | no sort | 8 | 253 | 0.878 | 0.850 | 50% | 0.536 / 0.739 / 0.825 |
| close calls | 30 | careful (tau 0) | 8 | 96 (30 + 66) | 0.914 | 0.901 | 0% | 0.913 / 0.914 / 0.923 |
| close calls | 30 | ordinary (tau 1.28) | 8 | 258 (30 + 228) | 0.864 | 0.868 | 50% | 0.609 / 0.769 / 0.834 |
| close calls | 30 | careless (tau 3.85) | 8 | 265 (30 + 235) | 0.836 | 0.873 | 50% | 0.383 / 0.629 / 0.775 |

What it says:

- **A careful sort is a large saving.** Ordinary answerers who sort without
  misplacing: 20 options took 64 actions (20 taps, 44 picks) against 93 picks,
  for the same order (Spearman 0.929 against 0.933). 30 options: 96 against 123. Close-call people gain
  most: 86 actions against 135 at 20 options, with a better order (0.906
  against 0.857) and 4% of runs at the cap against 42%; at 30, 96 against 253.
- **An ordinary sort saves on short and mid lists and breaks even by 20.**
  12 options: 40 actions against 59 (Spearman 0.932 against 0.947, both above
  the 0.90 the stop promises); 20 options: 87 against 93 (0.937 against
  0.933); 30 options: 112 against 123 (0.926 against 0.918). Close calls: 142
  against 135 at 20 options and 258 against 253 at 30, same order.
- **A careless sort costs.** Three times the assumed misplacement: 120 actions
  against 93 at 20 options, same order; for close-call people 168 against 135
  and a slightly worse order (0.820 against 0.857). The stop stays about as honest
  as with no piles; the worst cell is close-call people sorting carelessly at
  20 options, 0.82 shown against 0.88 claimed (no piles: 0.86 against 0.88).
- **At equal effort** (the right-hand columns): for ordinary answerers a
  careful or ordinary sort is ahead at every budget measured; for close-call
  people a careful sort is far ahead and an ordinary one level. A careless sort
  is behind everywhere, by 0.03 or less at 6n actions except close-call people
  at 30 options (0.05).

So the step is offered, not forced, and the page says what it is for: "if you
can roughly tell top from bottom, sorting first saves picks". Lists under 8
were not measured, and the step is not offered there.

**Checks.** `node --test site/pile-first.test.mjs` (12 tests): the engine's
new options default to the plain refit and reject bad input; `pilePrior` is
null for nothing sorted, symmetric for equal piles, and matches Monte Carlo;
the team models' pseudo-likelihood gives the same mode as the direct prior;
codes round-trip piles and refuse damaged ones; a team member who only sorted
moves the group order; with right piles a 15-option person needs under 70% of
the picks (red with the old own-prior check); right piles read a careful tau
and reversed piles the "no information" end of the grid; check turns come
every 4th pick and only with piles; the page wires all of it. Browser,
Playwright at 390 px: 15 options sorted with keys (one Back), 28 picks for a
person who never wavers before the check pairs (51 measured without piles), the code carries
`p: 000001111122222`, a reload keeps the results, a 7-option list goes
straight to pairs, skipping at the first option goes straight to pairs,
combine works, no console errors, no horizontal scroll. A second walk with
the check pairs in: 27 picks, the exact order.

**Open.** Whether real people sort carefully, ordinarily or carelessly is the
whole question, and only real sessions answer it (`piles_started`,
`pile_tap`, `piles_done`, `piles_skipped` count locally; a session's code now
carries its piles, so the first real team codes will show how often picks
contradict piles). 40 and 60 options were not run (a 40-option close-call
person takes over 10 minutes a run here). The favourite and top-k modes use
the piles too, unmeasured.

## Best and worst of four (2026-11-15)

A fourth mode on the ranker, "Best and worst of four" (`rank.html?mode=screens`,
landing page `site/maxdiff-best-worst.html`). Each screen shows four options;
the person taps the one they like most, then the one they like least (keys 1
to 4; tapping the "most" again changes it; Undo takes back a whole screen).
It is the MaxDiff / best-worst scaling question, which survey platforms sell
as a paid module, and the one the customer-pain-points ready list already
named as its alternative.

**Model** (`site/best-worst.mjs`). The sequential best-worst model on the
refit's own Bradley-Terry scale: P(best = b | S) = e^{s_b} / sum_S e^{s},
then P(worst = w | S \ b) = e^{-s_w} / sum_{S \ b} e^{-s}. On a screen of
two it is exactly one pick (`best-worst.test.mjs` checks mode and covariance
to 1e-6), so pairs and screens share one likelihood: `fitAt` in
`rank-core.mjs` hands any answer list that contains a screen to `setFitAt`
(Newton on the concave log posterior, Laplace covariance, the same prior and
pile prior options), and lists of pairs alone still go to the engine's refit
unchanged. `linearize` adds a screen's exact terms (observed information), so
both team reads and `combine` take codes made of screens; `ownPrior` finds a
screen-answerer's own prior sd by golden section on the Laplace evidence
(`setPriorPhi`), so the stop rule's second check works as for pairs.

**Why not implied pairs.** Best A and worst D of {A, B, C, D} implies five
wins (A over B, C, D; B and C over D). Read as five independent picks they
overstate two taps: a test shows one screen read exactly leaves a larger
Var(s_A - s_D) and a smaller gap than its five implied picks. Overstated
evidence means narrow ranges and a stop that fires early, the failure this
page's stop rule was built to avoid ("Noisy answerers").

**The next screen** (`nextScreen`). Greedy on the expected information gain
(1/2) log det(I + I_S Cov_SS), with I_S the screen's expected Fisher
information at the current mode (best term plus the worst term averaged over
which option is best). On a pair it is (1/2) log(1 + p(1 - p) Var), the pair
picker's score made monotone (tested). Start from the best pair, add the
option that raises the gain most up to four; the same set is never asked
twice in a row, and options are shown shuffled. Piles are not offered in this
mode (the pile prior was measured with pairs only), and lists of 3 or 4 show
every option on each screen.

**Codes and links.** A screen travels in the result code as `s` + best,
worst, rest in base 36 (`s4.0.3.1`); a code that repeats an option, names
one outside the list or has best = worst is refused as damaged. A list link
carries `m: "screens"`, so a team answers the same question. The screen cap
is half the pair cap (`suggestedMax`) in screens, the same taps.

**Measured** (`node scripts/best-worst-sim.mjs`, rows in
`docs/best-worst-gumbel-2026-11-15.jsonl.gz` and
`docs/best-worst-probit-2026-11-15.jsonl.gz`, each with the true Spearman
after every tap). The page's own loop twice per simulated person, pairs then
screens, same true scores (evenly spaced over `spread` logits, shuffled);
stopCheck at 0.9 in both arms. 48 people per cell at 8 and 15 options, 12 at
30 (a 30-option close-call cell runs about 25 minutes per 6 people on one
core). "gumbel" answers as the model assumes (logistic pairs, Gumbel-max
screens); "probit" is off-model: each option seen with N(0, 1.6^2) noise,
highest best, lowest worst, which is also noisier on a pair (difference sd
2.26) than the logistic answerer.

| answerer | spread | n | pairs: picks | rho | screens: screens | taps | rho | rho at 2n taps, pairs / screens |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| gumbel | 6 | 8 | 37.8 | 0.960 | 13.0 | 25.9 | 0.958 | 0.889 / 0.923 |
| gumbel | 6 | 15 | 69.8 | 0.934 | 27.2 | 54.3 | 0.943 | 0.828 / 0.903 |
| gumbel | 6 | 30 | 149.6 | 0.930 | 64.8 | 129.7 | 0.951 | 0.809 / 0.889 |
| gumbel | 3 | 8 | 46.3 | 0.871 | 21.1 | 42.2 | 0.903 | 0.742 / 0.783 |
| gumbel | 3 | 15 | 109.1 | 0.862 | 47.2 | 94.4 | 0.901 | 0.631 / 0.754 |
| gumbel | 3 | 30 | 228.3 | 0.844 | 101.8 | 203.7 | 0.865 | 0.549 / 0.653 |
| probit | 6 | 8 | 42.7 | 0.927 | 16.0 | 32.1 | 0.947 | 0.803 / 0.887 |
| probit | 6 | 15 | 86.8 | 0.913 | 33.1 | 66.1 | 0.927 | 0.756 / 0.854 |
| probit | 6 | 30 | 152.4 | 0.881 | 62.5 | 125.0 | 0.920 | 0.755 / 0.856 |
| probit | 3 | 8 | 46.9 | 0.824 | 21.7 | 43.5 | 0.862 | 0.599 / 0.669 |
| probit | 3 | 15 | 114.2 | 0.816 | 53.6 | 107.3 | 0.851 | 0.479 / 0.639 |
| probit | 3 | 30 | 202.0 | 0.730 | 125.0 | 250.0 | 0.834 | 0.479 / 0.577 |

rho is the true Spearman of the order shown at the stop (or the cap). At equal
taps screens lead in every cell; to the stop they take fewer taps in 11 of 12.
The exception, probit close calls at 30, is the stop rule's: pairs that
stopped on their own (8 of 12) claimed 0.90 for orders that were truly 0.68,
screens that stopped (6 of 12) 0.81 under the same claim. Calibration of the
self-stopped runs elsewhere: ordinary people 0.92 to 0.96 true under a 0.90
to 0.91 claim in both arms; gumbel close calls at 15, pairs 0.83 and screens
0.88 under a 0.90 claim. Long close-call lists overclaim in both arms (the
"Open" item on noisy answerers stands).

**Not simulated: time.** A screen of four takes longer to read than a pair,
and taps are a stand-in for effort. Since 2026-11-15 the page measures it on
real people instead ("Answer times" below). The page counts `screen` events and
`mode:screens` starts locally; real codes now show which kind of answer a
person gave. The status line quotes the gumbel screens to the stop (13 / 21
at 8 options, 27 / 47 at 15, 65 / 102 at 30, ordinary / close calls).

**Checks.** `node --test site/best-worst.test.mjs` (9 tests): a two-option
screen equals one pick; gradient and information match finite differences;
one screen is weaker than its implied pairs; screenGain on a pair matches the
pair score; nextScreen shows distinct options and never repeats a set; screens
recover a simulated order (Spearman over 0.85 in 25 screens of 10 options);
codes round-trip mixed screens and picks and refuse damaged screens; both team
reads take screen codes; the page, link mode and landing page are wired, with
the disclaimer. Browser, Playwright at 390 px: example list in screens mode,
four options as a 2 by 2 grid, "Most" marked on the first tap, 24 screens to
the cap answering at random, results, a `QP1.` code with screens, the share
note names the mode, combine with that code works, no console errors.

## Answer times (2026-11-15)

The simulations above count taps, and a tap on a screen of four is not a tap
on a pair: reading four options and choosing twice takes longer. Whether
screens are quicker overall turns on one number, seconds per screen over
seconds per pick. A screen replaces about pairs-to-stop / screens-to-stop
picks (40 / 13 = 3.1 at 8 options, 73 / 27 = 2.7 at 15, 146 / 65 = 2.2 at
30, ordinary answerers), so screens save time while a screen takes less than
that many picks' time. No simulation can supply the ratio, so the page now
measures it on the people who use it.

**What is recorded** (`site/answer-time.mjs`). From the moment a pair or a
screen is shown to the answer (for a screen, the second tap), in whole tenths
of a second. A question during which the page was hidden at any point
(another tab, a locked phone) gets no time, as does one over ten minutes or
one whose clock ran backwards: unknown, not a wrong number. Undo drops the
time with the answer; times are saved with the answers on the device, and an
older save without them reads as unknown.

**Codes.** A result code carries the times as `t`, one base-36 token per
answer (`-` for unknown), only when they line up one-to-one with the answers.
A `t` of the wrong length, a token outside base 36 or over the cap is
refused as damaged rather than half-read, since a time pinned to the wrong
answer could pass a pair's time off as a screen's. A box under the code,
ticked by default, leaves the times out ("Include how long each answer
took"). Codes made before this read as before.

**What a person and a team see.** Results show the person's own median
seconds per pick and per screen. A team combine gives, for each kind, the
median over people of their own median (people with at least 3 timed answers
of that kind), so one slow person with many answers does not set it. When
both kinds are present it gives the ratio and the time to a settled order
for the list: real median seconds times the simulated typical answers to the
stop (`picksGuide(n).ordinary` picks; the nearest measured screens row; the
best-worst simulation's own pair arm needed 38, 70 and 150 picks where the
picks table says 40, 73 and 146, so the two tables agree within 6%), and
says whether screens save or cost time for this team. The counts are
simulated and the times are the team's own, and the page says so.

**Not yet.** No real times exist yet; the codes now carry them. Once a few
teams have combined, the ratio decides whether the best-worst landing page
should say screens are quicker, and the same times give the first real
check of the answer-time model the survey app's pace tools assume (flagship
item c).

**Checks.** `node --test site/answer-time.test.mjs` (7 tests): times in
tenths with none for a hidden page, a backward clock or over the cap; codes
round-trip times across mixed pairs and screens; misaligned or all-unknown
times are not sent and old codes still read; seven kinds of damaged `t` are
refused (the test fails with the decode check removed); a person's pace
splits pairs (ties included) from screens by the median; a team's pace is
the median of medians over people with 3 or more timed answers, and the time
to the stop is computed from it; the page starts a clock for pairs and
screens, records both, drops times on both undos, and passes times into the
code and the combine. Browser, Playwright at 390 px: 6 pairs at about 0.4 s
and 6 screens at about 0.9 s read back as 0.4 s per pick and 1.0 s per
screen; a combine of the screens person with two pairs codes gave "A screen
took 2.5 times as long as a pick ... about 16 s with picks against 13 s with
screens"; unticking the box shortens the code; no console errors.
