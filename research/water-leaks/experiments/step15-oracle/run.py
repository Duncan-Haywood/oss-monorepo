"""Step 15: localisation on the oracle residual (published minus leak-free simulated pressure).

    PYTHONPATH=src python experiments/step15-oracle/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-15, step 15) before any oracle residual was computed. Step 14 found
the published pressures equal the leak-free `L-TOWN_Real.inp` simulation to their 0.01 m rounding,
so D(h) = published - simulated is the leaks' own pressure effect. Localising on D with step 11's
nominal-model signatures splits step 11's loss into residual error and model error.

Needs wntr (1.5.0 used). Reuses step 14's continuous simulation cache and step 11's signature
cache under $WATER_LEAKS_CACHE (simulated here if absent: about 4 minutes for the two-year run,
about 12 for 782 junctions x 6 leak sizes on 4 cores). Deterministic. Writes results.txt and
leaks.tsv next to this file.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, localise, network, simulate, stats
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
GRID = [1.0, 2.0, 5.0, 10.0, 20.0, 30.0]
RADIUS = 300.0
W, G, WMIN = 14, 7, 7
VIS_DROP = 0.05   # m, five rounding steps of the published files
VIS_RUN = 3       # hours running


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step8 = _load("step8", EXP / "step8-gated" / "run.py")
step11 = _load("step11", EXP / "step11-localise" / "run.py")


def leak_free(pcols, fcols, lcols):
    """Step 14's continuous two-year leak-free run (5-minute pressures), cached as step 14 caches it."""
    cache = data.cache_dir() / "step14_sim_continuous.npz"
    if cache.exists():
        return np.load(cache)["P"]
    inp = data.fetch("L-TOWN_Real.inp")
    P, F, L = simulate.run_year(inp, pcols, fcols, lcols, steps=2 * simulate.YEAR_STEPS)
    np.savez(cache, P=P, F=F, L=L)
    return P


