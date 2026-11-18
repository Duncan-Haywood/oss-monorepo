"""Step 17: a per-leak oracle residual, every other leak replayed through `L-TOWN_Real.inp`.

    PYTHONPATH=src python experiments/step17-replay/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-15, step 17) before any replayed residual was computed. Every leak
pipe is split at its midpoint and draws its published 5-minute leak flow (`replay`). With all
leaks replayed, a window restarted from the published tank level should reproduce the published
pressures (the gate); with the target leak left out, published minus the run is that leak's own
effect (O-one). O-one is localised with step 16's real-day signatures (R), step 11's nominal ones
at q = 5 (A) and the most-affected sensor (M).

Needs wntr (1.5.0 used) and step 16's signature cache (`step16_realday.npz`, made by running
step 16 first); step 11's q = 5 signatures are simulated if absent (about 3 minutes). The 128 day
runs take about a minute on 4 cores and are cached as step17_replay.npz. Deterministic. Writes
results.txt and leaks.tsv next to this file.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, localise, network, realsig, replay, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
TIE = 1e-3
N5 = realsig.DAY_STEPS


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step16 = _load("step16", EXP / "step16-realday" / "run.py")
step15, step11, step8, harness = step16.step15, step16.step11, step16.step8, step16.harness


def five_minute():
    """Published 5-minute pressures, T1 level, PUMP_1 flow and leak flows over 2018-19."""
    P, L, F, Q, pipes = [], [], [], [], None
    for y in (2018, 2019):
        tp, pc, p = data.load("Pressures", y)
        tl, _, lv = data.load("Levels", y)
        tf, fc, f = data.load("Flows", y)
        tq, qc, q = data.load("Leakages", y)
        assert len(tp) == len(tl) == len(tf) == len(tq)
        P.append(p), L.append(lv[:, 0]), F.append(f[:, list(fc).index("PUMP_1")])
        Q.append(dict(zip(qc, q.T)))
    pipes = sorted(set(Q[0]) | set(Q[1]))
    Qm = np.vstack([np.column_stack([Qy.get(c, np.zeros(len(Py))) for c in pipes]) for Qy, Py in zip(Q, P)])
    return np.vstack(P), np.concatenate(L), np.concatenate(F), Qm, pipes


def main():
    S_ = harness.setup()
    hrs, P, events, pcols, links = (S_[k] for k in ("hrs", "P", "events", "pcols", "links"))
    inp_nom = data.fetch("L-TOWN.inp")
    inp_real = data.fetch("L-TOWN_Real.inp")
    nodes = step11.junctions(inp_nom.read_text())
    flows = step8.leak_flows(hrs)
    ref15 = step16.step15_rows()
    P5, L5, F5, Q5, lpipes = five_minute()
    assert len(P5) == 12 * len(hrs)

    first_scored = hrs[(step16.G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref15), "leak set differs from step 15"

    z16 = np.load(data.cache_dir() / "step16_realday.npz")
    sigR = z16["sigs"]
    sigA = step11.load_signatures(inp_nom, pcols, nodes, 5.0)

    # 4 day runs per leak: (localisation, pre-onset) x (all leaks, the others)
    jobs, meta = [], []
    for n_, (i, t) in enumerate(items):
        pipe = events[i][0]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        j = lpipes.index(pipe)
        for w, h0 in (("loc", t), ("pre", on - 24)):
            k0 = h0 * 12
            fl = Q5[k0:k0 + N5].copy()
            state = (k0 * realsig.STEP_S, float(L5[k0]), bool(F5[k0] > 0))
            jobs.append((*state, fl))
            fo = fl.copy()
            fo[:, j] = 0.0
            jobs.append((*state, fo))
            meta.append((n_, w, k0))
    cache = data.cache_dir() / "step17_replay.npz"
    key = np.array([[m[0], m[2]] for m in meta], dtype=float)
    if cache.exists() and np.array_equal(np.load(cache)["key"], key):
        runs = np.load(cache)["runs"]
    else:
        runs = np.array(replay.run_windows(inp_real, pcols, lpipes, jobs))
        np.savez(cache, key=key, runs=runs)

    kind = {}
    for ln in data.fetch("dataset_configuration.yaml").read_text().splitlines():
        f = [x.strip() for x in ln.lstrip("- ").split(",")]
        if len(f) == 6 and f[0].startswith("p"):
            kind[f[0]] = f[4]

    rows = []
    for n_, (i, t) in enumerate(items):
        pipe = events[i][0]
        g, res = {}, {}
        for w in ("loc", "pre"):
            m_ = meta.index(next(m for m in meta if m[0] == n_ and m[1] == w))
            k0 = meta[m_][2]
            pub = P5[k0:k0 + N5]
            allr, oth = np.round(runs[2 * m_], 2), np.round(runs[2 * m_ + 1], 2)
            g[w] = float(np.median(np.abs(allr - pub)))
            res[w] = (pub - oth).mean(axis=0)
        o1 = res["loc"]
        o1b = res["loc"] - res["pre"]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        oinc = step15_oinc(P, hrs, t, on)
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dp = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])
        ends = [nodes.index(x) for x in (a, b) if x in nodes]
        scR = localise.scores(o1, sigR[n_], "pearson")
        far = dp > RADIUS
        row = {"pipe": pipe, "t": hrs[t], "kind": kind[pipe], "gate_loc": g["loc"], "gate_pre": g["pre"],
               "pi": float(ref15[pipe]["p_chance"]), "q": float(flows[pipe][t:t + 24].mean()),
               "err_R": float(dp[int(np.nanargmax(scR))]),
               "err_Rb": float(dp[localise.estimate(o1b, sigR[n_], "pearson")]),
               "err_A": float(dp[localise.estimate(o1, sigA, "pearson")]),
               "err_M": float(dp[nodes.index(pcols[int(np.argmin(o1))])]) if pcols[int(np.argmin(o1))] in nodes else math.nan,
               "M": pcols[int(np.argmin(o1))],
               "best": float(np.nanmax(scR)), "rank": realsig.rank_of(scR, ends),
               "ties": realsig.near_ties(scR, far, TIE),
               "r_oinc": float(np.corrcoef(o1, oinc)[0, 1]) if oinc is not None else math.nan,
               "min_o1": float(o1.min()), "pre_abs": float(np.abs(res["pre"]).max())}
        if math.isnan(row["err_M"]):
            gd = network.graph_dist(links, row["M"])
            row["err_M"] = float(network.pipe_dist(links, gd, pipe))
        rows.append(row)

    n = len(rows)
    ps = [w["pi"] for w in rows]
    gl = np.array([w["gate_loc"] for w in rows])
    gp = np.array([w["gate_pre"] for w in rows])
    gate_ok = (gl < 0.01) & (gp < 0.01)
    out = ["# water-leaks step 17: per-leak oracle residual. L-TOWN_Real.inp with every leak pipe split at its midpoint",
           "# drawing its published 5-minute leak flow; restarted per 24 h window at the published T1 level and PUMP_1 status;",
           "# O-one = published - run with the target leak left out, mean over [t, t + 24); argmax Pearson; rule 300 m", "",
           f"gate: all leaks replayed (rounded 0.01 m) against published, median |diff| per window: localisation max {gl.max():.4f} "
           f"(median {np.median(gl):.4f}), pre-onset max {gp.max():.4f} (median {np.median(gp):.4f}) m; "
           f"{int(gate_ok.sum())} of {n} leaks pass both (< 0.01 m): {'PASS' if gate_ok.all() else 'FAIL'}",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "",
           "## within 300 m (P(chance >=); median error m)"]
    hits = {}
    for k, lab in (("err_R", "R real-day signatures, O-one"), ("err_Rb", "R real-day signatures, O-one-b"),
                   ("err_A", "A nominal q = 5, O-one"), ("err_M", "M most-affected sensor, O-one")):
        d = np.array([w[k] for w in rows])
        h = d <= RADIUS
        hits[k] = h
        inc = np.array([w["kind"] == "incipient" for w in rows])
        out.append(f"  {lab:<34} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                   f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")
    if not gate_ok.all():
        d = np.array([w["err_R"] for w in rows])[gate_ok]
        out.append(f"  R on O-one, gate-passing leaks only: {int((d <= RADIUS).sum())} of {int(gate_ok.sum())}")
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    xm = ym = 0
    p_rm = 1.0
    for a_, b_, la, lb in (("err_R", "err_M", "R", "M"), ("err_R", "err_A", "R", "A")):
        x, y = localise.sign_test_counts(hits[a_], hits[b_])
        p = stats.sign_test(x, y)
        out.append(f"  {la} only {x}, {lb} only {y}: P = {p:.3f}")
        if lb == "M":
            xm, ym, p_rm = x, y, p
    s16 = step16_hits()
    x, y = localise.sign_test_counts(hits["err_R"], np.array([s16[w["pipe"]] for w in rows]))
    out.append(f"  R on O-one only {x}, R on O-inc (step 16) only {y}: P = {stats.sign_test(x, y):.3f}")

    best = np.array([w["best"] for w in rows])
    rank = np.array([w["rank"] for w in rows])
    ties = np.array([w["ties"] for w in rows])
    roi = np.array([w["r_oinc"] for w in rows])
    out += ["", "## descriptive",
            f"  best Pearson score of R on O-one: median {np.median(best):.4f} (range {best.min():.4f} to {best.max():.4f})",
            f"  leak pipe's better end node ranked first: {int(np.sum(rank == 1))} of {n}; top 10: {int(np.sum(rank <= 10))}; median rank {np.median(rank):.0f}",
            f"  junctions over 300 m away within {TIE:g} of the best: median {np.median(ties):.0f} (range {ties.min()} to {ties.max()}); none for {int(np.sum(ties == 0))}",
            f"  Pearson r of O-one with step 15's O-inc: median {np.nanmedian(roi):.3f} (range {np.nanmin(roi):.3f} to {np.nanmax(roi):.3f})",
            "",
            "  pipe  kind       t                 q m3/h | R err | Rb err | A err | M err | best r | rank | ties | r(O-inc) | min O-one | gate loc/pre"]
    for w in rows:
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} {w['q']:6.1f} | {w['err_R']:5.0f} | {w['err_Rb']:6.0f} |"
                   f" {w['err_A']:5.0f} | {w['err_M']:5.0f} | {w['best']:.4f} | {w['rank']:4d} | {w['ties']:4d} | {w['r_oinc']:8.3f} |"
                   f" {w['min_o1']:9.3f} | {w['gate_loc']:.4f}/{w['gate_pre']:.4f}")

    r = int(hits["err_R"].sum())
    ri = int(sum(h for h, w in zip(hits["err_R"], rows) if w["kind"] == "incipient"))
    out += ["", "## pre-registered predictions (LOG.md, step 17 plan)",
            f"  (a) R on O-one puts more than 15 of 32 within 300 m: {r}: {'HELD' if r > 15 else 'FAILED'}",
            f"  (b) R on O-one puts more than 4 of 17 incipient leaks within 300 m: {ri}: {'HELD' if ri > 4 else 'FAILED'}",
            f"  (c) R on O-one puts at least 20 of 32 within 300 m: {r}: {'HELD' if r >= 20 else 'FAILED'}",
            f"  (d) median best Pearson score of R on O-one >= 0.99: {np.median(best):.4f}: {'HELD' if np.median(best) >= 0.99 else 'FAILED'}",
            f"  (e) R beats M on O-one at P < 0.05: R only {xm}, M only {ym}, P = {p_rm:.3f}: {'HELD' if (p_rm < 0.05 and xm > ym) else 'FAILED'}"]
    tsv = ["pipe\tkind\tt\tq\tgate_loc\tgate_pre\terr_R\terr_Rb\terr_A\terr_M\tM\tbest_r\tend_rank\tfar_ties\tr_oinc\tmin_o1"]
    for w in rows:
        tsv.append("\t".join([w["pipe"], w["kind"], str(w["t"]), f"{w['q']:.2f}", f"{w['gate_loc']:.5f}", f"{w['gate_pre']:.5f}",
                              f"{w['err_R']:.0f}", f"{w['err_Rb']:.0f}", f"{w['err_A']:.0f}", f"{w['err_M']:.0f}", w["M"],
                              f"{w['best']:.4f}", str(w["rank"]), str(w["ties"]), f"{w['r_oinc']:.4f}", f"{w['min_o1']:.4f}"]))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


_D = None


def step15_oinc(P, hrs, t, on):
    """Step 15's O-inc at hour t for a leak with onset hour `on` (published minus leak-free, hourly)."""
    global _D
    if _D is None:
        from water_leaks import detect  # noqa: PLC0415
        z = np.load(data.cache_dir() / "step14_sim_continuous.npz")
        ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
        _, Psh = detect.hourly(ts, np.round(z["P"], 2))
        _D = P - Psh
    return _D[t:t + 24].mean(axis=0) - _D[on - 24:on].mean(axis=0)


def step16_hits():
    lines = (EXP / "step16-realday" / "leaks.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    rows = [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln]
    return {r["pipe"]: float(r["err_R_oinc"]) <= RADIUS for r in rows}


if __name__ == "__main__":
    sys.exit(main())
