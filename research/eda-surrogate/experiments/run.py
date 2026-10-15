"""Collect the dataset (Yosys, a few minutes at most) if absent, then fit, evaluate and write results.txt and figure.png.

    python experiments/run.py            # reuse experiments/dataset.jsonl
    python experiments/run.py --collect  # rebuild the dataset with the Yosys on PATH
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_surrogate import gen, models, synth  # noqa: E402

DATA = os.path.join(HERE, "dataset.jsonl")
OBJ_FAMILIES = ("mac", "fir")  # families with a meaningful analytic cycle count for cells x cycles
SEEDS = 10


def collect():
    ver = synth.version()
    with open(DATA, "w") as f:
        for fam, designs in gen.spaces().items():
            for params, v, cycles in designs:
                feat, ft = synth.features(v)
                cells, ff, st = synth.synth(v)
                f.write(json.dumps({"family": fam, "params": params, "cycles": cycles, "features": feat, "cells": cells,
                                    "ff": ff, "feature_seconds": round(ft, 4), "synth_seconds": round(st, 4),
                                    "yosys": ver}) + "\n")


def main():
    if "--collect" in sys.argv or not os.path.exists(DATA):
        collect()
    rows = models.load(DATA)
    X, y, names = models.matrix(rows)
    fam = np.array([r["family"] for r in rows])
    cyc = np.array([r["cycles"] for r in rows], float)
    fams = sorted(set(fam))
    out = []
    P = out.append
    P(f"Yosys: {rows[0]['yosys']}; target: generic-gate cells after `synth -flatten; abc -g {synth.GATES}`")
    P(f"designs: {len(rows)} " + ", ".join(f"{f}={int((fam == f).sum())}" for f in fams))
    P(f"cells range {int(y.min())}..{int(y.max())}; features: {len(names)} word-level counts and bit totals")
    ft, st = np.array([r["feature_seconds"] for r in rows]), np.array([r["synth_seconds"] for r in rows])
    P(f"cost per design: features {ft.mean():.3f} s, synthesis {st.mean():.3f} s (ratio {st.sum() / ft.sum():.0f}x)")

    P("\n== A. random 5-fold CV, pooled over families (10 repeats of the split; median of per-repeat median APE) ==")
    P("model   median APE   mean Spearman within family")
    oof = {}
    for k in models.KINDS:
        meds, sps = [], []
        for s in range(SEEDS):
            p = models.oof_predictions(X, y, k, seed=s)
            if s == 0:
                oof[k] = p
            meds.append(np.median(models.ape(p, y)))
            sps.append(np.mean([models.spearman(p[fam == f], y[fam == f]) for f in fams]))
        P(f"{k:7s} {np.median(meds):9.1%}   {np.mean(sps):.3f}")

    P("\n== B. leave-one-family-out (trained only on the other three families), median APE per held-out family ==")
    P("model   " + "  ".join(f"{f:>8s}" for f in fams) + "   Spearman " + " ".join(fams))
    lofo = {}
    for k in models.KINDS:
        p = models.lofo_predictions(X, y, fam, k)
        lofo[k] = p
        e = models.ape(p, y)
        sp = [models.spearman(p[fam == f], y[fam == f]) for f in fams]
        P(f"{k:7s} " + "  ".join(f"{np.median(e[fam == f]):8.1%}" for f in fams) + "   " + " ".join("  n/a" if v != v else f"{v:.2f}" for v in sp))

    P("\n== C. screening: synthesise designs in the surrogate's order of predicted cells x cycles until one is within 2% "
      "of the best (mean number of syntheses; random = mean over 2,000 orders) ==")
    P("family  pool  random  " + "  ".join(f"{k}:oof/lofo" for k in ("linear", "ridge", "gbr")))
    screen = {}
    for f in OBJ_FAMILIES:
        idx = np.where(fam == f)[0]
        obj = y[idx] * cyc[idx]
        rnd = models.random_evals_to_good(obj).mean()
        cells = []
        res = {"random": rnd}
        for k in ("linear", "ridge", "gbr"):
            a = models.evals_to_good(np.argsort(oof[k][idx] * cyc[idx], kind="mergesort"), obj)
            b = models.evals_to_good(np.argsort(lofo[k][idx] * cyc[idx], kind="mergesort"), obj)
            res[k] = (a, b)
            cells.append(f"{a:3d}/{b:3d}")
        screen[f] = res
        P(f"{f:7s} {len(idx):4d}  {rnd:6.1f}  " + "  ".join(f"{c:>14s}" for c in cells))

    P("\n== D. what the features hide: worst out-of-fold designs for gbr ==")
    e = models.ape(oof["gbr"], y)
    for i in np.argsort(-e)[:5]:
        P(f"{fam[i]} {rows[i]['params']}: true {int(y[i])}, predicted {oof['gbr'][i]:.0f} ({e[i]:.0%})")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    cols = dict(zip(fams, ["#1f77b4", "#d62728", "#2ca02c", "#9467bd"]))
    for a, (title, p) in zip(ax, (("random 5-fold CV (gbr)", oof["gbr"]), ("leave-one-family-out (gbr)", lofo["gbr"]))):
        for f in fams:
            m = fam == f
            a.scatter(y[m], p[m], s=14, c=cols[f], label=f)
        lim = [y.min() * 0.8, y.max() * 1.2]
        a.plot(lim, lim, "k--", lw=0.8)
        a.set_xscale("log"); a.set_yscale("log"); a.set_xlabel("synthesised cells"); a.set_ylabel("predicted cells")
        a.set_title(title)
    ax[0].legend()
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)


if __name__ == "__main__":
    main()
