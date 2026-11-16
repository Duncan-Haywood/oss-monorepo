"""Why the drop fit's spin efficiency was up to 8% off, and the calibration drill that fixes it (2026-11-16,
firmware/esp32/README.md "Spin from fast wheels").

The drops read the spin efficiency from the *difference* between the two wheels' drops on a spin shot, and that
difference is a small part of each drop. So one wheel's reading error moves the spin fit several times as much as it
moves the speed fit. The old calibration drill put its spin on wheels at 1,000 to 1,700 rpm, the slowest wheels in the
drill, whose pulse-time drops are the least accurate (fewest revolutions before the verdict; tests/pulse_drop_sweep.py:
sd 1.7% under 2,000 rpm, 0.5-1.0% above 4,000). One such wheel set most of each bad fit.

This sweep runs both drills through the whole Pi path (plan_drill, run_drill, the firmware on tests/feeder_sim.py,
fit_from_drops) on the 18 builds of tests/launch_fit_sweep.py, then on 12 held-out builds the drill was not designed
on (other true launchers, other wheel lags), and with `--random` on 40 more. It prints each fit's spin and speed efficiency error.

    PYTHONPATH=src python tests/spin_drill_sweep.py [--random]

About four minutes; `--random` adds 40 builds drawn at random (about six more). Physics is the simulator's, not a measurement.
"""

import json
import os
import random
import statistics
import sys

from feeder_sim import SimFeeder
from tennisbots import host, launcher

HERE = os.path.dirname(os.path.abspath(__file__))

# The calibration drill before 2026-11-16 ("Spin from fast wheels"): its spin shots planned the slow wheel at 1,062 to
# 1,961 rpm. Kept here so the comparison can be rerun.
OLD_DRILL = {"machine": {"y": 0.0, "height": 1.0}, "interval": 4.0, "shots": [
    {"x": 6.0, "y": 0.0, "speed": 16, "topspin": 0}, {"x": 8.0, "y": -2.0, "speed": 20, "topspin": 0},
    {"x": 10.0, "y": 2.0, "speed": 25, "topspin": 0}, {"x": 10.5, "y": 0.0, "speed": 30, "topspin": 0},
    {"x": 9.5, "y": -2.5, "speed": 22, "topspin": 2500}, {"x": 6.5, "y": 2.5, "speed": 17, "topspin": -1200},
    {"x": 9.0, "y": 0.0, "speed": 20, "topspin": 1500}, {"x": 7.5, "y": -1.5, "speed": 19, "topspin": -1000},
    {"x": 10.5, "y": 3.0, "speed": 28, "topspin": 2500}, {"x": 8.0, "y": 1.0, "speed": 19, "topspin": 1500},
    {"x": 6.5, "y": -1.0, "speed": 18, "topspin": -800}, {"x": 10.5, "y": -3.0, "speed": 26, "topspin": 0}]}

DESIGN = [(se, sp, tau) for tau in (0.2, 0.4, 0.8) for se in (0.70, 0.85, 0.95) for sp in (0.35, 0.65)]
HELD_OUT = [(se, sp, tau) for tau in (0.3, 0.6) for se in (0.75, 0.90) for sp in (0.25, 0.45, 0.55)]


def random_builds(n=40, seed=20261116):
    """`--random`: n builds drawn uniformly, speed efficiency 0.70-0.95, spin 0.25-0.65, wheel lag 0.2-0.8 s."""
    rng = random.Random(seed)
    return [(round(rng.uniform(0.7, 0.95), 3), round(rng.uniform(0.25, 0.65), 3), round(rng.uniform(0.2, 0.8), 2))
            for _ in range(n)]


def load_new():
    with open(os.path.join(HERE, "..", "drill.calibration.json")) as f:
        return json.load(f)


def slowest_spin_wheel(spec):
    """The slowest wheel on any spin shot of a drill, as planned with the default launcher (rpm)."""
    return min(min(s.rpm_top, s.rpm_bottom) for s in host.plan_drill(spec) if s.rpm_top != s.rpm_bottom)


def fit_one(spec, se, sp, tau):
    sim = SimFeeder(true_launcher=launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp), wheel_tau_s=tau)
    link = host.FeederLink(sim, sim.clock)
    res = host.run_drill(link, host.plan_drill(spec), sim.sleep)
    if not res.ok:
        raise RuntimeError(f"drill aborted on build {se}/{sp}/{tau}: {res.aborted}")
    fit = launcher.fit_from_drops(res.launches)
    return fit.speed_efficiency / se - 1, fit.spin_efficiency / sp - 1


def main():
    drills = {"old": OLD_DRILL, "new": load_new()}
    for name, spec in drills.items():
        print(f"{name} drill: slowest wheel on a spin shot {slowest_spin_wheel(spec)} rpm")
    sets = [("design builds (tests/launch_fit_sweep.py)", DESIGN), ("held-out builds", HELD_OUT)]
    if "--random" in sys.argv:
        sets.append(("40 random builds (--random)", random_builds()))
    for label, builds in sets:
        print(f"\n{label}\ntrue_se true_sp tau_s | old: speed  spin   | new: speed  spin")
        worst = {n: [0.0, 0.0] for n in drills}
        spins = {n: [] for n in drills}
        for se, sp, tau in builds:
            cells = []
            for name, spec in drills.items():
                e_se, e_sp = fit_one(spec, se, sp, tau)
                worst[name][0] = max(worst[name][0], abs(e_se))
                worst[name][1] = max(worst[name][1], abs(e_sp))
                spins[name].append(e_sp)
                cells.append(f"{e_se:+6.1%} {e_sp:+6.1%}")
            print(f"{se:7.2f} {sp:7.2f} {tau:5.1f} | {cells[0]}      | {cells[1]}")
            sys.stdout.flush()
        for name in drills:
            mag = sorted(abs(e) for e in spins[name])
            print(f"{name} drill: speed efficiency worst {worst[name][0]:.1%}; spin efficiency worst {worst[name][1]:.1%}, "
                  f"mean {statistics.mean(spins[name]):+.1%}, mean size {statistics.mean(mag):.1%}")


if __name__ == "__main__":
    main()
