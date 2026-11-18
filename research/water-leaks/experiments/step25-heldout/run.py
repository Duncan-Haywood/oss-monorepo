"""Step 25: a held-out check of step 24's shape-chosen rule. 64 new leaks (8 sets of 8), each
resampling the type, diameter, rise and duration of one of BattLeDIM's 33 configured leaks at a
new junction and a new time, are simulated through `L-TOWN_Real.inp` and their pressure effect is
added to the published pressures; step 21's tracker and step 24's rule, frozen, then localise them.

    PYTHONPATH=src python experiments/step25-heldout/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-17, step 25) before any leak was injected. Needs wntr (1.5.0) and
scipy. Each set is one continuous two-year EPANET run (about 6 to 10 minutes; four in parallel),
cached as $WATER_LEAKS_CACHE/step25_inj_s<seed>.npz. Deterministic. Writes results.txt,
leaks.tsv and real_control.tsv next to this file.
"""
from __future__ import annotations

import importlib.util
import math
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, localise, network, simulate, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
Q = 5.0
SEEDS = range(1, 9)
PER_SET = 8
STEPS = 2 * simulate.YEAR_STEPS
DAY5 = 288          # 5-minute steps per day


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step24 = _load("step24", EXP / "step24-shape-chosen" / "run.py")
step21, step15, step11, step8 = step24.step21, step24.step15, step24.step11, step24.step8


def config_leaks():
    """The 33 configured leaks as (kind, diameter m, rise steps, duration steps or None if it
    runs to the end of 2019)."""
    out = []
    end19 = np.datetime64("2019-12-31T23:55", "m")
    for _, s, e, d, kind, pk in data.parse_config_leaks(data.fetch("dataset_configuration.yaml").read_text()):
        rise = int((pk - s).astype(int)) // 5
        dur = None if e >= end19 else int((e - s).astype(int)) // 5
        out.append((kind, d, rise, dur))
    return out


def draw_set(seed, cfg, nodes, allowed, ndist, first5):
    """Eight leaks for one seed: (node, C, start, peak, end, kind, source index)."""
    rng = np.random.default_rng(seed)
    leaks, chosen = [], []
    while len(leaks) < PER_SET:
        src = int(rng.integers(len(cfg)))
        kind, d, rise, dur = cfg[src]
        last = STEPS - DAY5 - rise           # peak at least a day before the end
        if last <= first5:
            continue
        start = int(rng.integers(first5, last + 1))
        j = int(rng.choice(allowed))
        if any(ndist(nodes[c])[j] <= RADIUS for c in chosen):
            continue
        chosen.append(j)
        end = STEPS if dur is None else min(STEPS, start + dur)
        leaks.append((nodes[j], float(simulate.emitter_coef(d)), start, start + rise, end, kind, src))
    return leaks


def _simulate(args):
    seed, inp, pcols, leaks = args
    cache = data.cache_dir() / f"step25_inj_s{seed}.npz"
    if cache.exists():
        z = np.load(cache)
        return seed, z["P"], z["PL"]
    P, PL = simulate.run_injected(inp, pcols, [lk[:6] for lk in leaks], steps=STEPS)
    np.savez(cache, P=P, PL=PL)
    return seed, P, PL


