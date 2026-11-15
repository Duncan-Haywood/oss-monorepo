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
- Stop (since 2026-11-14, later): with at least one answer of each kind,
  when there is under a 10% chance that any option beats the leader by more
  than `DECIDE_MARGIN` (0.25 on the overall logit scale, a weighted edge of
  about 56 to 44 in a head-to-head pick; `table.safe`), or when the posterior
  mean Spearman between a drawn order and the order shown reaches 0.9
  (`STOP_CONFIDENCE`, as on the list ranker), or at the cap
  `decisionMax(n, C)` (half of a full list-ranker budget for the criteria
  plus one per criterion). See "The winner stop" below.
- What would change the winner (`whatWouldChange`): for each criterion, the
  weight it would need (the others keeping their proportions) for another
  option to come out best. With the others in proportion every overall score
  is linear in that one weight, `S_o(x) = x D_o + (1 - x) R_o`, so each
  crossing is solved exactly, at the posterior mode. The page says "too few
  picks on it to tell" for a criterion with fewer option picks than options
  minus one, where flat scores would make "no weight changes it" a guess.

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

## The winner stop (2026-11-14, later)

The first stop rule waited for the whole order to settle, and the table above
shows what happened: 58 of 60 runs hit the cap. A person using this page came
to choose one option, so a second rule now ends the questions once the leader
is safe, and the picker aims at the same thing: `nextQuestion` with
`focus: "winner"` (the default) scores the gaps between the leader and each
rival, weighted by each rival's chance of really being ahead, instead of
every neighbouring pair (`focus: "order"`, the first picker, kept).

`node scripts/decide-stop-sweep.mjs --runs 12 [--case 0..4] [--focus winner|order]`
uses decide-sim.mjs's people, seeds and answer model and records, at every
answer, where each rule would stop. Rows: `docs/decide-winner-stop-2026-11-14.jsonl`
(winner focus) and `docs/decide-order-focus-stop-2026-11-14.jsonl` (the first
picker). The same 60 people (five cells x 12):

| picker, stop | picks in all | runs at the cap | shown best is the true best | true best more than 0.25 ahead of it |
|---|---|---|---|---|
| order focus, order stop (before) | 6,179 | 58 | 31 | 19 |
| order focus, winner stop at 0.25 | 6,179 | 58 | 31 | 19 |
| winner focus, winner stop at 0.15 | 5,788 | 48 | 35 | 17 |
| **winner focus, winner stop at 0.25 (shipped)** | **5,695** | **45** | **35** | **13** |
| winner focus, winner stop at 0.4 | 5,424 | 37 | 33 | 10 (of a looser 0.4 bar) |

- **The stop alone does nothing; the picker matters.** Under the order picker
  the winner stop fired in 2 of 60 runs: questions spread over the whole order
  leave the leader as uncertain as everything else.
- **With both, 8% fewer picks and a better winner**: 35 against 31 right,
  13 against 19 runs where the true best was more than 0.25 ahead of the
  option shown. The stop fired on its own in 15 of 60 runs; the cap still
  ends most, because decisionMax is tight (41 picks for 5 x 3).
- **The read is honest, slightly cautious**: in the 15 runs that stopped on
  their own the read averaged 0.907 and 14 (0.933) really were within 0.25.
- **0.25, not 0.4**: 0.4 stops sooner (5,424 picks) but names the true best
  less often (33) and is a looser promise; 0.15 buys nothing over 0.25.
