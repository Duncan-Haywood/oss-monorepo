# Milestone 3: Bayesian mixture (DPMPM) imputation of held-out survey years (Catholics, 307 item-years, 13 items)

K = 80 classes; occupied classes per run: median 53, max 69; m = 10 imputations; total sampler time 211 CPU-minutes.

Mean absolute error of the imputed share against the held-out year's observed weighted share, points.

| method | mean | median | closer than interp |
|---|---:|---:|---:|
| dpmpm | 4.81 | 3.49 | 43% |
| dpmpm_rb | 4.76 | 3.58 | 42% |
| mice_logreg | 4.66 | 3.46 | 42% |
| logit_plain | 4.06 | 2.62 | 47% |
| hgb_plain | 3.87 | 2.85 | 50% |
| hgb_shift | 3.38 | 2.36 | 56% |
| decade | 3.54 | 2.71 | 51% |
| interp | 3.43 | 2.72 | 0% |
| combo | 3.23 | 2.46 | 61% |
| combo_dpmpm | 3.57 | 2.74 | 51% |

dpmpm closer than mice_logreg on 48% of item-years, than plain hgb on 37%. Mean signed error of dpmpm -0.24 points.

95% intervals (coverage overall, worst item, same-sex marriage, same-sex relations; median half-width; mean Winkler score, points):

| interval | coverage | worst item | same-sex marriage | same-sex relations | half-width | Winkler |
|---|---:|---:|---:|---:|---:|---:|
| dpmpm, Rubin | 81.8% | 0% (samesex_marr_no) | 0% | 40% | 7.6 | 44.9 |
| mice_logreg, Rubin (m3_mice) | 82.7% | 20% (samesex_marr_no) | 20% | 40% | 7.4 | 45.3 |
| dpmpm, conformal const | 94.1% | 40% (samesex_marr_no) | 40% | 53% | 15.7 | 45.4 |
| dpmpm, conformal drift | 93.8% | 63% (homosex_wrong) | 80% | 63% | 12.9 | 40.4 |
| combo_dpmpm, conformal const | 94.5% | 40% (samesex_marr_no) | 40% | 83% | 10.0 | 26.2 |
| combo_dpmpm, conformal drift | 95.1% | 80% (samesex_marr_no) | 80% | 87% | 8.9 | 25.9 |
| hgb_shift, conformal const | 94.1% | 60% (samesex_marr_no) | 60% | 80% | 9.4 | 30.1 |
| hgb_shift, conformal drift | 95.1% | 83% (divorce_harder) | 100% | 87% | 7.6 | 22.2 |
| combo, conformal const | 94.8% | 60% (samesex_marr_no) | 60% | 93% | 8.7 | 26.3 |
| combo, conformal drift | 95.4% | 79% (divorce_harder) | 100% | 93% | 7.1 | 21.1 |

| item | n years | dpmpm | dpmpm_rb | mice_logreg | hgb | interp | dpmpm Rubin covers | median Rubin half-width |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| abortion_no | 29 | 4.2 | 4.3 | 4.6 | 4.4 | 3.8 | 86% | 9.2 |
| afterlife | 29 | 3.4 | 3.3 | 3.2 | 2.7 | 3.2 | 93% | 6.9 |
| attend_weekly | 35 | 3.7 | 3.7 | 3.9 | 3.0 | 3.0 | 83% | 6.5 |
| cohab_not_ok | 5 | 4.8 | 5.2 | 4.2 | 6.9 | 2.9 | 100% | 7.6 |
| divorce_harder | 29 | 5.6 | 5.9 | 5.7 | 5.6 | 6.1 | 90% | 9.0 |
| ever_divorced | 35 | 2.6 | 2.4 | 2.3 | 2.0 | 2.2 | 89% | 6.4 |
| god_no_doubt | 16 | 2.7 | 2.4 | 2.4 | 1.9 | 3.0 | 94% | 7.5 |
| homosex_wrong | 30 | 10.5 | 10.4 | 10.0 | 6.7 | 2.9 | 40% | 9.0 |
| pope_infallible | 10 | 3.9 | 3.9 | 3.4 | 3.6 | 3.6 | 90% | 8.1 |
| pray_daily | 24 | 3.3 | 3.2 | 3.2 | 3.0 | 3.1 | 96% | 7.9 |
| premarsx_wrong | 30 | 3.4 | 3.3 | 3.5 | 2.9 | 3.3 | 93% | 6.5 |
| samesex_marr_no | 5 | 20.3 | 20.1 | 15.8 | 17.3 | 5.8 | 0% | 10.1 |
| xmarsex_wrong | 30 | 5.6 | 5.6 | 5.6 | 3.2 | 3.6 | 70% | 7.3 |
