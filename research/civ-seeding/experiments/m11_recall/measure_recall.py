"""Milestone 11, part A: how many ties does one BCDJ name-generator question recall?

The BCDJ household survey asked converse questions (borrow money from / lend money to; borrow
kerosene or rice from / lend it to; visit / invite home). A relationship between two surveyed
households is then captured twice, once by each end under the converse question, so on pairs
where both households were surveyed the two lists are two captures of one set and
Lincoln-Petersen gives each question's recall: recall(B) = |B & L| / |L|, recall(L) = |B & L| / |B|.
The three-question generator is the union of the three "from" questions against the union of
the three converses. Counts are pooled over villages; intervals are a village bootstrap.

Reads the archive (Harvard Dataverse doi:10.7910/DVN/U3BIHX, CC0; read from the public mirror
ftschofenig/EmergentDirectedness, `datav4.0/`, as milestone 1 did):

    python3 experiments/m11_recall/measure_recall.py "<path to datav4.0>"

Needs numpy and pandas (for the .dta household file). Writes `recall.txt` and `recall.json` here.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# the 43 microfinance villages, as in data/build_dataset.py (which needs scipy)
VILLS = [1, 2, 3, 4, 6, 9, 12, 15, 19, 20, 21, 23, 24, 25, 29, 31, 32, 33, 36, 39, 42, 43,
         45, 46, 47, 48, 50, 51, 52, 55, 57, 59, 60, 62, 64, 65, 67, 68, 70, 71, 72, 73, 75]

PAIRS = [("borrowmoney", "lendmoney"), ("keroricego", "keroricecome"), ("visitgo", "visitcome")]
B_BOOT, SEED = 2000, 11


def counts(root, v, surveyed):
    """Per question pair (and the 3-question union), on surveyed-surveyed pairs:
    (|first|, |second|, |both|)."""
    d = os.path.join(root, "Data", "1. Network Data", "Adjacency Matrices")
    S = surveyed[:, None] & surveyed[None, :]
    iu = np.triu(np.ones_like(S, bool), 1) & S
    out, U1, U2 = {}, None, None
    for a, b in PAIRS:
        A = np.loadtxt(os.path.join(d, f"adj_{a}_HH_vilno_{v}.csv"), delimiter=",") > 0
        B = np.loadtxt(os.path.join(d, f"adj_{b}_HH_vilno_{v}.csv"), delimiter=",") > 0
        assert A.shape == B.shape == S.shape
        out[a] = (int((A & iu).sum()), int((B & iu).sum()), int((A & B & iu).sum()))
        U1 = A if U1 is None else U1 | A
        U2 = B if U2 is None else U2 | B
    out["three"] = (int((U1 & iu).sum()), int((U2 & iu).sum()), int((U1 & U2 & iu).sum()))
    return out


def recall(c):
    n1, n2, m = c
    return m / n2, m / n1, n1 * n2 / m  # recall of first, of second, LP size


def main(root):
    import pandas as pd
    hh = pd.read_stata(os.path.join(root, "Data", "2. Demographics and Outcomes",
                                    "household_characteristics.dta"))
    per = {}
    for v in sorted(hh.village.unique()):
        h = hh[hh.village == v].sort_values("adjmatrix_key")
        n = int(h.adjmatrix_key.max())
        s = np.zeros(n, bool)
        s[h.adjmatrix_key.values[h.hhSurveyed.values == 1].astype(int) - 1] = True
        per[int(v)] = {"n": n, "surveyed": int(s.sum()), "c": counts(root, int(v), s)}
    keys = [a for a, _ in PAIRS] + ["three"]
    rng = np.random.default_rng(SEED)
    lines = ["# Milestone 11, part A: recall of BCDJ name-generator questions (Lincoln-Petersen on "
             "pairs of surveyed households)",
             f"village bootstrap B = {B_BOOT} (seed {SEED}); counts are undirected household ties"]
    res = {}
    for label, vs in (("43 microfinance villages", VILLS), ("all 75 villages", sorted(per))):
        lines.append(f"\n## {label}: {sum(per[v]['surveyed'] for v in vs)} surveyed of "
                     f"{sum(per[v]['n'] for v in vs)} households")
        lines.append("  pair: |from| |to| |both| | recall(from) [95%] | recall(to) [95%] | LP total / seen")
        C = {k: np.array([per[v]["c"][k] for v in vs]) for k in keys}
        res[label] = {}
        for k in keys:
            tot = C[k].sum(0)
            r1, r2, N = recall(tot)
            bs = np.array([recall(C[k][rng.integers(0, len(vs), len(vs))].sum(0)) for _ in range(B_BOOT)])
            lo, hi = np.percentile(bs[:, :2], [2.5, 97.5], 0)
            seen = tot[0] + tot[1] - tot[2]
            name = k if k == "three" else f"{k}/{dict(PAIRS)[k]}"
            lines.append(f"  {name:24s} {tot[0]:6d} {tot[1]:6d} {tot[2]:6d} | {r1:.3f} [{lo[0]:.3f}, {hi[0]:.3f}]"
                         f" | {r2:.3f} [{lo[1]:.3f}, {hi[1]:.3f}] | {N / seen:.3f}")
            res[label][k] = {"counts": tot.tolist(), "recall_from": [r1, lo[0], hi[0]],
                             "recall_to": [r2, lo[1], hi[1]], "lp_over_seen": N / seen}
        vr = np.array([recall(per[v]["c"]["three"])[:2] for v in vs])
        lines.append(f"  three-question recall across villages (mean of the two directions): "
                     f"min {vr.mean(1).min():.3f}, median {np.median(vr.mean(1)):.3f}, max {vr.mean(1).max():.3f}")
    t = res["43 microfinance villages"]["three"]
    rho = (t["recall_from"][0] + t["recall_to"][0]) / 2
    lines.append(f"\npooled three-question recall, 43 villages, mean of the two directions: {rho:.3f} "
                 f"-> grid value {round(rho * 20) / 20:.2f}")
    txt = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "recall.txt"), "w").write(txt)
    json.dump({"pooled": res, "rho3": rho, "rho_grid": round(rho * 20) / 20,
               "per_village": {str(v): per[v] for v in per}},
              open(os.path.join(HERE, "recall.json"), "w"), indent=1, default=float)
    print(txt)


if __name__ == "__main__":
    main(sys.argv[1])
