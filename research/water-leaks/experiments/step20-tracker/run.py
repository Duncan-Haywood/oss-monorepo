"""Step 20: a daily tracker on a data-only residual. Date each atom's onset; localise a leak as the
active atom whose onset is nearest the alarm.

    PYTHONPATH=src python experiments/step20-tracker/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-16, step 20) before any tracker output was computed. F = published
hourly pressure minus step 11's no-flow regression (hour of day x weekday/weekend, tank level)
fitted once on the first 14 days of 2018 and frozen: no hydraulic model, no leak list. Daily means
of F are tracked by `localise.track` over step 11's nominal q = 5 signatures (per m3/h, centred).

Needs numpy and scipy, plus wntr only if step 11's q = 5 signatures are not yet cached under
$WATER_LEAKS_CACHE. Deterministic. Writes results.txt and leaks.tsv next to this file.
"""
from __future__ import annotations

import csv
import importlib.util
import math
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, harness, localise, network, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
Q = 5.0
TRAIN = 14          # days, frozen regression
QMIN, LINK, GAP = 0.5, 0.95, 2
LAG = 168


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


def frozen(P, A, days):
    tr = slice(0, days * 24)
    coef, *_ = np.linalg.lstsq(A[tr], P[tr], rcond=None)
    return P - A @ coef


def daily(X):
    n = len(X) // 24
    return X[:n * 24].reshape(n, 24, -1).mean(axis=1)


def joint(F, t, S):
    rb = F[t - LAG:t - LAG + 24].mean(axis=0)
    rt = F[t:t + 24].mean(axis=0)
    sb, xb, _ = localise.nn_pursuit(rb, S)
    st, xt, _ = localise.nn_pursuit(rt, S, support=sb)
    return localise.rise(sb, xb, st, xt) if (st or sb) else None


def crms(r):
    return float(np.sqrt(np.mean((r - r.mean()) ** 2)))


