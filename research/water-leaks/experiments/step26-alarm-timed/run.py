"""Step 26: a detector's alarm in place of the oracle half-peak hour. Step 1's D1 (both variants,
thresholds frozen from 2018) detects; step 24's R30 then localises at the alarm day on step 21's
tracker (real leaks, residual D) and on step 25's trackers (64 injected leaks, residual D_inj).

    PYTHONPATH=src python experiments/step26-alarm-timed/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-17, step 26) before R30 was run at any alarm day. Needs wntr and
scipy, as step 25, whose cached simulations ($WATER_LEAKS_CACHE/step25_inj_s<seed>.npz) it reuses
(about 20 minutes on 4 cores when cold). Deterministic. Writes results.txt and leaks.tsv.
"""
from __future__ import annotations

import importlib.util
import math
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, localise, network, score, simulate, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
Q = 5.0
W, G, K, WMIN = 14, 7, 0.5, 7          # step 1
DETECTORS = {"D1-L": ("L", 80), "D1-F": ("F", 240)}   # step 1's 2018 selections
PRIMARY = "D1-L"
OFFSETS = (-14, -7, -4, -2, -1, 0, 1, 2, 4, 7, 14)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step25 = _load("step25", EXP / "step25-heldout" / "run.py")
step24, step21, step15, step11, step8 = step25.step24, step25.step21, step25.step15, step25.step11, step25.step8


def _simulate(args):
    """Step 25's `_simulate`, defined here so multiprocessing can pickle it (same cache files)."""
    seed, inp, pcols, leaks = args
    cache = data.cache_dir() / f"step25_inj_s{seed}.npz"
    if cache.exists():
        z = np.load(cache)
        return seed, z["P"], z["PL"]
    P, PL = simulate.run_injected(inp, pcols, [lk[:6] for lk in leaks], steps=step25.STEPS)
    np.savez(cache, P=P, PL=PL)
    return seed, P, PL


def step1_alarms():
    """{variant: sorted 2019 alarm hours} from step 1's alarms.tsv."""
    out = {"L": [], "F": []}
    for ln in (EXP / "step1-baseline" / "alarms.tsv").read_text().splitlines()[1:]:
        f = ln.split("\t")
        out[f[0]].append(np.datetime64(f[2], "h"))
    return {k: sorted(v) for k, v in out.items()}


def run_detectors(Ph, hrs, Lv, F):
    """{detector: [alarm hour index]} for D1-L and D1-F on hourly pressures Ph."""
    out = {}
    for name, (variant, h) in DETECTORS.items():
        A = detect.design(hrs, Lv, F if variant == "F" else None)
        al, _ = detect.detect_sequential(Ph, A, W=W, g=G, wmin=WMIN, k=K, h=h)
        out[name] = [t for t, _ in al]
    return out


