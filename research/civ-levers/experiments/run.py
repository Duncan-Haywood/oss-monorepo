"""Sweep every lever over dose, tolerance eps and rejection threshold tau; write results.txt.

    PYTHONPATH=src python3 experiments/run.py        # about 2 minutes on 4 cores

Each cell is the mean over SEEDS societies (n = 1000, mean degree 10, 5% cross-camp ties,
camps uniform on 0.2 +/- 0.15 and 0.8 +/- 0.15, mu = 0.3, 400 sweeps).
"""
import math
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from civ_levers.levers import outcome  # noqa: E402

SEEDS = 10
EPS = (0.2, 0.25, 0.3, 0.35, 0.4)
TAU = (math.inf, 0.9, 0.8, 0.7, 0.6)
DOSES = {
    "none": (0,),
    "bridge": (0.1, 0.25, 0.5),
    "broadcast": (0.05, 0.1, 0.2),
    "moderates": (0.05, 0.1, 0.2),
    "ladder": (0.05, 0.1, 0.2),
    "nudge": (0.1, 0.2, 0.4),
    "tolerance": (0.05, 0.1, 0.2),
}
CELLS = [(lv, d, e, t) for lv, ds in DOSES.items() for d in ds for e in EPS for t in TAU]


def cell(c):
    lv, d, e, t = c
    ms = [outcome(lv, d, e, t, seed=s) for s in range(SEEDS)]
    return c, {k: float(np.mean([m[k] for m in ms])) for k in ms[0]}, sum(m["gap"] < 0.1 for m in ms)


DESIGN = (0.2, 0.3, 0.4)


def ladder_cell(c):
    e, d, t = c
    return sum(outcome("ladder", 0.1, e, t, seed=s, design_eps=d)["gap"] < 0.1 for s in range(SEEDS))


def fmt_tau(t):
    return "inf" if math.isinf(t) else f"{t:.2f}"


def main():
    with Pool() as p:
        res = p.map(cell, CELLS)
        ecells = [(e, d, t) for e in EPS for d in DESIGN for t in (math.inf, 0.7)]
        E = dict(zip(ecells, p.map(ladder_cell, ecells)))
    R = {c: (m, k) for c, m, k in res}
    out = ["civ-levers results (written by experiments/run.py; do not edit by hand)",
           f"n = 1000, mean degree 10, cross-camp ties 5%, mu = 0.3, 400 sweeps, {SEEDS} seeds per cell",
           "gap = |mean opinion camp 1 - camp 0| (0 = merged, 0.6 = start, 1 = opposite extremes)",
           "ext = share of people within 0.05 of 0 or 1; merged = seeds out of 10 that end with gap < 0.1", ""]
    out.append("== A. Full table: lever dose eps tau gap ext merged")
    for c in CELLS:
        m, k = R[c]
        out.append(f"{c[0]:<10} {c[1]:<5} {c[2]:<5} {fmt_tau(c[3]):<5} {m['gap']:.3f} {m['extreme']:.3f} {k}")
    out.append("")
    # B: bridging against tau, eps = 0.3 (the backfire curve)
    out.append("== B. bridging at eps 0.30: tau then extreme share for bridge doses 0, 0.1, 0.25, 0.5")
    for t in TAU[1:]:
        row = [R[("none", 0, 0.3, t)][0]["extreme"]] + [R[("bridge", d, 0.3, t)][0]["extreme"] for d in DOSES["bridge"]]
        out.append(f"{t:.2f} " + " ".join(f"{v:.3f}" for v in row))
    out.append("")
    # C: least dose that merges at least 9 of 10 seeds, per lever, eps and tau
    out.append("== C. least dose that merges >= 9 of 10 societies ('-' = no dose tried does)")
    out.append("lever      eps   " + " ".join(f"tau={fmt_tau(t):<5}" for t in TAU))
    for lv, ds in DOSES.items():
        if lv == "none":
            continue
        for e in EPS:
            cells = []
            for t in TAU:
                ok = [d for d in ds if R[(lv, d, e, t)][1] >= 9]
                cells.append(f"{ok[0] if ok else '-':<9}")
            out.append(f"{lv:<10} {e:<5} " + " ".join(cells))
    out.append("")
    # D: count of (eps, tau) settings where each lever at its top dose merges / pushes to extremes
    out.append("== D. lever at its largest dose, over all 25 (eps, tau) settings: merged, made worse, no change")
    for lv, ds in DOSES.items():
        if lv == "none":
            continue
        merged = worse = 0
        for e in EPS:
            for t in TAU:
                m, k = R[(lv, ds[-1], e, t)]
                b = R[("none", 0, e, t)][0]
                merged += k >= 9
                worse += m["extreme"] > b["extreme"] + 0.1
        out.append(f"{lv:<10} dose {ds[-1]:<5} merged {merged:>2}  more-extreme {worse:>2}  of 25")
    # E: a ladder spaced for the wrong tolerance (dose 0.1)
    out.append("== E. ladder (dose 0.1) spaced for design eps, against true eps: merged of 10 at tau inf / tau 0.7")
    out.append("true_eps " + " ".join(f"design={d:<9}" for d in DESIGN))
    for e in EPS:
        out.append(f"{e:<8} " + " ".join(f"{E[(e, d, math.inf)]:>2} / {E[(e, d, 0.7)]:<9}" for d in DESIGN))
    out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out[-75:]))


if __name__ == "__main__":
    main()
