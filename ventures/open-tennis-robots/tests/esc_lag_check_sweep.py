"""The ESC-lag check before a calibration drill, through the whole Pi path (2026-11-17, firmware/esp32/README.md
"Checked before a calibration drill").

For each plant, wheel lag and true launcher, and for a board set to ESC_TAU_US 0 (the default) or 50 ms (a guess):
the rally drill runs with `--shot-log`, so its ESC_SURVEY lands in the log; then the calibration drill is started
with that survey as `prior_survey` and `hold_on_esc_lag` on, on a fresh board with the same setting. The sweep
counts the drills the check stops, and runs the calibration drill anyway (check off) to score the launcher fit it
would have given, so the drills held can be compared with the drills let through. Last, every held build is
re-flashed to the survey's pick and the check re-run.

    PYTHONPATH=src:tests:firmware/esp32 python tests/esc_lag_check_sweep.py [--quick]

Physics and plants are the simulator's assumptions (tests/feeder_sim.py), not measurements.
"""

import os
import sys
import tempfile

from esc_survey_sweep import PLANTS, TRUE, drill, fit_err, load, sim_for
from tennisbots import host

BOARD_MS = (0, 50)


def calibration(sim, prior):
    return host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(load("drill.calibration.json")), sim.sleep,
                          prior_survey=prior, hold_on_esc_lag=True)


def main():
    taus = (0.4,) if "--quick" in sys.argv else (0.2, 0.4, 0.8)
    rows = []
    print("plant | wheel lag s | true se/sp | board ms | survey wheels, pick ms | held | spin error if run "
          "| after re-flash to the pick: held, spin error")
    with tempfile.TemporaryDirectory() as tmp:
        for name, kw in PLANTS:
            for tau_s in taus:
                for se, sp in TRUE:
                    for board in BOARD_MS:
                        log = os.path.join(tmp, f"{len(rows)}.jsonl")
                        res = drill(sim_for(kw, tau_s, se, sp, board * 1000), "drill.rally.json")
                        host.append_shot_log(log, res, "drill.rally.json")
                        prior = host.last_survey_from_log(log)
                        held = calibration(sim_for(kw, tau_s, se, sp, board * 1000), prior)
                        assert held.held or held.ok, held.aborted
                        if held.held:
                            assert not held.fed, "a held drill fed a ball"
                        err = fit_err(drill(sim_for(kw, tau_s, se, sp, board * 1000), "drill.calibration.json"),
                                      se, sp)[1]
                        pick = prior["refined_ms"]
                        again = ""
                        if held.held:
                            re = calibration(sim_for(kw, tau_s, se, sp, pick * 1000), prior)
                            e2 = fit_err(re, se, sp)[1] if re.ok else None
                            again = f"{re.held}, {e2:+.1%}" if e2 is not None else f"{re.held}, -"
                            rows.append((name, board, True, abs(err), re.held, None if e2 is None else abs(e2)))
                        else:
                            rows.append((name, board, False, abs(err), None, None))
                        print(f"{name} | {tau_s} | {se}/{sp} | {board} | {prior['wheels']}, {pick} | {held.held} | "
                              f"{err:+.1%} | {again}")
                        sys.stdout.flush()
    print()
    print("plant | board ms | held | spin error if run anyway, held: worst / mean | let through: worst / mean "
          "| held again after re-flash | spin error after re-flash: worst / mean")

    def wm(v):
        return f"{max(v):.1%} / {sum(v) / len(v):.1%}" if v else "-"

    for name, _ in PLANTS:
        for board in BOARD_MS:
            rs = [r for r in rows if r[0] == name and r[1] == board]
            h = [r for r in rs if r[2]]
            print(f"{name} | {board} | {len(h)} of {len(rs)} | {wm([r[3] for r in h])} | "
                  f"{wm([r[3] for r in rs if not r[2]])} | {sum(1 for r in h if r[4])} | "
                  f"{wm([r[5] for r in h if r[5] is not None])}")


if __name__ == "__main__":
    main()
