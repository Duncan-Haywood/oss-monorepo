"""Reference numbers for the online rules (online.mjs), from a second implementation.

Run:  python3 eval/online_reference.py > eval/online_reference.json   (needs numpy, scipy)
Nothing here is imported by the tool; online.test.mjs checks the JavaScript
levels and decisions against this file's output to 1e-12.

Written separately from online.mjs, straight from the papers' formulas, with
the sums over past rejections and candidates recomputed from scratch at every
step (no running counters or prefix arrays):

- LOND, Javanmard & Montanari (2018): alpha_t = alpha * gamma_t * (D(t-1) + 1)
- LORD++, Ramdas, Yang, Wainwright & Jordan (2017):
  alpha_t = W0 gamma_t + (alpha - W0) gamma_{t - tau_1} + alpha sum_{j>=2} gamma_{t - tau_j}
- SAFFRON, Ramdas, Zrnic, Wainwright & Jordan (2018), Algorithm 1:
  alpha_t = min(lambda, W0 gamma_{t - C_0+} + ((1 - lambda) alpha - W0) gamma_{t - tau_1 - C_1+}
                        + sum_{j>=2} (1 - lambda) alpha gamma_{t - tau_j - C_j+})
- alpha-spending: alpha_t = alpha * gamma_t

gamma for LOND/LORD++/spending: c log(max(j,2)) / (j exp(sqrt(log j))), c = 0.07720838.
gamma for SAFFRON: j^-1.6 / zeta(1.6), with zeta from scipy.special.
"""
import json
import math
import sys

import numpy as np
import scipy
from scipy.special import zeta
from scipy.stats import norm

C_LORD = 0.07720838
C_SAFFRON = 1.0 / float(zeta(1.6))


def g_lord(j):
    return C_LORD * math.log(max(j, 2)) / (j * math.exp(math.sqrt(math.log(j)))) if j >= 1 else 0.0


def g_saffron(j):
    return C_SAFFRON * j ** -1.6 if j >= 1 else 0.0


def run_spending(p, alpha):
    lv = [alpha * g_lord(t) for t in range(1, len(p) + 1)]
    return lv, [bool(p[i] <= lv[i]) for i in range(len(p))]


def run_lond(p, alpha):
    lv, rj = [], []
    for t in range(1, len(p) + 1):
        a = alpha * g_lord(t) * (sum(rj) + 1)
        lv.append(a)
        rj.append(bool(p[t - 1] <= a))
    return lv, rj


def run_lordpp(p, alpha, w0):
    lv, rj = [], []
    for t in range(1, len(p) + 1):
        taus = [i + 1 for i, r in enumerate(rj) if r]
        a = w0 * g_lord(t)
        if taus:
            a += (alpha - w0) * g_lord(t - taus[0]) + alpha * sum(g_lord(t - tau) for tau in taus[1:])
        lv.append(a)
        rj.append(bool(p[t - 1] <= a))
    return lv, rj


def run_saffron(p, alpha, lam, w0):
    lv, rj = [], []
    for t in range(1, len(p) + 1):
        cands = [bool(p[i] <= lam) for i in range(t - 1)]  # C_1 .. C_{t-1}
        taus = [i + 1 for i, r in enumerate(rj) if r]
        a = w0 * g_saffron(t - sum(cands))
        for j, tau in enumerate(taus):
            c_plus = sum(cands[tau:t - 1])  # C_i for i = tau+1 .. t-1
            weight = (1 - lam) * alpha - w0 if j == 0 else (1 - lam) * alpha
            a += weight * g_saffron(t - tau - c_plus)
        a = min(lam, a)
        lv.append(a)
        rj.append(bool(p[t - 1] <= a))
    return lv, rj


def stream(rng, n, share, shift):
    nonnull = rng.random(n) < share
    z = rng.standard_normal(n) + np.where(nonnull, shift, 0.0)
    return [float(x) for x in norm.sf(z)]


def main():
    rng = np.random.default_rng(20261116)
    cases = [
        ("mostly null, 300 tests", stream(rng, 300, 0.1, 3.0)),
        ("half signal, 300 tests", stream(rng, 300, 0.5, 3.0)),
        ("weak signal, 500 tests", stream(rng, 500, 0.2, 2.0)),
        ("strong early burst", [1e-6, 1e-5, 2e-4, 0.001] + stream(rng, 196, 0.05, 3.0)),
        ("all null, 200 tests", stream(rng, 200, 0.0, 0.0)),
        ("ties and exact 0 and 1", [0.0, 0.0, 1.0, 0.5, 0.5, 0.001, 1.0, 0.0001, 0.03, 0.5] * 6),
    ]
    out = {"generator": f"eval/online_reference.py (numpy {np.__version__}, scipy {scipy.__version__})", "c_saffron": C_SAFFRON, "cases": []}
    for name, p in cases:
        p = [float(f"{x:.8g}") for x in p]
        case = {"name": name, "p": p, "runs": []}
        for alpha, share, lam in ((0.05, 0.5, 0.5), (0.1, 0.9, 0.25)):
            run = {"alpha": alpha, "w0Share": share, "lambda": lam}
            for key, (lv, rj) in (
                ("lordpp", run_lordpp(p, alpha, share * alpha)),
                ("saffron", run_saffron(p, alpha, lam, share * (1 - lam) * alpha)),
                ("lond", run_lond(p, alpha)),
                ("spending", run_spending(p, alpha)),
            ):
                run[key] = {"level": [float(f"{x:.15g}") for x in lv], "reject": [int(r) for r in rj]}
            case["runs"].append(run)
        out["cases"].append(case)
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
