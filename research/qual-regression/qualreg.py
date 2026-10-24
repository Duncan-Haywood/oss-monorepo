"""Regression with an LLM-coded regressor, and multi-class code shares. Stdlib only.

`qual-correction` corrected a code's mean. Here the code is a regressor: y = b0 + b1*code + b2*z + noise,
and the LLM's code replaces the true code. Three estimators of the coefficients, each returning
(coefficients, standard errors):

- `ols_naive`: regress y on the LLM's code over the whole corpus (the usual shortcut);
- `ols_human`: regress on the hand-coded random sample only;
- `dsl`: design-based supervised learning (Egami et al. 2023) for OLS. The estimating equation
  x(y - x'b) is computed with the LLM code everywhere and corrected on hand-coded rows, weighted by
  1/pi, where pi is the known probability of being hand-coded. Sandwich standard errors.

`class_shares_*` do the same for a code with K classes (prevalence of each class), using `ppi` per class.
"""
import math
import random

Z95 = 1.959963984540054


def solve(a, b):
    """Solve a x = b by Gauss-Jordan with partial pivoting (small dense systems)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-12:
            raise ValueError("singular system")
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def inv(a):
    n = len(a)
    cols = [solve(a, [1.0 if i == j else 0.0 for i in range(n)]) for j in range(n)]
    return [[cols[j][i] for j in range(n)] for i in range(n)]


def _outer(x):
    return [[u * v for v in x] for u in x]


def ols(xs, ys):
    """OLS with heteroskedasticity-robust (HC0) se. xs: rows of regressors (include the 1)."""
    p, n = len(xs[0]), len(xs)
    a = [[sum(x[i] * x[j] for x in xs) / n for j in range(p)] for i in range(p)]
    b = [sum(x[i] * y for x, y in zip(xs, ys)) / n for i in range(p)]
    th = solve(a, b)
    return th, _sandwich(a, [[x[i] * (y - sum(t * v for t, v in zip(th, x))) for i in range(p)]
                             for x, y in zip(xs, ys)])


def _sandwich(a, psi):
    """se of theta = a^-1 mean(psi) from the influence rows psi (each already zero-mean at theta)."""
    n, p = len(psi), len(psi[0])
    ai = inv(a)
    cov = [[sum(r[i] * r[j] for r in psi) / n for j in range(p)] for i in range(p)]
    v = [[sum(ai[i][k] * cov[k][l] * ai[j][l] for k in range(p) for l in range(p)) / n
          for j in range(p)] for i in range(p)]
    return [math.sqrt(max(v[i][i], 0.0)) for i in range(p)]


def dsl(xs_llm, ys, gold, xs_true, pi):
    """DSL for OLS. xs_llm: regressor rows with the LLM's code, for all n items; gold: indices
    hand-coded (a Bernoulli(pi) draw, pi known); xs_true: the true-code rows for those indices."""
    p, n = len(xs_llm[0]), len(xs_llm)
    r = {i: k for k, i in enumerate(gold)}
    a = [[0.0] * p for _ in range(p)]
    b = [0.0] * p
    for i in range(n):
        x, y = xs_llm[i], ys[i]
        o = _outer(x)
        v = [x[j] * y for j in range(p)]
        if i in r:
            xt = xs_true[r[i]]
            ot, vt = _outer(xt), [xt[j] * y for j in range(p)]
            o = [[o[j][k] + (ot[j][k] - o[j][k]) / pi for k in range(p)] for j in range(p)]
            v = [v[j] + (vt[j] - v[j]) / pi for j in range(p)]
        for j in range(p):
            b[j] += v[j] / n
            for k in range(p):
                a[j][k] += o[j][k] / n
    th = solve(a, b)
    psi = []
    for i in range(n):
        x, y = xs_llm[i], ys[i]
        if i in r:
            xt = xs_true[r[i]]
            w = 1.0 / pi
            res_l = y - sum(t * v for t, v in zip(th, x))
            res_t = y - sum(t * v for t, v in zip(th, xt))
            psi.append([x[j] * res_l + w * (xt[j] * res_t - x[j] * res_l) for j in range(p)])
        else:
            res_l = y - sum(t * v for t, v in zip(th, x))
            psi.append([x[j] * res_l for j in range(p)])
    return th, _sandwich(a, psi)


def simulate(n, prev, sens, spec, betas, sigma, pi, rng, sens_by_z=None):
    """One corpus: z ~ N(0,1); code ~ Bernoulli(prev); y = b0 + b1*code + b2*z + N(0, sigma).
    LLM sensitivity is `sens`, or sens + sens_by_z*z when given (error depends on the covariate,
    e.g. a writing-style score). Returns (ys, rows_llm, gold indices, rows_true_for_gold, all true rows)."""
    b0, b1, b2 = betas
    ys, llm_rows, true_rows = [], [], []
    for _ in range(n):
        z = rng.gauss(0, 1)
        c = 1 if rng.random() < prev else 0
        s = sens if sens_by_z is None else min(max(sens + sens_by_z * z, 0.0), 1.0)
        f = (1 if rng.random() < s else 0) if c else (0 if rng.random() < spec else 1)
        ys.append(b0 + b1 * c + b2 * z + rng.gauss(0, sigma))
        llm_rows.append([1.0, float(f), z])
        true_rows.append([1.0, float(c), z])
    gold = [i for i in range(n) if rng.random() < pi]
    return ys, llm_rows, gold, [true_rows[i] for i in gold], true_rows


# ---- multi-class code shares ---------------------------------------------

def mean(xs):
    return sum(xs) / len(xs)


def var(xs):
    n = len(xs)
    if n < 2:
        return 0.0
    m = mean(xs)
    return sum((x - m) ** 2 for x in xs) / (n - 1)


def class_shares_naive(llm_all, k):
    out = []
    for c in range(k):
        ind = [1.0 if v == c else 0.0 for v in llm_all]
        out.append((mean(ind), math.sqrt(var(ind) / len(ind))))
    return out


def class_shares_ppi(llm_all, llm_gold, human_gold, k):
    """PPI share for each of k classes (one-vs-rest indicator per class)."""
    out = []
    for c in range(k):
        ia = [1.0 if v == c else 0.0 for v in llm_all]
        rect = [(1.0 if h == c else 0.0) - (1.0 if f == c else 0.0) for h, f in zip(human_gold, llm_gold)]
        out.append((mean(ia) + mean(rect), math.sqrt(var(ia) / len(ia) + var(rect) / len(rect))))
    return out


def simulate_classes(n, shares, confusion, rng):
    """truth ~ categorical(shares); LLM code ~ categorical(confusion[truth])."""
    def draw(p):
        u, acc = rng.random(), 0.0
        for i, w in enumerate(p):
            acc += w
            if u < acc:
                return i
        return len(p) - 1
    truth = [draw(shares) for _ in range(n)]
    return truth, [draw(confusion[t]) for t in truth]


def covers(est, truth, z=Z95):
    return abs(est[0] - truth) <= z * est[1]
