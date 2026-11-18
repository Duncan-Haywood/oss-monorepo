"""Refitter's speed tolerance on builds the planner has nearly right (2026-11-16, firmware/esp32/README.md "Slow wheels
and one ball mass").

`host.Refitter` changes the planned speed efficiency only when a fit moves it more than `speed_tol`. With the drop
fit's speed error at 0.6% (tests/launch_fit_sweep.py), 5% left builds 2-4% off uncorrected. This runs
tests/refit_sweep.py's case on four builds near the planner's 0.85 (0.82, 0.85, 0.87, 0.88) at 5% and 2%, and prints
the median and worst landing error over shots 5 to 16, fixed plan and re-planned.

    PYTHONPATH=src:tests:firmware/esp32 python tests/refit_tol_sweep.py

About four minutes. Physics is the simulator's assumption, not a measurement.
"""

import refit_sweep as rs
from tennisbots import host


def main():
    orig = host.Refitter.__init__
    try:
        for tol in (0.05, 0.02):
            def init(self, *a, _tol=tol, **k):
                k["speed_tol"] = _tol
                orig(self, *a, **k)
            host.Refitter.__init__ = init
            for se, sp, tau in ((0.88, 0.50, 0.2), (0.82, 0.50, 0.8), (0.85, 0.50, 0.2), (0.87, 0.50, 0.8)):
                out, _ = rs.run_case(se, sp, tau)
                r = rs.summary(out["refit"][0], rs.REFIT_AFTER)
                f = rs.summary(out["fixed"][0], rs.REFIT_AFTER)
                print(f"tol {tol:.0%} true {se} {sp} {tau} fixed {f[0]:.2f}/{f[1]:.2f} refit {r[0]:.2f}/{r[1]:.2f}",
                      flush=True)
    finally:
        host.Refitter.__init__ = orig


if __name__ == "__main__":
    main()
