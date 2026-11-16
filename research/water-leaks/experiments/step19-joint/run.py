"""Step 19: a joint multi-source fit. Model the other leaks instead of differencing them away.

    PYTHONPATH=src python experiments/step19-joint/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-16, step 19) before any joint fit was computed. D = published minus
step 14's leak-free L-TOWN_Real.inp run (a demand oracle, no leak list). The 24 h mean of D at a
baseline window is fitted by non-negative greedy pursuit over step 11's nominal q = 5 signatures
(per m3/h, centred); the 24 h mean from the leak's localisation hour t is then fitted starting from
the baseline's atoms, and the estimate is the junction whose fitted flow rose most. Primary
baseline t - 168 h (J-lag(168)); J-on uses [onset - 24 h, onset) (an oracle onset).

Needs wntr (1.5.0 used) and scipy. Reuses step 14's continuous simulation cache and step 11's q = 5
signatures under $WATER_LEAKS_CACHE (simulated if absent). Deterministic. Writes results.txt and
leaks.tsv next to this file.
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
LAGS = (24, 72, 168, 336)
PRIMARY = 168
RELS = (0.02, 0.05, 0.10)
REL = 0.05
RUNNING = 1.0   # m3/h, mean over the window


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


def joint(D, t, base, S, rel):
    """(estimate index, window support, window flows, window RMS) for baseline hour `base`."""
    rb = D[base:base + 24].mean(axis=0)
    rt = D[t:t + 24].mean(axis=0)
    sb, xb, _ = localise.nn_pursuit(rb, S, rel=rel)
    st, xt, rms = localise.nn_pursuit(rt, S, support=sb, rel=rel)
    if not st and not sb:
        return None, st, xt, rms
    return localise.rise(sb, xb, st, xt), st, xt, rms


def main():
    S_ = harness.setup()
    hrs, P, events, pcols, links = (S_[k] for k in ("hrs", "P", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    lcols = data.load("Levels", 2018)[1]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    sigA = step11.load_signatures(inp, pcols, nodes, Q)
    S = sigA / Q                       # per m3/h
    flows = step8.leak_flows(hrs)

    Ps = np.round(step15.leak_free(pcols, fcols, lcols), 2)
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    _, Psh = detect.hourly(ts, Ps)
    D = P - Psh

    ref15 = _tsv(EXP / "step15-oracle" / "leaks.tsv")
    ref17 = _tsv(EXP / "step17-replay" / "leaks.tsv")
    ref18 = _tsv(EXP / "step18-lagged" / "leaks.tsv")
    first_scored = hrs[(step15.G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref15), "leak set differs from step 15"

    dpipe = {}
    for pipe in flows:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])

    def err(pipe, j):
        return math.inf if j is None else float(dpipe[pipe][j])

    rows = []
    for i, t in items:
        pipe = events[i][0]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        row = {"pipe": pipe, "t": hrs[t], "kind": ref17[pipe]["kind"], "pi": float(ref15[pipe]["p_chance"]),
               "q": float(flows[pipe][t:t + 24].mean())}
        for rel in RELS:
            for lag in LAGS:
                if rel != REL and lag != PRIMARY:
                    continue
                j, st, xt, rms = joint(D, t, t - lag, S, rel)
                key = f"J{lag}" + ("" if rel == REL else f"_r{int(rel * 100)}")
                row[key] = err(pipe, j)
                if rel == REL and lag == PRIMARY:
                    running = [p for p, f in flows.items() if f[t:t + 24].mean() >= RUNNING]
                    row["n_atoms"] = len(st)
                    row["rms"] = rms
                    row["n_run"] = len(running)
                    row["n_found"] = sum(1 for p in running if st and min(dpipe[p][st]) <= RADIUS)
                    row["fit_rms0"] = float(np.sqrt(np.mean((lambda r: (r - r.mean()) ** 2)(D[t:t + 24].mean(axis=0)))))
                    m_near = int((dpipe[pipe] <= RADIUS).sum())
                    row["p_set"] = 1.0 - math.comb(len(nodes) - m_near, len(st)) / math.comb(len(nodes), len(st))
                    row["tgt_in_set"] = float(min(dpipe[pipe][st])) if st else math.inf
                    row["own_q"] = float(dict(zip(st, xt)).get(j, 0.0)) if j is not None else 0.0
            if rel == REL:
                j, st, _, _ = joint(D, t, on - 24, S, rel)
                row["Jon"] = err(pipe, j)
        row["Dlag"] = float(ref18[pipe]["A_D168"])
        row["oinc"] = float(ref15[pipe]["err_A_oinc"]) if "err_A_oinc" in ref15[pipe] else math.nan
        row["d1"] = float(ref15[pipe]["err_A_d1"])
        row["or17"] = float(ref17[pipe]["err_A"])
        rows.append(row)

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    errkeys = [k for k in rows[0] if k.startswith("J") or k in ("Dlag", "oinc", "d1", "or17")]
    hit = {k: np.array([w[k] for w in rows]) <= RADIUS for k in errkeys}
    out = ["# water-leaks step 19: joint multi-source fit. D = published - leak-free L-TOWN_Real.inp run (hourly);",
           "# baseline-window mean fitted by non-negative greedy pursuit over nominal L-TOWN.inp q = 5 signatures",
           "# (per m3/h, centred), window [t, t+24) refitted from the baseline's atoms; estimate = largest flow rise;",
           "# rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "",
           "## within 300 m (P(chance >=); median error m), primary J-lag(168), stop at 5% RMS gain"]

    def line(lab, k):
        h = hit[k]
        d = np.array([w[k] for w in rows])
        return (f"  {lab:<40} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, k in (("J-lag(168), primary", f"J{PRIMARY}"), ("J-on (onset baseline, oracle onset)", "Jon"),
                   ("ref: A on D-lag(168) (step 18)", "Dlag"), ("ref: A on D1 regression (step 11)", "d1"),
                   ("ref: A on O-inc (step 15)", "oinc"), ("ref: A on one-leak oracle (step 17)", "or17")):
        if k in hit:
            out.append(line(lab, k))
    out += ["", "## sweep (no verdicts)"]
    for lag in LAGS:
        out.append(line(f"J-lag({lag}), 5%", f"J{lag}"))
    for rel in RELS:
        if rel != REL:
            out.append(line(f"J-lag(168), stop at {int(rel * 100)}%", f"J{PRIMARY}_r{int(rel * 100)}"))

    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_ in ((f"J{PRIMARY}", "Dlag"), (f"J{PRIMARY}", "d1"), (f"J{PRIMARY}", "or17"), (f"J{PRIMARY}", "oinc"),
                   ("Jon", "oinc")):
        if b_ not in hit:
            continue
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {a_} only {x}, {b_} only {y}: P = {p:.3f}")

    na = np.array([w["n_atoms"] for w in rows])
    rms = np.array([w["rms"] for w in rows])
    r0 = np.array([w["fit_rms0"] for w in rows])
    nr = np.array([w["n_run"] for w in rows])
    nf = np.array([w["n_found"] for w in rows])
    out += ["", "## the window fit at t (primary)",
            f"  atoms fitted: median {np.median(na):.0f} (range {na.min()} to {na.max()})",
            f"  centred RMS of D_t: median {np.median(r0):.4f} m; after the fit: median {np.median(rms):.4f} m"
            f" (range {rms.min():.4f} to {rms.max():.4f}); share left median {np.median(rms / r0):.3f}",
            f"  leaks running (>= {RUNNING:g} m3/h): median {np.median(nr):.0f}; with a fitted atom within 300 m: median"
            f" {np.median(nf):.0f}; pooled {nf.sum()} of {nr.sum()} ({nf.sum() / nr.sum():.2f})"]

    tin = np.array([w["tgt_in_set"] for w in rows]) <= RADIUS
    jh = hit[f"J{PRIMARY}"]
    out += ["", "## seen after the run (post hoc, no verdict): is the target among the window fit's atoms at all?"]
    for lab, m in (("abrupt", ~inc), ("incipient", inc), ("all", np.ones(n, bool))):
        out.append(f"  {lab:<9}: an atom within 300 m of the target {int(tin[m].sum())} of {int(m.sum())};"
                   f" of those, picked by the largest rise {int((tin & jh)[m].sum())};"
                   f" chance (as many atoms drawn at random) expected {sum(w['p_set'] for w, k in zip(rows, m) if k):.2f},"
                   f" P(chance >=) {localise.poisson_binomial_tail([w['p_set'] for w, k in zip(rows, m) if k], int(tin[m].sum())):.4f}")

    out += ["", "  pipe  kind       t                 q m3/h | J168 | Jon | Dlag | oracle | atoms | rms m  | run | found"]
    for w in rows:
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} {w['q']:6.1f} | {w['J168']:4.0f} | {w['Jon']:4.0f} |"
                   f" {w['Dlag']:4.0f} | {w['or17']:6.0f} | {w['n_atoms']:5d} | {w['rms']:.4f} | {w['n_run']:3d} | {w['n_found']:3d}")

    h = int(hit[f"J{PRIMARY}"].sum())
    hi = int(hit[f"J{PRIMARY}"][inc].sum())
    x, y, p = tests[(f"J{PRIMARY}", "Dlag")]
    out += ["", "## pre-registered predictions (LOG.md, step 19 plan)",
            f"  (a) J-lag(168) puts more than 11 of 32 within 300 m: {h}: {'HELD' if h > 11 else 'FAILED'}",
            f"  (b) J-lag(168) puts more than 15 of 32 within 300 m: {h}: {'HELD' if h > 15 else 'FAILED'}",
            f"  (c) J-lag(168) puts more than 3 of 17 incipient leaks within 300 m: {hi}: {'HELD' if hi > 3 else 'FAILED'}",
            f"  (d) J-lag(168) puts at most 27 of 32 within 300 m: {h}: {'HELD' if h <= 27 else 'FAILED'}",
            f"  (e) J-lag(168) beats A on D-lag(168) at P < 0.05: J only {x}, D-lag only {y}, P = {p:.3f}:"
            f" {'HELD' if (p < 0.05 and x > y) else 'FAILED'}"]

    keys = ["pipe", "kind", "t", "q"] + errkeys + ["n_atoms", "rms", "fit_rms0", "n_run", "n_found", "tgt_in_set", "p_set", "own_q"]
    tsv = ["\t".join(keys)]
    for w in rows:
        tsv.append("\t".join(str(w[k]) if isinstance(w[k], str) or k == "t" else f"{w[k]:.4g}" for k in keys))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
