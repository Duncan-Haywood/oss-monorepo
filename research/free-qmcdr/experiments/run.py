"""Run all experiments; prints the tables committed as results.txt.

    PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
"""
import time
from free_qmcdr import *

KINDS = ("mc", "lhs", "halton", "rd")
NS = (64, 256, 1024, 4096)
REPS = 100
SEED = "qmcdr-1"
T7 = 2.365  # two-sided 95% t critical value, 7 degrees of freedom


def configs():
    out = []
    for d in (2, 5, 10):
        out.append((f"smooth d={d}", smooth(d)))
    out.append(("smooth d=10 decay", smooth(10, gamma=1.0)))
    for d in (2, 5, 10):
        out.append((f"kink d={d}", kink(d)))
    out.append(("kink d=10 decay", kink(10, decay=True)))
    for d in (2, 5, 10):
        out.append((f"jump d={d}", jump(d)))
    out.append(("jump d=10 decay", jump(10, decay=True)))
    return out


def main():
    t0 = time.time()
    cfg = configs()
    curves = {name: {k: rmse_curve(g, k, NS, REPS, SEED) for k in KINDS} for name, g in cfg}

    print(f"== 1. RMSE slope: RMSE ~ n^slope, fitted over n = {NS[0]}..{NS[-1]} ({REPS} randomisations per cell)")
    print(f"{'return function':<20}" + "".join(f"{k:>9}" for k in KINDS))
    for name, _ in cfg:
        print(f"{name:<20}" + "".join(f"{slope(NS, curves[name][k]):>9.2f}" for k in KINDS))

    print()
    print("== 2. RMSE against n, smooth d=5 (exact mean 1)")
    print(f"{'n':>6}" + "".join(f"{k:>10}" for k in KINDS))
    for i, n in enumerate(NS):
        print(f"{n:>6}" + "".join(f"{curves['smooth d=5'][k][i]:>10.5f}" for k in KINDS))

    print()
    print(f"== 3. MSE reduction vs iid sampling at n = {NS[2]}: MSE(mc) / MSE(method), i.e. how many iid scenarios one scenario is worth")
    print(f"{'return function':<20}" + "".join(f"{k:>9}" for k in KINDS[1:]))
    i = NS.index(1024)
    for name, _ in cfg:
        m = curves[name]["mc"][i] ** 2
        print(f"{name:<20}" + "".join(f"{m / curves[name][k][i] ** 2:>9.1f}" for k in KINDS[1:]))

    print()
    print("== 4. Coverage of the 95% t-interval from 8 independent randomisations of 128 points (n = 1024), 400 trials")
    print(f"{'return function':<20}" + "".join(f"{k:>9}" for k in KINDS))
    for name, g in cfg:
        if name in ("smooth d=5", "kink d=5", "jump d=5", "jump d=10 decay"):
            print(f"{name:<20}" + "".join(f"{interval_coverage(g, k, 1024, 8, 400, SEED, T7):>9.3f}" for k in KINDS))

    print()
    print(f"== 5. Scope")
    print("Stylised: uniform scenario parameters, return functions with exact means; no robot data or simulator.")
    print(f"(runtime {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
