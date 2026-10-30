"""Contact that widens tolerance (civ-levers milestone 2); writes results.txt.

    PYTHONPATH=src python3 experiments/contact/run.py
"""
import math
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.contact import outcome_contact  # noqa: E402

SEEDS = 10
INF = math.inf


def wilson(k, n=SEEDS, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0, c - h), min(1, c + h)


def cell(a):
    kw = dict(a)
    ms = [outcome_contact(seed=s, **kw) for s in range(SEEDS)]
    return a, {k: float(np.mean([m[k] for m in ms])) for k in ms[0]}, sum(m["gap"] < 0.1 for m in ms)


def key(**kw):
    return tuple(sorted(kw.items()))


def main():
    cells = []
    for eps0 in (0.2, 0.25, 0.3):
        for tau, loss in ((INF, 0.0), (0.8, 0.02), (0.7, 0.02)):
            for dose in (0.1, 0.25, 0.5):
                for gain in (0.0, 0.005, 0.01, 0.02, 0.05):
                    cells.append(key(lever="bridge", dose=dose, eps0=eps0, tau=tau, gain=gain, loss=loss))
    for eps0 in (0.2, 0.25, 0.3):
        for tau, loss in ((INF, 0.0), (0.8, 0.02), (0.7, 0.02)):
            for dose in (0.1, 0.25, 0.5):
                for gain in (0.005, 0.01, 0.02, 0.05):
                    cells.append(key(lever="bridge", dose=dose, eps0=eps0, tau=tau, gain=gain, loss=loss, exposure=True))
    for q in (0.0, 0.25, 0.5, 0.75):
        for eps0 in (0.2, 0.3):
            cells.append(key(lever="moderates", dose=0.2, eps0=eps0, tau=INF, gain=0.0, identity=q))
    with Pool() as p:
        res = p.map(cell, cells)
    R = {a: (m, k) for a, m, k in res}
    out = ["civ-levers contact results (experiments/contact/run.py; do not edit by hand)",
           f"n = 1000, mean degree 10, 5% cross-camp ties, mu 0.3, 400 sweeps, eps cap 0.5, floor 0.05, {SEEDS} seeds",
           "merged = seeds of 10 with gap < 0.1 (95% Wilson interval in brackets); ext = share within 0.05 of 0 or 1; eps = mean final eps", "",
           "== A. bridging with contact-widened tolerance: eps0 tau(loss) dose | merged at gain 0, 0.005, 0.01, 0.02, 0.05"]
    for eps0 in (0.2, 0.25, 0.3):
        for tau, loss in ((INF, 0.0), (0.8, 0.02), (0.7, 0.02)):
            for dose in (0.1, 0.25, 0.5):
                row = []
                for gain in (0.0, 0.005, 0.01, 0.02, 0.05):
                    m, k = R[key(lever="bridge", dose=dose, eps0=eps0, tau=tau, gain=gain, loss=loss)]
                    lo, hi = wilson(k)
                    row.append(f"{k:>2}[{lo:.1f},{hi:.1f}] ext {m['extreme']:.2f} eps {m['eps_mean']:.2f}")
                out.append(f"{eps0:<5} {'inf' if tau == INF else tau:<4} {dose:<4} | " + " | ".join(row))
    out += ["", "== A2. same, but tolerance widens on ANY cross-camp meeting that is not repelled (exposure): merged at gain 0.005, 0.01, 0.02, 0.05"]
    for eps0 in (0.2, 0.25, 0.3):
        for tau, loss in ((INF, 0.0), (0.8, 0.02), (0.7, 0.02)):
            for dose in (0.1, 0.25, 0.5):
                row = []
                for gain in (0.005, 0.01, 0.02, 0.05):
                    m, k = R[key(lever="bridge", dose=dose, eps0=eps0, tau=tau, gain=gain, loss=loss, exposure=True)]
                    row.append(f"{k:>2} ext {m['extreme']:.2f} eps {m['eps_mean']:.2f}")
                out.append(f"{eps0:<5} {'inf' if tau == INF else tau:<4} {dose:<4} | " + " | ".join(row))
    out += ["", "== B. identity: 20% committed moderates at 0.5, no backfire: eps0 | merged at q = 0, 0.25, 0.5, 0.75"]
    for eps0 in (0.2, 0.3):
        row = []
        for q in (0.0, 0.25, 0.5, 0.75):
            m, k = R[key(lever="moderates", dose=0.2, eps0=eps0, tau=INF, gain=0.0, identity=q)]
            row.append(f"{k:>2}  gap {m['gap']:.2f}")
        out.append(f"{eps0:<5} | " + " | ".join(row))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
