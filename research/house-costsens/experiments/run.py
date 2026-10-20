"""Monte Carlo over house-cost's driver splits. Writes results.txt (deterministic: seeded).

    PYTHONPATH=src:../house-cost/src python experiments/run.py > experiments/results.txt
"""
from house_costsens.levers import load_levers
from house_costsens.sens import run, quantile, swings

LEVERS = load_levers()  # house-cost's lever ranges, reused unchanged
N = 2000
KS = (5, 20, 80)


def main():
    names = [n for n, _, _ in LEVERS]
    base = swings(LEVERS)
    base_rank = sorted(names, key=lambda n: -base[n])
    print("A. Baseline (house-cost's assumed splits): swing in price-index points, ranked")
    for i, n in enumerate(base_rank, 1):
        print(f"  {i:2d} {n:44s}{base[n]:6.1f}")
    for k in KS:
        res = run(LEVERS, k, N, seed=1)
        print()
        print(f"B. Splits redrawn from a Dirichlet, concentration k={k}, {N} draws: swing median (5th to 95th pct)")
        ranks = {n: [] for n in names}
        for sw, _ in res:
            order = sorted(names, key=lambda n: -sw[n])
            for r, n in enumerate(order, 1):
                ranks[n].append(r)
        for n in base_rank:
            v = [sw[n] for sw, _ in res]
            r = ranks[n]
            print(f"  {n:44s}{quantile(v, .5):6.1f} ({quantile(v, .05):5.1f} to {quantile(v, .95):5.1f})"
                  f"  rank median {quantile(r, .5):4.1f}, top-3 in {100 * sum(x <= 3 for x in r) / N:3.0f}%")
        top = base_rank[0]
        print(f"  '{top}' is the largest swing in {100 * sum(x == 1 for x in ranks[top]) / N:.0f}% of draws")
        a = [lv[0] for _, lv in res]
        b = [lv[1] for _, lv in res]
        print(f"  14% framing-lumber cut, % of price: median {quantile(a, .5):+.2f} ({quantile(a, .05):+.2f} to {quantile(a, .95):+.2f})")
        print(f"  ... plus 20% less framing labour:   median {quantile(b, .5):+.2f} ({quantile(b, .05):+.2f} to {quantile(b, .95):+.2f})")


if __name__ == "__main__":
    main()
