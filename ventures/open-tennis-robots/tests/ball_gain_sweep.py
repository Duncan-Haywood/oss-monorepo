"""The ball hold with the plant gain the integrator has learned (2026-11-19, firmware/esp32/README.md "The ball hold on
a wheel faster than told"; rule in eval/ball-gain-rule-2026-11-19.md, written before the run).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/ball_gain_sweep.py [--set dev,heldout,fresh] [--variant down] [--judge dev,fresh]

Same trial as tests/ball_recovery_sweep.py (one FEED from a steady pair, watched until the gate passes again), with
the shipped ball hold, LOOP_BALL_GAIN off and on (True, or the capped "down" variant). The physics is the simulator's assumption.
"""

import multiprocessing
import statistics
import sys

import ball_recovery_sweep as brs
from feeder_sim import SimFeeder, controller
from tennisbots import protocol as P

SETS = {
    "dev": (brs.PAIRS, brs.TAUS, brs.FREE),
    "heldout": (((5500, 700), (4200, 1200), (3000, 2000), (2800, 3600)), (0.15, 0.3, 0.6), (7500, 10500)),
    "fresh": (((6200, 900), (3800, 1700), (2400, 2900), (4500, 600)), (0.18, 0.25, 0.5), (7200, 10800)),
}


def trial(case):
    gain, pname, plant, tau, free, pair = case
    orig = controller.WheelLoop.__init__

    def init(self, *a, **k):
        k.setdefault("ball_gain", gain)
        orig(self, *a, **k)

    controller.WheelLoop.__init__ = init
    try:
        r = brs.trial(controller.LOOP_BALL_BAND, pair, plant, tau, free)
    finally:
        controller.WheelLoop.__init__ = orig
    return case[:2] + (tau, free, pair), r


def cases(name, gain):
    pairs, taus, frees = SETS[name]
    for pname, plant in brs.PLANTS:
        for tau in taus:
            for free in frees:
                for pair in pairs:
                    yield gain, pname, plant, tau, free, pair


def stats(rows):
    ok = [r for r in rows if r is not None and r[0] is not None]
    t = [r[0] for r in ok]
    return {"n": len(rows), "never": len(rows) - len(ok), "mean": statistics.mean(t), "median": statistics.median(t),
            "worst": max(t), "gate3": sum(r[1] > 0.03 for r in ok), "over": max(r[2] for r in rows if r),
            "under2": sum(r[3] > 0.02 for r in rows if r), "underw": max(r[3] for r in rows if r)}


def fmt(s):
    return (f"never {s['never']}/{s['n']} | back median {s['median']:.2f} / mean {s['mean']:.2f} / worst {s['worst']:.2f} s"
            f" | >3% at gate {s['gate3']} | overshoot worst {s['over']:.1%} | undershoot >2% {s['under2']}, "
            f"worst {s['underw']:.1%}")


def verdict(off, on):
    a, b = stats([r for _, r in off]), stats([r for _, r in on])
    lost = sum(1 for (_, x), (_, y) in zip(off, on) if x and x[0] is not None and (y is None or y[0] is None))
    checks = {
        "undershoots >2% fall": b["under2"] < a["under2"],
        "mean back <= +0.05 s": b["mean"] <= a["mean"] + 0.05,
        "no more >3% at gate": b["gate3"] <= a["gate3"],
        "overshoot <= +0.5 pt": b["over"] <= a["over"] + 0.005,
        "no case lost": lost == 0,
    }
    return a, b, checks


def main():
    which = sys.argv[sys.argv.index("--set") + 1] if "--set" in sys.argv else "both"
    names = ["dev", "heldout"] if which == "both" else which.split(",")
    variant = sys.argv[sys.argv.index("--variant") + 1] if "--variant" in sys.argv else True
    judged = sys.argv[sys.argv.index("--judge") + 1].split(",") if "--judge" in sys.argv else names
    allpass = True
    with multiprocessing.Pool(multiprocessing.cpu_count()) as pool:
        for name in names:
            off = pool.map(trial, list(cases(name, False)))
            on = pool.map(trial, list(cases(name, variant)))
            a, b, checks = verdict(off, on)
            print(f"\n== {name} set, {a['n']} cases ==")
            print(f"  gain off: {fmt(a)}")
            print(f"  gain on : {fmt(b)}")
            for tau in SETS[name][1]:
                for free in SETS[name][2]:
                    sa = stats([r for c, r in off if c[2] == tau and c[3] == free])
                    sb = stats([r for c, r in on if c[2] == tau and c[3] == free])
                    print(f"  wheel {tau} s, free {free}: off under>2% {sa['under2']:2d} worst {sa['underw']:.1%} "
                          f"mean {sa['mean']:.2f} s | on under>2% {sb['under2']:2d} worst {sb['underw']:.1%} "
                          f"mean {sb['mean']:.2f} s")
            for k, v in checks.items():
                print(f"  {'PASS' if v else 'FAIL'} {k}")
            if name in judged:
                allpass &= all(checks.values())
            else:
                print("  (reported, not judged)")
    print(f"\nRule (eval/ball-gain-rule-2026-11-19.md), LOOP_BALL_GAIN={variant!r} on {','.join(judged)}: "
          f"{'ships' if allpass else 'kept off'}")


if __name__ == "__main__":
    main()
