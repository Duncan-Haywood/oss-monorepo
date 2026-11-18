---
title: "Alpha's confidence interval gets worse with more respondents, when items are unequal"
seo_title: "Cronbach's alpha vs omega: when alpha's interval misses"
date: 2026-11-17
tags: [scale-reliability, psychometrics, research-tools, statistics]
description: "A new free reliability tool, and a simulation: with unequal items, alpha's 95% interval covered the true reliability 11% of the time at n = 1,000."
---

A new tool landed today: a [scale reliability calculator](https://marisstella.app/scale-reliability/)
for questionnaires and surveys. Paste one row per respondent and one column per
item and it reports Cronbach's alpha with its confidence interval, McDonald's
omega with a bootstrap interval, Guttman's lambda-2 and lambda-6, and an item
analysis (item-rest correlations, alpha and omega if each item is deleted,
loadings, and a warning for reverse-keyed items nobody reversed). It runs in the
browser, from a command line and as an agent tool, and nothing is uploaded.

**Checked against other software.** On the bundled example, alpha matches
pingouin to twelve decimals and its Feldt interval matches scipy's F quantiles
to 1e-9. The one-factor loadings match factor_analyzer's minres fit to 1e-5.
Omega matches a separate scipy least-squares fit to 1e-7. The reference script
and its output are in `ventures/scale-reliability/eval/`.

**The example is real survey data.** It is the nine PHQ-9 depression-screener
items answered by 1,500 adults in NHANES 2017-2018, a public-domain US
government file. Alpha is 0.824 (95% CI 0.810 to 0.837) and omega 0.838. The
weakest item is the self-harm question: almost nobody endorses it (mean 0.04 on
a 0 to 3 scale), so it correlates only 0.32 with the other eight. Deleting it
would raise alpha by 0.004. That is a reason to keep the item, which is there
for safety, and to read "alpha if deleted" with care. These are unweighted
answers, not population estimates or screening results.

## The finding: a bigger sample can make alpha's interval worse

Alpha equals the reliability of a total score only when every item measures
the trait equally strongly. When the items differ, alpha is a lower bound
(Sijtsma 2009). Textbooks say so. Fewer people ask what that does to the
confidence interval most software prints beside alpha.

So the tool ships a seeded simulation (`eval/coverage.mjs`). Six items share one
common factor. 300 data sets were drawn per setting, each with 300 bootstrap
resamples, and every 95% interval was scored against the true reliability of
the total score:

| loadings | n | true reliability | population alpha | Feldt (alpha) | BCa (alpha) | BCa (omega) |
| --- | --- | --- | --- | --- | --- | --- |
| all 0.6 | 50 | 0.771 | 0.771 | 94.7% | 93.7% | 93.3% |
| all 0.6 | 200 | 0.771 | 0.771 | 92.3% | 91.0% | 90.7% |
| all 0.6 | 1000 | 0.771 | 0.771 | 95.3% | 93.7% | 93.7% |
| 0.2 to 0.9 | 50 | 0.771 | 0.734 | 93.3% | 88.0% | 94.7% |
| 0.2 to 0.9 | 200 | 0.771 | 0.734 | 73.0% | 68.0% | 92.7% |
| 0.2 to 0.9 | 1000 | 0.771 | 0.734 | 11.3% | 11.3% | 94.3% |

With equal loadings, every method is within a few points of 95%; with 300
draws a coverage figure carries about 1.3 points of noise. With unequal loadings
(0.2, 0.3, 0.4, 0.8, 0.85, 0.9), the population alpha is 0.734 against a true
reliability of 0.771. Alpha's intervals are centred on 0.734 and narrow as the
sample grows, so they miss the true value more and more often: 93% coverage at
50 respondents, 73% at 200, 11% at 1,000. Omega's bias-corrected bootstrap
interval, the one Kelley and Pornprasertmanit (2016) recommend, stays between
93 and 95% throughout.

The practical reading: with a large sample and items that differ in strength,
a tight interval around alpha is precise about the wrong number. It
underestimates reliability, which is the safe direction, but anyone who uses
the interval to compare scales or to correct correlations for attenuation gets
it wrong in a predictable way. The page puts omega and its interval beside
alpha by default, and the gap between the two shows how unequal the items are.

This is a small simulation with one design for unequal loadings and normal
answers. Ordinal answers and correlated errors are not covered, and the README
says so.

## What's next

Natural extensions: a multi-factor model for hierarchical omega on scales with
subscales; ordinal (polychoric) coefficients, reported next to the Pearson
ones; and the greatest lower bound. The code is MIT licensed, in
`ventures/scale-reliability/`.
