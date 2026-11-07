# changepoint-detector: ramp gap rule, synthetic check (2026-11-07)

`ventures/changepoint-detector/eval/ramp-gap.mjs` (output beside it, README "Gap rule on synthetic ramps and staircases").
Finding: default `maxGap` (n/50, here 6) groups 6-point ramps and 6-point step pairs equally (38/40) and misses 24 to 48 point ramps (0 to 8/40).
Next run: a span-aware rule (e.g. test whether a linear segment through the cuts beats steps by BIC) instead of a gap; calibrate on real documented ramps if any can be fetched.
Nothing here is real data.
