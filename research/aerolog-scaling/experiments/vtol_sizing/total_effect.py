"""Milestone 10n: total-effect Sobol indices for the cruise-sized hybrid's break-even range (closes 10m's "Next").

Predictions (written before the first run):
 (P1) pack peak power p_batt keeps the largest total-effect index and it exceeds its first-order index (10m: 0.53) by >= 0.05;
 (P2) engine specific power p_eng is second by total effect, and its total effect exceeds its first-order index (0.19) by >= 0.03;
 (P3) the sum of total-effect indices is >= 1.10 (10m: first-order indices sum to 0.82, so interactions are real);
 (P4) the five inputs with first-order index below 0.01 in 10m have total effect below 0.05 each.
Method: Saltelli (2010) sampling with Jansen (1999) estimators. Two independent uniform matrices A, B (N x 12) over 10m's ranges;
AB_i = A with column i taken from B. First-order S_i = 1 - mean((f(B)-f(AB_i))^2)/(2 Var) [Jansen]; total ST_i = mean((f(A)-f(AB_i))^2)/(2 Var).
Cost N*14 model runs. Bootstrap (resampling the N rows, 300 draws) gives 95% intervals. Same ranges and model as 10m (not datasheet values).
"""
import random, sys, math
from multiprocessing import Pool
from global_sensitivity import RANGES, be

KEYS = list(RANGES)

def f(row):
    return be(dict(zip(KEYS, row)))

def run(N, seed, procs):
    rng = random.Random(seed)
    A = [[rng.uniform(*RANGES[k]) for k in KEYS] for _ in range(N)]
    B = [[rng.uniform(*RANGES[k]) for k in KEYS] for _ in range(N)]
    jobs = A + B
    for i in range(len(KEYS)):
        jobs += [a[:i] + [b[i]] + a[i + 1:] for a, b in zip(A, B)]
    with Pool(procs) as p:
        out = p.map(f, jobs, chunksize=50)
    fa, fb = out[:N], out[N:2 * N]
    fab = [out[(2 + i) * N:(3 + i) * N] for i in range(len(KEYS))]
    return fa, fb, fab

def idx(fa, fb, fab_i, rows):
    n = len(rows)
    allv = [fa[r] for r in rows] + [fb[r] for r in rows]
    m = sum(allv) / len(allv); var = sum((v - m) ** 2 for v in allv) / len(allv)
    s1 = 1 - sum((fb[r] - fab_i[r]) ** 2 for r in rows) / (2 * n * var)
    st = sum((fa[r] - fab_i[r]) ** 2 for r in rows) / (2 * n * var)
    return s1, st

def main(N=1500, seed=3, procs=4, nboot=300):
    fa, fb, fab = run(N, seed, procs)
    base = list(range(N))
    res = {k: idx(fa, fb, fab[i], base) for i, k in enumerate(KEYS)}
    rng = random.Random(seed + 1)
    boots = {k: ([], []) for k in KEYS}
    for _ in range(nboot):
        rows = [rng.randrange(N) for _ in range(N)]
        for i, k in enumerate(KEYS):
            s1, st = idx(fa, fb, fab[i], rows)
            boots[k][0].append(s1); boots[k][1].append(st)
    def ci(v):
        v = sorted(v); return v[int(0.025 * len(v))], v[int(0.975 * len(v))]
    print(f"Milestone 10n: total-effect indices, break-even range (N={N}, {N*14} model runs, seed {seed}, {nboot} bootstrap draws)")
    print("input       first-order [95% CI]          total-effect [95% CI]")
    for k in sorted(KEYS, key=lambda k: -res[k][1]):
        a, b = ci(boots[k][0]), ci(boots[k][1])
        print(f"{k:10} {res[k][0]:7.3f} [{a[0]:+.3f},{a[1]:+.3f}]      {res[k][1]:7.3f} [{b[0]:+.3f},{b[1]:+.3f}]")
    print(f"\nsum first-order {sum(r[0] for r in res.values()):.3f}; sum total-effect {sum(r[1] for r in res.values()):.3f}")

if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:]))
