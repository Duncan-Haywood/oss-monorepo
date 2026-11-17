# changepoint-detector: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-15) (5) holiday list: wanted a shop's counts or a yearly term.
- (2026-11-16) (4) driftWarning on real shocks.
- (2026-11-16) (3) `--garch`: t-GARCH failed one pre-registered line (README "Heavy tails in the GARCH search"): re-test scoring breaks with false alarms, new seeds
- (2026-11-16) next real batch counts
- (2026-11-16) real calls: Poisson, wandering rate
- (2026-11-16) (2) clumpy counts: NB1 shipped
- (2026-11-17) a real step inside a cycle, a cycle check not tied to rho, real documented ramps and close steps
- (2026-11-17) nulls rho low
- (2026-11-17) step/bend bootstrap tests (README "Step or bend, as two tests") fail: walks called bend, use the cut guard
- (2026-11-17) cut-guard conditioning calibrated but blind (round 6), a control series was tried 2026-11-17 (README "A control series")
- (2026-11-17) TSSB/HAS/UTSA (README): count, shape checks failed; next phase-tolerant shapes, 5th set.
- (2026-11-17) in-time placebos ship beside it (README "In-time placebos": 0-4% false warnings)
- (2026-11-17) control series: step-only rule calibrated in sims, but 11 of 13 annual state tobacco ratios refused as wanders (README "The step alone"): synthetic control (README "A floored ratio"): CA -26.5 packs at 2000, rank 1 of 39 with the floored ratio (default)
- (2026-11-17) synthetic control with covariates: one-start V (README "Matched on covariates") and six-start V (README "Several starts for V") both fail the real bars; Oregon cannot be fitted by any V on income, price and lags 1983/1988/1996 (eval/synth-multi-oregon-diag.out.txt)
- (2026-11-17) (1) slopes: logs fail, 2 hinges ship (refuse short sticky series), given date: --known-date on CLI, page, engine
