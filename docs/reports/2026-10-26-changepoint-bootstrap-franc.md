# changepoint-detector: why --bootstrap missed CHF (2026-10-26)

Measured with `ventures/changepoint-detector/eval/fx-bootstrap-why.mjs` (output beside it). The pilot fit at 3x BIC isolates the shock in a 10-day segment, per-segment standardising cuts kurtosis 111.5 to 4.3, bootstrap penalty 36.4 vs ~45 needed. Longer pilot minSegment (30/60/90) does not help (penalty 36-38). Next run: try a robust-scale standardisation across the shock (not segment-wise) and check synthetic GARCH false alarms (16% at n=200) do not regress.
