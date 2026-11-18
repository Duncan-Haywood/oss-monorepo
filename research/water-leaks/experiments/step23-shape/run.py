"""Step 23: on step 21's demand-oracle residual D and its tracker, fit each recently dated atom's
daily flow with a one-change step and a one-change ramp, time its change by its shape, and pick
the atom whose change is timed nearest the alarm.

    PYTHONPATH=src python experiments/step23-shape/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-17, step 23) before any shape fit of a tracked atom was computed.
D, the tracker and the candidate set are steps 21 and 22's exactly (rebuilt here from the same
caches); only the estimate changes: `localise.shape_timed`. Needs wntr and scipy, as step 21.
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

    ref21 = step21._tsv(EXP / "step21-tracker-d" / "leaks.tsv")
    ref22 = step21._tsv(EXP / "step22-steepest" / "leaks.tsv")
    ref15 = step21._tsv(EXP / "step15-oracle" / "leaks.tsv")
    first_scored = hrs[(step15.G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref22), "leak set differs from step 22"

    dpipe = {}
    for pipe in flows:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])

    def err(pipe, j):
        return math.inf if j is None else float(dpipe[pipe][j])

    out_T, _ = localise.track(step21.daily(D), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)

    rules = {"C30": dict(window=30), "C30start": dict(window=30, half=False),
             "C30step": dict(window=30, force="step"), "C30ramp": dict(window=30, force="ramp"),
             "C14": dict(window=14), "C60": dict(window=60)}
    rows = []
    for i, t in items:
        pipe = events[i][0]
        k = t // 24 + 1
        alarm = t / 24
        st = out_T[k]
        kind = ref22[pipe]["kind"]
        row = {"pipe": pipe, "t": hrs[t], "kind": kind, "pi": float(ref15[pipe]["p_chance"]), "k": k}
        for name, kw in rules.items():
            j, info = localise.shape_timed(out_T, k, alarm, **kw)
            row[name] = err(pipe, j)
            if name == "C30":
                near = [c for c in info if dpipe[pipe][c] <= RADIUS]
                if near:
                    c = min(near, key=lambda c: (dpipe[pipe][c], c))
                    row["near_shape"] = info[c][0]
                    row["near_dt"] = info[c][1] - alarm
                else:
                    row["near_shape"], row["near_dt"] = "-", math.nan
                row["pick_shape"] = info[j][0] if j in info else "-"
                row["n_ramp"] = sum(1 for v in info.values() if v[0] == "ramp")
                row["n_cand"] = len(info)
        row["S30re"] = err(pipe, localise.steepest_dated(out_T, k, 30, 14))
        for kk in ("S30", "TD", "d1", "or17"):
            row[kk] = float(ref22[pipe][kk])
        rows.append(row)
    assert all(abs(w["S30re"] - w["S30"]) < 0.5 or (math.isinf(w["S30re"]) and math.isinf(w["S30"])) for w in rows), \
        "the rebuilt tracker differs from step 22's"

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    keys = list(rules) + ["S30", "TD", "d1", "or17"]
    hit = {kk: np.array([w[kk] for w in rows]) <= RADIUS for kk in keys}
    out = ["# water-leaks step 23: step 21's tracker on the demand-oracle residual D, unchanged; candidates = atoms",
           "# active on day k with onset in [k - 30, k]; each candidate's daily flow over [k - 29, k] fitted by a",
           "# one-change step or ramp; estimate = the candidate whose change (step: its day; ramp: its half-level day)",
           "# is nearest the alarm t/24 (fallback: latest onset); rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "", "## within 300 m (P(chance >=); median error m)"]

    def line(lab, kk):
        h = hit[kk]
        d = np.array([w[kk] for w in rows])
        return (f"  {lab:<44} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, kk in (("C30, primary", "C30"), ("ref: S30 steepest (step 22)", "S30"),
                    ("ref: T-D latest onset (step 21)", "TD"), ("ref: A on D1 regression (step 11)", "d1"),
                    ("ref: one-leak oracle (step 17)", "or17")):
        out.append(line(lab, kk))
    out += ["", "## variants (no verdicts)"]
    for lab, kk in (("C30-start (change = start for both shapes)", "C30start"),
                    ("C30-step (every candidate a step)", "C30step"), ("C30-ramp (every candidate a ramp)", "C30ramp"),
                    ("C14 (onset within 14 days)", "C14"), ("C60 (onset within 60 days)", "C60")):
        out.append(line(lab, kk))
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_ in (("C30", "TD"), ("C30", "S30"), ("C30", "d1"), ("C30", "C30start"), ("C30", "or17")):
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {a_} only {x}, {b_} only {y}: P = {p:.3f}")
    union = hit["S30"] | hit["TD"]
    out.append(f"  for reference: S30 or T-D hits {int(union.sum())}; C30 hits {int((hit['C30'] & union).sum())} of those"
               f" and {int((hit['C30'] & ~union).sum())} others")

    has = [w for w in rows if w["near_shape"] != "-"]
    match = [w for w in has if (w["near_shape"] == "step") == (w["kind"] == "abrupt")]
    ab = [w for w in has if w["kind"] == "abrupt"]
    ic = [w for w in has if w["kind"] == "incipient"]
    dts = np.array([w["near_dt"] for w in has])
    nr = np.array([w["n_ramp"] for w in rows])
    nc = np.array([w["n_cand"] for w in rows])
    out += ["", "## shapes (C30's fits)",
            f"  candidates per leak median {np.median(nc):.0f}, of which ramps median {np.median(nr):.0f}",
            f"  a candidate within 300 m: {len(has)} of {n}; its fitted shape matches the leak type for {len(match)}",
            f"    abrupt fitted step {sum(1 for w in ab if w['near_shape'] == 'step')} of {len(ab)};"
            f" incipient fitted ramp {sum(1 for w in ic if w['near_shape'] == 'ramp')} of {len(ic)}",
            f"  its change time minus the alarm, days: median {np.median(dts):+.1f}, |.| median {np.median(np.abs(dts)):.1f}"
            f" (abrupt {np.median([w['near_dt'] for w in ab]):+.1f}, incipient {np.median([w['near_dt'] for w in ic]):+.1f})"]
    out += ["", "  pipe  kind       t                 |  k  |  C30 |  S30 |  T-D | cand | ramps | near shape, dt | pick"]
    for w in rows:
        nd = "-" if w["near_shape"] == "-" else f"{w['near_shape']}, {w['near_dt']:+.1f}"
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} | {w['k']:3d} | {w['C30']:4.0f} | {w['S30']:4.0f} |"
                   f" {w['TD']:4.0f} | {w['n_cand']:4d} | {w['n_ramp']:5d} | {nd:<14} | {w['pick_shape']}")
    h, hi, ha = int(hit["C30"].sum()), int(hit["C30"][inc].sum()), int(hit["C30"][~inc].sum())
    x, y, p = tests[("C30", "TD")]
    out += ["", "## pre-registered predictions (LOG.md, step 23 plan)",
            f"  (a) C30 puts more than 14 of 32 within 300 m: {h}: {'HELD' if h > 14 else 'FAILED'}",
            f"  (b) C30 keeps at least 10 of 15 abrupt leaks: {ha}: {'HELD' if ha >= 10 else 'FAILED'}",
            f"  (c) C30 puts at least 6 of 17 incipient leaks within 300 m: {hi}: {'HELD' if hi >= 6 else 'FAILED'}",
            f"  (d) the near candidate's shape matches the leak type for at least 15 of the {len(has)}: {len(match)}:"
            f" {'HELD' if len(match) >= 15 else 'FAILED'}",
            f"  (e) C30 beats T-D at P < 0.05: C30 only {x}, T-D only {y}, P = {p:.3f}: {'HELD' if (p < 0.05 and x > y) else 'FAILED'}"]
    cols = ["pipe", "kind", "t", "k"] + keys + ["n_cand", "n_ramp", "near_shape", "near_dt", "pick_shape"]
    tsv = ["\t".join(cols)]
    for w in rows:
        tsv.append("\t".join(str(w[c]) if isinstance(w[c], (str, int)) or c == "t" else f"{w[c]:.4g}" for c in cols))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
