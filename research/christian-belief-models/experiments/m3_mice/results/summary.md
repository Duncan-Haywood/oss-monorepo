# Milestone 3: MICE on held-out survey years (Catholics, 307 item-years)

Mean absolute error of the imputed share against the held-out year's observed weighted share, points.

| method | mean | median |
|---|---:|---:|
| mice_logreg | 4.66 | 3.46 |
| mice_norm | 7.18 | 6.58 |
| logit_plain | 4.06 | 2.62 |
| hgb_plain | 3.87 | 2.85 |
| hgb_shift | 3.38 | 2.36 |
| hgb_w5 | 3.44 | 2.41 |
| decade | 3.54 | 2.71 |
| interp | 3.43 | 2.72 |

mice_logreg closer than interp on 42% of item-years; closer than plain hgb on 39%.

Rubin 95% interval covers the observed share:

- mice_logreg: 82.7% of item-years; median interval half-width 7.4 points, median between-imputation sd 2.33 points
- mice_norm: 39.7% of item-years; median interval half-width 5.2 points, median between-imputation sd 1.50 points

| item | n years | mice_logreg | mice_norm | logit | hgb | interp | logreg covers |
|---|---:|---:|---:|---:|---:|---:|---:|
| abortion_no | 29 | 4.6 | 5.7 | 4.5 | 4.4 | 3.8 | 90% |
| afterlife | 29 | 3.2 | 7.2 | 2.2 | 2.7 | 3.2 | 93% |
| attend_weekly | 35 | 3.9 | 5.8 | 3.1 | 3.0 | 3.0 | 83% |
| cohab_not_ok | 5 | 4.2 | 7.4 | 6.0 | 6.9 | 2.9 | 100% |
| divorce_harder | 29 | 5.7 | 6.0 | 6.3 | 5.6 | 6.1 | 79% |
| ever_divorced | 35 | 2.3 | 7.9 | 2.3 | 2.0 | 2.2 | 97% |
| god_no_doubt | 16 | 2.4 | 4.2 | 2.4 | 1.9 | 3.0 | 100% |
| homosex_wrong | 30 | 10.0 | 11.3 | 6.8 | 6.7 | 2.9 | 40% |
| pope_infallible | 10 | 3.4 | 4.3 | 3.8 | 3.6 | 3.6 | 90% |
| pray_daily | 24 | 3.2 | 3.7 | 3.3 | 3.0 | 3.1 | 100% |
| premarsx_wrong | 30 | 3.5 | 8.3 | 3.0 | 2.9 | 3.3 | 90% |
| samesex_marr_no | 5 | 15.8 | 19.5 | 16.4 | 17.3 | 5.8 | 20% |
| xmarsex_wrong | 30 | 5.6 | 8.6 | 3.9 | 3.2 | 3.6 | 70% |