def main():
    S_ = harness.setup()
    hrs, P, Lv, events, links = (S_[k] for k in ("hrs", "P", "Lv", "events", "links"))
    pcols = S_["pcols"]
    inp = data.fetch("L-TOWN.inp")
    nodes = step11.junctions(inp.read_text())
    S = step11.load_signatures(inp, pcols, nodes, Q) / Q
    flows = step8.leak_flows(hrs)
    A = localise.design_noflow(hrs, Lv)

    ref15 = _tsv(EXP / "step15-oracle" / "leaks.tsv")
    ref17 = _tsv(EXP / "step17-replay" / "leaks.tsv")
    ref18 = _tsv(EXP / "step18-lagged" / "leaks.tsv")
    ref19 = _tsv(EXP / "step19-joint" / "leaks.tsv")
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

    configs = {"T": dict(train=TRAIN, qmin=QMIN, link=LINK),
               "q0": dict(train=TRAIN, qmin=1e-9, link=LINK), "q1": dict(train=TRAIN, qmin=1.0, link=LINK),
               "l90": dict(train=TRAIN, qmin=QMIN, link=0.90), "l99": dict(train=TRAIN, qmin=QMIN, link=0.99),
               "lno": dict(train=TRAIN, qmin=QMIN, link=None), "tr28": dict(train=28, qmin=QMIN, link=LINK)}
    Fs, tracks = {}, {}
    for name, c in configs.items():
        if c["train"] not in Fs:
            Fs[c["train"]] = frozen(P, A, c["train"])
        tracks[name] = localise.track(daily(Fs[c["train"]]), S, qmin=c["qmin"], link=c["link"], gap=GAP)
    F = Fs[TRAIN]
    out_T, rms_T = tracks["T"]

    rows = []
    for i, t in items:
        pipe = events[i][0]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        od = on // 24
        k = t // 24 + 1
        st = out_T[k]
        row = {"pipe": pipe, "t": hrs[t], "kind": ref17[pipe]["kind"], "pi": float(ref15[pipe]["p_chance"]),
               "q": float(flows[pipe][t:t + 24].mean()), "on_day": od, "k": k}
        for name, (out, _) in tracks.items():
            row[name] = err(pipe, localise.latest_onset(out[k]))
        row["T0"] = err(pipe, localise.latest_onset(out_T[t // 24]))
        row["Ton"] = err(pipe, localise.nearest_onset(st, od))
        row["J"] = err(pipe, joint(F, t, S))
        near = [j for j in st if dpipe[pipe][j] <= RADIUS]
        dated = [st[j][1] for j in near if od - 2 <= st[j][1] <= k]
        row["n_act"] = len(st)
        row["near"] = len(near)
        row["dated"] = int(bool(dated))
        row["onset_gap"] = float(min(dated, key=lambda d: abs(d - od)) - od) if dated else math.nan
        order = sorted(st, key=lambda j: (-st[j][1], -st[j][0], j))
        row["rank"] = (1 + min(order.index(j) for j in near)) if near else 0
        m_near = int((dpipe[pipe] <= RADIUS).sum())
        row["p_set"] = 1.0 - math.comb(len(nodes) - m_near, len(st)) / math.comb(len(nodes), len(st)) if st else 0.0
        row["Plag"] = float(ref18[pipe]["A_P168"])
        row["d1"] = float(ref18[pipe]["d1"])
        row["J19"] = float(ref19[pipe]["J168"])
        row["or17"] = float(ref17[pipe]["err_A"])
        rows.append(row)

    n = len(rows)
    ps = [w["pi"] for w in rows]
    inc = np.array([w["kind"] == "incipient" for w in rows])
    errkeys = list(configs) + ["T0", "Ton", "J", "Plag", "d1", "J19", "or17"]
    hit = {kk: np.array([w[kk] for w in rows]) <= RADIUS for kk in errkeys}
    out = ["# water-leaks step 20: daily tracker on a data-only residual. F = published hourly pressure minus step 11's",
           f"# no-flow regression fitted on 2018 days 0-{TRAIN - 1} and frozen; daily means tracked by non-negative pursuit",
           "# over nominal L-TOWN.inp q = 5 signatures (per m3/h, centred); active >= 0.5 m3/h, gap 2 d, link r >= 0.95;",
           "# estimate = active atom with the latest onset on the first whole day after t; rule 300 m along pipes", "",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "",
           "## within 300 m (P(chance >=); median error m)"]

    def line(lab, kk):
        h = hit[kk]
        d = np.array([w[kk] for w in rows])
        return (f"  {lab:<44} {h.sum():>2} of {n} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f});"
                f" abrupt {int(h[~inc].sum())} of {int((~inc).sum())}, incipient {int(h[inc].sum())} of {int(inc.sum())}")

    for lab, kk in (("T, primary", "T"), ("T-on (oracle onset)", "Ton"), ("T-0 (day t div 24, no data past t+24)", "T0"),
                    ("J on F (step 19's rule, same residual)", "J"),
                    ("ref: A on P-lag(168) (step 18, data only)", "Plag"), ("ref: A on D1 regression (step 11)", "d1"),
                    ("ref: J-lag(168) on D (step 19, demand oracle)", "J19"), ("ref: one-leak oracle (step 17)", "or17")):
        out.append(line(lab, kk))
    out += ["", "## sweep (no verdicts)"]
    for lab, kk in (("active >= 0 (any positive flow)", "q0"), ("active >= 1.0 m3/h", "q1"), ("link r >= 0.90", "l90"),
                    ("link r >= 0.99", "l99"), ("no linking", "lno"), ("28-day training window", "tr28")):
        out.append(line(lab, kk))

    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]
    tests = {}
    for a_, b_ in (("T", "J"), ("T", "Plag"), ("T", "d1"), ("T", "or17"), ("Ton", "T")):
        x, y = localise.sign_test_counts(hit[a_], hit[b_])
        p = stats.sign_test(x, y)
        tests[(a_, b_)] = (x, y, p)
        out.append(f"  {a_} only {x}, {b_} only {y}: P = {p:.3f}")

    dated = np.array([w["dated"] for w in rows], bool)
    near = np.array([w["near"] for w in rows]) > 0
    out += ["", "## onset dating (an active atom within 300 m on day k with onset in [true onset day - 2, k])"]
    for lab, m in (("abrupt", ~inc), ("incipient", inc), ("all", np.ones(n, bool))):
        g = np.array([w["onset_gap"] for w, kk in zip(rows, m) if kk])
        g = g[~np.isnan(g)]
        out.append(f"  {lab:<9}: near atom active {int(near[m].sum())} of {int(m.sum())}; dated {int(dated[m].sum())};"
                   f" chance of a near atom (as many atoms at random) {sum(w['p_set'] for w, kk in zip(rows, m) if kk):.2f};"
                   f" onset gap days median {np.median(g) if len(g) else math.nan:.0f}")

    na = np.array([len(o) for o in out_T])
    rr = np.array(rms_T)
    f0 = np.array([crms(r) for r in daily(F)])
    out += ["", "## the tracker over 2018-19 (primary)",
            f"  days {len(out_T)}; active atoms per day median {np.median(na):.0f} (range {na.min()} to {na.max()});"
            f" days at the 24-atom cap {int((na >= 24).sum())}",
            f"  centred RMS of daily F: median {np.median(f0):.4f} m (5th-95th {np.percentile(f0, 5):.4f} to {np.percentile(f0, 95):.4f});"
            f" after the fit median {np.median(rr):.4f} m",
            f"  distinct onsets (track starts) {len({(j, o) for s in out_T for j, (_, o) in s.items()})}"]

    starts = {}
    for d, s_ in enumerate(out_T):
        for j, (_, o) in s_.items():
            starts.setdefault((j, o), [d, d])[1] = d
    lens = np.array([b - a + 1 for a, b in starts.values()])
    new_per_day = np.array([sum(1 for _, o in s_.values() if o == d) for d, s_ in enumerate(out_T)])
    rk = np.array([w["rank"] for w in rows if w["near"]])
    act = np.array([w["n_act"] for w in rows])
    out += ["", "## seen after the run (post hoc, no verdict): why the latest-onset rule fails",
            f"  tracks: {len(lens)}; length days median {np.median(lens):.0f} (range {lens.min()} to {lens.max()});"
            f" new tracks per day mean {new_per_day[1:].mean():.2f}",
            f"  active atoms on day k at the 32 leaks: median {np.median(act):.0f}; at 23 or 24 (the cap is 24): {int((act >= 23).sum())}",
            f"  where a near atom is active ({len(rk)} leaks), its rank in the onset order: median {np.median(rk):.0f};"
            f" first {int((rk == 1).sum())}, top 3 {int((rk <= 3).sum())}",
            f"  T hits by leak date: 2018 {int(hit['T'][[str(w['t']) < '2019' for w in rows]].sum())} of"
            f" {sum(str(w['t']) < '2019' for w in rows)}, 2019 {int(hit['T'][[str(w['t']) >= '2019' for w in rows]].sum())} of"
            f" {sum(str(w['t']) >= '2019' for w in rows)}"]

    out += ["", "  pipe  kind       t                 q m3/h | on_d |  k  |   T  | Ton |  T0  |   J  | Plag | act | near | rank | gap"]
    for w in rows:
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {str(w['t']):<16} {w['q']:6.1f} | {w['on_day']:4d} | {w['k']:3d} |"
                   f" {w['T']:4.0f} | {w['Ton']:4.0f} | {w['T0']:4.0f} | {w['J']:4.0f} | {w['Plag']:4.0f} | {w['n_act']:3d} |"
                   f" {w['near']:4d} | {w['rank']:4d} | {w['onset_gap']:4.0f}")

    h = int(hit["T"].sum())
    hi = int(hit["T"][inc].sum())
    x, y, p = tests[("T", "J")]
    di = int(dated[inc].sum())
    out += ["", "## pre-registered predictions (LOG.md, step 20 plan)",
            f"  (a) T puts more than 12 of 32 within 300 m: {h}: {'HELD' if h > 12 else 'FAILED'}",
            f"  (b) T puts more than 15 of 32 within 300 m: {h}: {'HELD' if h > 15 else 'FAILED'}",
            f"  (c) T puts more than 3 of 17 incipient leaks within 300 m: {hi}: {'HELD' if hi > 3 else 'FAILED'}",
            f"  (d) T puts at most 27 of 32 within 300 m: {h}: {'HELD' if h <= 27 else 'FAILED'}",
            f"  (e) T beats J on F at P < 0.05: T only {x}, J only {y}, P = {p:.3f}: {'HELD' if (p < 0.05 and x > y) else 'FAILED'}",
            f"  (f) at least 8 of 17 incipient leaks dated: {di}: {'HELD' if di >= 8 else 'FAILED'}"]

    keys = ["pipe", "kind", "t", "q", "on_day", "k"] + errkeys + ["n_act", "near", "rank", "dated", "onset_gap", "p_set"]
    tsv = ["\t".join(keys)]
    for w in rows:
        tsv.append("\t".join(str(w[kk]) if isinstance(w[kk], (str, int)) or kk == "t" else f"{w[kk]:.4g}" for kk in keys))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    np.savetxt(HERE / "daily.tsv", np.column_stack([np.arange(len(na)), na, f0, rr]), fmt=["%d", "%d", "%.4f", "%.4f"],
               delimiter="\t", header="day\tactive\tF_rms\tfit_rms", comments="")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
