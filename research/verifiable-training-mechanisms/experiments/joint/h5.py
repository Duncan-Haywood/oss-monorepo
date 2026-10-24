"""Milestone 5, H5: a one-sided resolution lower bound on the cost of any contract, and how tight it is.

Proposition. Let honest (cost C) be implemented against a deviation a (cost c_a, gain g = C - c_a > 0) under
pay w >= -S. Let r = min_s P_a(s)/P_h(s) over signals with P_h(s) > 0 and p = 1 - r (the one-sided
resolution; for an audit that never catches honest work, p is the catch probability). Then
E_h[w] >= max(C, g / p - S).
Proof. Incentive compatibility gives E_h[w] - E_a[w] >= g. With f = w + S >= 0, E_a[f] >= r E_h[f] (the ratio
bound, plus mass of P_a off the support of P_h only adds), so g <= E_h[f] - E_a[f] <= p E_h[f], i.e.
E_h[w] = E_h[f] - S >= g/p - S. Individual rationality gives E_h[w] >= C. QED. Over several deviations take
the largest bound. Run from here:  PYTHONPATH=../../src python3 h5.py  (writes h5.json, h5.txt)."""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "frontier"))
from vtm.contract import optimal_contract  # noqa: E402
import analyse as fr  # noqa: E402  (the measured actions and the audit and score signal builders)


def bound(P, c, S, target=0):
    """Largest one-sided-resolution bound over the deviations; also IR (cost >= c_target)."""
    L = c[target]
    for a in range(len(c)):
        g = c[target] - c[a]
        if a == target or g <= 0:
            continue
        mask = P[target] > 0
        r = float(np.min(P[a][mask] / P[target][mask]))
        p = 1 - r
        L = max(L, g / p - S if p > 1e-12 else np.inf)
    return L


def main():
    rng = np.random.default_rng(5)
    lines, out = [], {}
    worst, viol, n_tight, n = 0.0, 0, 0, 0
    for _ in range(3000):
        k, m = int(rng.integers(2, 5)), int(rng.integers(2, 6))
        P = rng.dirichlet(np.ones(m) * rng.choice([0.3, 1.0]), size=k)
        c = np.sort(rng.uniform(0.1, 1.0, k))[::-1]  # target 0 is the costliest
        c[0] = 1.0
        S = float(rng.choice([0.0, 0.5, 2.0]))
        lp, _ = optimal_contract(P, c, 0, stake=S)
        if not np.isfinite(lp):
            continue
        L = bound(P, c, S)
        n += 1
        viol += lp < L - 1e-7
        worst = max(worst, lp / L)
        n_tight += abs(lp - L) < 1e-6 * max(1, lp)
    lines.append(f"== A. random instances (2-4 actions, 2-5 signals): LP optimum vs bound, {n} feasible instances")
    lines.append(f"bound violated by the LP: {viol}; LP equals bound: {n_tight}; largest LP/bound: {worst:.2f}")
    out["random"] = {"n": n, "violations": int(viol), "tight": int(n_tight), "max_ratio": worst}
    # two actions, binary audit: exact
    err = 0.0
    for _ in range(500):
        g, p, S = rng.uniform(0.02, 0.98), rng.uniform(0.02, 1), float(rng.choice([0, 0.5, 2]))
        P = np.array([[1, 0], [1 - p, p]])
        lp, _ = optimal_contract(P, np.array([1.0, 1 - g]), 0, stake=S)
        err = max(err, abs(lp - max(1.0, g / p - S)))
    lines.append(f"two actions, binary audit: max |LP - max(C, g/p - S)| = {err:.2e}")
    out["binary_err"] = err
    # measured skip actions, audit only and joint with score
    lines.append("")
    lines.append("== B. measured skip actions (tau = 0 audit, m audited steps): LP vs bound, S = 1")
    lines.append("m      audit_LP   bound   LP/bound")
    rows = []
    for m in (1, 3, 10, 100, 1500):
        P = fr.build("audit", 0, m, fr.ACT["n_test"])
        lp, _ = optimal_contract(P, fr.COST, 0, stake=1.0)
        L = bound(P, fr.COST, 1.0)
        rows.append({"m": m, "lp": lp, "bound": L})
        lines.append(f"{m:5} {lp:10.3f} {L:8.3f} {lp / L:8.3f}")
    out["audit"] = rows
    lines.append("")
    lines.append("== C. same actions, Gaussian score only (n_test = 540): the bound is vacuous")
    P = fr.build("score", None, 0, fr.ACT["n_test"])
    lp, _ = optimal_contract(P, fr.COST, 0, stake=1.0)
    L = bound(P, fr.COST, 1.0)
    lines.append(f"score LP {lp:.3f}, one-sided bound {L:.3f} (the Gaussian ratio reaches ~0 in the tail, so p ~ 1 and the bound is the IR floor)")
    out["score"] = {"lp": lp, "bound": L}
    open(os.path.join(HERE, "h5.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(HERE, "h5.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
