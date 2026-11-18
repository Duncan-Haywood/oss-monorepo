"""Step 11: sensitivity-based localisation on the nominal L-Town model (milestone 3, H3).

    PYTHONPATH=src python experiments/step11-localise/run.py   # from research/water-leaks

Needs wntr (1.5.0 used). Signatures for 782 junctions x 3 leak sizes are simulated once (about
5 minutes on 4 cores) and cached under $WATER_LEAKS_CACHE. Deterministic. Writes results.txt and
leaks.tsv next to this file. The plan is in LOG.md (step 11), written before any result.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, harness, localise, network
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
QS = [5.0, 1.0, 20.0]          # primary first
RADIUS = 300.0
W, G, WMIN = 14, 7, 7


def junctions(inp_text):
    out, sec = [], None
    for ln in inp_text.splitlines():
        s = ln.split(";")[0].strip()
        if s.startswith("["):
            sec = s.upper()
        elif s and sec == "[JUNCTIONS]":
            out.append(s.split()[0])
    return out


def load_signatures(inp, sensors, nodes, q):
    p = data.cache_dir() / f"step11_sig_q{q:g}.npy"
    if p.exists():
        S = np.load(p)
        if S.shape == (len(nodes), len(sensors)):
            return S
    S = localise.signatures(str(inp), sensors, nodes, q)
    np.save(p, S)
    return S


def detector_alarms():
    """{detector: {pipe: alarm hour}} for the 2019 new leaks each detected (ungated 30-day rule)."""
    out = {"D1-F": {}, "LILA-auto": {}}
    for ln in (EXP / "step1-baseline" / "alarms.tsv").read_text().splitlines()[1:]:
        f = ln.split("\t")
        if f[0] == "F" and f[1] == "240" and f[4]:
            out["D1-F"][f[4]] = np.datetime64(f[2], "h")
    for ln in (EXP / "step2-lila" / "alarms.tsv").read_text().splitlines()[1:]:
        f = ln.split("\t")
        if f[0] == "index" and f[1] == "1.0" and f[2] == "20" and f[5]:
            out["LILA-auto"][f[5]] = np.datetime64(f[3], "h")
    return out


def main():
    S_ = harness.setup()
    hrs, P, Lv, events, pcols, links = S_["hrs"], S_["P"], S_["Lv"], S_["events"], S_["pcols"], S_["links"]
    inp = data.fetch("L-TOWN.inp")
    nodes = junctions(inp.read_text())
    sig = {q: load_signatures(inp, pcols, nodes, q) for q in QS}
    A = localise.design_noflow(hrs, Lv)
    first_scored = hrs[(G + WMIN) * 24]

    # distances: every junction to every leak pipe (along pipes), via both pipe ends
    s8 = __import__("importlib.util").util
    spec = s8.spec_from_file_location("step8", EXP / "step8-gated" / "run.py")
    step8 = s8.module_from_spec(spec)
    spec.loader.exec_module(step8)
    flows = step8.leak_flows(hrs)
    leak_pipes = sorted({e[0] for e in events})
    dpipe = {}
    for pipe in leak_pipes:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(n, math.inf), db.get(n, math.inf)) + length / 2 for n in nodes])
    sensor_d = {s: network.graph_dist(links, s) for s in pcols}

    def sensor_to_pipe(s, pipe):
        return network.pipe_dist(links, sensor_d[s], pipe)

    out = ["# water-leaks step 11: sensitivity-based localisation on the nominal L-TOWN.inp (WNTR, EPANET, 24 h from 00:00, hourly)",
           f"# signature: 24 h mean pressure change at the {len(pcols)} sensors for a constant leak of q m3/h at each of {len(nodes)} junctions",
           "# residual: mean (pressure - D1 no-flow prediction) over the 24 h from the localisation hour; model fitted on days [d-21, d-7)",
           f"# estimate: argmax Pearson correlation (primary) or cosine; error = along-pipe distance to the leak pipe midpoint; rule {RADIUS:g} m",
           "# chance: a uniformly drawn junction; p_i = share of junctions within 300 m of leak i; Poisson-binomial tail", ""]
    sat = np.array([np.abs(sig[q]).max() for q in QS])
    out.append("signature size (max |dp| over junctions and sensors, m): " + ", ".join(f"q={q:g}: {s:.3f}" for q, s in zip(QS, sat)))
    out.append(f"junctions within 300 m of a leak pipe (share), median over leak pipes: {np.median([np.mean(dpipe[p] <= RADIUS) for p in leak_pipes]):.3f}")
    out.append("")

    tsv = ["set\tpipe\tyear\tt\tdelay_h\tpeak\test_pearson\terr_pearson_m\test_cosine\terr_cosine_m\tmas\terr_mas_m\talarm_sensor\terr_alarm_m\tp_chance\tsame_q1\tsame_q20"]

    def localise_set(name, items, alarm_sensor=None):
        """items: [(event index, hour index)]"""
        rows = []
        for i, t in items:
            pipe, on = events[i][0], events[i][1]
            r = localise.residual(P, A, t, W=W, g=G)
            j = {q: localise.estimate(r, sig[q], "pearson") for q in QS}
            jc = localise.estimate(r, sig[QS[0]], "cosine")
            mas = pcols[int(np.argmin(r))]
            row = {"pipe": pipe, "year": 2019 if on >= Y19 else 2018, "t": hrs[t],
                   "delay": int((hrs[t] - on.astype("datetime64[h]")).astype(int)), "peak": events[i][3],
                   "ep": nodes[j[QS[0]]], "dp": float(dpipe[pipe][j[QS[0]]]),
                   "ec": nodes[jc], "dc": float(dpipe[pipe][jc]),
                   "mas": mas, "dm": sensor_to_pipe(mas, pipe),
                   "pi": float(np.mean(dpipe[pipe] <= RADIUS)),
                   "s1": j[1.0] == j[QS[0]], "s20": j[20.0] == j[QS[0]],
                   "top10": float(np.min(dpipe[pipe][np.argsort(-localise.scores(r, sig[QS[0]]))[:10]]))}
            if alarm_sensor is not None:
                row["as"] = alarm_sensor[pipe]
                row["da"] = sensor_to_pipe(alarm_sensor[pipe], pipe)
            rows.append(row)
            tsv.append("\t".join([name, pipe, str(row["year"]), str(row["t"]), str(row["delay"]), f"{row['peak']:.2f}",
                                   row["ep"], f"{row['dp']:.0f}", row["ec"], f"{row['dc']:.0f}", mas, f"{row['dm']:.0f}",
                                   row.get("as", ""), f"{row['da']:.0f}" if "da" in row else ""]))
            tsv[-1] += f"\t{row['pi']:.4f}\t{int(row['s1'])}\t{int(row['s20'])}"
        n = len(rows)
        out.append(f"## {name}: {n} leaks")
        out.append("  pipe   year localised at       +h  peak  | model (Pearson) err m | cosine err m | most-affected sensor err m"
                   + (" | alarm sensor err m" if alarm_sensor else "") + " | p_chance  best-of-top-10 m")
        for w in rows:
            out.append(f"  {w['pipe']:>5} {w['year']} {str(w['t']):<16} {w['delay']:>5} {w['peak']:5.1f} | {w['ep']:>5} {w['dp']:7.0f} | "
                       f"{w['ec']:>5} {w['dc']:7.0f} | {w['mas']:>5} {w['dm']:7.0f}"
                       + (f" | {w['as']:>5} {w['da']:7.0f}" if alarm_sensor else "") + f" | {w['pi']:.3f}  {w['top10']:7.0f}")
        ps = [w["pi"] for w in rows]
        out.append(f"  chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m")
        cols = [("model (Pearson)", "dp"), ("model (cosine)", "dc"), ("most-affected sensor", "dm")]
        if alarm_sensor:
            cols.append(("alarm sensor", "da"))
        for label, k in cols:
            d = np.array([w[k] for w in rows])
            hit = int((d <= RADIUS).sum())
            out.append(f"  {label:<21} within {RADIUS:g} m: {hit:>2}/{n} ({100 * hit / n:4.0f}%), P(chance >=) {localise.poisson_binomial_tail(ps, hit):.4f}; "
                       f"median error {np.median(d):5.0f} m (range {d.min():.0f} to {d.max():.0f})")
        top = np.array([w["top10"] for w in rows])
        out.append(f"  descriptive: nearest of the model's top 10 junctions within {RADIUS:g} m for {(top <= RADIUS).sum()}/{n}; median {np.median(top):.0f} m")
        a = np.array([w["dp"] <= RADIUS for w in rows])
        b = np.array([w["dm"] <= RADIUS for w in rows])
        x, y = localise.sign_test_counts(a, b)
        from water_leaks import stats
        out.append(f"  paired, 300 m hits: model only {x}, most-affected sensor only {y}, exact sign test P = {stats.sign_test(x, y):.3f}")
        dpm = np.array([w["dp"] for w in rows]) - np.array([w["dm"] for w in rows])
        out.append(f"  paired errors: model closer on {(dpm < 0).sum()}, sensor closer on {(dpm > 0).sum()}, ties {(dpm == 0).sum()}")
        s = np.mean([w["s1"] and w["s20"] for w in rows])
        out.append(f"  stability in q: same junction at q = 1, 5 and 20 for {100 * s:.0f}% of leaks "
                   f"(q=1: {np.mean([w['s1'] for w in rows]) * 100:.0f}%, q=20: {np.mean([w['s20'] for w in rows]) * 100:.0f}%)")
        out.append("")
        return rows

    # (i) detector-timed: H3
    det = detector_alarms()
    idx = {e[0]: i for i, e in enumerate(events) if e[1] >= Y19}
    h_index = {h: k for k, h in enumerate(hrs)}
    for name, al in det.items():
        sens = {}
        for ln in ((EXP / "step1-baseline" / "alarms.tsv") if name == "D1-F" else (EXP / "step2-lila" / "alarms.tsv")).read_text().splitlines()[1:]:
            f = ln.split("\t")
            if name == "D1-F" and f[0] == "F" and f[1] == "240" and f[4]:
                sens[f[4]] = f[3]
            if name == "LILA-auto" and f[0] == "index" and f[1] == "1.0" and f[2] == "20" and f[5]:
                sens[f[5]] = f[4]
        items = [(idx[p], h_index[t]) for p, t in sorted(al.items(), key=lambda kv: kv[1]) if p in idx]
        localise_set(f"detector-timed, {name} (2019 new leaks it detected, at its alarm hour)", items, sens)

    # (ii) oracle-timed: every scored new leak of both years, at the first hour its flow reaches half its peak
    items = []
    for i, e in enumerate(events):
        if not (e[1] >= first_scored):
            continue
        q = flows[e[0]]
        k = int(np.nonzero(q >= 0.5 * q.max())[0][0])
        items.append((i, k))
    items.sort(key=lambda it: it[1])
    localise_set("oracle-timed (scored new leaks of 2018 and 2019, at the first hour of half-peak flow)", items)

    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
