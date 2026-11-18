"""Step 24: on step 21's demand-oracle residual D and its tracker, let each recently dated atom's
fitted shape (step 23's `shape_fit`) choose the score: the steepest fitted ramp when one exists,
otherwise the newest atom.

    PYTHONPATH=src python experiments/step24-shape-chosen/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-17, step 24) before any output of this rule was computed. D, the
tracker, the candidate set and the fits are steps 21 to 23's exactly (rebuilt here from the same
caches); only the estimate changes: `localise.shape_chosen`. Needs wntr and scipy, as step 21.
Deterministic. Writes results.txt and leaks.tsv next to this file.
"""
from __future__ import annotations

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

    ref23 = step21._tsv(EXP / "step23-shape" / "leaks.tsv")
    ref15 = step21._tsv(EXP / "step15-oracle" / "leaks.tsv")
    first_scored = hrs[(step15.G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref23), "leak set differs from step 23"

    dpipe = {}
    for pipe in flows:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])

    def err(pipe, j):
        return math.inf if j is None else float(dpipe[pipe][j])

    out_T, _ = localise.track(step21.daily(D), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)

    rules = {"R30": dict(window=30), "R30S": dict(window=30, score="ls"), "R30L": dict(window=30, score="level"),
             "R14": dict(window=14), "R60": dict(window=60)}
    rows = []
    for i, t in items:
        pipe = events[i][0]
        k = t // 24 + 1
        kind = ref23[pipe]["kind"]
        row = {"pipe": pipe, "t": hrs[t], "kind": kind, "pi": float(ref15[pipe]["p_chance"]), "k": k}
        for name, kw in rules.items():
            j, info = localise.shape_chosen(out_T, k, **kw)
            row[name] = err(pipe, j)
            if name == "R30":
                ramps = [c for c in info if info[c][0] == "ramp"]
                row["n_cand"], row["n_ramp"] = len(info), len(ramps)
                row["near_ramp"] = int(any(dpipe[pipe][c] <= RADIUS for c in ramps))
                row["pick_shape"] = info[j][0] if j in info else "-"
                row["pick_b"] = info[j][2] if j in info else math.nan
        row["C30re"] = err(pipe, localise.shape_timed(out_T, k, t / 24, window=30)[0])
        for kk in ("C30", "S30", "TD", "d1", "or17"):
            row[kk] = float(ref23[pipe][kk])
        rows.append(row)
    assert all(abs(w["C30re"] - w["C30"]) < 0.5 or (math.isinf(w["C30re"]) and math.isinf(w["C30"])) for w in rows), \
        "the rebuilt tracker differs from step 23's"

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    keys = list(rules) + ["C30", "S30", "TD", "d1", "or17"]
    hit = {kk: np.array([w[kk] for w in rows]) <= RADIUS for kk in keys}
    out = ["# water-leaks step 24: step 21's tracker on the demand-oracle residual D, unchanged; candidates = atoms",
           "# active on day k with onset in [k - 30, k], each fitted over [k - 29, k] by step 23's step-or-ramp fit;",
           "# estimate = the ramp with the largest fitted slope if any candidate is a ramp, else the latest onset;",
           "# rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "", "## within 300 m (P(chance >=); median error m)"]

    def line(lab, kk):
        h = hit[kk]
        d = np.array([w[kk] for w in rows])
        return (f"  {lab:<44} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, kk in (("R30, primary", "R30"), ("ref: C30 shape-timed (step 23)", "C30"),
                    ("ref: S30 steepest (step 22)", "S30"), ("ref: T-D latest onset (step 21)", "TD"),
                    ("ref: A on D1 regression (step 11)", "d1"), ("ref: one-leak oracle (step 17)", "or17")):
        out.append(line(lab, kk))
    out += ["", "## variants (no verdicts)"]
    for lab, kk in (("R30-S (ramp by 14-day least-squares slope)", "R30S"),
                    ("R30-L (ramp by fitted level on day k)", "R30L"),
                    ("R14 (onset within 14 days)", "R14"), ("R60 (onset within 60 days)", "R60")):
        out.append(line(lab, kk))
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_ in (("R30", "TD"), ("R30", "S30"), ("R30", "C30"), ("R30", "d1"), ("R30", "or17")):
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {a_} only {x}, {b_} only {y}: P = {p:.3f}")
    union = hit["S30"] | hit["TD"]
    out.append(f"  for reference: S30 or T-D hits {int(union.sum())}; R30 hits {int((hit['R30'] & union).sum())} of those"
               f" and {int((hit['R30'] & ~union).sum())} others")

    nr = np.array([w["n_ramp"] for w in rows])
    has_r = np.array([w["n_ramp"] > 0 for w in rows])
    near_r = np.array([w["near_ramp"] == 1 for w in rows])
    out += ["", "## where the shape decides",
            f"  leaks with a ramp candidate {int(has_r.sum())} of {n} (median ramps {np.median(nr):.0f});"
            f" R30 hits {int(hit['R30'][has_r].sum())} of them (T-D {int(hit['TD'][has_r].sum())})",
            f"  leaks with no ramp candidate {int((~has_r).sum())}; R30 hits {int(hit['R30'][~has_r].sum())}"
            f" (T-D {int(hit['TD'][~has_r].sum())}; equal by construction)",
            f"  leaks with a ramp candidate within 300 m {int(near_r.sum())}"
            f" (abrupt {int(near_r[~inc].sum())}, incipient {int(near_r[inc].sum())}); R30 within 300 m for {int(hit['R30'][near_r].sum())}"]
    out += ["", "  pipe  kind       t                 |  k  |  R30 |  C30 |  S30 |  T-D | cand | ramps | near ramp | pick, b"]
    for w in rows:
        pb = w["pick_shape"] if w["pick_shape"] != "ramp" else f"ramp, {w['pick_b']:.2f}"
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} | {w['k']:3d} | {w['R30']:4.0f} | {w['C30']:4.0f} |"
                   f" {w['S30']:4.0f} | {w['TD']:4.0f} | {w['n_cand']:4d} | {w['n_ramp']:5d} | {'yes' if w['near_ramp'] else 'no':<9} | {pb}")
    h, hi, ha = int(hit["R30"].sum()), int(hit["R30"][inc].sum()), int(hit["R30"][~inc].sum())
    hn = int(hit["R30"][near_r].sum())
    x, y, p = tests[("R30", "TD")]
    out += ["", "## pre-registered predictions (LOG.md, step 24 plan)",
            f"  (a) R30 puts more than 14 of 32 within 300 m: {h}: {'HELD' if h > 14 else 'FAILED'}",
            f"  (b) R30 puts at least 6 of 17 incipient leaks within 300 m: {hi}: {'HELD' if hi >= 6 else 'FAILED'}",
            f"  (c) R30 keeps at least 9 of 15 abrupt leaks: {ha}: {'HELD' if ha >= 9 else 'FAILED'}",
            f"  (d) of the leaks with a ramp candidate within 300 m ({int(near_r.sum())}; the plan counted 13 from step 23's"
            f" nearest-candidate shapes), R30 within 300 m for at least 9: {hn}: {'HELD' if hn >= 9 else 'FAILED'}",
            f"  (e) R30 beats T-D at P < 0.05: R30 only {x}, T-D only {y}, P = {p:.3f}: {'HELD' if (p < 0.05 and x > y) else 'FAILED'}"]
    cols = ["pipe", "kind", "t", "k"] + keys + ["n_cand", "n_ramp", "near_ramp", "pick_shape", "pick_b"]
    tsv = ["\t".join(cols)]
    for w in rows:
        tsv.append("\t".join(str(w[c]) if isinstance(w[c], (str, int)) or c == "t" else f"{w[c]:.4g}" for c in cols))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
