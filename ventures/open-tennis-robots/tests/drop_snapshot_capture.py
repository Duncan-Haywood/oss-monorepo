"""Capture each launched wheel's period snapshot with the simulator's true drop (2026-11-16, firmware/esp32/README.md
"A recovery shaped like the loop").

Runs drill.rally.json and drill.calibration.json on tests/feeder_sim.py builds and writes one JSON line per launched
wheel: the build (true wheel lag, true free speed, launcher), the snapshot `LaunchCheck` fitted, its tick log (edges
into the snapshot, us since that edge, the ESC command), the true fractional drop at the instant the ball took its
momentum, and the wheel's speed then. Models of the recovery are compared on
these lines offline (tests/recovery_model_sweep.py) before one goes into the firmware.

    PYTHONPATH=src:tests:firmware/esp32 python tests/drop_snapshot_capture.py OUT.jsonl [--held-out]

Physics is the simulator's assumption (first-order wheels, an exact tach), not a measurement.
"""

import json
import sys

from feeder_sim import SimFeeder, controller
import refit_sweep as rs
from tennisbots import host, launcher

DESIGN = [(tau, mx, se, sp) for tau in (0.2, 0.4, 0.8) for mx in (9000.0,) for se, sp in ((0.70, 0.35), (0.95, 0.65))]
# held out: lags and free speeds the design set never had (the firmware is still told 9,000 rpm)
HELD_OUT = [(0.3, 7500.0, 0.80, 0.45), (0.6, 10500.0, 0.85, 0.55), (0.25, 11000.0, 0.75, 0.40),
            (1.0, 8000.0, 0.90, 0.60)]


def capture(tau_s, max_rpm, speed_eff, spin_eff, drill):
    true = launcher.WheelLauncher(speed_efficiency=speed_eff, spin_efficiency=spin_eff)
    sim = SimFeeder(balls=None, wheel_tau_s=tau_s, wheel_max_rpm=max_rpm, true_launcher=true)
    balls, verdicts = [], []
    take = sim._take_momentum

    def taken():
        before = tuple(sim.wheel)
        take()
        balls.append((before, tuple(sim.wheel)))
    sim._take_momentum = taken
    update = controller.LaunchCheck.update

    def watched(self, *a, **k):
        went = update(self, *a, **k)
        if went is not None:
            snaps = [list(s) for s in (self.last_snap or [[], []])]
            e0 = self.edges0 or (0, 0)
            ticks = [[(c - e0[i], us, u) for c, us, u in (self.last_ticks or [[], []])[i]] for i in (0, 1)]
            verdicts.append((went, self.last_fit, snaps, ticks))
        return went
    controller.LaunchCheck.update = watched
    try:
        rs._run(sim, host.plan_drill(rs.load(drill)))
    finally:
        controller.LaunchCheck.update = update
    out = []
    for (before, after), (_, fits, snaps, tk) in zip(balls, [v for v in verdicts if v[0]]):
        for k in (0, 1):
            out.append({"tau_s": tau_s, "max_rpm": max_rpm, "speed_eff": speed_eff, "spin_eff": spin_eff,
                        "drill": drill, "wheel": k, "rpm": before[k], "drop": 1 - after[k] / before[k],
                        "fit": fits[k][0] if fits[k] else None, "periods": snaps[k], "ticks": tk[k]})
    return out


def main():
    path = sys.argv[1]
    builds = HELD_OUT if "--held-out" in sys.argv else DESIGN
    with open(path, "w") as f:
        for b in builds:
            for drill in ("drill.rally.json", "drill.calibration.json"):
                for row in capture(*b, drill):
                    f.write(json.dumps(row) + "\n")


if __name__ == "__main__":
    main()
