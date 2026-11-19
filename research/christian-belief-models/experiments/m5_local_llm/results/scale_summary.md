# Milestone 5, scale point: Qwen2.5-3B-Instruct against the 0.5B and 1.5B models

74 cells, same seed-0 sample and cells as `summary.md`; medians over cells, cell bootstrap 95% intervals (2000 draws). Level error in points.

| Estimator | median AUC | median abs. level error | median var ratio |
|---|---:|---:|---:|
| LLM05 | 0.531 (0.502&ndash;0.542) | 36.98 (26.00&ndash;42.16) | 1.006 (1.000&ndash;1.014) |
| LLM15 | 0.569 (0.537&ndash;0.589) | 32.84 (22.50&ndash;38.57) | 0.990 (0.984&ndash;1.006) |
| LLM3 | 0.560 (0.545&ndash;0.577) | 61.43 (54.40&ndash;70.88) | 1.000 (1.000&ndash;1.000) |
| LLM15_platt | 0.530 (0.504&ndash;0.555) | 14.05 (11.08&ndash;15.86) | 1.000 (0.996&ndash;1.003) |
| LLM3_platt | 0.522 (0.504&ndash;0.544) | 13.28 (9.68&ndash;14.55) | 1.000 (1.000&ndash;1.004) |
| GBM_demog | 0.699 (0.674&ndash;0.728) | 7.53 (6.60&ndash;8.91) | 0.927 (0.888&ndash;0.945) |
| GBM_full | 0.780 (0.754&ndash;0.790) | 5.11 (3.86&ndash;6.42) | 0.796 (0.772&ndash;0.838) |
| SRC | &mdash; | 12.41 (9.52&ndash;13.97) | 1.000 (1.000&ndash;1.000) |
| LLM05_shift | &mdash; | 13.63 (9.25&ndash;17.27) | 1.000 (1.000&ndash;1.000) |
| LLM15_shift | &mdash; | 9.35 (7.64&ndash;13.71) | 1.000 (1.000&ndash;1.000) |
| LLM3_shift | &mdash; | 12.27 (9.33&ndash;13.66) | 1.000 (1.000&ndash;1.000) |

## Paired differences (median over cells, 95% interval)

- auc: GBM_demog &minus; LLM3: +0.111 (+0.098 to +0.140), 74 cells
- auc: LLM3 &minus; LLM15: +0.005 (-0.017 to +0.026), 74 cells
- abs_err: LLM3 &minus; LLM15: +26.759 (+13.659 to +31.696), 74 cells
- abs_err: LLM3_shift &minus; SRC: -0.006 (-0.015 to -0.002), 74 cells
- abs_err: LLM3_shift &minus; GBM_full: +5.655 (+4.325 to +7.972), 74 cells
- abs_err: LLM3_shift &minus; LLM15_shift: +0.590 (-0.826 to +1.770), 74 cells
- abs_err: LLM3_platt &minus; SRC: +1.122 (+0.205 to +2.470), 74 cells

## The gap between groups, by model size

| Model | params (B) | Spearman (p) | slope (95% CI) | median abs. predicted gap | median abs. true gap |
|---|---:|---:|---:|---:|---:|
| LLM05 | 0.49 | -0.508 (3.9e-06) | -0.10 (-0.14 to -0.06) | 2.57 | 12.41 |
| LLM15 | 1.54 | 0.345 (0.0026) | 0.09 (0.04 to 0.14) | 2.61 | 12.41 |
| LLM3 | 3.09 | 0.556 (2.7e-07) | 0.02 (0.01 to 0.04) | 0.02 | 12.41 |

Log-linear extrapolation of the slope (slope = a + b log2 size): through 1.5B and 3B, b = -0.063 per doubling, so the line never reaches slope 1; through all three, b = +0.051, slope 1 at about 873,384B. An extrapolation over a factor of six in size, not a forecast.

## Exploratory (not pre-registered): the LLM3 gap on the logit scale

Qwen2.5-3B-Instruct answers No to almost everything (87.2% of its 40,249 scores are below 0.01 or above 0.99; 2.0% round to 0 at six decimals), so its probability-scale group means sit near 0 and their difference cannot carry a gap of any size. On the logit scale (weighted mean logit of p in the target minus the source, p clipped at 1e-6, the CSV's resolution) against logit(theta_T) - logit(theta_S):

- Spearman 0.597 (p = 1.9e-08); slope 1.30 (0.75 to 1.86); median |predicted logit gap| 0.59, median |true logit gap| 0.60; 74 cells.
- LLM3_logitshift = expit(logit theta_S + predicted logit gap): median abs. level error 11.57 (9.26&ndash;14.04), mean 14.93
- abs_err: LLM3_logitshift &minus; SRC: +0.065 (-2.775 to +4.249), 74 cells
- abs_err: LLM3_logitshift &minus; GBM_full: +6.412 (+3.092 to +9.494), 74 cells
- abs_err: LLM3_logitshift &minus; LLM15_shift: +0.620 (-1.748 to +7.494), 74 cells

| Kind | cells | SRC | GBM_full | LLM3_logitshift | logit-gap slope | Spearman |
|---|---:|---:|---:|---:|---:|---:|
| generation | 10 | 10.87 | 5.54 | 11.92 | 0.25 | 0.39 |
| ethnicity | 10 | 6.93 | 4.81 | 6.80 | 0.14 | 0.20 |
| tradition | 36 | 15.99 | 6.00 | 14.27 | 1.64 | 0.57 |
| period | 18 | 6.44 | 3.87 | 11.00 | -0.07 | -0.21 |

| Item | cells | SRC | GBM_full | LLM3_logitshift | share of scores &lt; 1e-5 |
|---|---:|---:|---:|---:|---:|
| abortion_no | 8 | 9.14 | 5.86 | 7.45 | 0.26 |
| afterlife | 8 | 7.21 | 3.66 | 9.77 | 0.00 |
| attend_weekly | 8 | 5.73 | 5.46 | 20.56 | 0.22 |
| divorce_harder | 8 | 15.54 | 10.31 | 18.25 | 0.00 |
| god_no_doubt | 8 | 23.44 | 9.29 | 10.73 | 0.60 |
| homosex_wrong | 8 | 20.29 | 7.87 | 17.45 | 0.50 |
| pray_daily | 8 | 9.69 | 2.00 | 23.63 | 0.28 |
| premarsx_wrong | 8 | 11.67 | 5.26 | 6.82 | 0.01 |
| xmarsex_wrong | 8 | 5.73 | 2.26 | 5.94 | 0.05 |
| pope_infallible | 2 | 10.20 | 4.19 | 8.56 | 0.01 |

## By kind of transfer (median abs. level error, points)

| Kind | cells | SRC | GBM_full | LLM15_shift | LLM3_shift | slope LLM15 | slope LLM3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| generation | 10 | 10.87 | 5.54 | 8.27 | 9.64 | -0.01 | 0.03 |
| ethnicity | 10 | 6.93 | 4.81 | 4.24 | 6.77 | -0.08 | 0.02 |
| tradition | 36 | 15.99 | 6.00 | 14.78 | 14.22 | 0.16 | 0.03 |
| period | 18 | 6.44 | 3.87 | 7.12 | 7.70 | -0.02 | -0.03 |
