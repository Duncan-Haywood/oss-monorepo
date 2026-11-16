"""Slow launcher wheels and the speed loop's gains (2026-11-16, firmware/esp32/README.md "Slow wheels need slower
gains").

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/low_speed_loop_sweep.py [--low 0,1000,1500] [--revs 0,4,6]
        [--quick] [--margins]

"The 1,000 rpm floor retested" saw every build on a 30 ms ESC lag with a 0.2 s wheel abort at its first slow shot:
the loop never held a ~510 rpm wheel in the ready gate. This sweep sets one wheel slow (510-2,000 rpm) and the other
at 3,500, from rest and from 5,000 rpm on both (the slow wheel braking down, as after a fast shot in a drill), on four
plants (first-order, 5 us tach jitter, 30 and 80 ms ESC lag), wheel lags 0.2 / 0.4 / 0.8 s and free speeds 7,000 and
11,000 rpm while the firmware is told 9,000. For each `controller.LOOP_LOW_RPM` and `GATE_HOLD_REVS` (with no options: both off, the loop's alone, the gate at 4
revolutions alone and with the loop's, and both at the defaults) it reports how many cases never pass
the gate in 12 s, how many pass it with a wheel's true speed over 3% off, the time to pass it, and the worst true error when it passes and over the next second
(a ball leaves within about 0.3 s). The tach, loop, ramp and gate are the firmware's code; the physics is the
simulator's assumption. One process per setting; about 10 minutes for the
five default settings on four cores.
"""

import cmath
import math
import multiprocessing
import statistics
import sys

from feeder_sim import SimFeeder, controller
from tennisbots import protocol as P

SLOW = (510, 600, 750, 1000, 1250, 1500, 2000)
PLANTS = (("first-order", {}), ("tach 5 us", {"tach_jitter_us": 5.0}), ("ESC 30 ms", {"esc_tau_s": 0.03}),
          ("ESC 80 ms", {"esc_tau_s": 0.08}))
TAUS = (0.2, 0.4, 0.8)
FREE = (7000, 11000)
STARTS = (None, (5000, 5000))


def trial(low, revs, slow, plant, tau, free, start, secs=12.0):
    sim = SimFeeder(wheel_tau_s=tau, wheel_max_rpm=free, **plant)
    sim.hw.wheel_loops = tuple(controller.WheelLoop(9000, low_rpm=low) for _ in range(2))
    sim.hw.wheels_steady = controller.SteadyGate(hold_revs=revs)
    pair = (3500, slow)
    if start:
        sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *start))
        for _ in range(600):
            sim.write(P.encode(P.HEARTBEAT))
            sim.run_ms(10)
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *pair))
    t0 = sim.clock()
    first, at, worst = None, None, 0.0
    while sim.clock() - t0 < secs:
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(10)
        e = max(abs(w - p) / p for w, p in zip(sim.wheel, pair))
        if first is None:
            if sim.hw.wheels_steady.steady:
                first, at = sim.clock() - t0, e
        else:
            worst = max(worst, e)
            if sim.clock() - t0 > first + 1.0:
                break
    return first, at, worst


def cases(quick):
    for pname, plant in PLANTS[2:3] if quick else PLANTS:
        for tau in TAUS[:1] if quick else TAUS:
            for free in FREE:
                for start in STARTS:
                    for slow in SLOW:
                        yield pname, plant, tau, free, start, slow


def run_one(args):
    low, revs, quick = args
    return (low, revs), [(c[0], c[5], trial(low, revs, c[5], c[1], c[2], c[3], c[4])) for c in cases(quick)]


def summary(rows):
    ok = [r for r in rows if r[0] is not None]
    if not ok:
        return f"never {len(rows)}/{len(rows)}"
    t = [r[0] for r in ok]
    return (f"never {len(rows) - len(ok):2d}/{len(rows)} | over 3% at gate {sum(r[1] > 0.03 for r in ok):3d} | "
            f"steady median {statistics.median(t):4.2f} s, "
            f"slowest {max(t):5.2f} s | error at gate worst {max(r[1] for r in ok):5.1%} | "
            f"next 1 s worst {max(r[2] for r in ok):5.1%}")


def phase_margin(rpm, tau, esc, low=0, kp=2e-4, ki=6e-7, rpm_full=9000):
    """The loop's phase margin in degrees, linearised: PI (gains per rpm of error, scaled by the wheel's free speed)
    times the wheel's and the ESC's first-order lags and a pure delay of 2.5 revolutions plus 5 ms (the four-period
    tach average trails by two revolutions, its reading changes once a revolution, and the loop runs every 10 ms)."""
    g = rpm / low if low and rpm < low else 1.0
    p, i = kp * g * rpm_full, ki * g * rpm_full * 1000.0
    delay = 2.5 * 60.0 / rpm + 0.005
    for k in range(1, 40000):
        w = k * 0.005
        s = 1j * w
        loop = (p + i / s) / ((1 + tau * s) * (1 + esc * s))
        if abs(loop) < 1.0:
            return 180.0 + math.degrees(cmath.phase(loop)) - math.degrees(w * delay)
    return 180.0


def margins():
    rpms = (510, 750, 1000, 1500, 3500)
    print("Phase margin, degrees (linear model; a negative margin rings for ever):")
    print("ESC s | wheel s | low rpm | " + " | ".join(f"{r:5d}" for r in rpms))
    for esc in (0.0, 0.03, 0.08):
        for tau in TAUS:
            for low in (0, 1500):
                print(f"{esc:5.2f} | {tau:7.1f} | {low or 'off':>7} | "
                      + " | ".join(f"{phase_margin(r, tau, esc, low):5.0f}" for r in rpms))


def main():
    if "--margins" in sys.argv:
        margins()
        return
    quick = "--quick" in sys.argv
    if "--low" in sys.argv or "--revs" in sys.argv:
        lows = [int(x) for x in sys.argv[sys.argv.index("--low") + 1].split(",")] if "--low" in sys.argv else [0]
        revs = [int(x) for x in sys.argv[sys.argv.index("--revs") + 1].split(",")] if "--revs" in sys.argv else [0]
        grid = [(low, r, quick) for low in lows for r in revs]
    else:   # the firmware before this change, each half of it, and both (the defaults)
        low = controller.LOOP_LOW_RPM
        grid = [(0, 0, quick), (low, 0, quick), (0, 4, quick), (low, 4, quick), (low, controller.GATE_HOLD_REVS, quick)]
    with multiprocessing.Pool(min(len(grid), multiprocessing.cpu_count())) as pool:
        results = dict(pool.map(run_one, grid))
    for low, rv, _ in grid:
        rows = results[(low, rv)]
        print(f"\nLOOP_LOW_RPM {low or 'off'}, GATE_HOLD_REVS {rv or 'off'}: all {summary([r[2] for r in rows])}")
        for slow in SLOW:
            print(f"  slow {slow:4d} rpm: {summary([r[2] for r in rows if r[1] == slow])}")
        for pname, _ in PLANTS:
            sub = [r[2] for r in rows if r[0] == pname]
            if sub:
                print(f"  {pname:11s}: {summary(sub)}")


if __name__ == "__main__":
    main()
