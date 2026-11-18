"""Re-planning a drill from its own shots, on the simulated feeder (2026-11-16, firmware/esp32/README.md
"Re-planning a drill from its own shots").

The planner aims every shot with a launcher model (speed and spin efficiency). If the build's true efficiencies
differ, every shot lands short or long. The shot log's wheel speed drops measure them for free (`fit_from_drops`), and
`host.Refitter` feeds that back mid-drill: after N shots it fits this run's drops and re-plans the remaining shots'
wheel speeds. This sweep runs drill.rally.json (16 groundstrokes, 18 to 25 m/s, mostly topspin) on tests/feeder_sim.py
builds whose true launcher differs from the planner's default (0.85 / 0.50), each build first running
drill.calibration.json once to give the tach's recovery time (a property of the speed loop, so a log's figure holds),
and reports how far each shot truly landed from its target (the simulator's exit speed and spin, flown with the aim the
runner sent) with and without the re-plan.

    PYTHONPATH=src:tests:firmware/esp32 python tests/refit_sweep.py

About three minutes. Physics is the simulator's assumption (first-order wheels, momentum leaving in one instant), not a
measurement.
"""

import json
import math
import os
import statistics
import sys

from feeder_sim import SimFeeder
from tennisbots import ballistics as bl
from tennisbots import host, launcher

HERE = os.path.dirname(os.path.abspath(__file__))
REFIT_AFTER = 4


def load(name):
    with open(os.path.join(HERE, "..", name)) as f:
        return json.load(f)


def landings(sim, res, origin):
    """Where each fed ball truly landed: the simulator's exit speed and spin, flown with the aim it was fed with."""
    out = []
    for p, (v, spin) in zip(res.fed, sim.exits):
        f = launcher._fly(origin, v, math.radians(p.elevation_cdeg / 100), math.radians(p.azimuth_cdeg / 100), spin,
                          p.sidespin_rpm * bl.RPM, bl.DEFAULT_BALL)
        b = f.first_bounce
        out.append(None if f.hit_net or b is None else math.dist((b.pos[0], b.pos[1]), p.landing))
    return out


def run_case(speed_eff, spin_eff, tau_s, refit_after=REFIT_AFTER):
    true = launcher.WheelLauncher(speed_efficiency=speed_eff, spin_efficiency=spin_eff)
    spec = load("drill.rally.json")
    m = spec["machine"]
    origin = launcher.default_origin(m["y"], m["height"])
    out = {}
    cal = SimFeeder(balls=None, wheel_tau_s=tau_s, true_launcher=true)
    res, _ = _run(cal, host.plan_drill(load("drill.calibration.json")))
    assert res.ok, res.aborted
    recovery = launcher.fit_from_drops(res.launches).recovery_s
    for mode in ("fixed", "refit"):
        sim = SimFeeder(balls=None, wheel_tau_s=tau_s, true_launcher=true)
        refit = host.Refitter(spec, after=refit_after, recovery_s=recovery) if mode == "refit" else None
        res, _ = _run(sim, host.plan_drill(spec), replan=refit)
        assert res.ok, res.aborted
        out[mode] = (landings(sim, res, origin), refit)
    return out, recovery


def _run(sim, shots, **kw):
    link = host.FeederLink(sim, sim.clock)
    return host.run_drill(link, shots, sim.sleep, **kw), link


def summary(errs, start):
    """Median and worst landing error over shots `start` onward; a ball into the net counts as infinite."""
    xs = [math.inf if e is None else e for e in errs[start:]]
    return statistics.median(xs), max(xs)


def main():
    print("true_se true_sp tau_s rec_s | fixed med/worst (m) | refit med/worst (m) | fitted se, sp at first refit")
    rows = []
    for tau_s in (0.2, 0.8):
        for speed_eff in (0.70, 0.85, 0.95):
            for spin_eff in (0.35, 0.65):
                out, rec = run_case(speed_eff, spin_eff, tau_s)
                start = REFIT_AFTER            # the first re-planned shot (0-based)
                f_med, f_max = summary(out["fixed"][0], start)
                r_med, r_max = summary(out["refit"][0], start)
                ev = next((e for e in out["refit"][1].events if e["used"]), None)
                fit = f"{ev['fit']['speed_efficiency']:.3f}, {ev['fit']['spin_efficiency']:.3f}" if ev else "not used"
                rows.append((f_med, f_max, r_med, r_max))
                rec_s = "none" if rec is None else f"{rec:.2f}"
                print(f"{speed_eff:7.2f} {spin_eff:7.2f} {tau_s:5.1f} {rec_s:>5} | {f_med:6.2f} {f_max:6.2f}       "
                      f"| {r_med:6.2f} {r_max:6.2f}       | {fit}")
                sys.stdout.flush()
    print(f"worst over builds, shots {REFIT_AFTER + 1}..16: fixed {max(r[1] for r in rows):.2f} m, "
          f"re-planned {max(r[3] for r in rows):.2f} m")


if __name__ == "__main__":
    main()
