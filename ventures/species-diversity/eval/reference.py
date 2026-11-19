"""Independent reference values for the species-diversity engine.

Everything here is computed a different way from engine.mjs:
  * rarefaction (q = 0, 1, 2) and coverage below n from scipy.stats.hypergeom
    probability mass functions, one species at a time, instead of the
    engine's log-binomial sums over frequency counts;
  * the Chao-Wang-Jost (2013) entropy tail from mpmath's Lerch transcendent,
    sum_{j>=0} A^(j+1)/(n+j) = A * lerchphi(A, 1, n), at 30 digits, instead of
    the engine's direct sum or Gauss-Legendre integral;
  * observed Shannon, the Simpson sums, ACE and (up to the (n-1)/n factor)
    Chao1 from scikit-bio;
  * the size needed for a given coverage by scipy.optimize.brentq on the
    coverage function instead of the engine's bisection / closed form;
  * a Monte Carlo check of the rarefaction expectations by actually drawing
    subsamples without replacement (numpy, 20,000 draws).
The extrapolation formulas for q = 0, 1, 2 are written again from Chao et al.
(2014) and the iNEXT 3.0.2 rule for q = 1, so a typo in either copy shows up.

Run: python3 -I eval/reference.py > eval/reference.json
Versions are recorded in the output.
"""
import csv
import json
import math
import os
import sys

import mpmath
import numpy as np
import scipy
from scipy import optimize
from scipy.stats import hypergeom, norm
import skbio
import skbio.diversity.alpha as alpha

HERE = os.path.dirname(os.path.abspath(__file__))
mpmath.mp.dps = 30


def portal(group):
    out = {}
    with open(os.path.join(HERE, "..", "data", "portal-rodents.csv"), newline="") as fh:
        for r in csv.DictReader(fh):
            out.setdefault(r[group], {}).setdefault(r["species"], 0)
            out[r[group]][r["species"]] += int(r["individuals"])
    return {k: sorted(v.values(), reverse=True) for k, v in out.items()}


def cases():
    rng = np.random.default_rng(20261118)
    cs = {}
    # Simulated: a lognormal assemblage of 120 species, sampled at three depths.
    p = rng.lognormal(0, 1.5, 120)
    p /= p.sum()
    for n in (60, 250, 1200):
        x = rng.multinomial(n, p)
        cs[f"lognormal-n{n}"] = sorted([int(v) for v in x if v > 0], reverse=True)
    # A geometric-series (steep dominance) assemblage.
    g = 0.7 ** np.arange(30)
    g /= g.sum()
    x = rng.multinomial(400, g)
    cs["geometric-n400"] = sorted([int(v) for v in x if v > 0], reverse=True)
    # Edge cases for Chao1's branches.
    cs["no-doubletons"] = [40, 22, 9, 5, 3, 1, 1, 1, 1]  # f1 = 4, f2 = 0
    cs["no-singletons"] = [30, 12, 7, 4, 3, 2, 2]  # f1 = 0
    cs["one-singleton"] = [25, 10, 6, 3, 1]  # f1 = 1, f2 = 0
    cs["many-singletons"] = [5, 3, 2] + [1] * 30  # A close to 1 is not reached here, but f1 >> f2
    for name, counts in portal("treatment").items():
        cs[f"portal-{name}"] = counts
    for name in ("4", "10"):
        cs[f"portal-plot{name}"] = portal("plot")[name]
    return cs


def f0_hat(n, f1, f2):
    return (n - 1) / n * f1 * f1 / (2 * f2) if f2 > 0 else (n - 1) / n * f1 * (f1 - 1) / 2


def a_hat(n, f1, f2):
    f0 = f0_hat(n, f1, f2)
    return n * f0 / (n * f0 + f1) if f1 > 0 else 1.0


