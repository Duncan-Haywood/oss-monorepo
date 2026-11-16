"""Each wheel's drop as the record carries it vs the simulator's true drop (2026-11-16, firmware/esp32/README.md "The
drop from the pulse times").

Runs drill.rally.json and drill.calibration.json on tests/feeder_sim.py builds (wheel lag 0.2 / 0.4 / 0.8 s, true
launcher 0.70 / 0.35 and 0.95 / 0.65), takes each launched wheel's true fractional drop at the instant the ball took
its momentum, and compares `controller.drop_from_commands` (the record's drop when its loop bit is set; 2026-11-16
later, README "A recovery shaped by the loop's own commands"), `controller.drop_from_periods` (the parabola, the
record's drop before that) and the lowest single-revolution reading's fall (what the record carried first) with it, grouped by the wheel's speed in thousands
of rpm.

    PYTHONPATH=src:tests:firmware/esp32 python tests/pulse_drop_sweep.py

About a minute. Physics is the simulator's assumption (first-order wheels, an exact tach), not a measurement.
"""

import collections
import statistics

from feeder_sim import SimFeeder, controller      # feeder_sim puts the firmware's modules on the path first
import refit_sweep as rs
from tennisbots import host, launcher


def wheels(speed_eff, spin_eff, tau_s, drill):
    """(true drop, pulse-time fit or None, lowest-reading drop, speed rpm, loop-command fit or None) per launched
    wheel."""
    true = launcher.WheelLauncher(speed_efficiency=speed_eff, spin_efficiency=spin_eff)
    sim = SimFeeder(balls=None, wheel_tau_s=tau_s, true_launcher=true)
    balls, verdicts, loops = [], [], []
    take = sim._take_momentum

    def taken():
        before = tuple(sim.wheel)
        take()
        balls.append((before, tuple(sim.wheel)))
    sim._take_momentum = taken
    update = controller.LaunchCheck.update
    loop_fit = controller.LaunchCheck._loop_fit

    def watched(self, *a, **k):
        went = update(self, *a, **k)
        if went is not None:
            verdicts.append((went, self.last_fit, self.last_low))
        return went

    def watched_loop(self, *a, **k):
        yield from loop_fit(self, *a, **k)
        loops.append(self.last_loop)
    controller.LaunchCheck.update = watched
    controller.LaunchCheck._loop_fit = watched_loop
    try:
        rs._run(sim, host.plan_drill(rs.load(drill)))
        sim.hw.launch.finish()
    finally:
        controller.LaunchCheck.update = update
        controller.LaunchCheck._loop_fit = loop_fit
    went = [v for v in verdicts if v[0]]
    assert len(loops) == len(went), (len(loops), len(went))
    out = []
    for (before, after), (_, fits, low), lp in zip(balls, went, loops):
        for k in (0, 1):
            out.append((1 - after[k] / before[k], fits[k], low[k], before[k], lp[k]))
    return out


def _stats(f):
    return (f"{len(f):4d} {statistics.fmean(f):.4f} {statistics.pstdev(f):.4f} {min(f):.3f} {max(f):.3f}"
            if f else "   0")


def main():
    fit_r, low_r, loop_r = (collections.defaultdict(list) for _ in range(3))
    for tau_s in (0.2, 0.4, 0.8):
        for se, sp in ((0.70, 0.35), (0.95, 0.65)):
            for drill in ("drill.rally.json", "drill.calibration.json"):
                for truth, fit, low, rpm, lp in wheels(se, sp, tau_s, drill):
                    band = int(rpm // 1000)
                    low_r[band].append(low / truth)
                    if fit is not None:
                        fit_r[band].append(fit[0] / truth)
                    if lp is not None:
                        loop_r[band].append(lp[0] / truth)
    print("krpm | wheels | lowest reading: mean min max | parabola fit: wheels mean sd min max | "
          "loop-command fit: wheels mean sd min max")
    for band in sorted(low_r):
        lo = low_r[band]
        print(f"{band:4d} | {len(lo):6d} | {statistics.fmean(lo):.3f} {min(lo):.3f} {max(lo):.3f} | "
              f"{_stats(fit_r[band])} | {_stats(loop_r[band])}")
    alll = [x for v in low_r.values() for x in v]
    print(f"all  | {len(alll):6d} | {statistics.fmean(alll):.3f} {min(alll):.3f} {max(alll):.3f} | "
          f"{_stats([x for v in fit_r.values() for x in v])} | {_stats([x for v in loop_r.values() for x in v])}")


if __name__ == "__main__":
    main()
