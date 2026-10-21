"""Design-level bootstrap of the spread-against-random gap; writes results.txt and results.json.

    python experiments/run.py [splits] [draws] [boot]    # default 40 splits per family, 20 random draws, 2000 resamples

eda-adaptci resampled (family, split) cells, which reuse the same ~33 designs per family, so its interval measured
split noise only. Here the unit resampled is the design: in each replicate every family's designs are redrawn with
replacement, a design drawn m times counts m times in every split's test set it belongs to (m = 0 drops it), and the
cell's median APE and the gap are recomputed; the replicate's statistic is the median gap over all cells. That
asks how the lead moves if the family had been a different sample of designs from the same generator. Pool designs
are not resampled (the choosers see the real pool).
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adaptdesign import models, pick  # noqa: E402

KINDS = ("linear", "ridge")
WEIGHT = 5.0
COMPARE = ("spread", "extremes")


def wmedian_gap(test, a_s, a_r, mult):
    """Median-APE gap (spread minus random) on a test set where design i counts mult[i] times."""
    m = mult[test]
    if m.sum() == 0:
        return np.nan
    return float(np.median(np.repeat(a_s, m)) - np.median(np.repeat(a_r, m)))


def design_boot(cells, fam, fams, boot, rs):
    """cells: list of (family, test_idx, ape_chooser, ape_random). Returns point median gap and 95% interval (percentage points)."""
    point = 100 * np.median([wmedian_gap(t, a, r, np.ones(len(fam), int)) for _, t, a, r in cells])
    reps = []
    for _ in range(boot):
        mult = np.zeros(len(fam), int)
        for h in fams:
            idx = np.where(fam == h)[0]
            np.add.at(mult, rs.choice(idx, size=len(idx)), 1)
        g = [wmedian_gap(t, a, r, mult) for _, t, a, r in cells]
        reps.append(100 * np.nanmedian(g))
    return float(point), float(np.percentile(reps, 2.5)), float(np.percentile(reps, 97.5))


def main():
    nsp = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    draws = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    boot = int(sys.argv[3]) if len(sys.argv) > 3 else 2000
    rows = models.load(os.path.join(HERE, "dataset.jsonl"))
    X, y, names = models.matrix(rows)
    fam = np.array([r["family"] for r in rows])
    fams = sorted(set(fam))
    rb = np.random.RandomState(7)
    out = [f"Yosys: {rows[0]['yosys']}; designs: {len(rows)}; {len(fams)} families x {nsp} splits; weight {WEIGHT:g}; random = per-design median APE over {draws} draws; {boot} design-level bootstrap replicates."]
    js = {}
    for kind in KINDS:
        for s in COMPARE:
            out.append(f"\n== {kind}, {s} vs random: median gap in percentage points (negative = {s} better); 'cell' = eda-adaptci split bootstrap, 'design' = design-level bootstrap, both 95% ==")
            out.append("k gap | design_lo design_hi | cell_lo cell_hi | per-family design interval: " + " ".join(fams))
            for k in pick.K_GRID:
                cells, fcells = [], {h: [] for h in fams}
                for h in fams:
                    for sp in range(nsp):
                        rs = np.random.RandomState(1000 * sp + k)
                        ar = []
                        for _ in range(draws):
                            test, a = pick.score_apes(X, y, fam, names, h, kind, "random", k, WEIGHT, sp, rs)
                            ar.append(a)
                        ar = np.median(ar, axis=0)
                        _, a_s = pick.score_apes(X, y, fam, names, h, kind, s, k, WEIGHT, sp)
                        c = (h, test, a_s, ar)
                        cells.append(c)
                        fcells[h].append(c)
                m, lo, hi = design_boot(cells, fam, fams, boot, rb)
                gaps = [100 * wmedian_gap(t, a, r, np.ones(len(fam), int)) for _, t, a, r in cells]
                clo, chi = (float(v) for v in np.percentile([np.median(rb.choice(gaps, len(gaps))) for _ in range(2000)], [2.5, 97.5]))
                per = []
                for h in fams:
                    _, flo, fhi = design_boot(fcells[h], fam, [h], max(boot // 4, 200), rb)
                    per.append(f"[{flo:.1f},{fhi:.1f}]")
                out.append(f"{k} {m:.2f} | {lo:.2f} {hi:.2f} | {clo:.2f} {chi:.2f} | " + " ".join(per))
                js[f"{kind}/{s}/{k}"] = {"gap": m, "design_lo": lo, "design_hi": hi, "cell_lo": clo, "cell_hi": chi}
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(js, f)
    print("\n".join(out))


if __name__ == "__main__":
    main()
