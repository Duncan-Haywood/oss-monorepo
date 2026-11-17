"""Milestone 12, part A: do BCDJ respondents forget weak ties more than strong ones?

Milestone 11 estimated name-generator recall by Lincoln-Petersen (LP) on converse questions
(borrow from / lend to, ...), pooled over all ties. LP assumes every tie is equally catchable; if
strong ties are named more often by both ends, the pooled estimate is biased up. Here pairs of
surveyed households are stratified by a tie-strength proxy, the number of the *other* survey
questions that name the same pair, and LP is applied per stratum:

- three-question generator (union of borrowmoney, keroricego, visitgo against the union of their
  converses): strength s6 = how many of giveadvice, helpdecision, medic, rel, nonrel,
  templecompany name the pair; strata 0, 1, 2+;
- each one-question converse pair: strength = how many of the other ten questions name it;
  strata 0, 1, 2, 3+.

Stratified recall of a list = seen / sum over strata of the LP total. Village bootstrap intervals.
It also writes `data/tie_strength.json.gz`: s6 and the 12-question count for every tie of the
model network (`data/bcdj_villages.json.gz`), for part B. Archive as milestone 11 (Harvard
Dataverse doi:10.7910/DVN/U3BIHX, CC0; public mirror ftschofenig/EmergentDirectedness):

    python3 experiments/m12_strength/measure_strength.py "<path to datav4.0>"

Needs numpy and pandas. Plan in LOG.md (2026-11-17, milestone 12), written before the run.
"""
import gzip
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
VILLS = [1, 2, 3, 4, 6, 9, 12, 15, 19, 20, 21, 23, 24, 25, 29, 31, 32, 33, 36, 39, 42, 43,
         45, 46, 47, 48, 50, 51, 52, 55, 57, 59, 60, 62, 64, 65, 67, 68, 70, 71, 72, 73, 75]
PAIRS = [("borrowmoney", "lendmoney"), ("keroricego", "keroricecome"), ("visitgo", "visitcome")]
OTHER6 = ["giveadvice", "helpdecision", "medic", "rel", "nonrel", "templecompany"]
ALL12 = [q for p in PAIRS for q in p] + OTHER6
B_BOOT, SEED = 2000, 12


def strata_of(s, top):
    """Stratum index 0..top of a strength count (top = the open-ended 'top+' stratum)."""
    return np.minimum(s, top)


def stratified_counts(A, B, S, iu, top):
    """Per stratum h of S: (|A|, |B|, |A & B|) on the pairs in iu."""
    h = strata_of(S, top)
    return np.array([[int((A & iu & (h == k)).sum()), int((B & iu & (h == k)).sum()),
                      int((A & B & iu & (h == k)).sum())] for k in range(top + 1)])


def lp(c):
    """Recall of the first list, of the second, and the LP total, from (n1, n2, m)."""
    n1, n2, m = (float(x) for x in c)
    if m == 0:
        return np.nan, np.nan, np.nan
    return m / n2, m / n1, n1 * n2 / m


def stratified_recall(C):
    """C: strata x (n1, n2, m). Returns (recall of list 1, recall of list 2) as seen / sum LP."""
    N = sum(lp(c)[2] for c in C)
    return C[:, 0].sum() / N, C[:, 1].sum() / N


def village(root, v, surveyed):
    d = os.path.join(root, "Data", "1. Network Data", "Adjacency Matrices")
    M = {q: np.loadtxt(os.path.join(d, f"adj_{q}_HH_vilno_{v}.csv"), delimiter=",") > 0 for q in ALL12}
    S = surveyed[:, None] & surveyed[None, :]
    iu = np.triu(np.ones_like(S, bool), 1) & S
    s6 = sum(M[q].astype(int) for q in OTHER6)
    s12 = sum(M[q].astype(int) for q in ALL12)
    out = {}
    U1 = M["borrowmoney"] | M["keroricego"] | M["visitgo"]
    U2 = M["lendmoney"] | M["keroricecome"] | M["visitcome"]
    out["three"] = stratified_counts(U1, U2, s6, iu, 2)
    for a, b in PAIRS:
        s10 = s12 - M[a].astype(int) - M[b].astype(int)
        out[a] = stratified_counts(M[a], M[b], s10, iu, 3)
    return out, s6, s12


