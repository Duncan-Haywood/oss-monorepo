"""Step 22: on step 21's demand-oracle residual D and its tracker, pick among the recently dated
atoms the one whose fitted flow is rising fastest, instead of the newest.

    PYTHONPATH=src python experiments/step22-steepest/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-16, step 22) before any output of this rule was computed. D and the
tracker are step 21's exactly (rebuilt here from the same caches); only the estimate changes:
`localise.steepest_dated` (onset within W = 30 days, slope over 14 days). Needs wntr and scipy, as
step 21. Deterministic. Writes results.txt and leaks.tsv next to this file.
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
Q = 5.0


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step21 = _load("step21", EXP / "step21-tracker-d" / "run.py")
step15, step11, step8 = step21.step15, step21.step11, step21.step8


def main():
    S_ = harness.setup()
    hrs, P, events, pcols, links = (S_[k] for k in ("hrs", "P", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    lcols = data.load("Levels", 2018)[1]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    S = step11.load_signatures(inp, pcols, nodes, Q) / Q
    flows = step8.leak_flows(hrs)
    Ps = np.round(step15.leak_free(pcols, fcols, lcols), 2)
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    _, Psh = detect.hourly(ts, Ps)
    D = P - Psh

    ref21 = step21._tsv(EXP / "step21-tracker-d" / "leaks.tsv")
    ref15 = step21._tsv(EXP / "step15-oracle" / "leaks.tsv")
    first_scored = hrs[(step15.G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref21), "leak set differs from step 21"

    dpipe = {}
    for pipe in flows:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])

    def err(pipe, j):
        return math.inf if j is None else float(dpipe[pipe][j])

    out_T, _ = localise.track(step21.daily(D), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)

    def largest_flow(st, k, window=30):
        c = [j for j in st if st[j][1] >= k - window]
        return localise.latest_onset(st) if not c else max(c, key=lambda j: (st[j][0], -j))

    rules = {"S30": lambda k: localise.steepest_dated(out_T, k, 30, 14),
             "S14": lambda k: localise.steepest_dated(out_T, k, 14, 14),
             "S60": lambda k: localise.steepest_dated(out_T, k, 60, 14),
             "Sall": lambda k: localise.steepest_dated(out_T, k, None, 14),
             "S30s7": lambda k: localise.steepest_dated(out_T, k, 30, 7),
             "F30": lambda k: largest_flow(out_T[k], k, 30),
             "TDre": lambda k: localise.latest_onset(out_T[k])}
    rows = []
    for i, t in items:
        pipe = events[i][0]
        k = t // 24 + 1
        st = out_T[k]
        row = {"pipe": pipe, "t": hrs[t], "kind": ref21[pipe]["kind"], "pi": float(ref15[pipe]["p_chance"]), "k": k}
        for name, f in rules.items():
            row[name] = err(pipe, f(k))
        row["n_cand"] = sum(1 for j in st if st[j][1] >= k - 30)
        row["near_cand"] = sum(1 for j in st if st[j][1] >= k - 30 and dpipe[pipe][j] <= RADIUS)
        for kk in ("TD", "d1", "JF", "or17"):
            row[kk] = float(ref21[pipe][kk])
        rows.append(row)
    assert all(abs(w["TDre"] - w["TD"]) < 0.5 or (math.isinf(w["TDre"]) and math.isinf(w["TD"])) for w in rows), \
        "the rebuilt tracker differs from step 21's"

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    keys = list(rules) + ["TD", "d1", "JF", "or17"]
    hit = {kk: np.array([w[kk] for w in rows]) <= RADIUS for kk in keys}
    out = ["# water-leaks step 22: step 21's tracker on the demand-oracle residual D, unchanged; estimate = among the",
           "# active atoms on day k with onset in [k - 30, k], the one whose daily fitted flow over [k - 13, k] has the",
           "# largest least-squares slope (fallback: latest onset); rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "", "## within 300 m (P(chance >=); median error m)"]

    def line(lab, kk):
        h = hit[kk]
        d = np.array([w[kk] for w in rows])
        return (f"  {lab:<44} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, kk in (("S30, primary", "S30"), ("ref: T-D latest onset (step 21)", "TD"),
                    ("ref: A on D1 regression (step 11)", "d1"), ("ref: J on F (step 20)", "JF"),
                    ("ref: one-leak oracle (step 17)", "or17")):
        out.append(line(lab, kk))
    out += ["", "## variants (no verdicts)"]
    for lab, kk in (("S14 (onset within 14 days)", "S14"), ("S60 (within 60 days)", "S60"),
                    ("Sall (no onset limit)", "Sall"), ("S30, 7-day slope", "S30s7"),
                    ("F30 (largest flow, onset within 30 days)", "F30")):
        out.append(line(lab, kk))
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_ in (("S30", "TD"), ("S30", "d1"), ("S30", "JF"), ("S30", "F30"), ("S30", "or17")):
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {a_} only {x}, {b_} only {y}: P = {p:.3f}")
    nc = np.array([w["n_cand"] for w in rows])
    nn = np.array([w["near_cand"] for w in rows]) > 0
    out += ["", "## the candidate set (onset within 30 days) on day k",
            f"  candidates median {np.median(nc):.0f} (range {nc.min()} to {nc.max()}); empty for {int((nc == 0).sum())}",
            f"  a candidate within 300 m: abrupt {int(nn[~inc].sum())} of {int((~inc).sum())}, incipient {int(nn[inc].sum())} of {int(inc.sum())};"
            f" S30 picks it for {int((hit['S30'] & nn).sum())} of {int(nn.sum())}"]
    out += ["", "  pipe  kind       t                 |  k  |  S30 |  T-D |  F30 | cand | near"]
    for w in rows:
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} | {w['k']:3d} | {w['S30']:4.0f} | {w['TD']:4.0f} |"
                   f" {w['F30']:4.0f} | {w['n_cand']:4d} | {w['near_cand']:4d}")
    h, hi, ha = int(hit["S30"].sum()), int(hit["S30"][inc].sum()), int(hit["S30"][~inc].sum())
    x, y, p = tests[("S30", "TD")]
    out += ["", "## pre-registered predictions (LOG.md, step 22 plan)",
            f"  (a) S30 puts more than 13 of 32 within 300 m: {h}: {'HELD' if h > 13 else 'FAILED'}",
            f"  (b) S30 puts more than 3 of 17 incipient leaks within 300 m: {hi}: {'HELD' if hi > 3 else 'FAILED'}",
            f"  (c) S30 puts at least 15 of 32 within 300 m: {h}: {'HELD' if h >= 15 else 'FAILED'}",
            f"  (d) S30 keeps at least 9 of 15 abrupt leaks: {ha}: {'HELD' if ha >= 9 else 'FAILED'}",
            f"  (e) S30 beats T-D at P < 0.05: S30 only {x}, T-D only {y}, P = {p:.3f}: {'HELD' if (p < 0.05 and x > y) else 'FAILED'}"]
    cols = ["pipe", "kind", "t", "k"] + keys + ["n_cand", "near_cand"]
    tsv = ["\t".join(cols)]
    for w in rows:
        tsv.append("\t".join(str(w[c]) if isinstance(w[c], (str, int)) or c == "t" else f"{w[c]:.4g}" for c in cols))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
