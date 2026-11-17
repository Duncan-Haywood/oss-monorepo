"""The ball hold on whole drills (2026-11-17, firmware/esp32/README.md "A ball charged the integrator").

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/ball_hold_drill.py [--plant 0|1|2] [--lags 0.2,0.4,0.8] [--builds 0,1,2] [--raw out.json]

`tests/ball_recovery_sweep.py` measures one ball's recovery. This runs the drills: the slow drill of
`tests/min_fit_rpm_sweep.py` (30 shots, slow wheels at 520-1,500 rpm, half straight after a fast flat shot) and
drill.calibration.json, on each plant, wheel lag and true launcher of that sweep, with `controller.LOOP_BALL_BAND` off
(the loop before) and at its default, the Pi at the shipped `host.HOLD_RPM` and `LOOP_AFTER_REVS`, the board told its
ESC lag (as after its survey). For each it reports the slow drill's time from first to last release, the record drop
over the simulator's true drop per launched wheel, and `fit_from_drops` on both logs at the shipped
`launcher.MIN_FIT_RPM` against the true efficiencies. One process per plant, about 15 minutes. The physics is the
simulator's assumption.
"""

import multiprocessing
import statistics
import sys

import min_fit_rpm_sweep as m
from feeder_sim import controller
from tennisbots import launcher

ON = controller.LOOP_BALL_BAND


def case(args):
    pname, plant, tau, se, sp, band = args
    controller.LOOP_BALL_BAND = band          # read when the board builds its WheelLoops
    m.TOLD = True
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    times = []
    take = m.SimFeeder._take_momentum

    def timed(sim):
        times.append(sim.clock())
        take(sim)
    m.SimFeeder._take_momentum = timed
    try:
        ws, slow_log = m.wheels(true, tau, m.slow_drill(), **plant)
        span = times[-1] - times[0] if times else None
        if ws is None:
            return args, None, slow_log
        _, cal_log = m.wheels(true, tau, m.rs.load("drill.calibration.json"), **plant)
    finally:
        m.SimFeeder._take_momentum = take
    f = launcher.fit_from_drops(cal_log + slow_log)
    ratios = [(rpm, rec / truth) for truth, rec, rpm, _, _ in ws]
    return args, (span, ratios, abs(f.speed_efficiency / se - 1), abs(f.spin_efficiency / sp - 1)), None


def main():
    plants = m.PLANTS
    if "--plant" in sys.argv:
        plants = [m.PLANTS[int(sys.argv[sys.argv.index("--plant") + 1])]]
    lags = (0.2, 0.4, 0.8)
    if "--lags" in sys.argv:
        lags = tuple(float(x) for x in sys.argv[sys.argv.index("--lags") + 1].split(","))
    grid = [(pn, pl, tau, se, sp, band) for pn, pl in plants for tau in lags for se, sp in m.BUILDS for band in (None, ON)]
    if "--builds" in sys.argv:
        keep = [m.BUILDS[int(x)] for x in sys.argv[sys.argv.index("--builds") + 1].split(",")]
        grid = [g for g in grid if (g[3], g[4]) in keep]
    with multiprocessing.Pool(multiprocessing.cpu_count()) as pool:
        out = pool.map(case, grid)
    if "--raw" in sys.argv:             # keep the raw rows (JSON) so a later summary needs no rerun
        import json
        with open(sys.argv[sys.argv.index("--raw") + 1], "w") as f:
            json.dump([(a[0], a[2], a[3], a[4], a[5], r, str(ab) if ab else None) for a, r, ab in out], f)
    print("plant        | ball hold | drills | aborted | slow drill s, mean / worst | record/true: >2% off, range, "
          "500-1,000 rpm >2% | spin error mean / worst | speed error mean / worst")
    for pname, _ in plants:
        for band in (None, ON):
            rows = [(a, r, ab) for a, r, ab in out if a[0] == pname and a[5] == band]
            ok = [r for _, r, _ in rows if r]
            ab = [(a[2], a[3], a[4], x) for a, r, x in rows if not r]
            if not ok:
                print(f"{pname:12} | {band} | all aborted {ab}")
                continue
            span = [r[0] for r in ok]
            rat = [x for r in ok for x in r[1]]
            slow = [q for rpm, q in rat if rpm < 1000]
            print(f"{pname:12} | {'off' if band is None else band:>9} | {len(rows):6d} | {len(ab):7d} | "
                  f"{statistics.fmean(span):6.1f} / {max(span):6.1f} | {sum(abs(q - 1) > 0.02 for _, q in rat):3d} of "
                  f"{len(rat)}, {min(q for _, q in rat):.3f}-{max(q for _, q in rat):.3f}, "
                  f"{sum(abs(q - 1) > 0.02 for q in slow)} of {len(slow)} | "
                  f"{100 * statistics.fmean(r[3] for r in ok):.2f} / {100 * max(r[3] for r in ok):.2f}% | "
                  f"{100 * statistics.fmean(r[2] for r in ok):.2f} / {100 * max(r[2] for r in ok):.2f}%")
            for a in ab:
                print(f"    aborted: lag {a[0]} build {a[1]}/{a[2]}: {a[3]}")
    print("\nPer drill (slow drill seconds, off -> on):")
    by = {}
    for a, r, _ in out:
        by.setdefault((a[0], a[2], a[3], a[4]), {})[a[5]] = r[0] if r else None
    for k, v in by.items():
        print(f"  {k[0]:12} lag {k[1]} build {k[2]}/{k[3]}: {v.get(None)} -> {v.get(ON)}")


if __name__ == "__main__":
    main()
