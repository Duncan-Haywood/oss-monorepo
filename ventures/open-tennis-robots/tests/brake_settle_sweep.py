"""A wheel braked from a fast shot to a slow one, and the speed loop's integrator (2026-11-17, firmware/esp32/README.md
"A ball charged the integrator").

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/brake_settle_sweep.py [--grid "LOOP_RAMP_HOLD=False,LOOP_I_FF_MAX=None;"]

Before shot 1 of the slow drill, its slow wheel brakes from 3,895 to 526 rpm. On a 0.8 s wheel the ramp lowers the
target faster than the wheel can slow, the loop integrates that tracking error until the integrator cancels the whole
feedforward, and the wheel coasts to about 90 rpm, overshoots to 620 and settles 3% low. Each case here holds a wheel
pair steady at a fast pair, then sets a slow pair, and reports the time until the gate passes, the worst true error
when it does, and the slow wheel's lowest speed and its highest after it first reached the target. Fast pairs: 3,895
both, 5,000 both; slow pairs: 6,065 / 526, 3,500 / 510, 3,500 / 750, 3,500 / 1,000; four plants, three wheel lags, free
speeds 7,000 and 11,000 rpm against the 9,000 told: 192 cases. `--grid` is a list of settings separated by ";", each a
comma-separated list of controller constants (an empty setting is the shipped firmware). One process per setting.
"""

import ast
import multiprocessing
import statistics
import sys

from feeder_sim import SimFeeder, controller
from tennisbots import protocol as P

FROM = ((3895, 3895), (5000, 5000))
TO = ((6065, 526), (3500, 510), (3500, 750), (3500, 1000))
PLANTS = (("first-order", {}), ("tach 5 us", {"tach_jitter_us": 5.0}), ("ESC 30 ms", {"esc_tau_s": 0.03}),
          ("ESC 80 ms", {"esc_tau_s": 0.08}))
TAUS = (0.2, 0.4, 0.8)
FREE = (7000, 11000)


def _step(sim):
    sim.write(P.encode(P.HEARTBEAT))
    sim.run_ms(10)


def trial(start, pair, plant, tau, free, secs=15.0):
    sim = SimFeeder(wheel_tau_s=tau, wheel_max_rpm=free, **plant)
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *start) + P.encode(P.SET_AIM, 1000, 0))
    t0 = sim.clock()
    while not (sim.hw.wheels_steady.steady and sim.clock() - t0 > 2.0):
        _step(sim)
        if sim.clock() - t0 > 15:
            return None
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *pair))
    t1 = sim.clock()
    k = 0 if pair[0] < pair[1] else 1
    low, high, reached = float("inf"), 0.0, False
    passed = err_at = None
    while sim.clock() - t1 < secs:
        _step(sim)
        w = sim.wheel[k] / pair[k]
        if sim.hw.wheel_ramps[k].rpm <= pair[k]:       # the ramp has arrived: from here the loop is on its own
            low = min(low, w)
        if w <= 1.0:
            reached = True
        if reached and passed is None:
            high = max(high, w)
        if passed is None and sim.hw.wheels_steady.steady:
            passed = sim.clock() - t1
            err_at = max(abs(x - p) / p for x, p in zip(sim.wheel, pair))
            break
    return passed, err_at, low, high


def cases():
    for pname, plant in PLANTS:
        for tau in TAUS:
            for free in FREE:
                for start in FROM:
                    for pair in TO:
                        yield pname, plant, tau, free, start, pair


def run_one(setting):
    for kv in filter(None, setting.split(",")):
        name, v = kv.split("=")
        setattr(controller, name.strip(), ast.literal_eval(v))
    return setting, [(c[0], c[2], c[5], trial(c[4], c[5], c[1], c[2], c[3])) for c in cases()]


def summary(rows):
    rows = [r for r in rows if r is not None]
    ok = [r for r in rows if r[0] is not None]
    t = [r[0] for r in ok] or [0.0]
    return (f"never {len(rows) - len(ok):2d}/{len(rows)} | steady median {statistics.median(t):4.2f} s, mean "
            f"{statistics.fmean(t):4.2f}, slowest {max(t):5.2f} | over 3% at gate {sum(r[1] > 0.03 for r in ok):2d} | "
            f"slow wheel lowest: worst {min(r[2] for r in rows):.0%}, under 90% {sum(r[2] < 0.9 for r in rows):3d} | "
            f"overshoot worst {max(r[3] for r in rows) - 1:5.1%}")


def main():
    grid = ["", "LOOP_RAMP_HOLD=True", "LOOP_I_FF_MAX=0.5", "LOOP_RAMP_HOLD=True,LOOP_I_FF_MAX=0.5"]
    if "--grid" in sys.argv:
        grid = sys.argv[sys.argv.index("--grid") + 1].split(";")
    with multiprocessing.Pool(min(len(grid), multiprocessing.cpu_count())) as pool:
        results = dict(pool.map(run_one, grid))
    for g in grid:
        rows = results[g]
        print(f"\n{g or 'shipped'}: all {summary([r[3] for r in rows])}")
        for pair in TO:
            print(f"  to {pair[0]:4d}/{pair[1]:4d}: {summary([r[3] for r in rows if r[2] == pair])}")
        for tau in TAUS:
            print(f"  wheel {tau} s   : {summary([r[3] for r in rows if r[1] == tau])}")


if __name__ == "__main__":
    main()