def chao1(x, conf=0.95):
    x = np.asarray(x)
    n, D = int(x.sum()), len(x)
    f1, f2 = int((x == 1).sum()), int((x == 2).sum())
    z = norm.ppf(1 - (1 - conf) / 2)
    k = (n - 1) / n
    if f1 > 0 and f2 > 0:
        est = D + k * f1**2 / (2 * f2)
        r = f1 / f2
        v = f2 * (k * r**2 / 2 + k**2 * r**3 + k**2 * r**4 / 4)
    elif f1 > 1 and f2 == 0:
        est = D + k * f1 * (f1 - 1) / 2
        v = k * f1 * (f1 - 1) / 2 + k**2 * f1 * (2 * f1 - 1) ** 2 / 4 - k**2 * f1**4 / 4 / est
    else:
        vals, mult = np.unique(x, return_counts=True)
        var_obs = float(np.sum(mult * (np.exp(-vals) - np.exp(-2.0 * vals))) - np.sum(vals * np.exp(-vals) * mult) ** 2 / n)
        P = float(np.sum(mult * np.exp(-vals.astype(float))) / D)
        lo = max(D, D / (1 - P) - z * math.sqrt(var_obs) / (1 - P))
        hi = D / (1 - P) + z * math.sqrt(var_obs) / (1 - P)
        return {"estimate": D, "se": math.sqrt(var_obs), "lower": lo, "upper": hi}
    t = est - D
    K = math.exp(z * math.sqrt(math.log(1 + v / t**2)))
    return {"estimate": est, "se": math.sqrt(v), "lower": D + t / K, "upper": D + t * K}


def chao_entropy(x):
    x = np.asarray(x)
    n = int(x.sum())
    f1, f2 = int((x == 1).sum()), int((x == 2).sum())
    from scipy.special import digamma
    part1 = float(np.sum(x / n * (digamma(n) - digamma(x))))
    A = a_hat(n, f1, f2)
    if f1 == 0 or A >= 1:
        return part1
    tail = A * mpmath.lerchphi(A, 1, n)  # sum_{j>=0} A^(j+1) / (n+j)
    return part1 + f1 / n * float(tail)


def rarefy(x, m):
    """q = 0, 1, 2 at size m < n from hypergeometric pmfs, species by species."""
    x = np.asarray(x)
    n = int(x.sum())
    q0 = float(np.sum(1 - hypergeom.pmf(0, n, x, m)))
    k = np.arange(1, m + 1)
    fbar = np.zeros(m + 1)
    for xi in x:
        fbar[1:] += hypergeom.pmf(k, n, xi, m)
    nz = fbar[1:] > 0
    h = -float(np.sum(fbar[1:][nz] * (k[nz] / m) * np.log(k[nz] / m)))
    simp = float(np.sum(fbar[1:] * (k / m) ** 2))
    return [q0, math.exp(h), 1 / simp]


def coverage(x, m):
    x = np.asarray(x)
    n = int(x.sum())
    f1, f2 = int((x == 1).sum()), int((x == 2).sum())
    if m >= n:
        return 1 - f1 / n * a_hat(n, f1, f2) ** (m - n + 1)
    # P(a size-m draw from the other n - 1 individuals misses all X - 1 conspecifics).
    return 1 - float(np.sum(x / n * hypergeom.pmf(0, n - 1, x - 1, m)))


def observed(x):
    x = np.asarray(x)
    return [len(x), math.exp(alpha.shannon(x)), 1 / alpha.dominance(x)]


def extrapolate(x, m):
    x = np.asarray(x)
    n = int(x.sum())
    f1, f2 = int((x == 1).sum()), int((x == 2).sum())
    S = len(x)
    f0 = f0_hat(n, f1, f2)
    q0 = S + f0 * (1 - (1 - f1 / (n * f0 + f1)) ** (m - n)) if f0 > 0 else S
    simp = alpha.dominance(x, finite=True)
    q2 = 1 / (1 / m + (1 - 1 / m) * simp)
    obs1 = observed(x)[1]
    asy1 = math.exp(chao_entropy(x))
    prev = rarefy(x, n - 1)[1]
    beta = (obs1 - prev) / (asy1 - prev) if asy1 != prev else 0.0
    q1 = obs1 + (asy1 - obs1) * (1 - (1 - beta) ** (m - n))
    return [q0, q1, q2]