def main():
    S_ = harness.setup()
    hrs, P, Lv, events, pcols, links = (S_[k] for k in ("hrs", "P", "Lv", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    lcols = data.load("Levels", 2018)[1]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    sig = {q: step11.load_signatures(inp, pcols, nodes, q) for q in GRID}
    A = localise.design_noflow(hrs, Lv)
    first_scored = hrs[(G + WMIN) * 24]
    flows = step8.leak_flows(hrs)

    # oracle residual D at hourly means; the simulation rounded to the published 0.01 m
    Ps = np.round(leak_free(pcols, fcols, lcols), 2)
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    _, Psh = detect.hourly(ts, Ps)
    D = P - Psh

    leak_pipes = sorted({e[0] for e in events})
    dpipe = {}
    for pipe in leak_pipes:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(n, math.inf), db.get(n, math.inf)) + length / 2 for n in nodes])
    sensor_d = {s: network.graph_dist(links, s) for s in pcols}

    # step 11's 32 oracle-timed leaks, unchanged
    items = []
    for i, e in enumerate(events):
        if not (e[1] >= first_scored):
            continue
        k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
        items.append((i, k))
    items.sort(key=lambda it: it[1])

    ref = {}
    for ln in (EXP / "step11-localise" / "leaks.tsv").read_text().splitlines()[1:]:
        f = ln.split("\t")
        if f[0].startswith("oracle"):
            ref[f[1]] = (f[6], f[10])

    rows, tsv = [], ["pipe\tyear\tt\tpeak\tq_true\tq_grid\tp_chance\tcorr_d1_oinc"
                     "\tA_d1\tA_oall\tA_oinc\tS_d1\tS_oall\tS_oinc\tM_d1\tM_oall\tM_oinc"
                     "\terr_A_d1\terr_A_oall\terr_A_oinc\terr_S_d1\terr_S_oall\terr_S_oinc\terr_M_d1\terr_M_oall\terr_M_oinc"
                     "\tscore_A_oinc\tvis_delay_h"]
    gate_bad = []
    h_on = {}
    for i, t in items:
        pipe = events[i][0]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        h_on[pipe] = on
        qt = float(flows[pipe][t:t + 24].mean())
        qg = localise.nearest_q(qt, GRID)
        res = {"d1": localise.residual(P, A, t, W=W, g=G),
               "oall": D[t:t + 24].mean(axis=0),
               "oinc": D[t:t + 24].mean(axis=0) - D[on - 24:on].mean(axis=0)}
        est, err = {}, {}
        for rk, r in res.items():
            est[("A", rk)] = nodes[localise.estimate(r, sig[5.0], "pearson")]
            est[("S", rk)] = nodes[localise.estimate(r, sig[qg], "pearson")]
            m = pcols[int(np.argmin(r))]
            est[("M", rk)] = m
            for mk in ("A", "S"):
                err[(mk, rk)] = float(dpipe[pipe][nodes.index(est[(mk, rk)])])
            err[("M", rk)] = network.pipe_dist(links, sensor_d[m], pipe)
        if (est[("A", "d1")], est[("M", "d1")]) != ref[pipe]:
            gate_bad.append(pipe)
        best = float(np.max(localise.scores(res["oinc"], sig[5.0], "pearson")))
        c = float(np.corrcoef(res["d1"], res["oinc"])[0, 1])
        vis = localise.visible_from(D, on, 30 * 24, VIS_DROP, VIS_RUN)
        row = {"pipe": pipe, "year": 2019 if events[i][1] >= Y19 else 2018, "t": hrs[t], "peak": events[i][3],
               "qt": qt, "qg": qg, "pi": float(np.mean(dpipe[pipe] <= RADIUS)), "corr": c, "est": est, "err": err,
               "best": best, "vis": None if vis is None else vis - on}
        rows.append(row)
        keys = [(mk, rk) for mk in "ASM" for rk in ("d1", "oall", "oinc")]
        tsv.append("\t".join([pipe, str(row["year"]), str(row["t"]), f"{row['peak']:.2f}", f"{qt:.2f}", f"{qg:g}",
                              f"{row['pi']:.4f}", f"{c:.3f}"] + [est[k] for k in keys] + [f"{err[k]:.0f}" for k in keys]
                             + [f"{best:.3f}", "" if row["vis"] is None else str(row["vis"])]))

    n = len(rows)
    ps = [w["pi"] for w in rows]
    out = ["# water-leaks step 15: localisation on the oracle residual (published minus leak-free L-TOWN_Real.inp, continuous two-year run, rounded to 0.01 m)",
           "# residuals over the 24 h from t (first hour of half-peak flow): d1 = step 11's D1 no-flow regression residual;",
           "#   o-all = mean D; o-inc (primary) = mean D minus mean D over the 24 h before the leak's onset",
           "# estimates: A = nominal L-TOWN.inp 24 h mean signatures, q = 5, argmax Pearson (step 11); S = same at the grid q nearest the leak's true mean flow;",
           f"#   M = most-affected sensor; error = along-pipe distance to the leak pipe midpoint; rule {RADIUS:g} m; chance: Poisson-binomial over p_i", "",
           f"gate: step 11's A and M estimates on the d1 residual reproduced for {n - len(gate_bad)} of {n} leaks"
           + (f" (differ: {', '.join(gate_bad)})" if gate_bad else ""),
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "",
           "## within 300 m, of 32 oracle-timed leaks (P(chance >=); median error m)",
           "  method                      |   d1 (step 11)        |   o-all               |   o-inc (primary)"]
    hits = {}
    for mk, lab in (("A", "A nominal, q = 5"), ("S", "S nominal, oracle q"), ("M", "M most-affected sensor")):
        cells = []
        for rk in ("d1", "oall", "oinc"):
            d = np.array([w["err"][(mk, rk)] for w in rows])
            h = d <= RADIUS
            hits[(mk, rk)] = h
            cells.append(f"{h.sum():>2} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f})")
        out.append(f"  {lab:<27} | " + " | ".join(f"{c:<21}" for c in cells))
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]

    def pair(a, b, la, lb):
        x, y = localise.sign_test_counts(hits[a], hits[b])
        p = stats.sign_test(x, y)
        out.append(f"  {la} only {x}, {lb} only {y}: P = {p:.3f}")
        return p

    pair(("A", "oinc"), ("A", "d1"), "A on o-inc", "A on d1")
    p_am = pair(("A", "oinc"), ("M", "oinc"), "A on o-inc", "M on o-inc")
    pair(("S", "oinc"), ("M", "oinc"), "S on o-inc", "M on o-inc")
    pair(("M", "oinc"), ("M", "d1"), "M on o-inc", "M on d1")

    best = np.array([w["best"] for w in rows])
    corr = np.array([w["corr"] for w in rows])
    out += ["", "## descriptive",
            f"  best Pearson score of A on o-inc: median {np.median(best):.3f} (range {best.min():.3f} to {best.max():.3f})",
            f"  Pearson correlation of the d1 residual with o-inc, per leak: median {np.median(corr):.3f} (range {corr.min():.3f} to {corr.max():.3f})",
            f"  oracle q grid used: " + ", ".join(f"{q:g}: {sum(w['qg'] == q for w in rows)}" for q in GRID), "",
            "  pipe  year t                 peak  q_true | A d1 / o-inc err m | S o-inc err m | M d1 / o-inc err m | best r | corr(d1, o-inc) | visible +h"]
    for w in rows:
        e = w["err"]
        out.append(f"  {w['pipe']:>5} {w['year']} {str(w['t']):<16} {w['peak']:5.1f} {w['qt']:6.1f} | {e[('A', 'd1')]:6.0f} / {e[('A', 'oinc')]:6.0f}    |"
                   f" {e[('S', 'oinc')]:6.0f}        | {e[('M', 'd1')]:6.0f} / {e[('M', 'oinc')]:6.0f}    | {w['best']:.3f}  | {w['corr']:+.3f}          |"
                   f" {'-' if w['vis'] is None else w['vis']}")

    # visibility against the detectors' alarm delays (2019 leaks they detected)
    det = step11.detector_alarms()
    out += ["", f"## visibility: first hour from onset with D minus its pre-onset mean <= -{VIS_DROP:g} m at some sensor for {VIS_RUN} h running (within 30 days)"]
    vis = {w["pipe"]: w["vis"] for w in rows}
    v = np.array([x for x in vis.values() if x is not None])
    out.append(f"  visible within 30 days: {len(v)} of {n}; delay median {np.median(v):.0f} h (range {v.min()} to {v.max()})")
    for name, al in det.items():
        dd = [(p, int((t - hrs[h_on[p]]).astype(int)), vis.get(p)) for p, t in al.items() if p in h_on]
        dl = np.array([x[1] for x in dd])
        vv = [x[2] for x in dd if x[2] is not None]
        out.append(f"  {name}: {len(dd)} detected 2019 leaks; alarm delay median {np.median(dl):.0f} h; their visibility delay median "
                   f"{np.median(vv) if vv else float('nan'):.0f} h; alarm later than visibility for {sum(1 for x in dd if x[2] is not None and x[1] > x[2])}")

    a_inc = int(hits[("A", "oinc")].sum())
    out += ["", "## pre-registered predictions (LOG.md, step 15 plan)",
            f"  (a) A on o-inc puts more than 15 of 32 within 300 m: {a_inc}: {'HELD' if a_inc > 15 else 'FAILED'}",
            f"  (b) A on o-inc puts at least 16 of 32 within 300 m: {a_inc}: {'HELD' if a_inc >= 16 else 'FAILED'}",
            f"  (c) A and M on o-inc not separable at P < 0.05: P = {p_am:.3f}: {'HELD' if p_am >= 0.05 else 'FAILED'}",
            f"  (d) median best Pearson score of A on o-inc >= 0.9: {np.median(best):.3f}: {'HELD' if np.median(best) >= 0.9 else 'FAILED'}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
