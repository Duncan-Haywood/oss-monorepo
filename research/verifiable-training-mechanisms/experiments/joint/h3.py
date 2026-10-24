"""Milestone 5, H3: does an agreement term between two redundant workers lower the cheapest contract once an
audit exists?  Random sweep over (g, p, S, delta, alpha, kappa). Writes h3.json and h3.txt.
Run from here:  PYTHONPATH=../../src python3 h3.py"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.peer import peer_cost  # noqa: E402

N = 4000
rng = np.random.default_rng(20261024)
TOL = 1e-4  # far above the 1e-6 strictness margin divided by the smallest p (0.02)


def main():
    rows = []
    for _ in range(N):
        g = rng.uniform(0.02, 0.98)
        p = rng.uniform(0.02, 1.0)
        S = float(rng.choice([0.0, 0.25, 1.0, 4.0]))
        delta = float(rng.choice([0.0, 0.01, 0.1]))
        alpha = rng.uniform(0, 1 - delta)  # a cheat agrees with an honest peer no more often than an honest worker does
        kappa = float(rng.choice([0.0, 0.5, 1.0]))
        a = peer_cost(g, p, S, delta, alpha, kappa, use_peer=False)
        v1 = peer_cost(g, p, S, delta, alpha, kappa)
        v2 = peer_cost(g, p, S, delta, alpha, kappa, use_peer=True, exclude_copying=True)
        # audit-only with the copying exclusion (the audit alone must also make (K,K) a non-equilibrium)
        a2 = peer_cost(g, p, S, delta, alpha, kappa, use_peer=False, exclude_copying=True)
        rows.append(dict(g=g, p=p, S=S, delta=delta, alpha=alpha, kappa=kappa, audit=a, peer=v1, peer_unique=v2, audit_unique=a2))
    fin = lambda x: np.isfinite(x)
    out, lines = {"n": N, "rows": rows}, []
    def stat(name, lo, hi, mask):
        m = [r for r, k in zip(rows, mask) if k and fin(r[lo]) and fin(r[hi])]
        cheaper = [r for r in m if r[hi] < r[lo] - TOL]
        dearer = [r for r in m if r[hi] > r[lo] + TOL]
        lines.append(f"{name:62} n={len(m):5} peer cheaper in {len(cheaper):5}, dearer in {len(dearer):4}, "
                     f"max saving {max([(r[lo]-r[hi])/r[lo] for r in cheaper] or [0]):.3f}")
        out[name] = {"n": len(m), "cheaper": len(cheaper), "dearer": len(dearer)}
        return cheaper, dearer
    allm = [True] * N
    lines.append("== H3: peer (agreement) contract vs audit-only contract, cost to implement honest-honest")
    stat("A. honest-honest only: peer vs audit", "audit", "peer", allm)
    for k in (0.0, 0.5, 1.0):
        stat(f"A. ... kappa={k}", "audit", "peer", [r["kappa"] == k for r in rows])
    lines.append("")
    stat("B. also exclude (cheat,cheat): peer_unique vs audit_unique", "audit_unique", "peer_unique", allm)
    for k in (0.0, 0.5, 1.0):
        stat(f"B. ... kappa={k}", "audit_unique", "peer_unique", [r["kappa"] == k for r in rows])
    lines.append("")
    stat("C. price of excluding copying with peer: peer_unique vs peer", "peer", "peer_unique", allm)
    stat("C. ... kappa=1", "peer", "peer_unique", [r["kappa"] == 1.0 for r in rows])
    open(os.path.join(HERE, "h3.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(HERE, "h3.json"), "w"))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
