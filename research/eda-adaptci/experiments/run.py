"""Bootstrap intervals for the spread-against-random gap; writes results.txt and results.json.

    python experiments/run.py [splits] [draws]    # default 40 splits per family, 20 random draws

For each (family, split) cell the paired gap is APE(spread) - APE(random), both scored on the same fixed test set
(eda-adaptfixed's protocol, copied). Cells are resampled with replacement 5000 times for a 95% percentile interval of
the median gap and of the median-APE ratio. Splits of one family reuse the same designs, so the interval reflects
the random split, not a new population of designs; the per-family rows show whether one family drives the result.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adaptci import models, pick  # noqa: E402

KINDS = ("linear", "ridge")
WEIGHT = 5.0
COMPARE = ("spread", "extremes")
BOOT = 5000


def boot_ci(v, rs, stat=np.median):
    v = np.asarray(v, float)
    s = [stat(v[rs.randint(0, len(v), len(v))]) for _ in range(BOOT)]
    return float(stat(v)), float(np.percentile(s, 2.5)), float(np.percentile(s, 97.5))


def main():
    nsp = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    draws = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    rows = models.load(os.path.join(HERE, "dataset.jsonl"))
    X, y, names = models.matrix(rows)
    fam = np.array([r["family"] for r in rows])
    fams = sorted(set(fam))
    cells = {}
    for kind in KINDS:
        for k in pick.K_GRID:
            for h in fams:
                for sp in range(nsp):
                    rs = np.random.RandomState(1000 * sp + k)
                    r = float(np.median([pick.score(X, y, fam, names, h, kind, "random", k, WEIGHT, sp, rs) for _ in range(draws)]))
                    rec = {"random": r}
                    for s in COMPARE:
                        rec[s] = pick.score(X, y, fam, names, h, kind, s, k, WEIGHT, sp)
                    cells[f"{kind}/{k}/{h}/{sp}"] = rec
    rb = np.random.RandomState(7)
    out = [f"Yosys: {rows[0]['yosys']}; designs: {len(rows)}; {len(fams)} families x {nsp} splits (60% pool / 40% fixed test set); new-family weight {WEIGHT:g}; random = median of {draws} draws; {BOOT} bootstrap resamples of the cells."]
    js = {"cells": cells}
    for kind in KINDS:
        for s in COMPARE:
            out.append(f"\n== {kind}, {s} vs random: median gap in percentage points of APE (negative = {s} better), 95% bootstrap interval over all cells; wins = share of cells where {s} is lower ==")
            out.append("k gap lo hi wins% | per-family median gap: " + " ".join(fams))
            for k in pick.K_GRID:
                gaps = [100 * (cells[f"{kind}/{k}/{h}/{sp}"][s] - cells[f"{kind}/{k}/{h}/{sp}"]["random"]) for h in fams for sp in range(nsp)]
                m, lo, hi = boot_ci(gaps, rb)
                win = 100 * np.mean(np.array(gaps) < 0)
                perf = [float(np.median([100 * (cells[f"{kind}/{k}/{h}/{sp}"][s] - cells[f"{kind}/{k}/{h}/{sp}"]["random"]) for sp in range(nsp)])) for h in fams]
                out.append(f"{k} {m:.2f} {lo:.2f} {hi:.2f} {win:.0f} | " + " ".join(f"{p:.2f}" for p in perf))
                js[f"{kind}/{s}/{k}"] = {"gap": m, "lo": lo, "hi": hi, "wins": win, "per_family": perf}
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(js, f)
    print("\n".join(out))


if __name__ == "__main__":
    main()
