# Milestone 3: drift-aware conformal intervals (Catholics, 307 item-years, 13 items)

Leave-one-item-out split-conformal 95% intervals around each point imputation of a held-out year's share. Coverage = share of item-years whose observed share lies inside; width = median half-width, points; Winkler = mean interval score, points (lower is better).

| method | MAE | score | coverage | worst item | same-sex marriage | same-sex relations | median half-width | Winkler |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| interp | 3.43 | const | 94.8% | 66% (divorce_harder) | 80% | 97% | 9.2 | 24.6 |
| interp | 3.43 | samp | 95.4% | 76% (divorce_harder) | 80% | 100% | 8.1 | 22.0 |
| interp | 3.43 | drift | 95.4% | 79% (divorce_harder) | 100% | 100% | 7.6 | 22.9 |
| hgb_shift | 3.38 | const | 94.1% | 60% (samesex_marr_no) | 60% | 80% | 9.4 | 30.1 |
| hgb_shift | 3.38 | samp | 95.1% | 60% (samesex_marr_no) | 60% | 87% | 8.2 | 28.5 |
| hgb_shift | 3.38 | drift | 95.1% | 83% (divorce_harder) | 100% | 87% | 7.6 | 22.2 |
| mice_logreg | 4.66 | const | 93.2% | 40% (samesex_marr_no) | 40% | 50% | 14.4 | 40.4 |
| mice_logreg | 4.66 | samp | 92.8% | 20% (samesex_marr_no) | 20% | 50% | 13.6 | 38.0 |
| mice_logreg | 4.66 | drift | 94.8% | 67% (homosex_wrong) | 80% | 67% | 12.8 | 37.6 |
| combo | 3.23 | const | 94.8% | 60% (samesex_marr_no) | 60% | 93% | 8.7 | 26.3 |
| combo | 3.23 | samp | 95.1% | 60% (samesex_marr_no) | 60% | 97% | 7.8 | 23.5 |
| combo | 3.23 | drift | 95.4% | 79% (divorce_harder) | 100% | 93% | 7.1 | 21.1 |
| mice_logreg | 4.66 | Rubin (m3_mice) | 82.7% | 20% (samesex_marr_no) | 20% | 40% | 7.4 | 45.3 |
| hgb_shift | 3.38 | bootstrap (m3_period_shift) | 76.2% | 40% (cohab_not_ok) | 40% | 67% | 4.7 | n/a |

Per-item coverage of `hgb_shift` intervals:

| item | n years | MAE | const | samp | drift | median drift half-width |
|---|---:|---:|---:|---:|---:|---:|
| abortion_no | 29 | 4.0 | 90% | 90% | 93% | 9.0 |
| afterlife | 29 | 2.4 | 100% | 100% | 97% | 7.6 |
| attend_weekly | 35 | 2.8 | 97% | 97% | 100% | 7.0 |
| cohab_not_ok | 5 | 4.6 | 100% | 100% | 100% | 13.8 |
| divorce_harder | 29 | 5.3 | 83% | 86% | 83% | 8.3 |
| ever_divorced | 35 | 2.1 | 100% | 100% | 97% | 6.2 |
| god_no_doubt | 16 | 2.2 | 100% | 100% | 94% | 6.9 |
| homosex_wrong | 30 | 4.4 | 80% | 87% | 87% | 8.3 |
| pope_infallible | 10 | 3.0 | 100% | 100% | 100% | 9.8 |
| pray_daily | 24 | 2.7 | 100% | 100% | 100% | 7.8 |
| premarsx_wrong | 30 | 3.0 | 97% | 97% | 100% | 6.5 |
| samesex_marr_no | 5 | 15.6 | 60% | 60% | 100% | 11.2 |
| xmarsex_wrong | 30 | 2.5 | 100% | 100% | 97% | 7.3 |

Coverage at other nominal levels (`hgb_shift`; overall / worst item):

| nominal | const | samp | drift |
|---:|---|---|---|
| 80% | 80.8% / 40% | 81.1% / 40% | 80.1% / 66% |
| 90% | 89.6% / 59% | 90.2% / 60% | 90.2% / 72% |
| 95% | 94.1% / 60% | 95.1% / 60% | 95.1% / 83% |

Drift scale d: median 1.5 points, 90th percentile 4.4; sampling sd s: median 2.3 points. Spearman correlation of d with |hgb_shift error|: 0.13.
