# changepoint-detector: calibrated meanvar penalty (2026-10-25)

Negative result, not wired into `analyze`. Script `ventures/changepoint-detector/eval/meanvar-calibrated-penalty.mjs`,
numbers in its `.out.txt` and the README section of the same name. Variant A (first-pass segments) is free but weak;
variant B (3x BIC segments) fixes false alarms but loses breaks at n = 100. Next: an inflation estimate that does not
count the break (robust local scale, or windowed long-run variance), then re-run both scripts. `--robust` remains the
shipped fix for heavy tails.
