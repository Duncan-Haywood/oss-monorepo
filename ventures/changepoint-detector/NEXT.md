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
- (2026-11-17) synthetic control with covariates: one-start V (README "Matched on covariates") and six-start V (README "Several starts for V") both fail the real bars (six starts also fail size in N7 and E1); Oregon cannot be fitted by any V on income, price and lags 1983/1988/1996 (eval/synth-multi-oregon-diag.out.txt)
- (2026-11-17) (1) slopes: logs fail, 2 hinges ship (refuse short sticky series), given date: --known-date on CLI, page, engine
- (2026-11-17) multi-start V (README "Several starts for V") failed too: no V fits Oregon
- (2026-11-17) covariates (README "Matched on covariates") failed
- (2026-11-17) MA, AZ, OR ranks 6-13
- (2026-11-17) (2) synthetic control (README "A floored ratio"): CA rank 1 of 39
- (2026-11-17) 3 log n led on all TCPD post hoc (0.754 vs 0.697 on the 34 non-sticky), test it on fresh labelled data
- (2026-11-17) (b) sticky series on a drifting level: four repeat treatments failed the frozen-juice bar
- (2026-11-18) CLI and page ship it 2026-11-17 (README "A synthetic control on the page", Prop 99 example)
- (2026-11-18) placeboWarning (>=80% matched better) holds every false find (README "Which imbalance biases the gap")
- (2026-11-18) covariate balance of the outcome fit (covariateBalance, eval/synth-balance-real.out.txt) 2026-11-17: CA 1.66 sd richer than its synthetic, MA balanced yet 6th
- (2026-11-18) ar1 alone led (0.353): a 6th set, a season and a trend term per column (README "Wide sets in print")
- (2026-11-18) few-donor power 2026-11-18 (README "Few donors: size and power"): one donor shocked as much as a 2 sd step cuts rank 1 from 54-60% to 35-40%, leaving it out beforehand restores it
- (2026-11-18) few donors 2026-11-18 (README "Few donors"): West Germany and Basque gaps replicate, ranks 3 and 4 of 17 (p <= 0.05 unreachable under 19 donors; FEW DONORS note and units-ranked-above ship)
- (2026-11-18) a shocked best match raises gap error 1.3-1.6x, leaving it out 1.36x
- (2026-11-18) next a real deployer's panel
- (2026-11-18) on West Germany 12 of 16 placebos grew (note says so)
- (2026-11-18) gapShape word on listed units (pulse faded 90%, 20% false)
- (2026-11-18) donor slope or pulse 2026-11-18 (README "A donor's own event that is not a step"): pulse 12-14%, slope 29-35%, step 37-40%
- (2026-11-18) anticipation 2026-11-18: --anticipation N ships (power 25-40% to 54-55% backdated), warning holds 4 of 8 when a covariate moves 4 early (README "A shock before the date")
- (2026-11-18) two shocked donors 2026-11-18 (README "Two shocked donors"): 54-56% to 27-28%, both left out 53-56%, one 35%
- (2026-11-19) next a real panel with a known slope event
- (2026-11-19) the note quotes it
- (2026-11-19) slope and pulse shocks 2026-11-18: warning holds 42 of 43 false finds (README "Shocks that are not steps")
- (2026-11-19) two covariates: harmless one's warning 0 of 170 false finds, 1.27x bias (bar failed)
- (2026-11-19) JHU state switches to weekly reporting 20 of 27, returns to more days 0 of 8 (README "A provider's own schedule changes")
- (2026-11-19) lasting moves to more days: cut has the power (8 of 9 cells)
- (2026-11-19) short returns: a half-share guard clears same-count day shifts (1.00 to 0 false, power kept) but JHU 2 of 8 (README "a real drop in repeats")
- (2026-11-19) real misses are 1-2 month sparse spells, and shortSpells ships as an opt-in (README "Short sparse spells": S1-S4, Alaska and South Dakota dated)
- (2026-11-19) NYT rerun: line 3/4 ends, 4/8 unexplained (all 105-372 days; README "The weekday spell score on NYT's state series")
- (2026-11-19) quoted-tick gate unscorable on 12 Binance pairs (all one-tick)
- (2026-11-19) AAPL/AMZN/GOOG 28/33, prints 0/34
- (2026-11-19) quality round 89 (`portfolio/quality/audits/2026-11-19-changepoint-detector-r2.json`, craft 2): `engine.mjs` is 3,004 lines (2,243 at the 11-09 audit); mulberry, lag1 and median are copied across 3 modules and `known-date.mjs` has its own least squares. Split the engine and share the helpers.
- (2026-11-19) same audit: the README (8,400 lines) has no "which option do I need" guide to ~45 flags; add one near the top. (llms.txt's two 10,000-character lines, drift and synthetic control, were cut to summaries 2026-11-20; it is 32 KB, other lines still run 1,500-2,700 characters.)
