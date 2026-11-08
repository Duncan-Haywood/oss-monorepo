---
kind: milestone
date: 2026-11-05
subjects: [marine-hull]
---
# marine-hull milestone 6m: handover

- Done: `run_saildrone_fit.py` fits `sail.Drone(sail_area, hull_scale)` to 2018 Saildrone cell-mean SOG, tests on 2019 (`results_saildrone_fit.txt`); `run_wind_vs_sun_fitted.py` and `run_wind_vs_sun_corridor_fitted.py` rerun 6h/6i with `sail_area=0.45`.
- Headline: fitted drone is 0.89x observed on 2019 days (default 2.39x); corridor median vs the 86 km/day solar ceiling is 1.16x (Jan) and 0.72x (Jul).
- Trap: area and hull_scale lie on a valley (best 0.030 at (0.5, 1); (1, 2), (1.5, 3), (2, 4) within 0.01), so quote the fit as an effective area. The fit is slow (about 8 min, stdlib speed solver): run it with `run_in_background`.
- Gotcha: the sandbox `sleep` is blocked; wait with an until-loop.
- Open: capability-bound fit (top-decile SOG per cell) instead of mission means; tack penalty (6j) not rerun; paper `DRAFT.md` not yet updated for 6l or 6m.
