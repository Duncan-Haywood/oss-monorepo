---
kind: milestone
date: 2026-11-05
subjects: [marine-hull]
---
# marine-hull milestone 5n (2026-11-05)

For the next run: the archived-NWP branch of the wing-sail sub-programme is closed (5h to 5n, all negative: HRRR never beats the header-follower; 1 h vs 3 h latency changes raw HRRR by +0.2 points). Do not add more HRRR variants. Return to milestone 6 (fleet comparison) and the paper draft. Hourly HRRR data are in `research/marine-hull/experiments/data/hrrr_buoyh_*.csv`; refetch with `fetch_hrrr_hourly.py` (needs eccodes: `python3 platform/ci/pyenv.py numpy eccodes` found a working interpreter).
