"""Step 16: localisation with the generator's own model (`L-TOWN_Real.inp`) on each leak's day.

    PYTHONPATH=src python experiments/step16-realday/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-15, step 16) before any signature was computed. Step 15 localised the
oracle residual O-inc with step 11's nominal signatures (16 of 32 within 300 m). Here the signatures
come from `L-TOWN_Real.inp` restarted at each leak's localisation hour t with the leak-free tank
level and pump status (step 14's continuous run), a constant demand of the leak's own mean flow at
each of the 782 junctions in turn. Model, residual, time and size are all oracles, so the result
bounds what correlation localisation can do with L-Town's 33 pressure sensors.

Needs wntr (1.5.0 used). Reuses step 14's continuous leak-free simulation (cached under
$WATER_LEAKS_CACHE, simulated if absent: about 4 minutes) and step 15's leaks.tsv; the 32 x 783
day runs (about 25 minutes on 4 cores) are cached as step16_realday.npz. Deterministic. Writes
results.txt and leaks.tsv next to this file.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np
from scipy.stats import fisher_exact

from water_leaks import data, detect, localise, network, realsig, stats

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
W, G = 14, 7
TIE = 1e-3


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


step15 = _load("step15", EXP / "step15-oracle" / "run.py")
step11 = step15.step11
step8 = step15.step8
harness = step15.harness


def step15_rows():
    lines = (EXP / "step15-oracle" / "leaks.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    return {r["pipe"]: r for r in (dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln)}


def main():
    S_ = harness.setup()
    hrs, P, Lv, events, pcols, links = (S_[k] for k in ("hrs", "P", "Lv", "events", "pcols", "links"))
    fcols = list(S_["fcols"])
    lcols = data.load("Levels", 2018)[1]
    inp_nom = data.fetch("L-TOWN.inp")
    inp_real = data.fetch("L-TOWN_Real.inp")
    nodes = step11.junctions(inp_nom.read_text())
    A = localise.design_noflow(hrs, Lv)
    flows = step8.leak_flows(hrs)
    ref = step15_rows()
    assert hrs[0] == np.datetime64("2018-01-01T00", "h")

    # step 14's continuous leak-free run, at 5 minutes, and the oracle residual D as step 15 forms it
    step15.leak_free(pcols, fcols, lcols)
    z = np.load(data.cache_dir() / "step14_sim_continuous.npz")
    P5, F5, L5 = z["P"], z["F"], z["L"]
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    _, Psh = detect.hourly(ts, np.round(P5, 2))
    D = P - Psh
    ipump = fcols.index("PUMP_1")

    # step 11's 32 oracle-timed leaks, as step 15 picks them
    first_scored = hrs[(G + step15.WMIN) * 24]
    items = []
    for i, e in enumerate(events):
        if e[1] >= first_scored:
            k = int(np.nonzero(flows[e[0]] >= 0.5 * flows[e[0]].max())[0][0])
            items.append((i, k))
    items.sort(key=lambda it: it[1])
    assert [events[i][0] for i, _ in items] == list(ref), "leak set differs from step 15"

    windows = []
    for i, t in items:
        qt = float(flows[events[i][0]][t:t + 24].mean())
        windows.append((t * 3600, float(L5[t * 12, 0]), bool(F5[t * 12, ipump] > 1e-6), qt))

    cache = data.cache_dir() / "step16_realday.npz"
    key = np.array([w for w in windows], dtype=float)
    if cache.exists() and np.array_equal(np.load(cache)["key"], key):
        zc = np.load(cache)
        bases, sigs = zc["bases"], zc["sigs"]
    else:
        out = realsig.window_signatures(inp_real, pcols, nodes, windows)
        bases = np.array([b for b, _ in out])
        sigs = np.array([s for _, s in out])
        np.savez(cache, key=key, bases=bases, sigs=sigs)

    dpipe = {}
    for pipe in ref:
        a, b, length = links[pipe]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        dpipe[pipe] = np.array([min(da.get(n, math.inf), db.get(n, math.inf)) + length / 2 for n in nodes])

    rows, gate = [], []
    tsv = ["pipe\tt\tq_true\tlevel_T1\tpump_open\tgate_median_abs_m\tR_oinc\terr_R_oinc\tR_d1\terr_R_d1"
           "\terr_A_oinc\terr_M_oinc\tbest_r\tend_rank\tend_gap\tfar_ties"]
    for n_, (i, t) in enumerate(items):
        pipe = events[i][0]
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        cont = P5[t * 12:t * 12 + realsig.DAY_STEPS]
        g = float(np.median(np.abs(bases[n_] - cont)))
        gate.append(g)
        oinc = D[t:t + 24].mean(axis=0) - D[on - 24:on].mean(axis=0)
        d1 = localise.residual(P, A, t, W=W, g=G)
        m = pcols[int(np.argmin(oinc))]
        assert m == ref[pipe]["M_oinc"], f"{pipe}: most-affected sensor differs from step 15"
        sc = localise.scores(oinc, sigs[n_], "pearson")
        est = nodes[int(np.nanargmax(sc))]
        est_d1 = nodes[localise.estimate(d1, sigs[n_], "pearson")]
        a, b, _ = links[pipe]
        ends = [nodes.index(x) for x in (a, b) if x in nodes]
        best = float(np.nanmax(sc))
        far = dpipe[pipe] > RADIUS
        row = {"pipe": pipe, "t": hrs[t], "q": windows[n_][3], "gate": g, "best": best,
               "err_R": float(dpipe[pipe][nodes.index(est)]), "err_Rd1": float(dpipe[pipe][nodes.index(est_d1)]),
               "err_A": float(ref[pipe]["err_A_oinc"]), "err_M": float(ref[pipe]["err_M_oinc"]),
               "rank": realsig.rank_of(sc, ends), "gap": best - max(sc[k] for k in ends),
               "ties": realsig.near_ties(sc, far, TIE), "pi": float(ref[pipe]["p_chance"])}
        rows.append(row)
        tsv.append("\t".join([pipe, str(hrs[t]), f"{row['q']:.2f}", f"{windows[n_][1]:.3f}", str(int(windows[n_][2])),
                              f"{g:.5f}", est, f"{row['err_R']:.0f}", est_d1, f"{row['err_Rd1']:.0f}",
                              f"{row['err_A']:.0f}", f"{row['err_M']:.0f}", f"{best:.4f}", str(row["rank"]),
                              f"{row['gap']:.4f}", str(row["ties"])]))

    n = len(rows)
    ps = [w["pi"] for w in rows]
    gate_ok = all(g < 0.01 for g in gate)
    out = ["# water-leaks step 16: localisation with L-TOWN_Real.inp restarted on each leak's day (T1 level and PUMP_1",
           "# status from step 14's continuous leak-free run), constant demand of the leak's own mean flow at each of 782 junctions;",
           "# residual o-inc (step 15's primary) unless named; argmax Pearson; along-pipe error to the leak pipe; rule 300 m", "",
           f"gate: restarted leak-free run against the continuous run over each 24 h window, median |diff| per leak: "
           f"max {max(gate):.5f} m, median {np.median(gate):.5f} m: {'PASS' if gate_ok else 'FAIL'} (< 0.01 m for every leak)",
           f"chance: expected {sum(ps):.2f} of {n} within {RADIUS:g} m", "",
           "## within 300 m, of 32 oracle-timed leaks (P(chance >=); median error m)"]
    hits = {}
    for k, lab in (("err_R", "R real model, leak's day, o-inc"), ("err_Rd1", "R real model, leak's day, d1 residual"),
                   ("err_A", "A nominal, q = 5, o-inc (step 15)"), ("err_M", "M most-affected sensor, o-inc (step 15)")):
        d = np.array([w[k] for w in rows])
        h = d <= RADIUS
        hits[k] = h
        out.append(f"  {lab:<42} {h.sum():>2} ({localise.poisson_binomial_tail(ps, int(h.sum())):.4f}; {np.median(d):5.0f})")
    out += ["", "## paired, 300 m hits (exact sign test on discordant leaks)"]

    def pair(a, b, la, lb):
        x, y = localise.sign_test_counts(hits[a], hits[b])
        p = stats.sign_test(x, y)
        out.append(f"  {la} only {x}, {lb} only {y}: P = {p:.3f}")
        return x, y, p

    pair("err_R", "err_A", "R", "A")
    xm, ym, p_rm = pair("err_R", "err_M", "R", "M")
    pair("err_Rd1", "err_R", "R on d1", "R on o-inc")

    best = np.array([w["best"] for w in rows])
    rank = np.array([w["rank"] for w in rows])
    ties = np.array([w["ties"] for w in rows])
    out += ["", "## descriptive",
            f"  best Pearson score of R on o-inc: median {np.median(best):.4f} (range {best.min():.4f} to {best.max():.4f})",
            f"  leak pipe's better end node ranked first: {int(np.sum(rank == 1))} of {n}; within the top 10: {int(np.sum(rank <= 10))}; median rank {np.median(rank):.0f}",
            f"  junctions over 300 m from the leak scoring within {TIE:g} of the best: median {np.median(ties):.0f} (range {ties.min()} to {ties.max()}); leaks with none: {int(np.sum(ties == 0))}",
            "",
            "  pipe  t                 q m3/h | R err m | A err m | M err m | best r  | end rank | gap    | far ties | gate m"]
    for w in rows:
        out.append(f"  {w['pipe']:>5} {str(w['t']):<16} {w['q']:6.1f} | {w['err_R']:7.0f} | {w['err_A']:7.0f} | {w['err_M']:7.0f} |"
                   f" {w['best']:.4f}  | {w['rank']:8d} | {w['gap']:.4f} | {w['ties']:8d} | {w['gate']:.5f}")

    r = int(hits["err_R"].sum())
    out += ["", "## pre-registered predictions (LOG.md, step 16 plan)",
            f"  (a) R on o-inc puts more than 16 of 32 within 300 m: {r}: {'HELD' if r > 16 else 'FAILED'}",
            f"  (b) R puts at least 24 of 32 within 300 m: {r}: {'HELD' if r >= 24 else 'FAILED'}",
            f"  (c) R beats M on o-inc at P < 0.05 (sign test): R only {xm}, M only {ym}, P = {p_rm:.3f}: "
            f"{'HELD' if (p_rm < 0.05 and xm > ym) else 'FAILED'}",
            f"  (d) median best Pearson score of R >= 0.99: {np.median(best):.4f}: {'HELD' if np.median(best) >= 0.99 else 'FAILED'}",
            f"  (e) best junction is an end node of the leak pipe for at least 16 of 32: {int(np.sum(rank == 1))}: "
            f"{'HELD' if np.sum(rank == 1) >= 16 else 'FAILED'}"]

    # post hoc, added after the predictions above were scored (LOG.md, step 16 outcome): leak type from the
    # generator's configuration, and how much the other leaks' flows changed between the pre-onset baseline
    # and the localisation window, both of which o-inc carries
    kind = {}
    for ln in data.fetch("dataset_configuration.yaml").read_text().splitlines():
        f = [x.strip() for x in ln.lstrip("- ").split(",")]
        if len(f) == 6 and f[0].startswith("p"):
            kind[f[0]] = f[4]
    out += ["", "## post hoc (added after the predictions were scored; no verdict)",
            "  other-leak change = sum over the other leaks of |mean flow over [t, t + 24) - mean flow over the 24 h before onset|, m3/h"]
    for w, (i, t) in zip(rows, items):
        on = int((events[i][1].astype("datetime64[h]") - hrs[0]).astype(int))
        w["kind"] = kind[w["pipe"]]
        w["lag"] = t - on
        w["other"] = float(sum(abs(fl[t:t + 24].mean() - fl[on - 24:on].mean()) for p_, fl in flows.items() if p_ != w["pipe"]))
    for kd in ("abrupt", "incipient"):
        sel = [w for w in rows if w["kind"] == kd]
        out.append(f"  {kd:<9}: {len(sel)} leaks; R within 300 m {sum(w['err_R'] <= RADIUS for w in sel)}, A {sum(w['err_A'] <= RADIUS for w in sel)},"
                   f" M {sum(w['err_M'] <= RADIUS for w in sel)}; end node first {sum(w['rank'] == 1 for w in sel)};"
                   f" median hours onset to t {np.median([w['lag'] for w in sel]):.0f}; median other-leak change {np.median([w['other'] for w in sel]):.1f} m3/h"
                   f" against own flow {np.median([w['q'] for w in sel]):.1f}")
    ratio = np.array([w["other"] / w["q"] for w in rows])
    hit = np.array([w["err_R"] <= RADIUS for w in rows])
    lo = ratio <= np.median(ratio)
    out.append(f"  other-leak change / own flow, median {np.median(ratio):.2f}: R within 300 m for {int(hit[lo].sum())} of {int(lo.sum())} at or below the median,"
               f" {int(hit[~lo].sum())} of {int((~lo).sum())} above (Fisher exact P = {fisher_exact([[int(hit[lo].sum()), int(lo.sum() - hit[lo].sum())], [int(hit[~lo].sum()), int((~lo).sum() - hit[~lo].sum())]])[1]:.4f})")
    out.append("  pipe  kind       onset->t h  q   other  end rank")
    for w in sorted(rows, key=lambda w: w["other"] / w["q"]):
        out.append(f"  {w['pipe']:>5} {w['kind']:<10} {w['lag']:6d} {w['q']:5.1f} {w['other']:6.1f} {w['rank']:5d}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0 if gate_ok else 1


if __name__ == "__main__":
    sys.exit(main())