- **The cost is the order below the winner.** On decide-sim.mjs's fixed
  budgets (rows: `docs/decide-sim-winner-focus-2026-11-14.jsonl`, against
  the first picker's `docs/decide-sim-2026-11-14.jsonl`), the shown best was
  the true best in 26 / 25 / 35 of 60 runs at a quarter, half and all of the
  cap, against 15 / 23 / 31, while the whole order's Spearman at the cap
  averaged 0.669 against 0.714 (worst at 8 x 4, spread 3: 0.41 against
  0.67). Someone who wants the full order can keep answering; a "rank them
  all" mode that switches the focus back is not built.

Browser (Chromium, 390 px): the example decision with a scripted person
whose options trade off across criteria stopped at 45 picks (cap 72) with
the leader 92% safe; "Would change the winner" named a rival and a weight
for two criteria and "too few picks on it to tell" for two the picker had
left alone; no console errors, no horizontal scroll.

## Graded answers (2026-11-14, latest)

Every pick now says how big the gap feels: each side has **Much better**
and **A bit better** (keys: arrows for "a bit", Shift+arrows for "much", or
1 2 3 4 from left to right). The diagnostic above found the per-criterion
option scores were the bottleneck, and a graded answer carries more than one
bit about them.

**The model** (`site/graded-fit.mjs`). The person feels
`z = (x_A - x_B) + e`, with `e` logistic, and says "much" when `|z| > tau`,
else "a bit". So `P(much A) = sigma(d - tau)` and
`P(bit A) = sigma(d) sigma(tau - d) (1 - e^-tau)`: both are sums of
log-sigmoid terms, so the fit is concave and the Laplace covariance falls out
as before. An ungraded pick is the two graded answers added together, which
is the plain Bradley-Terry win, so codes made before this change read exactly
as they did (the fit equals the old refit on them to 1e-9, tested). Codes
mark "a bit" with `-` and "much" with `+` after an answer.

**Measured.** `scripts/decide-graded-sim.mjs` runs decide-sim.mjs's people
(same cases and seeds, 60 per case, 300 in all) with one change: the pick
comes from the same uniform draw as before, so it is unchanged, and the grade
is `|z| > tau_true`. All rows: `docs/graded-answers-2026-11-14.jsonl.gz`;
`node scripts/decide-graded-summary.mjs` prints every line below.

| reading | person's tau ("much" share) | Spearman at 1/4, 1/2, cap | stop: picks | at cap | best right | true best > 0.25 ahead | self-stops within 0.25 |
|---|---|---|---|---|---|---|---|
| plain picks (the page before) | any | 0.362 / 0.505 / 0.631 | 28,510 | 231 | 165 | 83 | 62/69 (0.90) |
| "much" = two wins | 2 (36%) | 0.372 / 0.514 / 0.636 | 24,801 | 167 | 175 | 66 | 114/133 (0.86) |
| ordinal, tau 2 | 2 (36%) | **0.467 / 0.582 / 0.709** | 21,636 | 131 | 198 | 45 | 157/169 (0.93) |
| ordinal, tau 2 | 1 (63%) | 0.465 / 0.578 / 0.676 | 14,631 | 54 | 172 | 80 | 189/246 (**0.77**) |
| ordinal, tau 2 | 0.5 (80%) | 0.422 / 0.556 / 0.637 | 10,132 | 16 | 156 | 99 | 188/284 (**0.66**) |
| ordinal, tau 2 | 3 (19%) | 0.413 / 0.561 / 0.687 | 27,339 | 212 | 181 | 63 | 81/88 (0.92) |
| ordinal, tau 2 | 0.5 to 4 per answer (36%) | 0.423 / 0.549 / 0.644 | 22,837 | 147 | 179 | 69 | 129/153 (0.84) |
| ordinal, the person's own tau | 1 / 2 / 3 / spread | 0.68 / 0.67 / 0.69 / 0.67 at cap | 20,505 / 19,839 / 20,570 / 19,553 | | 178 / 188 / 183 / 177 | 75 / 63 / 59 / 71 | 0.80 / 0.87 / 0.87 / 0.79 |
| **ordinal tau 2, guarded stop (shipped)** | 2 | 0.467 / 0.582 / 0.709 | 28,762 | 240 | **203** | **42** | 58/60 (0.97) |
| same | 1 | 0.465 / 0.578 / 0.676 | 25,063 | 161 | 186 | 61 | 128/139 (0.92) |
| same | 0.5 | 0.422 / 0.556 / 0.637 | 25,103 | 160 | 192 | 67 | 120/140 (0.86) |
| same | 3 | 0.413 / 0.561 / 0.687 | 30,487 | 277 | 182 | 62 | 21/23 (0.91) |
| same | spread | 0.423 / 0.549 / 0.644 | 29,325 | 239 | 185 | 65 | 58/61 (0.95) |

- **Graded answers help, read as an ordinal model.** At every budget and
  for every kind of person the shown order is closer to the truth than with
  plain picks (at the cap 0.64 to 0.71 against 0.63; at a quarter of the cap
  0.41 to 0.47 against 0.36). Counting "much" as two wins buys little
  (0.636), so the model matters, not just the extra button. Grading only
  the option questions gets about half the gain (0.668 at the cap).
- **It does not close the diagnostic's gap.** 8 x 4, spread 6 at the cap
  went from 0.747 to 0.783; the true option scores gave 0.90. Graded
  answers are a step, not the fix.
- **The stop was the danger.** Read at a tau higher than the person's own,
  "much" is trusted too far: the winner stop kept its 90% promise in only 77%
  of the runs it ended for a person at tau 1, 66% at tau 0.5. Estimating the
  person's own tau (`estimateTau`: Laplace evidence over every fit, a
  log-normal prior at 2, sd 0.5) recovered it well (mean 1.22, 2.28, 3.38 for
  1, 2, 3) but the plug-in still read 0.79 to 0.87, and did no better than a
  fixed tau on the winner. So the fit stays at tau 2.
