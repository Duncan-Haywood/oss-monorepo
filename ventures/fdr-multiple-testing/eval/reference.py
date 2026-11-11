"""Reference numbers for fdr-multiple-testing, from another implementation.

Run:  python3 eval/reference.py > eval/reference.json   (needs numpy, scipy, statsmodels)
Nothing here is imported by the tool: the JavaScript engine is checked
against this file's output (engine.test.mjs).

- adjusted p-values: statsmodels.stats.multitest.multipletests
  (bonferroni, sidak, holm, simes-hochberg, fdr_bh, fdr_by)
- two-stage BKY rejections: multipletests(method="fdr_tsbky"), its default maxiter (two stages)
- Storey q-values: pi0 x statsmodels' fdr_bh adjusted p-values (Storey & Tibshirani 2003:
  the q-value is the BH adjustment scaled by pi0), with pi0 from Storey's (2002)
  fixed-lambda formula written here in numpy
- e-BH rejections: the Wang & Ramdas (2022) definition, k* = max{k: e_[k] >= m/(alpha k)},
  written here directly, at several alphas
"""
import json
import sys

import numpy as np
import statsmodels
from scipy.stats import norm
from statsmodels.stats.multitest import multipletests

ALPHAS = [0.01, 0.05, 0.1, 0.2]


def pi0_storey(p, lam):
    return float(min(1.0, (p > lam).sum() / (len(p) * (1 - lam))))


def ebh_rejections(e, alpha):
    m = len(e)
    order = np.argsort(-e, kind="stable")
    k_star = 0
    for k in range(1, m + 1):
        if e[order[k - 1]] >= m / (alpha * k):
            k_star = k
    rej = np.zeros(m, dtype=bool)
    rej[order[:k_star]] = True
    return rej.tolist()


rng = np.random.default_rng(20261111)
cases = {}
# Benjamini & Hochberg (1995) example, as reproduced in statsmodels' test_multi.py ("example from BKY")
cases["bh1995"] = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459,
                   0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.000]
cases["none_rejected"] = [0.2, 0.8, 0.3, 0.5, 1.0]
cases["all_small"] = [0.001, 0.002, 0.003, 0.0001]
# 200 two-sided z-tests, 40 with a mean shift of 3, rounded to 3 decimals so there are ties
z = np.concatenate([rng.normal(3, 1, 40), rng.normal(0, 1, 160)])
rng.shuffle(z)
cases["ties200"] = np.round(2 * norm.sf(np.abs(z)), 3).tolist()
# 1000 one-sided tests, 100 alternatives with shift 2.5
z = np.concatenate([rng.normal(2.5, 1, 100), rng.normal(0, 1, 900)])
rng.shuffle(z)
cases["mix1000"] = [float(x) for x in norm.sf(z)]
# 120: tiny p-values (Sidak precision), uniform nulls and a block of exact 1s
cases["tiny120"] = [float(x) for x in np.concatenate([10.0 ** -rng.uniform(6, 14, 20), rng.uniform(0, 1, 80), np.ones(20)])]

out = {"generator": "eval/reference.py", "statsmodels": statsmodels.__version__, "numpy": np.__version__, "cases": {}}
SM = {"bonferroni": "bonferroni", "sidak": "sidak", "holm": "holm", "hochberg": "simes-hochberg", "bh": "fdr_bh", "by": "fdr_by"}
for name, p in cases.items():
    p = np.asarray(p, dtype=float)
    c = {"p": p.tolist(), "adjusted": {}, "bky": {}, "pi0": {}, "storey": {}}
    for ours, theirs in SM.items():
        c["adjusted"][ours] = multipletests(p, alpha=0.05, method=theirs)[1].tolist()
    for a in ALPHAS:
        c["bky"][str(a)] = multipletests(p, alpha=a, method="fdr_tsbky")[0].tolist()
    bh = multipletests(p, alpha=0.05, method="fdr_bh")[1]
    for lam in [0.5, 0.2, 0.8]:
        pi0 = pi0_storey(p, lam)
        c["pi0"][str(lam)] = pi0
        c["storey"][str(lam)] = (pi0 * bh).tolist()
    out["cases"][name] = c

# e-values: likelihood ratios N(3,1)/N(0,1), which have expectation 1 under the N(0,1) null
x = np.concatenate([rng.normal(3.5, 1, 30), rng.normal(0, 1, 270)])
rng.shuffle(x)
e = np.exp(3.0 * x - 4.5)
e[::37] = 0.0
out["evalues"] = {"e": e.tolist(), "rejections": {str(a): ebh_rejections(e, a) for a in ALPHAS}}
json.dump(out, sys.stdout, indent=1)
print()
