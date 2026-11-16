"""The calibration drill's launcher fit on wheels that are not the first-order lag the firmware's drop fit assumes,
with and without the firmware's "unsure" marks (2026-11-16, firmware/esp32/README.md "When the wheel is not a
first-order lag").

Runs drill.calibration.json through the whole Pi path (plan_drill, run_drill, the firmware on tests/feeder_sim.py,
fit_from_drops) on the 18 design builds of tests/spin_drill_sweep.py, for each plant:

  first      the simulator's first-order wheel and exact tach (the baseline)
  hall Nus   each tach edge moved by a normal error of N microseconds
  esc Nms    the ESC's own speed control lags its command by N ms (a second lag)

and fits each drill as the Pi does. Prints the worst and mean size of the speed and spin efficiency errors, how many
wheel readings the firmware marked unsure (LAUNCH flags bits 6 / 7), the fewest and most in one drill, and in how many
drills `fit_from_drops` warned. `--set-aside` also fits with the marked drops left out (the policy tried first and
dropped: it did not help). `--esc-tau-us N` sets the board's `ESC_TAU_US` to N (2026-11-16, README "An ESC lag
picked from the build's own balls").

    PYTHONPATH=src:tests:firmware/esp32 python tests/plant_drill_sweep.py [plant ...] [--esc-tau-us N]

About 20 s a plant. The plants are assumptions, not measurements of a real wheel.
"""

import json
import os
import statistics
import sys

from feeder_sim import SimFeeder
from tennisbots import host, launcher
from spin_drill_sweep import DESIGN

HERE = os.path.dirname(os.path.abspath(__file__))
PLANTS = {"first": {}, "hall 5us": {"tach_jitter_us": 5.0}, "hall 10us": {"tach_jitter_us": 10.0},
          "hall 20us": {"tach_jitter_us": 20.0}, "esc 30ms": {"esc_tau_s": 0.03}, "esc 80ms": {"esc_tau_s": 0.08}}


def drill():
    with open(os.path.join(HERE, "..", "drill.calibration.json")) as f:
        return json.load(f)


def run(plant, se, sp, tau, seed):
    sim = SimFeeder(true_launcher=launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp), wheel_tau_s=tau,
                    seed=seed, **PLANTS[plant])
    if "--esc-tau-us" in sys.argv:
        sim.hw.launch.esc_tau_us = int(sys.argv[sys.argv.index("--esc-tau-us") + 1])
    link = host.FeederLink(sim, sim.clock)
    res = host.run_drill(link, host.plan_drill(drill()), sim.sleep)
    if not res.ok:
        raise RuntimeError(f"drill aborted on {plant} {se}/{sp}/{tau}: {res.aborted}")
    fit = launcher.fit_from_drops(res.launches)
    out = {"err": (fit.speed_efficiency / se - 1, fit.spin_efficiency / sp - 1), "marks": fit.unsure,
           "warned": "marked unsure" in fit.note, "wheels": sum(2 for r in res.launches if r.get("launched"))}
    if "--set-aside" in sys.argv:
        rows_of = launcher._drop_rows
        launcher._drop_rows = lambda *a: [r for r in rows_of(*a) if not r[5]]
        try:
            aside = launcher.fit_from_drops(res.launches)
            out["aside"] = (aside.speed_efficiency / se - 1, aside.spin_efficiency / sp - 1)
        except (ValueError, ZeroDivisionError):  # too few unmarked wheels left to fit
            out["aside"] = None
        finally:
            launcher._drop_rows = rows_of
    return out


def cell(es):
    return (f"{max(abs(e[0]) for e in es):6.1%} {max(abs(e[1]) for e in es):6.1%} / "
            f"{statistics.mean(abs(e[1]) for e in es):4.1%}")


def main():
    names = [a for a in sys.argv[1:] if a in PLANTS] or list(PLANTS)
    print(f"{'plant':10} | speed worst, spin worst / mean | marked (min-max a drill) | warned"
          + (" | set aside: speed, spin / mean" if "--set-aside" in sys.argv else ""))
    for name in names:
        rows = [run(name, se, sp, tau, seed=i) for i, (se, sp, tau) in enumerate(DESIGN)]
        marks = [r["marks"] for r in rows]
        line = (f"{name:10} | {cell([r['err'] for r in rows]):>30} | {sum(marks):3d}/{sum(r['wheels'] for r in rows):<4d}"
                f" ({min(marks)}-{max(marks)}) {'':8} | {sum(r['warned'] for r in rows):2d}/{len(rows)}")
        if "--set-aside" in sys.argv:
            left = [r["aside"] for r in rows if r["aside"] is not None]
            line += f" | {cell(left) if left else 'no fit'}"
            if len(left) < len(rows):
                line += f" ({len(rows) - len(left)} drills with every wheel marked: no fit)"
        print(line)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
