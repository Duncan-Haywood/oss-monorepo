"""Independent reference for engine.mjs: brute-force Shapley over permutations,
and the nucleolus by a different sequential-LP variant (scipy HiGHS; each
coalition tight at a stage optimum is tested for being fixed by its own LP,
rather than read from dual prices as the engine does).

    python3 eval/make_reference.py > eval/reference.json
"""
import itertools, json, math, random
import numpy as np
from scipy.optimize import linprog

def members(m, n): return [i for i in range(n) if m >> i & 1]

def shapley_perm(c, n):
    phi = [0.0] * n
    perms = list(itertools.permutations(range(n)))
    for p in perms:
        m = 0
        for i in p:
            phi[i] += c[m | 1 << i] - c[m]; m |= 1 << i
    return [v / len(perms) for v in phi]

def nucleolus(c, n):
    full = (1 << n) - 1
    single = [c[1 << i] for i in range(n)]
    # variables x_0..x_{n-1}, t
    fixed = []  # (mask, t)
    open_ = list(range(1, full))
    bounds = [(None, single[i]) for i in range(n)] + [(None, None)]
    def ind(m): return [1.0 if m >> i & 1 else 0.0 for i in range(n)]
    def solve(obj, extra_eq=()):
        A_eq = [[1.0] * n + [0.0]]; b_eq = [c[full]]
        for m, t in fixed: A_eq.append(ind(m) + [0.0]); b_eq.append(t + c[m])
        for row, rhs in extra_eq: A_eq.append(row); b_eq.append(rhs)
        A_ub = [ind(m) + [-1.0] for m in open_]; b_ub = [c[m] for m in open_]
        return linprog(obj, A_ub=A_ub or None, b_ub=b_ub or None, A_eq=A_eq, b_eq=b_eq, bounds=bounds, method="highs")
    least = None; x = None
    while open_:
        r = solve([0.0] * n + [1.0]); assert r.status == 0, r.message
        t = r.x[n]; x = r.x[:n]
        if least is None: least = t
        newly = []
        for m in open_:
            if abs(sum(x[i] for i in members(m, n)) - c[m] - t) > 1e-7: continue
            # is m tight in every optimum? minimise its excess with t fixed
            q = solve([*(ind(m)), 0.0], extra_eq=[([0.0] * n + [1.0], t)])
            if q.status == 0 and q.fun - c[m] > t - 1e-7: newly.append(m)
        assert newly
        for m in newly: fixed.append((m, t))
        M = np.array([ind(f) for f, _ in fixed] + [[1.0] * n])
        rank = np.linalg.matrix_rank(M, tol=1e-9)
        open_ = [m for m in open_ if m not in newly and np.linalg.matrix_rank(np.vstack([M, ind(m)]), tol=1e-9) > rank]
        if rank == n: break
    return list(map(float, x)), float(least)

def main():
    rng = random.Random(20261117)
    cases = []
    for k in range(40):
        n = rng.choice([3, 4, 5, 6, 7])
        kind = rng.choice(["subadditive", "random", "airport"])
        full = (1 << n) - 1
        c = [0.0] * (full + 1)
        if kind == "airport":
            need = [round(rng.uniform(1, 100), 2) for _ in range(n)]
            for m in range(1, full + 1): c[m] = max(need[i] for i in members(m, n))
        else:
            base = [round(rng.uniform(10, 100), 2) for _ in range(n)]
            for m in range(1, full + 1):
                mem = members(m, n)
                s = sum(base[i] for i in mem)
                if kind == "subadditive": c[m] = round(s * (1 - 0.12 * (len(mem) - 1) / n * rng.uniform(0.5, 1.5)), 2)
                else: c[m] = round(s * rng.uniform(0.6, 1.05), 2)
            for i in range(n): c[1 << i] = base[i]
        if sum(c[1 << i] for i in range(n)) < c[full]: continue
        x, least = nucleolus(c, n)
        cases.append({"n": n, "kind": kind, "c": c, "shapley": shapley_perm(c, n), "nucleolus": x, "leastCore": least})
    print(json.dumps({"generator": "eval/make_reference.py", "scipy": __import__("scipy").__version__, "seed": 20261117, "cases": cases}, indent=0))

main()
