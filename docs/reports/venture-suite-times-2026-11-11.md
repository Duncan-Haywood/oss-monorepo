# Venture test-suite times, 2026-11-11

For perf runs choosing a target (perf doc friction 2026-11-11: "no per-venture
suite timing table exists"). Regenerate with
`python3 platform/ci/run_venture_tests.py --slowest 30` (about 15 minutes on a
4-core cloud container; run it with `run_in_background`).

**Reading.** `run_venture_tests.py` over every venture on main at bcf6070b,
4 workers, Node v22.23.4, cloud container with 4 cores. The first
~6 minutes overlapped a `main_health.py` run (load average ~34), so the slowest
suites' numbers are inflated by contention; treat them as an upper bound and
re-time a suite alone before quoting a speed-up.

- 1,335 suites ran, 0 failed (exit 0). Wall time about 15 minutes.
- Summed suite time 3,716 s. Median suite 0.5 s, 90th percentile 1.2 s;
  1,285 suites finish under 2 s.
- The 4 slowest suites are 56% of all suite time (2,080 s), the top 6 are 67%,
  the top 50 are 80%. Speeding anything outside the top ~12 does not move the
  full run.
- With 4 workers the full run cannot finish faster than its slowest suite
  (changepoint-detector, ~600 s here). `suite_weight` (bytes of test code)
  already starts all four of the slowest suites within the first ten.

## The 30 slowest

| venture | seconds |
|---|---:|
| changepoint-detector | 600.7 |
| shed-designer | 576.6 |
| league-schedule-generator | 515.5 |
| shift-roster-builder | 387.0 |
| wall-framing-takeoff | 211.2 |
| ai-bookkeeper | 194.7 |
| chant-forge | 79.9 |
| open-house-plans | 54.0 |
| ad-spend-saturation-optimizer | 35.1 |
| clothing-design-studio | 34.6 |
| einvoice-preflight | 34.5 |
| babysitting-business-kit | 24.5 |
| sales-agent | 17.4 |
| tile-layout-planner | 14.7 |
| saas-feature-packaging-optimizer | 13.5 |
| tile-layout-optimizer | 10.0 |
| support-agent | 9.6 |
| container-load-planner | 9.5 |
| youth-lineup-rotator | 9.4 |
| workflow-audit | 9.1 |
| s3-storage-class-savings | 8.9 |
| garmin-world-traveler-watchface | 8.6 |
| tournament-pairing-manager | 7.3 |
| ebay-fee-calculator | 6.8 |
| conformal-prediction-intervals | 6.6 |
| shopify-fee-calculator | 6.4 |
| tutoring-group-schedule-optimizer | 5.4 |
| event-seating-chart-optimizer | 5.2 |
| stranded-branch-finder | 5.0 |
| ai-engineering-academy | 4.9 |

Raw per-venture lines were not committed (1,335 lines; regenerate as above).
