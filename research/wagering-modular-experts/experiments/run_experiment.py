"""Reproduces every table in README.md. Pure stdlib; ~1 min."""
import os, statistics, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from wagering_experts import (EqualWeights, Hedge, WageringMechanism,
                              make_experts, run)

SEEDS = range(10)
ROUNDS = 6000
N = len(make_experts(3))


def mean_sd(xs):
    return statistics.mean(xs), statistics.stdev(xs)


def sweep(make, period):
    """make() -> dict of aggregators; returns {name: [regret per seed]}."""
    out = {}
    for s in SEEDS:
        for n, r in run(make(), rounds=ROUNDS, period=period, seed=s).items():
            out.setdefault(n, []).append(r.regret_per_round)
    return out


def main():
    print("## 1. Regret per round vs best-in-regime oracle (mean ± sd, 10 seeds)")
    print("| period | equal | Hedge | Hedge+FS | WSWM f=.5 | WSWM f=1 | WSWM+FS f=.5 | WSWM+FS f=1 |")
    print("|---|---|---|---|---|---|---|---|")
    for period in (25, 100, 400):
        mk = lambda: {
            "equal": EqualWeights(N), "hedge": Hedge(N, 2.0),
            "hfs": Hedge(N, 2.0, 0.05),
            "w.5": WageringMechanism(N, 0.5), "w1": WageringMechanism(N, 1.0),
            "fs.5": WageringMechanism(N, 0.5, 0.05),
            "fs1": WageringMechanism(N, 1.0, 0.05)}
        r = sweep(mk, period)
        print(f"| {period} | " + " | ".join("%.4f ± %.4f" % mean_sd(r[k])
              for k in ("equal", "hedge", "hfs", "w.5", "w1", "fs.5", "fs1")) + " |")

    print("\n## 2. (f, alpha) grid, regret per round, period=100")
    alphas = (0.0, 0.01, 0.03, 0.1, 0.3)
    fs = (0.1, 0.25, 0.5, 1.0)
    print("| f \\ alpha | " + " | ".join(map(str, alphas)) + " |")
    print("|---|" + "---|" * len(alphas))
    for f in fs:
        row = []
        for a in alphas:
            r = sweep(lambda: {"x": WageringMechanism(N, f, a)}, 100)["x"]
            row.append("%.4f" % statistics.mean(r))
        print(f"| {f} | " + " | ".join(row) + " |")

    print("\n## 3. Recovery after a regime switch: mean excess loss vs oracle by rounds since switch, period=100")
    keys = {"equal": lambda: EqualWeights(N), "Hedge": lambda: Hedge(N, 2.0),
            "WSWM f=.5": lambda: WageringMechanism(N, .5),
            "WSWM+FS f=.5 a=.03": lambda: WageringMechanism(N, .5, .03)}
    acc = {k: [0.0] * 20 for k in keys}
    orc = [0.0]
    for s in SEEDS:
        res = run({k: v() for k, v in keys.items()}, rounds=ROUNDS, period=100,
                  seed=s, window=20)
        for k in keys:
            acc[k] = [a + b / len(SEEDS) for a, b in zip(acc[k], res[k].loss_by_offset)]
    print("| offset | " + " | ".join(keys) + " |")
    print("|---|" + "---|" * len(keys))
    for o in (0, 1, 2, 5, 10, 19):
        print(f"| {o} | " + " | ".join("%.4f" % acc[k][o] for k in keys) + " |")

    print("\n## 4. Final wealth share (mean over seeds), period=100, 6000 rounds")
    print("| mechanism | spec0 | spec1 | spec2 | lazy | adversary |")
    print("|---|---|---|---|---|---|")
    for name, mk in (("WSWM f=.5", lambda: WageringMechanism(N, .5)),
                     ("WSWM+FS a=.03", lambda: WageringMechanism(N, .5, .03))):
        sh = [0.0] * N
        for s in SEEDS:
            w = run({"x": mk()}, rounds=ROUNDS, period=100, seed=s)["x"].final_wealth
            sh = [a + b / sum(w) / len(SEEDS) for a, b in zip(sh, w)]
        print(f"| {name} | " + " | ".join("%.3f" % x for x in sh) + " |")

    print("\n## 5. Cost of the fixed-share tax to the adversary/lazy modules")
    print("Mean net wealth change per round of the adversary and lazy modules:")
    for a in (0.0, 0.03, 0.1):
        d = [0.0, 0.0]
        for s in SEEDS:
            w = run({"x": WageringMechanism(N, .5, a)}, rounds=ROUNDS, period=100,
                    seed=s)["x"].final_wealth
            d[0] += (w[-2] - 1) / ROUNDS / len(SEEDS)
            d[1] += (w[-1] - 1) / ROUNDS / len(SEEDS)
        print(f"- alpha={a}: lazy {d[0]:+.5f}, adversary {d[1]:+.5f}")


if __name__ == "__main__":
    main()
