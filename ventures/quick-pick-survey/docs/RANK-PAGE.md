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
- Team combine's ranges (below) read tau low; see "Team ranges".
- `orderConfidence` overstates certainty for very noisy respondents on short
  lists (table above); a lapse-aware prior or the app's `lapseEstimate` could
  correct it.

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
direction. tau is still read low (true 2 reads 0.6-0.9), the usual Laplace
bias for a variance component with binary answers, so the page states it in
words ("about the same / somewhat different / clearly different likes"), not
as a number.

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

Cost in Node: 0.2 s at 25 options x 5 people, 0.8 s at 60 x 5, 1.2 s at
60 x 10, run once per Combine click. Pinned by four tests in
`site/rank-core.test.mjs`; the disagreement one fails with tau forced to 0
(checked). Browser: Chromium at 390 px, 3 agreeing codes and 1 reversed:
Group ranges 1-2 ... 5-6, Wider 1-3 ... 4-6, no horizontal scroll, no console
errors.

Open: tau's low bias (an importance-sampled marginal or a moment estimator
could correct it); the Wider range assumes the members are a random draw
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
