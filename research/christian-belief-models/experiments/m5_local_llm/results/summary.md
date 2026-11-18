# Milestone 5: local open-weights LLMs against the transferred models

74 cells (pair x item), 8 pairs; medians over cells, cell bootstrap 95% intervals (2000 draws). Level error in points; var ratio = var(y - f)/var(y) (Section 5).

| Estimator | median AUC | median abs. level error | mean abs. level error | median var ratio |
|---|---:|---:|---:|---:|
| LLM05 | 0.531 (0.502&ndash;0.542) | 36.98 (26.00&ndash;42.16) | 34.25 | 1.006 (1.000&ndash;1.014) |
| LLM15 | 0.569 (0.537&ndash;0.589) | 32.84 (22.50&ndash;38.57) | 33.08 | 0.990 (0.984&ndash;1.006) |
| LLM15_platt | 0.530 (0.504&ndash;0.556) | 14.05 (11.08&ndash;15.86) | 14.31 | 1.000 (0.996&ndash;1.002) |
| GBM_demog | 0.699 (0.675&ndash;0.729) | 7.53 (6.61&ndash;8.89) | 8.94 | 0.927 (0.884&ndash;0.945) |
| GBM_full | 0.780 (0.755&ndash;0.790) | 5.11 (3.86&ndash;6.42) | 5.94 | 0.796 (0.772&ndash;0.838) |
| SRC | &mdash; | 12.41 (9.67&ndash;13.97) | 13.13 | 1.000 (1.000&ndash;1.000) |
| LLM05_shift | &mdash; | 13.63 (10.14&ndash;17.46) | 14.69 | 1.000 (1.000&ndash;1.000) |
| LLM15_shift | &mdash; | 9.35 (7.94&ndash;14.19) | 11.96 | 1.000 (1.000&ndash;1.000) |

## Paired differences (median over cells, 95% interval)

- auc: GBM_demog &minus; LLM15: +0.130 (+0.110 to +0.140), 74 cells
- auc: GBM_full &minus; LLM15: +0.193 (+0.162 to +0.209), 74 cells
- auc: LLM15 &minus; LLM05: +0.051 (+0.021 to +0.058), 74 cells
- abs_err: LLM15 &minus; GBM_full: +26.742 (+18.178 to +35.445), 74 cells
- abs_err: LLM15_platt &minus; SRC: +2.165 (+0.775 to +2.764), 74 cells
- abs_err: LLM15_platt &minus; GBM_full: +7.637 (+6.431 to +10.692), 74 cells
- abs_err: LLM15_shift &minus; GBM_full: +4.703 (+3.582 to +6.824), 74 cells
- abs_err: LLM15_shift &minus; SRC: -0.764 (-1.831 to -0.118), 74 cells
- abs_err: LLM05_shift &minus; GBM_full: +7.889 (+4.861 to +10.268), 74 cells
- abs_err: GBM_full &minus; SRC: -5.853 (-8.465 to -4.403), 74 cells

## The shift: does the LLM know the gap between the groups?

- LLM05: Spearman(predicted gap, true gap) = -0.508 (p = 3.9e-06), 74 cells; slope of predicted on true gap -0.10; median |true gap| 12.41 points, median |predicted gap| 2.57
- LLM15: Spearman(predicted gap, true gap) = 0.345 (p = 0.0026), 74 cells; slope of predicted on true gap 0.09; median |true gap| 12.41 points, median |predicted gap| 2.61

## By kind of transfer (median abs. level error, points; median AUC)

| Kind | cells | LLM05 | LLM15 | LLM15_platt | GBM_demog | GBM_full | SRC | LLM05_shift | LLM15_shift | AUC LLM15 | AUC GBM_demog | AUC GBM_full |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| generation | 10 | 34.73 | 27.55 | 13.72 | 8.56 | 5.54 | 10.87 | 10.08 | 8.27 | 0.548 | 0.677 | 0.742 |
| ethnicity | 10 | 30.38 | 19.95 | 7.53 | 6.12 | 4.81 | 6.93 | 7.23 | 4.24 | 0.563 | 0.688 | 0.753 |
| tradition | 36 | 40.22 | 38.03 | 16.13 | 9.58 | 6.00 | 15.99 | 19.75 | 14.78 | 0.547 | 0.694 | 0.779 |
| period | 18 | 32.95 | 31.16 | 5.67 | 5.99 | 3.87 | 6.44 | 5.62 | 7.12 | 0.609 | 0.730 | 0.811 |

## By item (median over pairs)

| Item | cells | AUC LLM15 | AUC GBM_full | abs err LLM15 | abs err GBM_full | abs err LLM15_shift |
|---|---:|---:|---:|---:|---:|---:|
| abortion_no | 8 | 0.546 | 0.729 | 9.75 | 5.86 | 7.18 |
| afterlife | 8 | 0.481 | 0.706 | 47.68 | 3.66 | 7.64 |
| attend_weekly | 8 | 0.623 | 0.786 | 23.06 | 5.46 | 5.54 |
| divorce_harder | 8 | 0.500 | 0.682 | 8.60 | 10.31 | 14.13 |
| god_no_doubt | 8 | 0.656 | 0.801 | 73.49 | 9.29 | 21.66 |
| homosex_wrong | 8 | 0.531 | 0.838 | 33.09 | 7.87 | 18.93 |
| pray_daily | 8 | 0.608 | 0.810 | 53.71 | 2.00 | 10.40 |
| premarsx_wrong | 8 | 0.502 | 0.785 | 12.41 | 5.26 | 11.71 |
| xmarsex_wrong | 8 | 0.603 | 0.750 | 37.62 | 2.26 | 4.47 |
| pope_infallible | 2 | 0.570 | 0.640 | 22.37 | 4.19 | 4.73 |
