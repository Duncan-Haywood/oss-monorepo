"""Milestone 6f (H6): a three-constant composition rule against a same-size fitted additive scaling law.

Pure stdlib. Reads the 17 rand-k/uncompressed cell means from composition_results.txt (written by composition.py),
fits each model on a random third of the cells, scores mean absolute percentage error (MAPE) on the rest,
over many random splits, and reports a paired bootstrap interval of the MAPE ratio. See LOG.md, 6f.
"""
import os, re, random, math

HERE = os.path.dirname(os.path.abspath(__file__))


def cells():
    out = {}
    for line in open(os.path.join(HERE, "composition_results.txt")):
        m = re.match(r"\((\d+), ([0-9.]+)\) 3 ([0-9.]+) ", line)
        if m: out[(int(m[1]), float(m[2]))] = float(m[3])
    return out


def solve(A, y):
    """Least squares by normal equations with Gauss elimination (a few columns)."""
    n = len(A[0])
    M = [[sum(r[i] * r[j] for r in A) for j in range(n)] + [sum(r[i] * t for r, t in zip(A, y))] for i in range(n)]
    for i in range(n):
        p = max(range(i, n), key=lambda k: abs(M[k][i]))
        M[i], M[p] = M[p], M[i]
        if abs(M[i][i]) < 1e-12: return None
        for k in range(n):
            if k != i:
                f = M[k][i] / M[i][i]
                M[k] = [a - f * b for a, b in zip(M[k], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]


def sse(A, y, w):
    return sum((sum(a * b for a, b in zip(r, w)) - t) ** 2 for r, t in zip(A, y))


def omega(p): return 1 / p - 1


# rule: L = L0 + a * omega * (H/16)^b      (3 constants: L0, a, b)
def fit_rule(tr):
    best = None
    for b in [i / 20 for i in range(-20, 41)]:
        A = [[1, omega(p) * (H / 16) ** b] for (H, p), _ in tr]
        w = solve(A, [l for _, l in tr])
        if w and (best is None or sse(A, [l for _, l in tr], w) < best[0]): best = (sse(A, [l for _, l in tr], w), w, b)
    _, w, b = best
    return lambda H, p: w[0] + w[1] * omega(p) * (H / 16) ** b


# baseline: Charles et al.-style additive power laws, L = A + B H^beta + C omega^gamma  (5 constants)
def fit_base(tr):
    best = None
    y = [l for _, l in tr]
    for be in [i / 10 for i in range(-10, 21) if i]:
        for ga in [i / 10 for i in range(2, 21)]:
            A = [[1, H ** be, omega(p) ** ga] for (H, p), _ in tr]
            w = solve(A, y)
            if w and (best is None or sse(A, y, w) < best[0]): best = (sse(A, y, w), w, be, ga)
    _, w, be, ga = best
    return lambda H, p: w[0] + w[1] * H ** be + w[2] * omega(p) ** ga


def mape(f, te): return sum(abs(f(H, p) - l) / l for (H, p), l in te) / len(te)


def main():
    c = cells()
    items = sorted(c.items())
    n = len(items)
    k = round(n / 3)
    rng = random.Random(0)
    res = []
    for _ in range(300):
        idx = set(rng.sample(range(n), k))
        tr = [items[i] for i in idx]
        # need at least two distinct omega values and two distinct H for the baseline to be identifiable
        if len({p for (H, p), _ in tr}) < 2 or len({H for (H, p), _ in tr}) < 2: continue
        te = [items[i] for i in range(n) if i not in idx]
        res.append((mape(fit_rule(tr), te), mape(fit_base(tr), te)))
    r = [a for a, b in res]; b = [b for a, b in res]
    mean = lambda v: sum(v) / len(v)
    print(f"{n} cells, {k} fit / {n-k} held out, {len(res)} usable random splits")
    print(f"mean held-out MAPE: rule (3 constants) {100*mean(r):.3f}%  additive power-law baseline (5) {100*mean(b):.3f}%")
    print(f"median: rule {100*sorted(r)[len(r)//2]:.3f}%  baseline {100*sorted(b)[len(b)//2]:.3f}%")
    print(f"splits where rule is better: {sum(a < c_ for a, c_ in res)}/{len(res)}")
    ratios = []
    for _ in range(2000):
        s = [res[rng.randrange(len(res))] for _ in res]
        ratios.append(mean([a for a, _ in s]) / mean([b for _, b in s]))
    ratios.sort()
    print(f"paired bootstrap, MAPE ratio rule/baseline: {mean(ratios):.3f}, 95% interval [{ratios[50]:.3f}, {ratios[1949]:.3f}]  (H6 refuted if the lower end exceeds 1.10)")
    # fixed split: fit on the H=16 slice (the classic one-axis-at-a-time design) and score the rest
    tr = [x for x in items if x[0][0] == 16 or x[0][1] == 1.0 and x[0][0] == 16]
    tr = [x for x in items if x[0][0] == 16]
    te = [x for x in items if x[0][0] != 16]
    print(f"H=16 slice fit ({len(tr)} cells), {len(te)} held out: rule {100*mape(fit_rule(tr), te):.3f}%  baseline {100*mape(fit_base(tr), te):.3f}%")


if __name__ == "__main__": main()
