"""How the launcher wheels recover from a ball, and the speed loop's ball hold (2026-11-17, firmware/esp32/README.md
"A ball charged the integrator").

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/ball_recovery_sweep.py [--band off,0,0.005,0.01] [--quick]
        [--ball-gain off,down,both] [--heldout] [--rows out.jsonl]

`--ball-gain` (2026-11-19, README "The ball hold on a wheel faster than told", "A 432-case replication") runs each
band with `controller.LOOP_BALL_GAIN` at each value given (off: False). `--heldout` swaps the grid for a 432-case one:
wheel lags 0.15 / 0.25 / 0.3 s and free speeds 8,000, 10,000, 10,500 and 12,000 rpm.

"The slow drill's release timeout" left a 0.8 s wheel at 526 rpm settling 3-4% low after a ball and taking about 2 s to
creep back. Each case here spins a wheel pair up from rest on the firmware's own tach, loop, ramp and gate, lets it sit
1.5 s after the gate first passes, then sends one FEED: the board strokes (arming `WheelLoop.ball`), and the ball takes
its momentum from both wheels (the simulator's `_take_momentum`, the model the drills use). From the release it
watches up to 10 s and reports: the time until the gate, once the tach has seen the drop and shut it, passes again (the
earliest the next ball can go), the wheels' true error when it passes, the worst excursion above target after the ball
(the integrator's overshoot) and the worst excursion below target after the wheel first got back to its target (the
undershoot that creeps back). `--band` sets `controller.LOOP_BALL_BAND` (off: no hold, the loop before). Pairs:
fast-over-slow drill shots, the drill's wheel pairs and even pairs; plants: first-order, 5 us tach jitter, 30 and 80 ms
ESC lag; wheel lags 0.2 / 0.4 / 0.8 s; free speeds 7,000 and 11,000 rpm while the firmware is told 9,000: 216 cases.
One process per band, about 5 minutes each. The physics is the simulator's assumption.
"""

import json
import multiprocessing
import statistics
import sys

from feeder_sim import SimFeeder, controller
from tennisbots import protocol as P

PAIRS = ((6065, 526), (3500, 510), (3500, 750), (3500, 1000), (3500, 1500), (4635, 1955), (2160, 3232),
         (5000, 2500), (2500, 2500))
PLANTS = (("first-order", {}), ("tach 5 us", {"tach_jitter_us": 5.0}), ("ESC 30 ms", {"esc_tau_s": 0.03}),
          ("ESC 80 ms", {"esc_tau_s": 0.08}))
TAUS = (0.2, 0.4, 0.8)
FREE = (7000, 11000)
HELDOUT_TAUS = (0.15, 0.25, 0.3)
HELDOUT_FREE = (8000, 10000, 10500, 12000)


def _step(sim):
    sim.write(P.encode(P.HEARTBEAT))
    sim.run_ms(10)


def trial(band, pair, plant, tau, free, after_s=10.0, ball_gain=None):
    sim = SimFeeder(wheel_tau_s=tau, wheel_max_rpm=free, **plant)
    sim.hw.wheel_loops = tuple(controller.WheelLoop(9000, ball_band=band, ball_gain=ball_gain) for _ in range(2))
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *pair) + P.encode(P.SET_AIM, 1000, 0))
    t0 = sim.clock()
    while not (sim.hw.wheels_steady.steady and sim.hw.aim_settled()):
        _step(sim)
        if sim.clock() - t0 > 15:
            return None
    t1 = sim.clock()
    while sim.clock() - t1 < 1.5:
        _step(sim)
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.FEED, 1))   # the board's own stroke: it arms the loops' ball hold
    while not sim.released:
        _step(sim)
        if sim.clock() - t1 > 8:
            return None
    tb = sim.released[-1][0]
    back = [False, False]
    over = under = 0.0
    passed = err_at = None
    shut = False            # the gate reads steady until the tach sees the drop; count from when it has shut
    while sim.clock() - tb < after_s:
        _step(sim)
        for k, (w, p) in enumerate(zip(sim.wheel, pair)):
            if w >= p:
                back[k] = True
            over = max(over, (w - p) / p)
            if back[k]:
                under = max(under, (p - w) / p)
        shut = shut or not sim.hw.wheels_steady.steady
        if passed is None and shut and sim.hw.wheels_steady.steady:
            passed = sim.clock() - tb
            err_at = max(abs(w - p) / p for w, p in zip(sim.wheel, pair))
            after_s = min(after_s, passed + 1.0)      # keep watching a second past the gate for the creep
    return passed, err_at, over, under


