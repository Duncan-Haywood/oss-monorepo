"""Step 18: a tracking baseline. Localise on the change against a lagged window, with no leak list.

    PYTHONPATH=src python experiments/step18-lagged/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-15, step 18) before any lagged residual was computed. Step 17's
one-leak residual is an oracle (every other leak replayed). Here the residual is the 24 h mean
pressure from the leak's localisation hour t minus the 24 h mean starting L hours earlier:
P-lag(L) on the published pressures (no model, no leak list) and D-lag(L) on published minus
step 14's leak-free run (removes demand change between the windows). Primary L = 168 h; 24, 72
and 336 h are a sweep. Localised with step 11's nominal q = 5 signatures (A) and the
most-affected sensor (M), scored by the 300 m along-pipe rule.

Needs wntr (1.5.0 used). Reuses step 14's continuous simulation cache and step 11's q = 5
signatures under $WATER_LEAKS_CACHE (simulated if absent: about 4 and 3 minutes). Deterministic.
Writes results.txt and leaks.tsv next to this file.
"""
from __future__ import annotations

import csv
import importlib.util
import math
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, localise, network, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
LAGS = (24, 72, 168, 336)
PRIMARY = 168


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step15 = _load("step15", EXP / "step15-oracle" / "run.py")
step11, step8 = step15.step11, step15.step8


def _tsv(path):
    with open(path) as f:
        return {r["pipe"]: r for r in csv.DictReader(f, delimiter="\t")}


def flow_change(flows, pipe, t, base, span=24):
    """(own mean-flow change, summed |change| of every other leak) between [base, base+span) and [t, t+span)."""
    own = float(flows[pipe][t:t + span].mean() - flows[pipe][base:base + span].mean())
    oth = sum(abs(float(q[t:t + span].mean() - q[base:base + span].mean())) for p, q in flows.items() if p != pipe)
    return own, oth


