# Neural minus boosted pinball loss, test year 2024, per-permit paired bootstrap

Permit-level (i.i.d.) bootstrap replication of the week-block result in `paired_summary_2024.txt` (PR #13636). Positive = neural worse. Source code was not kept (duplicate of `src/paired_neural_boosted.py`).

Positive = neural worse. Source: `src/paired_bootstrap.py`, 3 seeds.

| pair | quantile | neural minus boosted (relative) | 95% interval, permit bootstrap (days) | 95% interval, week-block bootstrap (days) | share of permits neural better |
|---|---|---|---|---|---|
| austin a2i | 0.1 | +2.73% | +0.198 to +0.219 | +0.182 to +0.232 | 0.37 |
| austin a2i | 0.5 | -0.03% | -0.095 to +0.093 | -0.212 to +0.198 | 0.45 |
| austin a2i | 0.9 | +0.92% | +0.104 to +0.330 | -0.115 to +0.542 | 0.45 |
| austin i2c | 0.1 | -0.10% | -0.055 to +0.027 | -0.077 to +0.057 | 0.51 |
| austin i2c | 0.5 | +0.25% | +0.022 to +0.200 | -0.060 to +0.289 | 0.50 |
| austin i2c | 0.9 | +1.36% | +0.322 to +0.529 | +0.225 to +0.626 | 0.35 |
| chicago a2i | 0.1 | +0.37% | +0.010 to +0.010 | +0.009 to +0.011 | 0.63 |
| chicago a2i | 0.5 | -0.46% | -0.074 to -0.033 | -0.079 to -0.025 | 0.47 |
| chicago a2i | 0.9 | -3.30% | -0.499 to -0.278 | -0.561 to -0.232 | 0.51 |
| sf a2i | 0.1 | +1.57% | +0.015 to +0.061 | +0.013 to +0.065 | 0.41 |
| sf a2i | 0.5 | +1.50% | +0.110 to +0.224 | +0.077 to +0.246 | 0.38 |
| sf a2i | 0.9 | +5.82% | +0.659 to +0.843 | +0.628 to +0.885 | 0.59 |
| sf i2c | 0.1 | +1.27% | +0.123 to +0.234 | +0.094 to +0.266 | 0.36 |
| sf i2c | 0.5 | +2.10% | +0.890 to +1.196 | +0.832 to +1.267 | 0.46 |
| sf i2c | 0.9 | +2.13% | +0.591 to +0.908 | +0.542 to +0.972 | 0.59 |