def size_for_coverage(x, C):
    n = int(np.sum(x))
    ref = coverage(x, n)
    if ref > C:
        # The engine interpolates coverage linearly between whole sizes.
        def cov(m):
            lo, hi = math.floor(m), math.ceil(m)
            if lo == hi:
                return coverage(x, lo)
            return (hi - m) * coverage(x, lo) + (m - lo) * coverage(x, hi)
        return optimize.brentq(lambda m: cov(m) - C, 1, n, xtol=1e-12)
    f = lambda m: coverage(x, m) - C
    return optimize.brentq(f, n, 1e7, xtol=1e-9)


def monte_carlo(x, m, draws=20000, seed=7):
    rng = np.random.default_rng(seed)
    labels = np.repeat(np.arange(len(x)), x)
    s0 = s1 = s2 = 0.0
    for _ in range(draws):
        sub = rng.choice(labels, size=m, replace=False)
        c = np.bincount(sub)
        c = c[c > 0]
        p = c / m
        s0 += len(c)
        s1 += -np.sum(p * np.log(p))
        s2 += np.sum(p * p)
    # Expectations of S, of H (whose exp is the q = 1 rarefaction), and of sum p^2.
    return {"S": s0 / draws, "H": s1 / draws, "simpson": s2 / draws, "draws": draws}


def main():
    out = {"versions": {"python": sys.version.split()[0], "numpy": np.__version__, "scipy": scipy.__version__, "mpmath": mpmath.__version__, "scikit-bio": skbio.__version__}, "cases": {}}
    for name, x in cases().items():
        x = [int(v) for v in x]
        xa = np.asarray(x)
        n = int(xa.sum())
        ms = sorted({1, 2, max(1, n // 5), n // 2, n - 1})
        ms = [m for m in ms if 1 <= m < n]
        ext = [n + 1, int(1.5 * n), 2 * n, 10 * n]
        try:
            ace = float(alpha.ace(xa, rare_threshold=10))
        except Exception:
            ace = None
        c = {
            "counts": x,
            "n": n,
            "S": len(x),
            "chao1": chao1(x),
            "skbio_chao1_plain": float(alpha.chao1(xa, bias_corrected=False)) if int((xa == 2).sum()) > 0 else None,
            "ace": ace if ace is None or math.isfinite(ace) else None,
            "observed": observed(x),
            "simpson_unbiased": float(alpha.dominance(xa, finite=True)),
            "entropy": chao_entropy(x),
            "coverage_n": coverage(x, n),
            "goods": float(alpha.goods_coverage(xa)),
            "rarefaction": [{"m": m, "qD": rarefy(x, m), "coverage": coverage(x, m)} for m in ms],
            "extrapolation": [{"m": m, "qD": extrapolate(x, m), "coverage": coverage(x, m)} for m in ext],
            "size_for_coverage": [],
        }
        for C in (0.5, 0.9, 0.99, 0.999):
            if C < 1 - 1e-12 and not (int((xa == 1).sum()) == 0 and C > c["coverage_n"]):
                try:
                    c["size_for_coverage"].append({"C": C, "m": size_for_coverage(x, C)})
                except ValueError:
                    pass
        if name in ("lognormal-n250", "portal-plot10"):
            m = n // 3
            c["monte_carlo"] = {"m": m, **monte_carlo(x, m)}
        out["cases"][name] = c
        print(name, file=sys.stderr)
    # The entropy tail on its own, including A so close to 1 that the engine
    # switches from the direct sum to its integral form.
    out["tails"] = [
        {"A": A, "n": n, "tail": float(A * mpmath.lerchphi(A, 1, n))}
        for A in (0.3, 0.9, 0.999, 0.99999, 0.9999999, 0.999999999)
        for n in (5, 300, 20000, 1000000)
    ]
    json.dump(out, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
