# Milestone 3: period-aware mixture (DPMPM + survey period) on held-out survey years (Catholics, 307 item-years, 13 items)

- `decade` arm: occupied classes median 56; sampler time 258 CPU-minutes; median share of the held-out year's respondents in classes mostly from their own period 2%; 6 item-years have no other asked year in their period.

Mean absolute error of the imputed share, points.

| method | mean | median | closer than interp | closer than year-free dpmpm |
|---|---:|---:|---:|---:|
| pmix_decade | 3.55 | 2.64 | 50% | 66% |
| pmix_rb_decade | 3.54 | 2.55 | 51% | 70% |
| dpmpm | 4.81 | 3.49 | 43% | 0% |
| mice_logreg | 4.66 | 3.46 | 42% | 52% |
| hgb_plain | 3.87 | 2.85 | 50% | 63% |
| hgb_shift | 3.38 | 2.36 | 56% | 61% |
| decade | 3.54 | 2.71 | 51% | 64% |
| interp | 3.43 | 2.72 | 0% | 57% |
| combo | 3.23 | 2.46 | 61% | 62% |
| combo_pmix_decade | 3.15 | 2.45 | 57% | 67% |

`decade`, item-years with at least one other asked year in the period (301): pmix 3.42, year-free dpmpm 4.66, interp 3.35; without (6): pmix 10.15, dpmpm 12.53.
Paired difference pmix_decade minus year-free dpmpm: -1.26 points (item-year bootstrap 95% interval -1.58 to -0.94).

95% intervals (coverage overall, worst item, same-sex marriage, same-sex relations; median half-width; mean Winkler score, points):

| interval | coverage | worst item | same-sex marriage | same-sex relations | half-width | Winkler |
|---|---:|---:|---:|---:|---:|---:|
| dpmpm (year-free), Rubin | 81.8% | 0% (samesex_marr_no) | 0% | 40% | 7.6 | 44.9 |
| pmix_decade, Rubin | 91.5% | 60% (samesex_marr_no) | 60% | 73% | 7.5 | 25.0 |
| pmix_decade, conformal drift | 94.8% | 80% (samesex_marr_no) | 80% | 87% | 9.2 | 26.1 |
| combo_pmix_decade, conformal drift | 95.1% | 79% (divorce_harder) | 80% | 93% | 7.5 | 21.5 |
| combo, conformal drift | 95.4% | 79% (divorce_harder) | 100% | 93% | 7.1 | 21.1 |

| item | n years | pmix_decade | dpmpm | mice_logreg | hgb_shift | interp |
|---|---:|---:|---:|---:|---:|---:|
| abortion_no | 29 | 3.9 | 4.2 | 4.6 | 4.0 | 3.8 |
| afterlife | 29 | 2.7 | 3.4 | 3.2 | 2.4 | 3.2 |
| attend_weekly | 35 | 2.3 | 3.7 | 3.9 | 2.8 | 3.0 |
| cohab_not_ok | 5 | 5.1 | 4.8 | 4.2 | 4.6 | 2.9 |
| divorce_harder | 29 | 5.2 | 5.6 | 5.7 | 5.3 | 6.1 |
| ever_divorced | 35 | 2.2 | 2.6 | 2.3 | 2.1 | 2.2 |
| god_no_doubt | 16 | 2.4 | 2.7 | 2.4 | 2.2 | 3.0 |
| homosex_wrong | 30 | 5.7 | 10.5 | 10.0 | 4.4 | 2.9 |
| pope_infallible | 10 | 3.8 | 3.9 | 3.4 | 3.0 | 3.6 |
| pray_daily | 24 | 2.7 | 3.3 | 3.2 | 2.7 | 3.1 |
| premarsx_wrong | 30 | 2.7 | 3.4 | 3.5 | 3.0 | 3.3 |
| samesex_marr_no | 5 | 11.5 | 20.3 | 15.8 | 15.6 | 5.8 |
| xmarsex_wrong | 30 | 4.0 | 5.6 | 5.6 | 2.5 | 3.6 |