def main(root):
    import pandas as pd
    hh = pd.read_stata(os.path.join(root, "Data", "2. Demographics and Outcomes",
                                    "household_characteristics.dta"))
    nets = os.path.join(root, "Matlab Replication", "India Networks")
    model = json.load(gzip.open(os.path.join(ROOT, "data", "bcdj_villages.json.gz"), "rt"))
    mv = {x["village"]: x for x in model["villages"]}
    per, ties = {}, {}
    for v in VILLS:
        h = hh[hh.village == v].sort_values("adjmatrix_key")
        n = int(h.adjmatrix_key.max())
        s = np.zeros(n, bool)
        s[h.adjmatrix_key.values[h.hhSurveyed.values == 1].astype(int) - 1] = True
        c, s6, s12 = village(root, v, s)
        per[v] = c
        g = np.loadtxt(os.path.join(nets, f"inGiant{v}.csv")).astype(bool)
        e = np.array(mv[v]["edges"])
        s6g, s12g = s6[np.ix_(g, g)], s12[np.ix_(g, g)]
        assert (s12g[e[:, 0], e[:, 1]] > 0).all() and (s12g > 0).sum() == 2 * len(e), v
        ties[str(v)] = {"s6": s6g[e[:, 0], e[:, 1]].tolist(), "s12": s12g[e[:, 0], e[:, 1]].tolist()}

    rng = np.random.default_rng(SEED)
    idx = [rng.integers(0, len(VILLS), len(VILLS)) for _ in range(B_BOOT)]
    lines = ["# Milestone 12, part A: name-generator recall by tie strength (Lincoln-Petersen per stratum, "
             "pairs of surveyed households, 43 microfinance villages)",
             f"village bootstrap B = {B_BOOT} (seed {SEED}); strength = number of the other survey questions "
             "naming the pair"]
    res = {}
    for k in ["three"] + [a for a, _ in PAIRS]:
        C = np.array([per[v][k] for v in VILLS])  # villages x strata x 3
        tot = C.sum(0)
        top = tot.shape[0] - 1
        lab = [str(i) for i in range(top)] + [f"{top}+"]
        name = "three-question generator (strength over the 6 others)" if k == "three" else \
            f"{k}/{dict(PAIRS)[k]} (strength over the 10 others)"
        lines.append(f"\n## {name}")
        lines.append("  stratum: |from| |to| |both| | recall(from) [95%] | recall(to) [95%] | mean | LP total / seen")
        bt = np.array([C[i].sum(0) for i in idx])  # B x strata x 3
        rows = []
        for hh_ in range(top + 1):
            r1, r2, N = lp(tot[hh_])
            b = np.array([lp(x[hh_])[:2] for x in bt])
            lo, hi = np.nanpercentile(b, [2.5, 97.5], 0)
            seen = tot[hh_, 0] + tot[hh_, 1] - tot[hh_, 2]
            rows.append({"stratum": lab[hh_], "counts": tot[hh_].tolist(), "recall_from": [r1, lo[0], hi[0]],
                         "recall_to": [r2, lo[1], hi[1]], "mean": (r1 + r2) / 2, "lp_over_seen": N / seen})
            lines.append(f"  {lab[hh_]:>3s}: {tot[hh_, 0]:6d} {tot[hh_, 1]:6d} {tot[hh_, 2]:6d} | {r1:.3f} [{lo[0]:.3f}, "
                         f"{hi[0]:.3f}] | {r2:.3f} [{lo[1]:.3f}, {hi[1]:.3f}] | {(r1 + r2) / 2:.3f} | {N / seen:.3f}")
        p1, p2, _ = lp(tot.sum(0))
        q1, q2 = stratified_recall(tot)
        bq = np.array([np.mean(stratified_recall(x)) for x in bt])
        bp = np.array([np.mean(lp(x.sum(0))[:2]) for x in bt])
        diff = np.array([np.mean(lp(x[top])[:2]) - np.mean(lp(x[0])[:2]) for x in bt])
        d0 = rows[top]["mean"] - rows[0]["mean"]
        lines.append(f"  pooled (milestone 11): from {p1:.3f}, to {p2:.3f}, mean {(p1 + p2) / 2:.3f} "
                     f"[{np.percentile(bp, 2.5):.3f}, {np.percentile(bp, 97.5):.3f}]")
        lines.append(f"  stratified: from {q1:.3f}, to {q2:.3f}, mean {(q1 + q2) / 2:.3f} "
                     f"[{np.percentile(bq, 2.5):.3f}, {np.percentile(bq, 97.5):.3f}]")
        lines.append(f"  top stratum minus stratum 0 (mean recall): {d0:+.3f} "
                     f"[{np.percentile(diff, 2.5):+.3f}, {np.percentile(diff, 97.5):+.3f}]")
        res[k] = {"strata": rows, "pooled": [p1, p2], "stratified": [q1, q2],
                  "stratified_mean_ci": np.percentile(bq, [2.5, 97.5]).tolist(),
                  "diff_top_minus_0": [d0] + np.percentile(diff, [2.5, 97.5]).tolist()}

    t = res["three"]
    rho_h = [r["mean"] for r in t["strata"]]
    s6all = np.concatenate([np.minimum(np.array(ties[str(v)]["s6"]), 2) for v in VILLS])
    share = [float((s6all == h).mean()) for h in range(3)]
    matched = float(sum(r * w for r, w in zip(rho_h, share)))
    d25 = t["diff_top_minus_0"]
    h25 = d25[0] >= 0.10 and d25[1] > 0
    h26v = float(np.mean(t["stratified"]))
    h26 = h26v >= 0.80
    lines.append(f"\nmodel ties (giant components, 43 villages) by s6 stratum 0 / 1 / 2+: "
                 + " / ".join(f"{x:.3f}" for x in share))
    lines.append("part B recall per stratum (mean of the two lists): " + ", ".join(f"{x:.3f}" for x in rho_h)
                 + f"; tie-weighted mean over model ties (matched setting) {matched:.3f}")
    lines.append(f"H25 (stratum 2+ recall exceeds stratum 0 by >= 0.10, 95% interval above 0): "
                 f"{'held' if h25 else 'refuted'}; {d25[0]:+.3f} [{d25[1]:+.3f}, {d25[2]:+.3f}]")
    lines.append(f"H26 (stratified three-question recall >= 0.80): {'held' if h26 else 'refuted'}; {h26v:.3f} "
                 f"(pooled {np.mean(t['pooled']):.3f})")
    txt = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "strength.txt"), "w").write(txt)
    json.dump({"results": res, "rho_strata": rho_h, "tie_share": share, "matched": matched,
               "h25": d25, "h26": h26v}, open(os.path.join(HERE, "strength.json"), "w"), indent=1, default=float)
    with gzip.open(os.path.join(ROOT, "data", "tie_strength.json.gz"), "wt") as f:
        json.dump({"source": "BCDJ datav4.0 household question matrices (doi:10.7910/DVN/U3BIHX, CC0); "
                             "per tie of data/bcdj_villages.json.gz, in its edge order",
                   "s6_questions": OTHER6, "s12_questions": ALL12, "villages": ties}, f, separators=(",", ":"))
    print(txt)


if __name__ == "__main__":
    main(sys.argv[1])
