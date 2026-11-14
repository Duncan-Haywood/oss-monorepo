# The list ranker page (`site/rank.html`)

**Live:** https://marisstella.app/quick-pick-survey/rank.html (landed 2026-11-14).

Until this page, the venture's only public surface was a description: using
Quick Pick meant deploying the Next.js and Postgres app. The list ranker is the
same model in the browser, for one person or a small team, with nothing
uploaded.

## What it does

- Paste 3 to 60 options (`parseList`: bullets, blanks and case-insensitive
  repeats dropped). Pick between two at a time; "About equal" is a tie, Undo
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

It now stops on `orderConfidence`: the posterior mean Spearman correlation
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
- Team combine averages refits; it does not use the app's random-effects pool
  (`pooling.ts`), which would widen intervals where people disagree.
- `orderConfidence` overstates certainty for very noisy respondents on short
  lists (table above); a lapse-aware prior or the app's `lapseEstimate` could
  correct it.
