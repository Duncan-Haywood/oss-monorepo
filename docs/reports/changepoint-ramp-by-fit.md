# changepoint-detector: ramps by fit (2026-11-08)

`ramps.mjs` `groupRamps(..., {values})` (engine passes values) keeps a run of same-direction cuts (inner gaps <= n/5) only if a 4-parameter flat-line-flat fit beats the steps by BIC (2k+1 params). Output: `ventures/changepoint-detector/eval/ramp-gap-fit.out.txt`; README "Ramps by fit".
Synthetic: long ramps 33-40/40 (was 0-8), close H=8 step pairs 1/40 (was 38). Costs: 6-pt H=8 ramp 27/40 (was 38); H=4 steps 12 apart 9/40.
Next: `--ar1`/sticky noise; real documented ramps and close steps; Python/`--trend` interplay untested.