def main():
    S_ = harness.setup()
    hrs, P, events, pcols, links = (S_[k] for k in ("hrs", "P", "events", "pcols", "links"))
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
    first_h = (step15.G + step15.WMIN) * 24
    first5 = first_h * 12

    # real leaks as in step 24 (control, and the check that the frozen pipeline is rebuilt)
    ref24 = step21._tsv(EXP / "step24-shape-chosen" / "leaks.tsv")
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

    rules = {"R30": dict(window=30), "R30S": dict(window=30, score="ls"), "R30L": dict(window=30, score="level"),
             "R14": dict(window=14), "R60": dict(window=60)}

    def estimates(states, k, t):
        est = {name: localise.shape_chosen(states, k, **kw)[0] for name, kw in rules.items()}
        est["TD"] = localise.latest_onset(states[k])
        est["S30"] = localise.steepest_dated(states, k, window=30)
        est["C30"] = localise.shape_timed(states, k, t / 24, window=30)[0]
        return est

    keys = list(rules) + ["TD", "S30", "C30"]

    def score(dist, j):
        return math.inf if j is None else float(dist[j])

    real_T, _ = localise.track(step21.daily(D), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)
    real_base = {}
    for i, t in items:
        pipe = events[i][0]
        est = estimates(real_T, t // 24 + 1, t)
        real_base[pipe] = {kk: score(dpipe[pipe], est[kk]) for kk in keys}
        for kk in ("R30", "TD", "S30", "C30"):
            ref = float(ref24[pipe][kk])
            assert abs(real_base[pipe][kk] - ref) < 0.5 or (math.isinf(ref) and math.isinf(real_base[pipe][kk])), (pipe, kk)

    cfg = config_leaks()
    sets = {s: draw_set(s, cfg, nodes, allowed, ndist, first5) for s in SEEDS}
    real_inp = data.fetch("L-TOWN_Real.inp")
    with mp.Pool(4) as pool:
        sims = dict((s, (Pi, PL)) for s, Pi, PL in
                    pool.imap_unordered(_simulate, [(s, str(real_inp), pcols, sets[s]) for s in SEEDS]))

    rows, ctrl = [], []
    for s in SEEDS:
        Pi, PL = sims[s]
        if np.isnan(Pi).any() or np.isnan(PL).any():
            raise SystemExit(f"set {s}: simulation left 5-minute marks unfilled")
        X = np.round(P5 + Pi - Pfree, 2)
        _, Xh = detect.hourly(ts, X)
        Dinj = Xh - Psh
        states, _ = localise.track(step21.daily(Dinj), S, qmin=step21.QMIN, link=step21.LINK, gap=step21.GAP)
        for li, (node, c, st, pk, en, kind, src) in enumerate(sets[s]):
            sh = np.array([simulate.leak_shape(i, st, pk, en, kind) for i in range(STEPS)])
            q5 = c * sh * np.sqrt(np.clip(PL[:, li], 0, None))
            qh = q5[:len(q5) // 12 * 12].reshape(-1, 12).mean(axis=1)
            t = int(np.nonzero(qh >= 0.5 * qh.max())[0][0])
            k = t // 24 + 1
            dist = ndist(node)
            est = estimates(states, k, t)
            row = {"set": s, "node": node, "kind": kind, "src": src, "start_day": st // DAY5, "k": k,
                   "q_peak": float(qh.max()), "q_k": float(qh[t:t + 24].mean()),
                   "p_node": float(np.median(PL[st:min(en, st + 7 * DAY5), li])),
                   "pi": float(np.mean(dist <= RADIUS))}
            for kk in keys:
                row[kk] = score(dist, est[kk])
            j, info = localise.shape_chosen(states, k, window=30)
            ramps = [cc for cc in info if info[cc][0] == "ramp"]
            row["n_cand"], row["n_ramp"] = len(info), len(ramps)
            row["near_ramp"] = int(any(dist[cc] <= RADIUS for cc in ramps))
            row["near_cand"] = int(any(dist[cc] <= RADIUS for cc in info))
            rows.append(row)
        for i, t in items:
            pipe = events[i][0]
            est = estimates(states, t // 24 + 1, t)
            ctrl.append({"set": s, "pipe": pipe, **{kk: score(dpipe[pipe], est[kk]) for kk in keys}})

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    hit = {kk: np.array([w[kk] for w in rows]) <= RADIUS for kk in keys}
    out = ["# water-leaks step 25: held-out check of step 24's rule. 64 injected leaks (8 sets of 8; type, diameter, rise",
           "# and duration resampled from BattLeDIM's 33; new junctions > 300 m from every real leak; new start times),",
           "# simulated through L-TOWN_Real.inp as emitters (Cd 0.75) and added to the published pressures; residual",
           "# D_inj = that minus the leak-free run; step 21's tracker and step 24's rules frozen; rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "", "## within 300 m (P(chance >=); median error m)"]

    def line(lab, kk, m=None):
        m = np.ones(n, bool) if m is None else m
        h = hit[kk]
        d = np.array([w[kk] for w in rows])
        return (f"  {lab:<44} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.2g}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, kk in (("R30, primary (step 24, frozen)", "R30"), ("ref: T-D latest onset (step 21)", "TD"),
                    ("ref: S30 steepest (step 22)", "S30"), ("ref: C30 shape-timed (step 23)", "C30")):
        out.append(line(lab, kk))
    out += ["", "## variants (no verdicts)"]
    for lab, kk in (("R30-S (ramp by 14-day least-squares slope)", "R30S"), ("R30-L (ramp by fitted level on day k)", "R30L"),
                    ("R14 (onset within 14 days)", "R14"), ("R60 (onset within 60 days)", "R60")):
        out.append(line(lab, kk))
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_ in (("R30", "TD"), ("R30", "S30"), ("R30", "C30"), ("S30", "TD")):
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {a_} only {x}, {b_} only {y}: P = {p:.3f}")
    per_set = [int(sum(1 for w in rows if w["set"] == s and w["R30"] <= RADIUS)) for s in SEEDS]
    per_set_td = [int(sum(1 for w in rows if w["set"] == s and w["TD"] <= RADIUS)) for s in SEEDS]
    out.append(f"  per set, R30 hits {per_set}; T-D {per_set_td}")

    nc = np.array([w["near_cand"] for w in rows], bool)
    nr = np.array([w["near_ramp"] for w in rows], bool)
    hr = np.array([w["n_ramp"] > 0 for w in rows])
    out += ["", "## where the leak's atom is",
            f"  a candidate within 300 m on day k: {int(nc.sum())} of {n} (abrupt {int(nc[~inc].sum())}, incipient {int(nc[inc].sum())})",
            f"  a ramp candidate within 300 m: {int(nr.sum())} (abrupt {int(nr[~inc].sum())}, incipient {int(nr[inc].sum())});"
            f" R30 hits {int(hit['R30'][nr].sum())} of them",
            f"  leaks with any ramp candidate {int(hr.sum())}: R30 hits {int(hit['R30'][hr].sum())}, T-D {int(hit['TD'][hr].sum())};"
            f" with none {int((~hr).sum())}: R30 {int(hit['R30'][~hr].sum())}, T-D {int(hit['TD'][~hr].sum())} (equal by construction)"]

    qp = np.array([w["q_peak"] for w in rows])
    real_peak = np.array([flows[p].max() for p in flows])
    out += ["", "## injected leak sizes against the published ones (hourly mean flow, m3/h)",
            f"  injected peak: median {np.median(qp):.1f} (range {qp.min():.1f} to {qp.max():.1f}); node pressure in the first week median"
            f" {np.median([w['p_node'] for w in rows]):.1f} m",
            f"  published 33 leaks' peak: median {np.median(real_peak):.1f} (range {real_peak.min():.1f} to {real_peak.max():.1f})"]

    out += ["", "## control: the 32 real leaks on each set's tracker (hits within 300 m; step 24 on D: R30 15, T-D 13)"]
    for kk in ("R30", "TD", "S30", "C30"):
        per = [sum(1 for c in ctrl if c["set"] == s and c[kk] <= RADIUS) for s in SEEDS]
        out.append(f"  {kk:<4} {per} (on D: {sum(1 for p in real_base if real_base[p][kk] <= RADIUS)})")

    out += ["", "  set node   kind       src start  k   | q_peak |  R30 |  T-D |  S30 |  C30 | cand | ramps | near"]
    for w in rows:
        out.append(f"  {w['set']:3d} {w['node']:<6} {w['kind']:<10} {w['src']:3d} {w['start_day']:5d} {w['k']:4d} | {w['q_peak']:6.1f} |"
                   f" {w['R30']:4.0f} | {w['TD']:4.0f} | {w['S30']:4.0f} | {w['C30']:4.0f} | {w['n_cand']:4d} | {w['n_ramp']:5d} |"
                   f" {'ramp' if w['near_ramp'] else ('cand' if w['near_cand'] else '-')}")

    h = int(hit["R30"].sum())
    pa = localise.poisson_binomial_tail(ps, h)
    htd = int(hit["TD"].sum())
    x, y, p = tests[("R30", "TD")]
    ri, ti = hit["R30"][inc].mean(), hit["TD"][inc].mean()
    ra, ta = int(hit["R30"][~inc].sum()), int(hit["TD"][~inc].sum())
    out += ["", "## pre-registered predictions (LOG.md, step 25 plan)",
            f"  (a) R30 beats chance at P < 0.001: P = {pa:.2g}: {'HELD' if pa < 0.001 else 'FAILED'}",
            f"  (b) R30 puts at least 19 of 64 within 300 m: {h}: {'HELD' if h >= 19 else 'FAILED'}",
            f"  (c) R30 has more hits than T-D: {h} against {htd}: {'HELD' if h > htd else 'FAILED'}",
            f"  (d) R30 beats T-D at P < 0.05: R30 only {x}, T-D only {y}, P = {p:.3f}: {'HELD' if (p < 0.05 and x > y) else 'FAILED'}",
            f"  (e) incipient hit share R30 > T-D: {ri:.2f} against {ti:.2f}: {'HELD' if ri > ti else 'FAILED'}",
            f"  (f) abrupt hits R30 >= T-D - 3: {ra} against {ta}: {'HELD' if ra >= ta - 3 else 'FAILED'}"]

    cols = ["set", "node", "kind", "src", "start_day", "k", "q_peak", "q_k", "p_node", "pi"] + keys + ["n_cand", "n_ramp", "near_cand", "near_ramp"]
    tsv = ["\t".join(cols)] + ["\t".join(str(w[c]) if isinstance(w[c], (str, int)) else f"{w[c]:.4g}" for c in cols) for w in rows]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    ccols = ["set", "pipe"] + keys
    (HERE / "real_control.tsv").write_text("\n".join(["\t".join(ccols)] + ["\t".join(
        str(c[k_]) if isinstance(c[k_], (str, int)) else f"{c[k_]:.4g}" for k_ in ccols) for c in ctrl]) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