def cases(quick, heldout=False):
    taus, frees = (HELDOUT_TAUS, HELDOUT_FREE) if heldout else (TAUS, FREE)
    for pname, plant in PLANTS[:1] + PLANTS[2:3] if quick else PLANTS:
        for tau in taus:
            for free in frees:
                for pair in PAIRS:
                    yield pname, plant, tau, free, pair


def run_one(args):
    (band, kl), quick, heldout = args
    return (band, kl), [(c[0], c[2], c[4], trial(band, c[4], c[1], c[2], c[3], ball_gain=kl), c[3])
                        for c in cases(quick, heldout)]


def summary(rows):
    rows = [r for r in rows if r is not None]
    ok = [r for r in rows if r[0] is not None]
    if not ok:
        return f"never {len(rows)}/{len(rows)}"
    t = [r[0] for r in ok]
    return (f"never {len(rows) - len(ok):2d}/{len(rows)} | back median {statistics.median(t):4.2f} s, mean "
            f"{statistics.mean(t):4.2f}, slowest {max(t):5.2f} | over 3% at gate {sum(r[1] > 0.03 for r in ok):2d}, "
            f"worst {max(r[1] for r in ok):4.1%} | overshoot worst {max(r[2] for r in rows):5.1%} | "
            f"undershoot worst {max(r[3] for r in rows):4.1%}, >2% {sum(r[3] > 0.02 for r in rows):2d}")


def main():
    quick = "--quick" in sys.argv
    bands = [None, controller.LOOP_BALL_BAND] if controller.LOOP_BALL_BAND is not None else [None]
    if "--band" in sys.argv:
        bands = [None if x == "off" else float(x) for x in sys.argv[sys.argv.index("--band") + 1].split(",")]
    kls = [None]
    if "--ball-gain" in sys.argv:
        kls = [False if x == "off" else (True if x == "both" else x)
               for x in sys.argv[sys.argv.index("--ball-gain") + 1].split(",")]
    heldout = "--heldout" in sys.argv
    tasks = [(b, k) for b in bands for k in kls]
    with multiprocessing.Pool(min(len(tasks), multiprocessing.cpu_count())) as pool:
        results = dict(pool.map(run_one, [(t, quick, heldout) for t in tasks]))
    if "--rows" in sys.argv:
        with open(sys.argv[sys.argv.index("--rows") + 1], "w") as f:
            for (b, k), rows in results.items():
                for pname, tau, pair, res, free in rows:
                    f.write(json.dumps({"band": b, "ball_gain": k, "plant": pname, "tau": tau, "free": free,
                                        "pair": pair, "result": res}) + "\n")
    for t in tasks:
        b, k = t
        rows = results[t]
        print(f"\nLOOP_BALL_BAND {'off' if b is None else b}, LOOP_BALL_GAIN {'shipped' if k is None else k}: "
              f"all {summary([r[3] for r in rows])}")
        for free in sorted({r[4] for r in rows}):
            print(f"  free {free:5d}: {summary([r[3] for r in rows if r[4] == free])}")
        for pair in PAIRS:
            sub = [r[3] for r in rows if r[2] == pair]
            if sub:
                print(f"  {pair[0]:4d}/{pair[1]:4d}: {summary(sub)}")
        for tau in sorted({r[1] for r in rows}):
            print(f"  wheel {tau} s : {summary([r[3] for r in rows if r[1] == tau])}")
        for pname, _ in PLANTS:
            sub = [r[3] for r in rows if r[0] == pname]
            if sub:
                print(f"  {pname:11s}: {summary(sub)}")


if __name__ == "__main__":
    main()
