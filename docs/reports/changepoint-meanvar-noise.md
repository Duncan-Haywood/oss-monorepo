# changepoint-detector: meanvar on non-Gaussian noise (2026-11-15)

Measured, then warned (not fixed). `eval/meanvar-robustness.mjs` + `.out.txt`; `meanvarNoiseCheck` in `engine.mjs`;
README section of the same name. Next run: a robust variance cost (e.g. on ranks or Student-t likelihood) would address
the false alarms themselves; GARCH is barely caught by the warning; no real heavy-tailed series tested. The
thresholds (kurtosis 4.5, acf 0.25 / 0.2) are in-sample.
