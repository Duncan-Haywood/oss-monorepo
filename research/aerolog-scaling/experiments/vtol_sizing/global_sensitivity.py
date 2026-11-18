"""Milestone 10m: which input decides the cruise-sized hybrid's break-even range? A global sensitivity run over 10k's model.

Predictions (written before the first run):
 (P1) the two largest first-order indices for the break-even range are engine specific power (p_eng) and pack peak
      power (p_batt) (10k: "pack peak power now decides the result"; 10j: engine specific power);
 (P2) pack energy density (e_cell) ranks in the bottom three of the 12 inputs (10k: no effect at 150 km);
 (P3) the non-energy fraction f_non ranks in the top three (it enters both the hybrid and the battery aircraft).
Method: N = 4,000 seeded uniform random draws of 12 inputs over the ranges below; output =
break-even km against the 250 Wh/kg battery aircraft (scan at 2 km steps; no crossing before 1,500 km is censored at
1,500). First-order index = variance of the conditional mean over 10 equal-count bins of one input / total variance;
Spearman rank correlation reported with it. Ranges are plausible sweeps, not datasheet values (10k's limits stand).
"""
import math, random, sys
from climb_transition_hybrid import hyb_ct
from hybrid_mass_law import bat_free

RANGES = {  # name: (lo, hi)
    "p_eng": (0.5, 4.0), "eta_chain": (0.12, 0.30), "k_tank": (0.10, 0.40), "p_batt": (800, 3000),
    "e_cell": (200, 400), "h": (50, 600), "vc": (1.0, 4.0), "t_tr": (15, 90), "f_tr": (0.4, 1.0),
    "fnon": (0.45, 0.60), "V": (25, 40), "LD": (8, 16),
}

def be(x):
    fnon = x["fnon"]
    kw = {k: v for k, v in x.items() if k != "fnon"}
    for Rk in range(2, 1501, 2):
        if hyb_ct(Rk * 1e3, fnon, **kw) > bat_free(Rk * 1e3, fnon):
            return Rk
    return 1500

def ranks(v):
    o = sorted(range(len(v)), key=v.__getitem__)
    r = [0.0] * len(v)
    for i, j in enumerate(o):
        r[j] = i
    return r

def corr(a, b):
    n = len(a); ma = sum(a) / n; mb = sum(b) / n
    sa = math.sqrt(sum((x - ma) ** 2 for x in a)); sb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb)

def first_order(xs, y, nb=10):
    o = sorted(range(len(xs)), key=xs.__getitem__)
    n = len(y); my = sum(y) / n; var = sum((v - my) ** 2 for v in y) / n
    s = 0.0
    for b in range(nb):
        idx = o[b * n // nb:(b + 1) * n // nb]
        mb = sum(y[i] for i in idx) / len(idx)
        s += len(idx) / n * (mb - my) ** 2
    return s / var

def main(N=4000, seed=1):
    rng = random.Random(seed)
    X = {k: [] for k in RANGES}; Y = []
    for _ in range(N):
        x = {k: rng.uniform(*r) for k, r in RANGES.items()}
        for k in x:
            X[k].append(x[k])
        Y.append(be(x))
    cens = sum(1 for v in Y if v >= 1500)
    srt = sorted(Y)
    print(f"Milestone 10m: global sensitivity of the cruise-sized hybrid's break-even range (N={N}, seed {seed})")
    print(f"break-even km: median {srt[N//2]}, 10th pct {srt[N//10]}, 90th pct {srt[9*N//10]}, censored at 1500: {cens}")
    print("\ninput        range            first-order  Spearman")
    rows = []
    ry = ranks(Y)
    for k in RANGES:
        rows.append((first_order(X[k], Y), corr(ranks(X[k]), ry), k))
    for s1, rho, k in sorted(rows, reverse=True):
        print(f"{k:10} {str(RANGES[k]):16} {s1:9.3f}  {rho:+8.3f}")
    print(f"\nsum of first-order indices {sum(r[0] for r in rows):.3f} (1 - sum = interactions + binning noise)")
    # bootstrap-free stability: second seed
    if len(sys.argv) > 1:
        pass

if __name__ == "__main__":
    main()
