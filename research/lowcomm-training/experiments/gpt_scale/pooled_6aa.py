"""Milestone 6aa, exploratory (not registered): omega 1 against omega 3 with rand-k and shaped Gaussian averaged per
seed (H6aa-iv and 6z's H6z-ii found the two noises interchangeable at omega 3 and 7), and a quadratic in log2(omega)
through the seed-mean fresh-batch T at omega 1/3, 1, 3, 7 and 15, to place the optimum. Usage: python3 pooled_6aa.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
L = lambda f: [json.loads(l) for l in open(os.path.join(HERE, f))]
y = {(r["arm"], r["seed"]): r for r in L("tuned_6y.jsonl")}
rec = {(r["noise"], r["seed"]): r["clean_fresh"] for r in L("recipe_6z.jsonl") + L("recipe_6aa.jsonl")}
for s in range(4): rec[("rk8", s)] = y[("recipe", s)]["fresh"]
T = lambda n, s: rec[(n, s)] - y[("unc", s)]["fresh"]
def mse(x):
    m = sum(x) / len(x); return m, (sum((v - m) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5
pool = {o: [(T(a, s) + T(b, s)) / 2 for s in range(4)] for o, (a, b) in {1: ("rk2", "shaped1"), 3: ("rk4", "shaped3"), 7: ("rk8", "shaped7")}.items()}
for o, v in pool.items():
    m, e = mse(v); print(f"pooled T(fresh) omega {o}: {m:+.4f} ({e:.4f}), per seed {' '.join(f'{x:+.4f}' for x in v)}")
d = mse([a - b for a, b in zip(pool[1], pool[3])]); print(f"pooled omega 1 minus omega 3, paired: {d[0]:+.4f} ({d[1]:.4f}), {d[0] / d[1]:+.1f} se")
d = mse([a - b for a, b in zip(pool[7], pool[3])]); print(f"pooled omega 7 minus omega 3, paired: {d[0]:+.4f} ({d[1]:.4f}), {d[0] / d[1]:+.1f} se")
# quadratic least squares in x = log2(omega) through seed means
pts = [(1 / 3, mse([T("shaped0.33", s) for s in range(3)])[0]), (1, mse(pool[1])[0]), (3, mse(pool[3])[0]),
       (7, mse(pool[7])[0]), (15, mse([T("rk16", s) for s in range(4)])[0])]
X = [math.log2(o) for o, _ in pts]; Y = [t for _, t in pts]
S = lambda k: sum(x ** k for x in X); SY = lambda k: sum(x ** k * yv for x, yv in zip(X, Y))
A = [[S(4), S(3), S(2)], [S(3), S(2), S(1)], [S(2), S(1), len(X)]]; bv = [SY(2), SY(1), SY(0)]
def solve(A, b):
    n = len(b); M = [r[:] + [b[i]] for i, r in enumerate(A)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M[r][i])); M[i], M[p] = M[p], M[i]
        for r in range(n):
            if r != i:
                f = M[r][i] / M[i][i]; M[r] = [a - f * c for a, c in zip(M[r], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]
a, b, c = solve(A, bv); xs = -b / (2 * a)
print(f"quadratic in log2(omega) through omega 1/3..15: vertex omega {2 ** xs:.2f} (keep {1 / (1 + 2 ** xs):.2f}), T at vertex {c - b * b / (4 * a):+.4f}")
print("residuals:", " ".join(f"{o:g}:{t - (a * x * x + b * x + c):+.4f}" for (o, t), x in zip(pts, X)))
