"""Retest of `launcher.MIN_FIT_RPM` now that the record's drop comes from the loop-command fit (2026-11-16,
firmware/esp32/README.md "The 1,000 rpm floor retested").

The floor was set when the record's drop came from the pulse-time parabola: a 523 rpm wheel got three revolutions
before the verdict and showed 70-78% of its drop. The loop-command fit (README "A recovery shaped by the loop's own
commands") models the recovery instead of reading it off a few revolutions, so the floor may no longer be needed, or
may sit elsewhere. No drill in the sweeps that validated the loop fit put a wheel under 1,000 rpm, so here a drill
does: heavy topspin and backspin shots whose slow wheel is planned at 520-1,500 rpm (the planner's floor is 500),
half of them straight after a fast flat shot, so the slow wheel is still braking down when the ball comes.

Part 1, per wheel: each launched wheel's record drop (loop-command fit, else the parabola's) over the simulator's true
drop, grouped by the wheel's speed and by which fit made it, on three plants (the first-order model, 5 us tach jitter,
a 30 ms ESC lag), three wheel lags and three true launchers.

Part 2, per drill: `fit_from_drops` on the calibration drill's log plus the slow drill's, with the floor at 0 to 1,000
rpm (and, "loop only", counting a wheel under 1,000 rpm only when the loop-command fit made its drop), against the
build's true efficiencies.

The run found the cause of the slow wheels' misses: the Pi sent the next shot's wheel speeds straight after each
release, which freezes the board's snapshot, so a slow wheel had one or two revolutions after its ball and the loop
fit gave up. `host.HOLD_RPM` (added with this sweep) makes the Pi wait for the verdict after a shot with a wheel under
it; every build runs with it at 0 (before) and 1,000.

    PYTHONPATH=src:tests:firmware/esp32 python tests/min_fit_rpm_sweep.py [--quick] [--plant 0|1|2] [--hold RPM] [--lags 0.2,0.4]

About 15 minutes a plant (--plant runs one; --quick: one lag, the first-order plant only). Each build runs twice:
with `host.HOLD_RPM` at 0 (the Pi before this change) and at 1,000. Physics is the simulator's assumption, not a
measurement of a real wheel.
"""

import collections
import statistics
import sys

from feeder_sim import SimFeeder, controller      # feeder_sim puts the firmware's modules on the path first
import refit_sweep as rs
from tennisbots import host, launcher

FAST = {"x": 10.5, "y": 0.0, "speed": 26, "topspin": 0}
SLOW_TARGETS = (520, 600, 700, 800, 900, 1000, 1100, 1250, 1400, 1500)


def _shot(target_rpm, sign, speed=22, x=9.0):
    """A shot whose slow wheel (bottom for topspin, top for backspin) is planned near `target_rpm`."""
    best = None
    for ts in range(0, 4001, 25):
        spec = {"x": x, "y": 0.0, "speed": speed, "topspin": sign * ts}
        try:
            p = host.plan_drill({"machine": {"y": 0.0, "height": 1.0}, "interval": 3.0, "shots": [spec]})[0]
        except ValueError:
            continue
        slow = p.rpm_bottom if sign > 0 else p.rpm_top
        if best is None or abs(slow - target_rpm) < best[0]:
            best = (abs(slow - target_rpm), spec)
    return best[1]


def slow_drill():
    """Slow-wheel shots, topspin and backspin, each target twice: once after a fast flat shot (the slow wheel braking
    down when the ball comes) and once after another slow shot."""
    shots = []
    for i, t in enumerate(SLOW_TARGETS):
        sign = 1 if i % 2 == 0 else -1
        s = _shot(t, sign)
        shots += [dict(FAST), s, dict(s)]
    return {"machine": {"y": 0.0, "height": 1.0}, "interval": 3.0, "shots": shots}


def wheels(true, tau_s, spec, **plant):
    """(true drop, record drop, wheel rpm at the ball, loop fit used, record) per launched wheel, and the records."""
    sim = SimFeeder(balls=None, wheel_tau_s=tau_s, true_launcher=true, **plant)
    balls = []
    take = sim._take_momentum

    def taken():
        before = tuple(sim.wheel)
        take()
        balls.append((before, tuple(sim.wheel)))
    sim._take_momentum = taken
    res, _ = rs._run(sim, host.plan_drill(spec))
    if not res.ok:
        return None, res.aborted
    recs = [r for r in res.launches if r.get("launched")]
    assert len(recs) == len(balls), (len(recs), len(balls))
    out = []
    for r, (before, after) in zip(recs, balls):
        for k, name in ((0, "top"), (1, "bottom")):
            truth = 1 - after[k] / before[k]
            out.append((truth, float(r[f"drop_{name}"]), float(r[f"rpm_{name}"]), bool(r.get(f"loop_{name}")), r))
    return out, res.launches


PLANTS = (("first-order", {}), ("tach 5 us", {"tach_jitter_us": 5.0}), ("ESC 30 ms", {"esc_tau_s": 0.03}))
BUILDS = ((0.70, 0.35), (0.95, 0.35), (0.95, 0.65))
HOLDS = (0.0, 1000.0)          # host.HOLD_RPM: 0 is the Pi before this change (the next speeds straight after a release)
BANDS = ((500, 750), (750, 1000), (1000, 1500), (1500, 2500), (2500, 9000))
# (floor, loop_only): wheels under `floor` are set aside; with loop_only, wheels between `floor` and 1,000 rpm count only
# when the board's loop-command fit made their drop (LAUNCH flags bits 3 / 4).
FLOORS = ((0.0, False), (500.0, False), (600.0, False), (700.0, False), (750.0, False), (800.0, False), (1000.0, False),
          (600.0, True), (700.0, True), (750.0, True))


