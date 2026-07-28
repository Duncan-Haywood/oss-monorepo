# Pooling across perspectives, and why it is not in the app

[CONVERGENCE.md](CONVERGENCE.md) has listed cross-perspective pooling as "the
largest untaken win, and the one most likely to be got subtly wrong" for
several sessions. This is the measurement that settles it. The answer is that
it is both — the win is real and about as large as advertised, and taking it
would delete the product's sharpest output.

The implementation is in [`src/lib/pooling.ts`](../src/lib/pooling.ts) and the
measurement in
[`src/lib/pooling.simulation.test.ts`](../src/lib/pooling.simulation.test.ts).
The module is written, tested, and deliberately imported by nothing.

## The idea

A person rates the same items three times: what they want for themselves
(SELF), what they want in a partner (PARTNER), and what they think their
partner wants (PARTNER_GUESS). The three sets of answers share no state at
all, so a person who answers 90 questions per perspective pays for 270 answers
and gets three separately-mediocre rankings.

The three are obviously correlated. Standard hierarchical shrinkage should let
each borrow strength from the other two:

    r[i][p] = mu[i] + delta[i][p] + e[i][p]
    delta ~ N(0, tau^2)     genuine departure of this perspective
    e     ~ N(0, rd^2)      measurement error

with `tau^2` estimated from the data by method of moments, so genuine
disagreement widens the prior and switches the borrowing off. That estimated
`tau^2` is the safety valve, and the whole design argument rests on it.

## What it does

Medians over 15 seeds, driving the real `selectNextPair`, the real Glicko-2
update and the real `compareRankings`, on the 41-item activities survey. Five
items per couple are planted blind spots — items where A's guess about B is
inverted relative to what B actually wants.

| | 90 answers/perspective | 300 answers/perspective |
| --- | --- | --- |
| Items under rd 150, before → after | 3–4 → **28–29** | 40 → 41 |
| corr(PARTNER_GUESS, SELF), raw | 0.21–0.34 | 0.33–0.41 |
| corr(PARTNER_GUESS, SELF), **pooled** | **0.97–0.99** | **0.83–0.90** |
| corr in the planted truth | 0.37 | 0.37 |
| Planted blind spots found, of 5 | 0 → 0 | 2 → **0–1** |
| Estimated `tau` | 60–91 | 155–176 |

## Reading the table

**The precision gain is real.** Three or four usable items become
twenty-eight, for no extra answers, at the budget a real person actually
answers. Nothing else in this project's backlog offers a sevenfold improvement
on the quantity that gates every screen. This is why the idea keeps coming
back, and it deserved a measurement rather than a hand-wave.

**The pooled guess is a copy of the guesser.** In the planted truth, what A
thinks B wants correlates 0.37 with what A wants for themselves. The raw
estimates recover 0.21–0.34 — attenuated below the truth by measurement error,
which is the direction of error [STATISTICAL-INTEGRITY.md](STATISTICAL-INTEGRITY.md)
already documents. Pooling returns **0.97–0.99**. The pooled PARTNER_GUESS is
very nearly A's SELF ranking with a different label on it.

That is not a bias to be traded off against precision. "A person's guess about
their partner is pulled toward what they want for themselves" is the
definition of the thing the blind-spots screen exists to detect. Pool the
perspectives and the estimator manufactures the bias, the screen finds it, and
the couple is told something about themselves that only the model did.

**The cost lands where the product lives.** At 300 answers, where the raw
comparison finds 2 of the 5 planted blind spots, the pooled one finds 0–1.

**The two effects are one mechanism, at opposite ends of the budget.** The
gain is entirely at 90 answers (3→28); at 300 it is 40→41, nothing. The bias
is worst at 90 (0.98) and smaller at 300 (0.86). Pooling helps exactly where
it hurts most, and stops helping exactly where it becomes tolerable. There is
no budget at which it is a good trade.

## The safety valve does not work at this precision

The design argument was that `tau^2` is estimated, not assumed, so a person
whose perspectives genuinely differ is barely shrunk. That is true, and it is
observable in the table: `tau` is 155–176 at 300 answers and the correlation
lands at 0.86 rather than 0.98.

At 90 answers `tau` collapses to 60–91, and across runs it lands anywhere
between 0 and about 90. It is estimated as the observed between-perspective
spread *minus* `mean(rd^2)`, and at 90 answers `rd` is still 200–300 — so
measurement error swamps the quantity being estimated and the estimate floors
toward zero. Zero `tau` is a maximally confident prior, which is maximum
shrinkage.

The valve is therefore backwards. It is tightest when pooling is harmless
because the answers are already there, and wide open when pooling does the
most damage. That is not a tuning problem. It is what happens when a variance
component is estimated from data noisier than the component itself, and no
choice of estimator fixes it — the information is not in the data.

## Where that leaves the convergence problem

Pooling is closed, not deferred. The remaining options from
[CONVERGENCE.md](CONVERGENCE.md) are unaffected and are now the whole list:

- **Shrink the combined survey.** 220 items is a superset of the other six. If
  the couple screen only ever needs the top of a ranking, it does not need the
  tail. No statistical risk; it is a content decision.
- **Make a smaller promise up front.** Say what 60 answers buys before someone
  starts, rather than showing a complete-looking ranking that is not one.

One narrower version of pooling is *not* refuted by any of this, because
nothing above applies to it: **using other perspectives to choose which
questions to ask, without letting them touch the estimates.** Question
selection may use any information it likes — it cannot bias a rating, because
the rating still comes only from that perspective's own answers. If SELF has
already established that item X beats item Y decisively, the PARTNER_GUESS
session need not spend answers rediscovering the pairs whose outcome is not in
doubt, and can spend them on the pairs where the perspectives are likely to
part company — which are the blind spots. That is unmeasured and is the honest
next thing to try here. It is a different change from the one this document
closes, and it needs its own simulation before anyone believes it.

## If you are about to propose pooling again

Read the second row of the table. The idea is good, the implementation in
`pooling.ts` is a fair one rather than a strawman, and it is correct that the
app leaves a large amount of precision on the table by keeping the three
perspectives apart. Keeping them apart is the product.