- **The shipped stop is guarded** (`decisionDoneGraded`): once the usual
  check passes, the answers are refit at the lower of tau 1 and the person's
  own estimate, where "much" counts for little and "a bit" for close to a tie,
  and the page stops only if that refit passes too (tau 1.5 was not enough:
  0.84 at tau 1). That keeps the promise at 0.91 to 0.97 for tau 1 to 3 and
  the inconsistent person, 0.86 for someone who says "much" 80% of the time.
- **The trade**: about as many picks as plain answers (25,063 to 30,487
  against 28,510; fewer for people who say "much" often), and a better
  winner for every kind of person: the true best named 182 to 203 times in
  300 against 165, and the true best more than 0.25 ahead of the one shown
  42 to 67 times against 83. Most runs still end at the cap.

Browser (Chromium, 390 px): the example decision answered by a scripted
person who puts Rent first, saying "much" on Rent and "a bit" elsewhere:
21 picks, the person's Rent favourite first with an 89% chance of being
best, Rent's weight 85% (25-96%); about 54 ms per pick end to end; a code
with grades; no console errors, no horizontal scroll.

## Checks

- `node --test site/graded-fit.test.mjs` (7 tests, 2026-11-14 latest): the ordinal fit equals the plain refit on ungraded answers (mode and covariance to 1e-9); "much" moves and tightens a gap more than an ungraded pick and "a bit" less; `estimateTau` reads a person at 1 below 1.5 and at 3.5 above 2.5 from 120 answers and stays at the default with none; graded codes round-trip and an old code reads as ungraded; one "much" against two "a bit" picks reverses a 2-1 plain lead; the graded stop's guard runs and never reads safer; the page's four buttons, keys and guarded stop. Red with grades ignored (3 tests) and with the guard skipped (1), checked.
- `node --test site/decide-core.test.mjs` (12 tests, under 1 s; since 2026-11-14 later also: the winner stop ends the questions while the order below is unsettled, refuses with one kind of answer, reads low with no answers (red with `safe` forced to 1, checked), and a wider margin reads safer; `whatWouldChange` names a weight at which the named rival really overtakes, checked just either side of it): setup
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

0. **A larger cap for the winner stop?** 45 of 60 runs still end at the
   cap. PR 15977's first version, a separate page this one superseded (a 0-100 value scale, a cap of
   4.5 C (n + 1)) stopped on its own in most runs at about 41 picks for 5 x 3;
   whether this page should trade more questions for a settled winner is
   open. A "rank them all" switch back to `focus: "order"` too.

1. **Graded answers, next steps.** Whether real people use "much"
   consistently, and how often (the guard assumes nothing about it, but a
   person below tau 0.5 is read surer than they are: 0.86 at 0.5). The
   picker still scores questions by the binary information `p (1 - p)`; the
   ordinal answer's own Fisher information would favour pairs where a "much"
   is likely. And a stop that rides on the guard ends on its own in only 60
   of 300 runs at tau 2: a larger cap (item 0) matters more now.
2. **Per-person prior on the criteria.** The fixed prior sd 2.0 on
   criterion logits allows extreme weights; the list ranker's
   empirical-Bayes second check could narrow it the same way.
3. **Team weights as a random-effects fit**, as the list ranker's team
   ranges do, so a team result has ranges too.
4. **Ready decisions** (flats, vendors, laptops, job offers framed safely)
   that open the page filled in, like the list ranker's ready lists.
5. A real person's answers: none yet.
