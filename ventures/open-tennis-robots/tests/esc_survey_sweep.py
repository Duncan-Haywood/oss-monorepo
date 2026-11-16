"""The board's own ESC-lag survey through the whole Pi path (2026-11-16, firmware/esp32/README.md "The ESC lag
surveyed on the board").

tests/esc_lag_pick.py picked a build's ESC lag offline, from snapshots the board does not send. Here the board does
it: after each launched stroke's record, `LaunchCheck` refits each turning wheel at the six lags of
`controller.ESC_SURVEY_GRID_US`, one step a control tick, sums the squared residuals per lag and sends them in the
ESC_SURVEY frame; `host.run_drill` keeps the last frame and `host.esc_survey_advice` turns it into one line. For each
plant and build the rally and the calibration drill run on one simulated board (so the survey sums both), then the
calibration drill runs again on a fresh board set to the surveyed lag, and the launcher fit's errors are compared with
ESC_TAU_US 0.

    PYTHONPATH=src:tests:firmware/esp32 python tests/esc_survey_sweep.py [--all]

One wheel lag (0.4 s) per plant and both true launchers of tests/esc_lag_pick.py (--all: wheel lags 0.2 / 0.4 /
0.8 s). Physics and plants are the simulator's assumptions, not measurements.
"""

import json
import os
import sys

from feeder_sim import SimFeeder
from tennisbots import host, launcher

HERE = os.path.dirname(os.path.abspath(__file__))
TRUE = ((0.70, 0.35), (0.95, 0.65))
PLANTS = [("first-order", {}), ("ESC lag 30 ms", {"esc_tau_s": 0.03}), ("ESC lag 60 ms", {"esc_tau_s": 0.06}),
          ("ESC lag 80 ms", {"esc_tau_s": 0.08}), ("ESC lag 150 ms", {"esc_tau_s": 0.15}),
          ("ESC lag 100 ms, jitter 3 us", {"esc_tau_s": 0.10, "tach_jitter_us": 3.0})]


def load(name):
    with open(os.path.join(HERE, "..", name)) as f:
        return json.load(f)


def sim_for(kw, tau_s, se, sp, esc_tau_us=0):
    sim = SimFeeder(true_launcher=launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp), wheel_tau_s=tau_s,
                    seed=7, **kw)
    sim.hw.launch.esc_tau_us = esc_tau_us
    return sim


def drill(sim, name):
    res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(load(name)), sim.sleep)
    if not res.ok:
        raise RuntimeError(f"{name} aborted: {res.aborted}")
    return res


def fit_err(res, se, sp):
    fit = launcher.fit_from_drops(res.launches)
    return fit.speed_efficiency / se - 1, fit.spin_efficiency / sp - 1


def main():
    taus = (0.2, 0.4, 0.8) if "--all" in sys.argv else (0.4,)
    print("plant | wheel lag s | true se/sp | wheels surveyed, cut | least / refined ms | calibration fit error, "
          "ESC_TAU_US 0: speed spin | with the refined lag: speed spin | advice")
    for name, kw in PLANTS:
        for tau_s in taus:
            for se, sp in TRUE:
                sim = sim_for(kw, tau_s, se, sp)
                drill(sim, "drill.rally.json")
                res = drill(sim, "drill.calibration.json")
                sv, cut = res.esc_survey, sim.hw.launch.survey_cut
                base = fit_err(drill(sim_for(kw, tau_s, se, sp), "drill.calibration.json"), se, sp)
                ms = sv["refined_ms"] if sv else 0
                after = base if ms == 0 else fit_err(drill(sim_for(kw, tau_s, se, sp, ms * 1000),
                                                           "drill.calibration.json"), se, sp)
                print(f"{name} | {tau_s} | {se}/{sp} | {sv and sv['wheels']}, {cut} | "
                      f"{sv and sv['least_ms']} / {ms} | {base[0]:+.1%} {base[1]:+.1%} | {after[0]:+.1%} {after[1]:+.1%}"
                      f" | {host.esc_survey_advice(sv)}")
                sys.stdout.flush()


if __name__ == "__main__":
    main()