def fit_with_floor(records, floor, loop_only=False):
    """fit_from_drops with launcher.MIN_FIT_RPM at `floor`; with `loop_only`, a wheel under 1,000 rpm whose drop is not
    the loop-command fit's is left out of the rows."""
    old, rows = launcher.MIN_FIT_RPM, launcher._drop_rows
    launcher.MIN_FIT_RPM = floor
    if loop_only:
        def only_loop(recs, *a):
            keep = []
            for r in recs:
                out = rows([r], *a)
                if not out:
                    continue
                wheels = [(float(r[f"rpm_{n}"]), r.get(f"loop_{n}", False)) for n in ("top", "bottom")
                          if float(r[f"rpm_{n}"]) >= floor]
                keep += [row for row, (w, lp) in zip(out, wheels) if w >= 1000.0 or lp]
            return keep
        launcher._drop_rows = only_loop
    try:
        return launcher.fit_from_drops(records)
    finally:
        launcher.MIN_FIT_RPM, launcher._drop_rows = old, rows


def main():
    quick = "--quick" in sys.argv
    lags = (0.4,) if quick else (0.2, 0.4, 0.8)
    if "--lags" in sys.argv:
        lags = tuple(float(x) for x in sys.argv[sys.argv.index("--lags") + 1].split(","))
    plants = PLANTS[:1] if quick else PLANTS
    if "--plant" in sys.argv:
        plants = [PLANTS[int(sys.argv[sys.argv.index("--plant") + 1])]]
    holds = HOLDS
    if "--hold" in sys.argv:
        holds = (float(sys.argv[sys.argv.index("--hold") + 1]),)
    spec = slow_drill()
    cal = rs.load("drill.calibration.json")
    ratios = collections.defaultdict(list)          # (plant, hold, band[, loop]) -> record / true
    fits = collections.defaultdict(list)            # (plant, hold, floor) -> (speed err, spin err)
    aborted = []
    for pname, plant in plants:
        for tau in lags:
            for se, sp in BUILDS:
                true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
                for hold in holds:
                    host.HOLD_RPM = hold
                    ws, slow_log = wheels(true, tau, spec, **plant)
                    if ws is None:
                        aborted.append((pname, tau, se, sp, hold, slow_log))
                        continue
                    _, cal_log = wheels(true, tau, cal, **plant)
                    for truth, rec, rpm, loop, _ in ws:
                        band = next(b for b in BANDS if b[0] <= rpm < b[1])
                        ratios[(pname, hold, band)].append(rec / truth)
                        ratios[(pname, hold, band, loop)].append(rec / truth)
                    for floor in FLOORS:
                        f = fit_with_floor(cal_log + slow_log, *floor)
                        fits[(pname, hold, floor)].append((abs(f.speed_efficiency / se - 1),
                                                           abs(f.spin_efficiency / sp - 1)))
                    print(f"  {pname} lag {tau} build {se}/{sp} hold {hold:.0f}: done", file=sys.stderr)
    print("Part 1. Record drop / true drop per wheel, slow drill (shots after a fast shot and after a slow one).")
    print("hold: host.HOLD_RPM (0 = the next shot's speeds sent straight after the release, as before)")
    print(f"{'plant':12} {'hold':>5} {'rpm band':>11} {'drop from':>10} | {'wheels':>6} {'mean':>6} {'sd':>6} {'min':>6}"
          f" {'max':>6} {'>2% off':>8}")
    for pname, _ in plants:
        for hold in holds:
            for band in BANDS:
                for key, label in (((pname, hold, band), "any"), ((pname, hold, band, True), "loop fit"),
                                   ((pname, hold, band, False), "fallback")):
                    xs = ratios[key]
                    if not xs:
                        continue
                    off = sum(abs(x - 1) > 0.02 for x in xs)
                    print(f"{pname:12} {hold:5.0f} {band[0]:5d}-{band[1]:<5d} {label:>10} | {len(xs):6d} "
                          f"{statistics.fmean(xs):6.3f} {statistics.pstdev(xs):6.3f} {min(xs):6.3f} {max(xs):6.3f} "
                          f"{off:8d}")
    print("\nPart 2. fit_from_drops on calibration + slow drill logs, by floor: efficiency error, mean / worst %")
    print(f"{'plant':12} {'hold':>5} {'floor':>6} {'rule':>9} | {'builds':>6} {'speed mean':>10} {'worst':>6} | "
          f"{'spin mean':>9} {'worst':>6}")
    for pname, _ in plants:
        for hold in holds:
            for floor in FLOORS:
                e = fits[(pname, hold, floor)]
                if not e:
                    continue
                rule = "loop only" if floor[1] else "any drop"
                print(f"{pname:12} {hold:5.0f} {floor[0]:6.0f} {rule:>9} | {len(e):6d} "
                      f"{100 * statistics.fmean(x[0] for x in e):10.2f} {100 * max(x[0] for x in e):6.2f} | "
                      f"{100 * statistics.fmean(x[1] for x in e):9.2f} {100 * max(x[1] for x in e):6.2f}")
    for a in aborted:
        print(f"aborted: {a[0]} lag {a[1]} build {a[2]}/{a[3]} hold {a[4]:.0f}: {a[5]}")


if __name__ == "__main__":
    main()
