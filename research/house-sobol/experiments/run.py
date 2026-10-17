"""Sobol indices of house-cost's price index. Writes results.txt (deterministic: seeded).

    PYTHONPATH=src:../house-cost/src python experiments/run.py > experiments/results.txt
"""
from house_sobol.levers import load_levers
from house_sobol.sobol import run, SHARE_RANGE

LEVERS = load_levers()
N = 4096
NAMES = ["price index", "price per sq ft index"]


def table(res, stats, o):
    mean, var = stats[o]
    print(f"  mean {mean:.1f}, sd {var ** .5:.1f}")
    print(f"  {'input':20s}{'S1':>7s}{'95% CI':>16s}{'ST':>8s}{'95% CI':>16s}")
    for name, (s1, a, b, st, c, d) in sorted(res[o].items(), key=lambda kv: -kv[1][3]):
        print(f"  {name:20s}{s1:7.3f} ({a:6.3f},{b:6.3f}){st:8.3f} ({c:6.3f},{d:6.3f})")
    print(f"  sum of S1 = {sum(v[0] for v in res[o].values()):.3f}")


def main():
    print(f"Inputs: 10 house-cost levers (uniform over its ranges), framing materials share (uniform {SHARE_RANGE}), "
          f"driver splits (one group, lognormal tilt sigma). N={N} base samples, 200 bootstrap resamples.")
    for sigma in (0.5, 0.25, 1.0):
        res, stats = run(LEVERS, N, sigma, seed=1)
        for o in (0, 1):
            print()
            print(f"A. sigma={sigma}, output: {NAMES[o]}" if sigma == 0.5 else f"B. sigma={sigma}, output: {NAMES[o]}")
            table(res, stats, o)


if __name__ == "__main__":
    main()
