"""Seeding a threshold contagion on Watts-Strogatz graphs (see LOG.md, 2026-10-28)."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
from civ_levers.cascades import watts_strogatz, spread, RULES

N, K, G = 1000, 8, 20
PS = [0.0, 0.01, 0.03, 0.1, 0.3, 1.0]
BUDGETS = [1, 2, 3, 5, 8, 12, 20, 40]


def cell(p, T, rule, s, seed0=0):
    out = []
    for g in range(G):
        rng = np.random.default_rng(seed0 + g)
        adj = watts_strogatz(N, K, p, rng)
        seeds = RULES[rule](adj, s, np.random.default_rng(10_000 + g))
        out.append(spread(adj, seeds, T)[0])
    out = np.array(out)
    return out.mean(), 1.96 * out.std(ddof=1) / np.sqrt(G)


def main():
    print(f"n={N} k={K} graphs per cell={G}; mean final adopted fraction +- 95% CI\n")
    print("== Table 1: T=1, one seed vs rewiring p")
    for p in PS:
        m, c = cell(p, 1, "random", 1)
        print(f"p={p:<5} {m:.3f} +- {c:.3f}")
    print("\n== Table 2: T=2, 5 seeds, by rule and p")
    print("p      " + "  ".join(f"{r:>12}" for r in RULES))
    for p in PS:
        row = []
        for r in RULES:
            m, c = cell(p, 2, r, 5)
            row.append(f"{m:.3f}+-{c:.3f}")
        print(f"{p:<6} " + "  ".join(f"{x:>12}" for x in row))
    print("\n== Table 3: smallest budget reaching mean adoption >= 0.9 ('-' = none up to 40)")
    for T in (2, 3):
        for rule in RULES:
            cells = []
            for p in PS:
                hit = "-"
                for s in BUDGETS:
                    if cell(p, T, rule, s)[0] >= 0.9:
                        hit = str(s)
                        break
                cells.append(f"{hit:>3}")
            print(f"T={T} {rule:<7} p=" + " ".join(f"{p:<4}" for p in PS) + " -> " + " ".join(cells))


if __name__ == "__main__":
    main()
