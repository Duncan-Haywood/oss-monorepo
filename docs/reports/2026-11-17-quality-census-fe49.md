# Quality census 2026-11-17, seed 2026-11-17-fe49

Six first audits (census mode), all in `portfolio/quality/audits/2026-11-17-*.json`:
research/free-sprtminimax, ventures/persona-conversation-simulator,
research/ambient-dshard, ventures/container-load-planner, ventures/link-keeper,
ventures/rev-rec. 0 of 6 at the bar, 6 of 6 finished; 20 of 37 seeded bugs caught.

Fixed in this PR (each with a test that fails on the old code where code changed):
rev-rec credit-note reversal and blank CSV amounts; link-keeper comma split and
salt wording; persona airtime note, seed ids and extraversion claim;
container-load-planner FAQ 10 -> 9; free-sprtminimax citations, claim and
convergence test; ambient-dshard identifiability wording and 0.872.

Open, for the next fix session (`python3 platform/ci/quality_audit.py queue`):
- rev-rec incremental sync misses invoices paid >3 days after creation (high,
  server.mjs:26); day count +1 for timed periods; zero-decimal currencies.
- link-keeper iPad classed as macOS; "+" preview hides device targets.
- container-load-planner: no weight balancing, no door-height check.
- free-sprtminimax: cutting-plane and PRUNE mutants still survive; no coded
  SPRT/2-SPRT baseline.
- ambient-dshard: no test touches the utility/policy layer (argmax->argmin survives).
