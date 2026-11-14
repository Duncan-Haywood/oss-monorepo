"""Step 12: time-resolved and size-matched signatures on the nominal L-Town model (milestone 3, H3).

    PYTHONPATH=src python experiments/step12-timesize/run.py   # from research/water-leaks

Needs wntr (1.5.0 used). Hourly signatures for 782 junctions x 6 leak sizes (4,692 EPANET runs,
about 15 minutes on 4 cores) are simulated once and cached under $WATER_LEAKS_CACHE.
Deterministic. Writes results.txt and leaks.tsv next to this file. The plan is in LOG.md
(step 12), written before any result; step 11's leak sets, residual model and scoring are reused.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, harness, localise, network, stats
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
GRID = [1.0, 2.0, 5.0, 10.0, 20.0, 30.0]
RADIUS = 300.0
TIE = 1e-4   # correlation; float32 rounding of the signatures moves scores by up to ~1e-5
W, G, WMIN = 14, 7, 7
METHODS = [("A", "24 h mean, q = 5 (step 11)"), ("B", "time-resolved, q = 5"),
           ("C", "24 h mean, q = flow balance"), ("D", "time-resolved, q = flow balance (primary)")]


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step8 = _load("step8", EXP / "step8-gated" / "run.py")
step11 = _load("step11", EXP / "step11-localise" / "run.py")


def hourly_signatures(inp, sensors, nodes, q):
    p = data.cache_dir() / f"step12_sigH_q{q:g}.npy"
    if p.exists():
        S = np.load(p)
        if S.shape == (len(nodes), 24, len(sensors)):
            return S
    S = localise.signatures(str(inp), sensors, nodes, q, hourly=True)
    np.save(p, S)
    return S


def step11_rows():
    out = {}
    for ln in (EXP / "step11-localise" / "leaks.tsv").read_text().splitlines()[1:]:
        f = ln.split("\t")
        out[(f[0], f[1])] = {"est": f[6], "mas": f[10], "s1": f[15] == "1", "s20": f[16] == "1"}
    return out


def main():
    S_ = harness.setup()
    hrs, P, F, Lv, events, pcols, links = (S_[k] for k in ("hrs", "P", "F", "Lv", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    supply = (F[:, fcols.index("p227")] + F[:, fcols.index("p235")])[:, None]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    SH = {q: hourly_signatures(inp, pcols, nodes, q) for q in GRID}
    SM = {q: SH[q].mean(axis=1) for q in GRID}
    A = localise.design_noflow(hrs, Lv)
    first_scored = hrs[(G + WMIN) * 24]
    flows = step8.leak_flows(hrs)
    ref = step11_rows()

    leak_pipes = sorted({e[0] for e in events})
    dpipe = {}
    for pipe in leak_pipes:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(n, math.inf), db.get(n, math.inf)) + length / 2 for n in nodes])
    sensor_d = {s: network.graph_dist(links, s) for s in pcols}

    out = ["# water-leaks step 12: time-resolved and size-matched signatures on the nominal L-TOWN.inp (WNTR 1.5.0, EPANET, 24 h from 00:00, hourly)",
           f"# signatures: hourly pressure change at {len(pcols)} sensors, leak of q m3/h at each of {len(nodes)} junctions, q in {GRID}",
           "# residual: (pressure - D1 no-flow prediction) per hour over the 24 h from the localisation hour; model fitted on days [d-21, d-7)",
           "# q-hat: mean residual of supply (p227 + p235) under the same regression; signature at the grid q nearest q-hat in log scale",
           "# methods: " + "; ".join(f"{k} {v}" for k, v in METHODS),
           f"# error: along-pipe distance to the leak pipe midpoint; rule {RADIUS:g} m; chance: Poisson-binomial over uniform junctions", ""]
    sat = ", ".join(f"q={q:g}: {np.abs(SH[q]).max():.3f}" for q in GRID)
    out.append(f"hourly signature size (max |dp|, m): {sat}")
    out.append("")
    tsv = ["set\tpipe\tyear\tt\tqhat\tq_used\tleak_mean_q\test_A\terr_A_m\test_B\terr_B_m\test_C\terr_C_m\test_D\terr_D_m\tmas\terr_mas_m\tp_chance"]
    gate_fail, gate_tie = [], []

    def localise_set(name, items):
        rows = []
        for i, t in items:
            pipe = events[i][0]
            R = localise.residual_hourly(P, A, t, W=W, g=G)
            r = R.mean(axis=0)
            qhat = float(localise.residual_hourly(supply, A, t, W=W, g=G).mean())
            qu = localise.nearest_q(qhat, GRID)
            hod0 = int((hrs[t] - hrs[t].astype("datetime64[D]")).astype(int))
            est = {"A": localise.estimate(r, SM[5.0]),
                   "B": int(np.argmax(localise.scores_tr(R, localise.aligned(SH[5.0], hod0)))),
                   "C": localise.estimate(r, SM[qu]),
                   "D": int(np.argmax(localise.scores_tr(R, localise.aligned(SH[qu], hod0))))}
            mas = pcols[int(np.argmin(r))]
            # gate: step 11's estimates from the hourly signatures' 24 h means
            # (amended after the first run, results_firstrun.txt: a mismatch whose two candidates
            # score within TIE of each other is a numerical tie, counted and listed, not a failure)
            g = ref.get((name, pipe))
            if g is None:
                gate_fail.append((name, pipe, "missing"))
            else:
                sc = {q: localise.scores(r, SM[q]) for q in (5.0, 1.0, 20.0)}
                ja = nodes.index(g["est"])
                if mas != g["mas"]:
                    gate_fail.append((name, pipe, "sensor"))
                if nodes[est["A"]] != g["est"]:
                    (gate_tie if sc[5.0][est["A"]] - sc[5.0][ja] < TIE else gate_fail).append((name, pipe, "q=5"))
                for q, flag in ((1.0, "s1"), (20.0, "s20")):
                    jq = int(np.argmax(sc[q]))
                    same = jq == est["A"]
                    if same == g[flag]:
                        continue
                    # step 11 said same: is its estimate tied with our argmax at q? said different: is ours tied with a runner-up?
                    gap = sc[q][jq] - (sc[q][ja] if g[flag] else np.sort(sc[q])[-2])
                    (gate_tie if gap < TIE else gate_fail).append((name, pipe, f"q={q:g} agreement"))
            row = {"pipe": pipe, "year": 2019 if events[i][1] >= Y19 else 2018, "t": hrs[t], "qhat": qhat, "qu": qu,
                   "lq": float(flows[pipe][t:t + 24].mean()), "mas": mas,
                   "dm": network.pipe_dist(links, sensor_d[mas], pipe), "pi": float(np.mean(dpipe[pipe] <= RADIUS))}
            for k, j in est.items():
                row["e" + k], row["d" + k] = nodes[j], float(dpipe[pipe][j])
            rows.append(row)
            tsv.append("\t".join([name, pipe, str(row["year"]), str(row["t"]), f"{qhat:.2f}", f"{qu:g}", f"{row['lq']:.2f}"]
                                 + [x for k in "ABCD" for x in (row["e" + k], f"{row['d' + k]:.0f}")]
                                 + [mas, f"{row['dm']:.0f}", f"{row['pi']:.4f}"]))
        n = len(rows)
        out.append(f"## {name}: {n} leaks")
        out.append("  pipe   year localised at      q-hat q-used leak-q |   A err m |   B err m |   C err m |   D err m | sensor err m")
        for w in rows:
            out.append(f"  {w['pipe']:>5} {w['year']} {str(w['t']):<16} {w['qhat']:6.1f} {w['qu']:5g} {w['lq']:6.1f} | "
                       + " | ".join(f"{w['e' + k]:>5} {w['d' + k]:4.0f}" for k in "ABCD") + f" | {w['mas']:>5} {w['dm']:4.0f}")
        ps = [w["pi"] for w in rows]
        out.append(f"  chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m")
        ratio = np.array([w["qhat"] / w["lq"] if w["lq"] > 0 else np.inf for w in rows])
        out.append(f"  q-hat within a factor of 2 of the leak's mean flow over the same 24 h: {int(((ratio >= 0.5) & (ratio <= 2)).sum())}/{n}; "
                   f"median q-hat/leak-q {np.median(ratio):.2f}")
        b = np.array([w["dm"] <= RADIUS for w in rows])
        dm = np.array([w["dm"] for w in rows])
        out.append(f"  most-affected sensor within {RADIUS:g} m: {int(b.sum()):>2}/{n} ({100 * b.mean():4.0f}%), "
                   f"P(chance >=) {localise.poisson_binomial_tail(ps, int(b.sum())):.4f}; median error {np.median(dm):5.0f} m")
        raw, lines = [], []
        for k, label in METHODS:
            d = np.array([w["d" + k] for w in rows])
            a = d <= RADIUS
            x, y = localise.sign_test_counts(a, b)
            p = stats.sign_test(x, y)
            raw.append(p)
            lines.append((k, label, int(a.sum()), localise.poisson_binomial_tail(ps, int(a.sum())), np.median(d), x, y, p,
                          int((d < dm).sum()), int((d > dm).sum())))
        adj = stats.holm(raw)
        for (k, label, hit, pc, med, x, y, p, closer, farther), pa in zip(lines, adj):
            out.append(f"  {k} {label:<40} within {RADIUS:g} m: {hit:>2}/{n} ({100 * hit / n:4.0f}%), P(chance >=) {pc:.4f}; "
                       f"median error {med:5.0f} m; vs sensor: {x} only / {y} only, sign P {p:.3f}, Holm {pa:.3f}; closer on {closer}, farther on {farther}")
        dA = np.array([w["dA"] <= RADIUS for w in rows])
        dD = np.array([w["dD"] <= RADIUS for w in rows])
        x, y = localise.sign_test_counts(dD, dA)
        out.append(f"  D against A, 300 m hits: D only {x}, A only {y}, exact sign test P = {stats.sign_test(x, y):.3f}")
        out.append("")
        return rows

    det = step11.detector_alarms()
    idx = {e[0]: i for i, e in enumerate(events) if e[1] >= Y19}
    h_index = {h: k for k, h in enumerate(hrs)}
    for name, al in det.items():
        items = [(idx[p], h_index[t]) for p, t in sorted(al.items(), key=lambda kv: kv[1]) if p in idx]
        localise_set(f"detector-timed, {name} (2019 new leaks it detected, at its alarm hour)", items)
    items = []
    for i, e in enumerate(events):
        if not (e[1] >= first_scored):
            continue
        q = flows[e[0]]
        items.append((i, int(np.nonzero(q >= 0.5 * q.max())[0][0])))
    items.sort(key=lambda it: it[1])
    localise_set("oracle-timed (scored new leaks of 2018 and 2019, at the first hour of half-peak flow)", items)

    gate = "PASSED" if not gate_fail else f"FAILED on {gate_fail}"
    ties = "; numerical ties (score gap < %g): %s" % (TIE, gate_tie if gate_tie else "none")
    out.insert(7, "gate (24 h means of the hourly q = 1, 5, 20 signatures reproduce step 11's estimates and most-affected sensors): "
               + gate + ties)
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0 if not gate_fail else 1


if __name__ == "__main__":
    sys.exit(main())
