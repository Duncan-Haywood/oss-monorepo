"""Why one surveyed wheel in about 56 fits 10 to 60 times worse than the rest (2026-11-16, firmware/esp32/README.md
"The outlier wheel's cause").

`tests/esc_survey_weight.py` found that, with tach jitter, one launched wheel in a drill could miss the loop-command
fit by 7,650 ppm of its speed at its best ESC lag against 120-830 for the others, and the board now trims such wheels
from the survey's sums. This asks why. For every launched wheel it records where the ball truly fell in the board's
pulse snapshot (the edge count when the simulator's ball took its momentum) and compares that with the revolution the
fit anchors on (`k`, the longest period in the snapshot; the ball's t0 is searched only from the start of k - 1 to the
end of k + 1).

    PYTHONPATH=src:tests:firmware/esp32 python tests/survey_outlier_cause.py [--seeds 7,8,9] [--kinds 5,6] [--all]
        [--back 0]

Prints, per build, each wheel whose best rms is over 5 x the median wheel's (`controller.SURVEY_TRIM`), with the
ball's revolution, the fit's k and the periods around them, then a count over all wheels: how often k missed the
ball's revolution or the one after it, among outliers and among the rest. `--back 0` is the anchor before the walk
back (controller.ANCHOR_BACK), the plain longest period. Physics and plants are the simulator's
assumptions, not measurements.
"""

import math
import statistics
import sys

from feeder_sim import SimFeeder, controller
import esc_survey_sweep as ess
import esc_survey_weight as esw
from tennisbots import host, launcher

GRID = controller.ESC_SURVEY_GRID_US


def wheels(kw, tau_s, se, sp, seed, fit_kw=None):
    """Per launched wheel: (rpm, periods, ball's revolution index in them, [rms^2 per grid lag] or None)."""
    sim = SimFeeder(true_launcher=launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp), wheel_tau_s=tau_s,
                    seed=seed, **kw)
    hw = sim.hw
    lc = hw.launch
    lc.survey = ()
    balls = []
    take = sim._take_momentum

    def taken():
        balls.append((hw.tach_top.core.edges, hw.tach_bottom.core.edges))
        take()
    sim._take_momentum = taken
    got = []
    loop_fit = controller.LaunchCheck._loop_fit

    def watched(self, snap, ticks, edges0, targets, speeds, dips, flags):
        ball = balls[-1] if balls else None
        for k in (0, 1):
            if targets[k] > 0 and ball is not None:
                raw = [(c - edges0[k], us, u) for c, us, u in ticks[k]]
                got.append((speeds[k], list(snap[k]), ball[k] - edges0[k], raw))
        yield from loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags)
    controller.LaunchCheck._loop_fit = watched
    try:
        for d in ("drill.rally.json", "drill.calibration.json"):
            res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(ess.load(d)), sim.sleep)
            if not res.ok:
                raise RuntimeError(res.aborted)
        lc.finish()
    finally:
        controller.LaunchCheck._loop_fit = loop_fit
    out = []
    for rpm, periods, b, raw in got:
        r2 = []
        for g in GRID:
            fit = controller.drop_from_commands(periods, controller.esc_lagged_ticks(periods, raw, g), refine=0,
                                                **(fit_kw or {}))
            if fit is None:
                r2 = None
                break
            r2.append(fit[4] * fit[4])
        out.append((rpm, periods, b, r2))
    return out


def main():
    seeds = [int(x) for x in esw.ess_arg("--seeds", "7,8,9").split(",")]
    kinds = [int(i) for i in esw.ess_arg("--kinds", "").split(",") if i] or \
        [i for i, (_, kw) in enumerate(esw.PLANTS) if kw.get("tach_jitter_us")]
    taus = (0.2, 0.4, 0.8) if "--all" in sys.argv else (0.8,)
    back = float(esw.ess_arg("--back", str(controller.ANCHOR_BACK)))
    trim = controller.SURVEY_TRIM
    tally = {}                                     # (outlier?, anchor class) -> wheels
    for name, kw in [esw.PLANTS[i] for i in kinds]:
        for tau_s in taus:
            for se, sp in ess.TRUE:
                for seed in seeds:
                    ws = [w for w in wheels(kw, tau_s, se, sp, seed, {"back": back}) if w[3] is not None]
                    best = sorted(math.sqrt(min(w[3])) for w in ws)
                    med = best[len(best) // 2]
                    for rpm, periods, b, r2 in ws:
                        rms = math.sqrt(min(r2))
                        out = rms > trim * med
                        k = controller._anchor(periods, back)
                        cls = "k = ball" if k == b else "k = ball + 1" if k == b + 1 else f"k off ({k - b:+d})"
                        cls = cls if k - b in (0, 1) else "k off"
                        tally[(out, cls)] = tally.get((out, cls), 0) + 1
                        if out:
                            lo, hi = max(0, min(b, k) - 3), min(len(periods), max(b, k) + 6)
                            print(f"{name} | lag {tau_s} | {se}/{sp} | seed {seed} | {rpm:5.0f} rpm | best rms "
                                  f"{1e6 * rms:5.0f} ppm ({rms / med:4.1f} x median) | ball rev {b}, k {k} | periods "
                                  f"[{lo}..{hi - 1}] " + " ".join(str(p) for p in periods[lo:hi]), flush=True)
    print("\nwheels by anchor: outlier (best rms over", trim, "x median) / the rest")
    for cls in ("k = ball", "k = ball + 1", "k off"):
        print(f"  {cls:13} {tally.get((True, cls), 0):5d} / {tally.get((False, cls), 0):5d}")


if __name__ == "__main__":
    main()