def main():
    S_ = harness.setup()
    hrs, P, events, pcols, links = (S_[k] for k in ("hrs", "P", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    lcols = data.load("Levels", 2018)[1]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    sigA = step11.load_signatures(inp, pcols, nodes, 5.0)
    flows = step8.leak_flows(hrs)

    Ps = np.round(step15.leak_free(pcols, fcols, lcols), 2)
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    _, Psh = detect.hourly(ts, Ps)
    D = P - Psh

    ref15 = _tsv(EXP / "step15-oracle" / "leaks.tsv")
    ref17 = _tsv(EXP / "step17-replay" / "leaks.tsv")
    first_scored = hrs[(step15.G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref15), "leak set differs from step 15"

    rows = []
    for i, t in items:
        pipe = events[i][0]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        gd = None
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dp = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])

        def err_M(r):
            nonlocal gd
            s = pcols[int(np.argmin(r))]
            if s in nodes:
                return float(dp[nodes.index(s)])
            return float(network.pipe_dist(links, network.graph_dist(links, s), pipe))

        row = {"pipe": pipe, "t": hrs[t], "kind": ref17[pipe]["kind"], "pi": float(ref15[pipe]["p_chance"]),
               "q": float(flows[pipe][t:t + 24].mean())}
        for lag in LAGS:
            for src, X in (("P", P), ("D", D)):
                r = localise.lagged_change(X, t, lag)
                row[f"A_{src}{lag}"] = float(dp[localise.estimate(r, sigA, "pearson")])
                row[f"M_{src}{lag}"] = err_M(r)
                if lag == PRIMARY:
                    row[f"best_{src}"] = float(np.nanmax(localise.scores(r, sigA, "pearson")))
                    row[f"min_{src}"] = float(r.min())
        oinc = D[t:t + 24].mean(axis=0) - D[on - 24:on].mean(axis=0)
        row["r_oinc"] = float(np.corrcoef(localise.lagged_change(D, t, PRIMARY), oinc)[0, 1])
        row["own168"], row["oth168"] = flow_change(flows, pipe, t, t - PRIMARY)
        row["own_on"], row["oth_on"] = flow_change(flows, pipe, t, on - 24)
        row["d1"] = float(ref15[pipe]["err_A_d1"])
        row["or17"] = float(ref17[pipe]["err_A"])
        rows.append(row)

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    hit = {k: np.array([w[k] for w in rows]) <= RADIUS for k in rows[0] if k[:2] in ("A_", "M_") or k in ("d1", "or17")}
    out = ["# water-leaks step 18: tracking baseline. Residual = 24 h mean from the localisation hour t minus the 24 h mean",
           "# from t - L; P = published pressures (no model, no leak list), D = published - leak-free L-TOWN_Real.inp run;",
           "# A = nominal L-TOWN.inp signatures at q = 5, argmax Pearson; M = most-affected sensor; rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "",
           "## within 300 m (P(chance >=); median error m), primary L = 168 h"]

    def line(lab, k):
        h = hit[k]
        d = np.array([w[k] for w in rows])
        return (f"  {lab:<36} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, k in (("A on P-lag(168), data only", "A_P168"), ("A on D-lag(168), demand removed", "A_D168"),
                   ("M on P-lag(168)", "M_P168"), ("M on D-lag(168)", "M_D168"),
                   ("ref: A on D1 regression (step 11)", "d1"), ("ref: A on one-leak oracle (step 17)", "or17")):
        out.append(line(lab, k))
    out += ["", "## sweep over the lag L (no verdicts)"]
    for lag in LAGS:
        for src in ("P", "D"):
            out.append(line(f"A on {src}-lag({lag})", f"A_{src}{lag}"))
    for lag in LAGS:
        out.append(line(f"M on P-lag({lag})", f"M_P{lag}"))

    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_, la, lb in (("A_P168", "M_P168", "A on P-lag", "M on P-lag"), ("A_P168", "d1", "A on P-lag", "A on D1"),
                           ("A_P168", "or17", "A on P-lag", "A on oracle"), ("A_D168", "A_P168", "A on D-lag", "A on P-lag")):
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {la} only {x}, {lb} only {y}: P = {p:.3f}")

    ratio168 = np.array([w["oth168"] / max(abs(w["own168"]), 1e-9) for w in rows])
    ratio_on = np.array([w["oth_on"] / max(abs(w["own_on"]), 1e-9) for w in rows])
    own_share = np.array([w["own168"] / max(w["own_on"], 1e-9) for w in rows])
    roi = np.array([w["r_oinc"] for w in rows])
    out += ["", "## contamination, from the published leak flows (m3/h; other = summed |change| of every other leak)"]
    for lab, m in (("abrupt", ~inc), ("incipient", inc), ("all", np.ones(n, bool))):
        out.append(f"  {lab:<9}: own change over 168 h median {np.median([w['own168'] for w, k in zip(rows, m) if k]):5.2f},"
                   f" others {np.median([w['oth168'] for w, k in zip(rows, m) if k]):5.2f};"
                   f" since onset own {np.median([w['own_on'] for w, k in zip(rows, m) if k]):5.2f},"
                   f" others {np.median([w['oth_on'] for w, k in zip(rows, m) if k]):5.2f};"
                   f" ratio others/own 168 h {np.median(ratio168[m]):.2f}, onset {np.median(ratio_on[m]):.2f}")
    out.append(f"  share of the leak's own change since onset left in the 168 h window: median {np.median(own_share):.2f}"
               f" (abrupt {np.median(own_share[~inc]):.2f}, incipient {np.median(own_share[inc]):.2f})")
    out.append(f"  Pearson r of D-lag(168) with O-inc: median {np.median(roi):.3f} (range {roi.min():.3f} to {roi.max():.3f})")
    bP = np.array([w["best_P"] for w in rows])
    out.append(f"  best Pearson score of A on P-lag(168): median {np.median(bP):.4f} (range {bP.min():.4f} to {bP.max():.4f})")

    out += ["", "  pipe  kind       t                 q m3/h | P168 A | D168 A | P168 M | D1 A | oracle A | own168 | oth168 | own_on | oth_on | best r P"]
    for w in rows:
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} {w['q']:6.1f} | {w['A_P168']:6.0f} | {w['A_D168']:6.0f} |"
                   f" {w['M_P168']:6.0f} | {w['d1']:4.0f} | {w['or17']:8.0f} | {w['own168']:6.2f} | {w['oth168']:6.2f} |"
                   f" {w['own_on']:6.2f} | {w['oth_on']:6.2f} | {w['best_P']:.4f}")

    hp, hd = int(hit["A_P168"].sum()), int(hit["A_D168"].sum())
    hdi = int(hit["A_D168"][inc].sum())
    x, y, p = tests[("A_P168", "M_P168")]
    out += ["", "## pre-registered predictions (LOG.md, step 18 plan)",
            f"  (a) A on P-lag(168) puts more than 15 of 32 within 300 m: {hp}: {'HELD' if hp > 15 else 'FAILED'}",
            f"  (b) A on D-lag(168) puts more than 5 of 17 incipient leaks within 300 m: {hdi}: {'HELD' if hdi > 5 else 'FAILED'}",
            f"  (c) hits(A on D-lag(168)) - hits(A on P-lag(168)) <= 3: {hd} - {hp} = {hd - hp}: {'HELD' if hd - hp <= 3 else 'FAILED'}",
            f"  (d) A on P-lag(168) puts at most 23 of 32 within 300 m: {hp}: {'HELD' if hp <= 23 else 'FAILED'}",
            f"  (e) A beats M on P-lag(168) at P < 0.05: A only {x}, M only {y}, P = {p:.3f}: {'HELD' if (p < 0.05 and x > y) else 'FAILED'}"]

    keys = ["pipe", "kind", "t", "q"] + [f"{e}_{s}{lag}" for lag in LAGS for s in ("P", "D") for e in ("A", "M")] + \
        ["d1", "or17", "own168", "oth168", "own_on", "oth_on", "best_P", "best_D", "min_P", "min_D", "r_oinc"]
    tsv = ["\t".join(keys)]
    for w in rows:
        tsv.append("\t".join(str(w[k]) if isinstance(w[k], str) else (str(w[k]) if k == "t" else f"{w[k]:.4g}") for k in keys))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