def build():
    """Everything up to the report: per-leak rows, alarms and trackers for arms A and B (step 27 reuses it)."""
    S_ = harness.setup()
    hrs, P, Lv, F, events, pcols, links = (S_[k] for k in ("hrs", "P", "Lv", "F", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    lcols = data.load("Levels", 2018)[1]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    S = step11.load_signatures(inp, pcols, nodes, Q) / Q
    flows = step8.leak_flows(hrs)
    Pfree = step15.leak_free(pcols, fcols, lcols)
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    P5 = np.vstack([data.load("Pressures", y)[2] for y in (2018, 2019)])
    _, Psh = detect.hourly(ts, np.round(Pfree, 2))
    D = P - Psh
    H = len(hrs)
    first_h = (step15.G + step15.WMIN) * 24
    first5 = first_h * 12
    h_index = {h: i for i, h in enumerate(hrs)}

    ref24 = step21._tsv(EXP / "step24-shape-chosen" / "leaks.tsv")
    ref15 = step21._tsv(EXP / "step15-oracle" / "leaks.tsv")
    first_scored = hrs[first_h]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            items.append((i, int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref24), "leak set differs from step 24"
    dpipe = {}
    for pipe in flows:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(x, math.inf), db.get(x, math.inf)) + length / 2 for x in nodes])
    _nd = {}

    def ndist(node):
        if node not in _nd:
            g = network.graph_dist(links, node)
            _nd[node] = np.array([g.get(x, math.inf) for x in nodes])
        return _nd[node]

    near_real = np.zeros(len(nodes), bool)
    for pipe in flows:
        near_real |= dpipe[pipe] <= RADIUS
    allowed = np.nonzero(~near_real)[0]

    def sc(dist, j):
        return math.inf if j is None else float(dist[j])

    def est(states, k):
        k = min(k, len(states) - 1)
        return localise.shape_chosen(states, k, window=30)[0], localise.latest_onset(states[k])

    # ---- arm A: the real leaks
    real_T, _ = localise.track(step21.daily(D), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)
    detA = run_detectors(P, hrs, Lv, F)
    rec = step1_alarms()
    for name, (variant, _) in DETECTORS.items():
        got = sorted(hrs[t] for t in detA[name] if hrs[t] >= harness.Y19)
        assert got == rec[variant], f"{name}: 2019 alarms differ from step 1's alarms.tsv"
    lila = step11.detector_alarms()["LILA-auto"]          # {pipe: alarm hour}, 2019 new leaks
    rowsA = []
    matchA, fpA = {}, {}
    for name in DETECTORS:
        matchA[name], fpA[name] = score.match([hrs[t] for t in detA[name]], events)
    for i, t in items:
        pipe = events[i][0]
        k_or = t // 24 + 1
        r30o, tdo = est(real_T, k_or)
        assert abs(sc(dpipe[pipe], r30o) - float(ref24[pipe]["R30"])) < 0.5 or math.isinf(float(ref24[pipe]["R30"])), pipe
        row = {"arm": "A", "id": pipe, "kind": ref24[pipe]["kind"], "year": int(str(events[i][1])[:4]),
               "pi": float(ref15[pipe]["p_chance"]), "k_or": k_or, "R30_or": sc(dpipe[pipe], r30o),
               "TD_or": sc(dpipe[pipe], tdo)}
        alarm = {n: matchA[n].get(i) for n in DETECTORS}
        alarm["LILA"] = lila.get(pipe)
        for n, at in alarm.items():
            if at is None:
                row[f"k_{n}"], row[f"R30_{n}"], row[f"TD_{n}"] = -1, math.nan, math.nan
                continue
            k = h_index[np.datetime64(at, "h")] // 24 + 1
            r, td = est(real_T, k)
            row[f"k_{n}"], row[f"R30_{n}"], row[f"TD_{n}"] = k, sc(dpipe[pipe], r), sc(dpipe[pipe], td)
        rowsA.append(row)

    # ---- arm B: step 25's injected leaks
    cfg = step25.config_leaks()
    sets = {s: step25.draw_set(s, cfg, nodes, allowed, ndist, first5) for s in step25.SEEDS}
    real_inp = data.fetch("L-TOWN_Real.inp")
    with mp.Pool(4) as pool:
        sims = dict((s, (Pi, PL)) for s, Pi, PL in pool.imap_unordered(
            _simulate, [(s, str(real_inp), pcols, sets[s]) for s in step25.SEEDS]))
    ref25 = [ln.split("\t") for ln in (EXP / "step25-heldout" / "leaks.tsv").read_text().splitlines()]
    c25 = {c: j for j, c in enumerate(ref25[0])}
    ref25 = ref25[1:]
    offA = [(events[i][0], t // 24 + 1) for i, t in items]
    offB = []
    rowsB, fpB, real_detB = [], {n: [] for n in DETECTORS}, {n: 0 for n in DETECTORS}
    falsepick = {n: [] for n in DETECTORS}
    for s in step25.SEEDS:
        Pi, PL = sims[s]
        X = np.round(P5 + Pi - Pfree, 2)
        _, Xh = detect.hourly(ts, X)
        Dinj = Xh - Psh
        states, _ = localise.track(step21.daily(Dinj), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)
        ev = list(events)
        for li, (node, c, st, pk, en, kind, src) in enumerate(sets[s]):
            ev.append((f"inj{s}_{li}", ts[st], ts[min(en, len(ts)) - 1], 0.0, 0.0))
        det = run_detectors(Xh, hrs, Lv, F)
        m_s = {}
        for n in DETECTORS:
            m_s[n], fp = score.match([hrs[t] for t in det[n]], ev)
            fpB[n] += fp
            real_detB[n] += sum(1 for i, _ in items if i in m_s[n])
            for at in fp:
                k = h_index[at] // 24 + 1
                j = est(states, k)[0]
                # does the false alarm's R30 pick sit within 300 m of any leak running then?
                near = False
                if j is not None:
                    for e_ in ev:
                        if e_[1] <= at <= e_[2]:
                            if e_[0].startswith("inj"):
                                d_ = ndist(sets[s][int(e_[0].split("_")[1])][0])
                            elif e_[0] in dpipe:
                                d_ = dpipe[e_[0]]
                            else:
                                continue
                            near = near or d_[j] <= RADIUS
                falsepick[n].append(near)
        for li, (node, c, st, pk, en, kind, src) in enumerate(sets[s]):
            sh = np.array([simulate.leak_shape(i, st, pk, en, kind) for i in range(step25.STEPS)])
            q5 = c * sh * np.sqrt(np.clip(PL[:, li], 0, None))
            qh = q5[:len(q5) // 12 * 12].reshape(-1, 12).mean(axis=1)
            t = int(np.nonzero(qh >= 0.5 * qh.max())[0][0])
            k_or = t // 24 + 1
            dist = ndist(node)
            r30o, tdo = est(states, k_or)
            ref = ref25[(s - 1) * step25.PER_SET + li]
            assert ref[c25["node"]] == node and abs(sc(dist, r30o) - float(ref[c25["R30"]])) < 0.5 \
                or math.isinf(float(ref[c25["R30"]])), (s, li)
            row = {"arm": "B", "id": f"s{s}:{node}", "kind": kind, "year": int(str(ts[st])[:4]),
                   "pi": float(np.mean(dist <= RADIUS)), "k_or": k_or, "R30_or": sc(dist, r30o), "TD_or": sc(dist, tdo)}
            idx = len(events) + li
            for n in DETECTORS:
                at = m_s[n].get(idx)
                if at is None:
                    row[f"k_{n}"], row[f"R30_{n}"], row[f"TD_{n}"] = -1, math.nan, math.nan
                    continue
                k = h_index[at] // 24 + 1
                r, td = est(states, k)
                row[f"k_{n}"], row[f"R30_{n}"], row[f"TD_{n}"] = k, sc(dist, r), sc(dist, td)
            row["k_LILA"], row["R30_LILA"], row["TD_LILA"] = -1, math.nan, math.nan
            rowsB.append(row)
            offB.append(({"node": node, "k_or": k_or}, states))
    return dict(locals())


def main():
    c = build()
    rowsA, rowsB, fpA, fpB, falsepick, real_detB = (c[k] for k in ("rowsA", "rowsB", "fpA", "fpB", "falsepick", "real_detB"))
    offA, offB, dpipe, ndist, est, sc, real_T = (c[k] for k in ("offA", "offB", "dpipe", "ndist", "est", "sc", "real_T"))
    items = c["items"]

    # ---- report
    def hits(rows, key):
        return np.array([w[key] <= RADIUS for w in rows])

    def block(rows, n, label):
        det = [w for w in rows if w[f"k_{n}"] >= 0]
        out = [f"  {label}: detected {len(det)} of {len(rows)}"]
        if not det:
            return out, det
        ps = [w["pi"] for w in det]
        ho, ha, ta = hits(det, "R30_or"), hits(det, f"R30_{n}"), hits(det, f"TD_{n}")
        inc = np.array([w["kind"] == "incipient" for w in det])
        dk = np.array([w[f"k_{n}"] - w["k_or"] for w in det])
        out.append(f"    alarm day minus oracle day: median {np.median(dk):+.0f} (range {dk.min():+d} to {dk.max():+d});"
                   f" {int((dk < 0).sum())} early, {int((dk == 0).sum())} same day, {int((dk > 0).sum())} late")
        out.append(f"    chance on the detected: expected {sum(ps):.2f}")
        for lab, h_ in (("R30 at the oracle day", ho), ("R30 at the alarm day", ha), ("T-D at the alarm day", ta)):
            out.append(f"    {lab:<24} {int(h_.sum()):>2} of {len(det)} (P(chance >=) {localise.poisson_binomial_tail(ps, int(h_.sum())):.2g});"
                       f" abrupt {int(h_[~inc].sum())} of {int((~inc).sum())}, incipient {int(h_[inc].sum())} of {int(inc.sum())}")
        x, y = localise.sign_test_counts(ha, ho)
        out.append(f"    paired, alarm against oracle day: alarm only {x}, oracle only {y}, P = {stats.sign_test(x, y):.3f}")
        x, y = localise.sign_test_counts(ha, ta)
        out.append(f"    paired, R30 against T-D at the alarm day: R30 only {x}, T-D only {y}, P = {stats.sign_test(x, y):.3f}")
        lost = ho & ~ha
        out.append(f"    lost by the change of day {int(lost.sum())} (alarm early {int((lost & (dk < 0)).sum())}, late {int((lost & (dk > 0)).sum())});"
                   f" gained {int((ha & ~ho).sum())}")
        out.append(f"    end to end: detected and within 300 m {int(ha.sum())} of {len(rows)}")
        return out, det

    out = ["# water-leaks step 26: D1 (step 1, thresholds frozen from 2018) detects; step 24's R30 localises at the",
           "# alarm day (hour index div 24 + 1) on step 21's tracker (real leaks, D) and step 25's (injected, D_inj);",
           "# compared with R30 at the oracle half-peak day on the same leaks; rule 300 m along pipes", ""]
    out.append("## arm A: the real leaks (step 24's 32), alarms on the published pressures")
    out.append(f"  2019 alarms reproduce step 1's alarms.tsv for both variants; false alarms over both years:"
               f" {', '.join(f'{n} {len(fpA[n])}' for n in DETECTORS)}")
    resA = {}
    for n in list(DETECTORS) + ["LILA"]:
        sub = [w for w in rowsA if w["year"] == 2019]
        o, d = block(sub, n, f"{n}, new 2019 leaks")
        out += o
        resA[n] = d
        if n != "LILA":
            out += block([w for w in rowsA if w["year"] == 2018], n, f"{n}, 2018 leaks (the tuning year)")[0]
    out += ["", "## arm B: step 25's 64 injected leaks, alarms on the published-plus-injected pressures (published regressors)"]
    resB = {}
    for n in DETECTORS:
        o, d = block(rowsB, n, n)
        out += o
        resB[n] = d
        fpk = falsepick[n]
        out.append(f"    false alarms over the 8 sets {len(fpB[n])}; R30's pick at one is within 300 m of a running leak for"
                   f" {sum(fpk)}; real leaks detected over the 8 sets {real_detB[n]} (of {8 * len(items)})")

    out += ["", "  arm id          kind       year | k_or | R30_or | " + " | ".join(f"k {n}, R30, T-D" for n in list(DETECTORS) + ["LILA"])]
    for w in rowsA + rowsB:
        cells = []
        for n in list(DETECTORS) + ["LILA"]:
            cells.append("-" if w[f"k_{n}"] < 0 else f"{w[f'k_{n}']:3d} {w[f'R30_{n}']:5.0f} {w[f'TD_{n}']:5.0f}")
        out.append(f"  {w['arm']}   {w['id']:<11} {w['kind']:<10} {w['year']} | {w['k_or']:4d} | {w['R30_or']:6.0f} | " + " | ".join(cells))

    dB = resB[PRIMARY]
    ho, ha, ta = hits(dB, "R30_or"), hits(dB, f"R30_{PRIMARY}"), hits(dB, f"TD_{PRIMARY}")
    pb = localise.poisson_binomial_tail([w["pi"] for w in dB], int(ha.sum())) if dB else 1.0
    dA = resA[PRIMARY]
    hoA, haA = hits(dA, "R30_or"), hits(dA, f"R30_{PRIMARY}")
    pool = dA + dB
    lost = hits(pool, "R30_or") & ~hits(pool, f"R30_{PRIMARY}")
    early = np.array([w[f"k_{PRIMARY}"] < w["k_or"] for w in pool])
    out += ["", "## pre-registered predictions (LOG.md, step 26 plan; detector D1-L)",
            f"  (a) arm B: R30 at the alarm day >= 80% of R30 at the oracle day on the detected: {int(ha.sum())} against"
            f" {int(ho.sum())} (bar {0.8 * ho.sum():.1f}): {'HELD' if ha.sum() >= 0.8 * ho.sum() else 'FAILED'}",
            f"  (b) arm B: R30 at the alarm day beats chance at P < 0.001: P = {pb:.2g}: {'HELD' if pb < 0.001 else 'FAILED'}",
            f"  (c) arm B: R30 more hits than T-D at the alarm day: {int(ha.sum())} against {int(ta.sum())}:"
            f" {'HELD' if ha.sum() > ta.sum() else 'FAILED'}",
            f"  (d) arm B end to end: at least 15 of 64 detected and within 300 m: {int(ha.sum())}: {'HELD' if ha.sum() >= 15 else 'FAILED'}",
            f"  (e) arm A, new 2019: R30 at the alarm day at most one fewer than at the oracle day: {int(haA.sum())} against"
            f" {int(hoA.sum())}: {'HELD' if haA.sum() >= hoA.sum() - 1 else 'FAILED'}",
            f"  (f) pooled: more than half of the leaks lost by the change of day were alarmed early: {int((lost & early).sum())}"
            f" of {int(lost.sum())}: {'HELD' if lost.sum() and (lost & early).sum() > lost.sum() / 2 else 'FAILED'}"]
    # post hoc (declared after the registered output was read; no verdicts): R30's hits at the oracle
    # day shifted by delta days, on all 64 injected and the 32 real leaks, to show how sharp the optimum is
    out += ["", "## post hoc, no verdicts: R30 hits at the oracle day + delta (all leaks, detected or not)",
            "  delta  injected (of 64)  real (of 32)"]
    for delta in OFFSETS:
        hb = sum(sc(ndist(w_["node"]), est(st_, max(1, w_["k_or"] + delta))[0]) <= RADIUS for w_, st_ in offB)
        ha_ = sum(sc(dpipe[pp], est(real_T, max(1, kk + delta))[0]) <= RADIUS for pp, kk in offA)
        out.append(f"  {delta:+4d}  {hb:>8}          {ha_:>6}")
    cols = ["arm", "id", "kind", "year", "pi", "k_or", "R30_or", "TD_or"] + [f"{a}_{n}" for n in list(DETECTORS) + ["LILA"] for a in ("k", "R30", "TD")]
    tsv = ["\t".join(cols)] + ["\t".join(str(w[c]) if isinstance(w[c], (str, int)) else f"{w[c]:.4g}" for c in cols) for w in rowsA + rowsB]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
