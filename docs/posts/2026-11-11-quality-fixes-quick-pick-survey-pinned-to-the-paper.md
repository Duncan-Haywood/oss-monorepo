---
title: "Quick Pick Survey's statistics, pinned to the paper they cite"
seo_title: "Pinning Glicko-2, DerSimonian-Laird and Davidson to references"
date: 2026-11-11
tags: [quality-audit, testing, statistics]
description: "Two of three seeded bugs in Quick Pick Survey's ranking maths passed every test. New tests pin them to the papers; six seeded bugs now fail."
---

Quick Pick Survey ranks things by asking people to pick one of two. It
runs on three pieces of statistics: Glicko-2 ratings for each respondent,
a DerSimonian-Laird random-effects pool across respondents, and Davidson's
tie-extended Bradley-Terry model for its conjoint surveys. The
[2026-11-10 quality audit](../../portfolio/quality/audits/2026-11-10-quick-pick-survey.json)
seeded a one-line bug into each of the three. All three passed the 304-test
fast suite. That is the audit's one high-severity defect.

## What still slipped through today

Before writing anything I ran the same three bugs against the current suite
(336 tests, `vitest.fast.config.ts`):

| seeded bug | before | after |
|---|---|---|
| Glicko-2 rating step scaled by 0.9 | caught (a single-game pin landed after the audit) | caught |
| DerSimonian-Laird `tau^2` numerator `Q - (k-1)` changed to `Q - k` | **survived** | caught |
| Davidson tie term `e^(d/2)` changed to `e^(d/3)` | **survived** | caught |
| Glicko-2 system constant tau 0.5 changed to 0.3 | not tried | caught |
| DerSimonian-Laird scaling `C` replaced by the sum of weights | not tried | caught |
| conjoint ridge penalty halved | not tried | caught |

So the pooled interval on every group ranking and the tie model behind every
conjoint result could change and nothing would fail.

## The fix: check against a source the author did not write

The existing Glicko test named itself after Glickman's worked example, then
checked only that the rating ended up between 1400 and 1500. The paper's
example is a rating *period* (one player, three opponents at once), and the
app updates one comparison at a time, so it could not reproduce the number.

The new `updateGlickoPeriod` runs the paper's period update. Steps 5 to 8
(the volatility solve and the new rating and RD) are now a single function,
`finishUpdate`, that both the period update and the live single-game update
call, so the published example checks the code the survey actually runs. It
gives 1464.05, 151.52 and 0.059996. Glickman publishes 1464.06, 151.52 and
0.05999, rounding as he goes.

I wrote the other reference values in a separate Python script, working from
the papers rather than from the TypeScript. The script reproduces Glickman's
example, which is some evidence that it is right. The new tests pin:

- rating, RD **and volatility** for a draw, a favourite losing and an upset.
  Volatility moves by about 1e-5 a game, so it is pinned to 1e-7, and that
  pin is what caught the tau change.
- the DerSimonian-Laird pooled mean, standard error and tau on a three-person
  and a five-person panel, plus the case where Q is below its degrees of
  freedom and tau truncates to zero.
- Davidson outcome probabilities at two points, and the penalised maximum
  likelihood fit on a counted table (12 A, 5 B, 7 ties). Without the ridge
  that fit has a closed form (beta = ln 12/5, nu = 7/sqrt 60), which gives a
  check that does not depend on any implementation.

Without the seeded bugs: 347 of 347 fast tests pass, and `tsc` and `eslint`
are clean.

## What this does not fix

The audit's other findings are open, and none of them is about arithmetic:

- Glicko-2 models skill that changes over time, with updates whose result
  depends on the order of the answers. A respondent's preferences are
  static, and a fixed Bradley-Terry fit would be the standard choice.
- The interval reported per respondent is the Glicko RD, with a floor of 30.
  It is not a sampling interval.
- The conjoint matrix inverse covers up a singular Hessian, so the standard
  errors it reports are arbitrary when that happens.

Those are method questions for a later round. The audit's scores stay as
they were: a fix never raises a score in the round that made it, and the
next audit of the subject re-scores it in a new file.
