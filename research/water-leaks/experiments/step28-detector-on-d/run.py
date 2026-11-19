"""Step 28: a detector on the residual D. Step 1's D1 (D1-L's design, every setting but the input
frozen) runs on hourly D (real leaks) and on each injected set's D_inj, its threshold picked on
2018 by step 1's rule; step 27's 17 re-timing rules of R30 around the alarm day are then selected on
2018's detected leaks (real and injected pooled), frozen, and only then scored on 2019's.

    PYTHONPATH=src python experiments/step28-detector-on-d/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-19, step 28) before any detector was run on D. Reuses step 26's
`build()` (and so step 25's cached simulations) and step 27's rule grid. Deterministic.
Writes results.txt, hgrid.tsv, rules.tsv and leaks.tsv.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

from water_leaks import detect, harness, localise, score

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RADIUS = 300.0
W, G, K, WMIN = 14, 7, 0.5, 7                                  # step 1
HS = [10, 15, 20, 30, 40, 60, 80, 120, 160, 240, 320, 400, 480]  # step 1's grid
MAX_FP_2018 = 2                                                # step 1's rule
TUNE, TEST = 2018, 2019
D1L = "D1-L"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m          # so multiprocessing can pickle step 26's `_simulate` by name
    spec.loader.exec_module(m)
    return m


def pick_h(rows):
    """Step 1's selection: most 2018 true positives with at most MAX_FP_2018 2018 false alarms;
    ties to fewer false alarms, then larger h. rows: {h: harness.evaluate result}."""
    best = None
    for h, r in rows.items():
        key = (len(r["tp18"]), -len(r["fp18"]), h)
        if len(r["fp18"]) <= MAX_FP_2018 and (best is None or key > best[0]):
            best = (key, h)
    return best[1]


def main():
    step26 = _load("step26", EXP / "step26-alarm-timed" / "run.py")
    step27 = _load("step27", EXP / "step27-retimed" / "run.py")
    c = step26.build()
    hrs, Lv, events, D, Psh, ts, P5, Pfree = (c[k] for k in ("hrs", "Lv", "events", "D", "Psh", "ts", "P5", "Pfree"))
    rowsA, rowsB, offB, items, sims, sets = (c[k] for k in ("rowsA", "rowsB", "offB", "items", "sims", "sets"))
    real_T, dpipe, ndist, est, h_index = (c[k] for k in ("real_T", "dpipe", "ndist", "est", "h_index"))
    step25 = step26.step25
    A = detect.design(hrs, Lv)
    first_scored = hrs[(G + WMIN) * 24]
    out = ["# water-leaks step 28: D2 = step 1's D1 with D1-L's design run on the residual D (real leaks) and D_inj",
           "# (step 25's injected sets) in place of the raw pressures; h by step 1's rule on 2018; then step 27's 17",
           "# rules of R30 around D2's alarm day, one selected on 2018's detected leaks, frozen, scored on 2019's", ""]

    # ---- threshold, step 1's rule on arm A's 2018
    grid, tsv_h = {}, ["h\ttp18\tn18\tfp18\ttp19\tn19\tfp19"]
    out.append("## h grid on D (arm A, the published leaks; 2019 shown for reference, not used)")
    for h in HS:
        al, _ = detect.detect_sequential(D, A, W=W, g=G, wmin=WMIN, k=K, h=h)
        r = harness.evaluate(hrs, al, events, c["S_"]["carried"], first_scored)
        grid[h] = (r, al)
        out.append(f"  h {h:>4}: 2018 TP {len(r['tp18'])}/{r['n18']} FP {len(r['fp18']):>2} | "
                   f"2019 new TP {len(r['tp19'])}/{r['n19']} FP {len(r['fp19']):>2}")
        tsv_h.append(f"{h}\t{len(r['tp18'])}\t{r['n18']}\t{len(r['fp18'])}\t{len(r['tp19'])}\t{r['n19']}\t{len(r['fp19'])}")
    H2 = pick_h({h: v[0] for h, v in grid.items()})
    rA, alA = grid[H2]
    out.append(f"  selected on 2018: h = {H2} (2019 false alarms {len(rA['fp19'])})")
    out.append("")

    # ---- D2's alarm day for every scored leak
    mA, _ = score.match([hrs[t] for t, _ in alA], events)
    leaks = []                     # (row, states, distance array, k_D2)
    k_on = {}                      # leak id -> onset day (post hoc diagnostic only)
    for (i, _), w in zip(items, rowsA):
        assert events[i][0] == w["id"]
        at = mA.get(i)
        k2 = -1 if at is None else h_index[np.datetime64(at, "h")] // 24 + 1
        leaks.append((w, real_T, dpipe[w["id"]], k2))
        k_on[w["id"]] = h_index[np.datetime64(events[i][1], "h")] // 24 + 1
    fpB, nB = 0, 0
    for s in step25.SEEDS:
        Pi, _ = sims[s]
        _, Xh = detect.hourly(ts, np.round(P5 + Pi - Pfree, 2))
        Dinj = Xh - Psh
        ev = list(events)
        for li, (node, cc, st, pk, en, kind, src) in enumerate(sets[s]):
            ev.append((f"inj{s}_{li}", ts[st], ts[min(en, len(ts)) - 1], 0.0, 0.0))
        al, _ = detect.detect_sequential(Dinj, A, W=W, g=G, wmin=WMIN, k=K, h=H2)
        m_s, fp = score.match([hrs[t] for t, _ in al], ev)
        fpB += len(fp)
        for li in range(step25.PER_SET):
            w = rowsB[nB]
            meta, states = offB[nB]
            assert w["id"] == f"s{s}:{meta['node']}" and sets[s][li][0] == meta["node"]
            at = m_s.get(len(events) + li)
            k2 = -1 if at is None else h_index[at] // 24 + 1
            leaks.append((w, states, ndist(meta["node"]), k2))
            k_on[w["id"]] = sets[s][li][2] // 12 // 24 + 1
            nB += 1
    assert nB == len(rowsB)

    # ---- per-leak rule errors, one year at a time (no 2019 error before S2 is fixed)
    order = step27.rule_order()
    L0 = ("L", (0,))

    def pick_fn(states):
        cache = {}

        def pick_at(k):
            k = max(1, k)
            if k not in cache:
                cache[k] = est(states, k)[0]
            return cache[k]
        return pick_at

    def err(dist, j):
        return math.inf if j is None else float(dist[j])

    table = []

    def score_year(year):
        for w, states, dist, k2 in leaks:
            if w["year"] != year:
                continue
            ent = {"w": w, "k2": k2, "e": None}
            if k2 >= 0:
                pa = pick_fn(states)
                ent["e"] = {r: err(dist, step27.apply_rule(r, pa, k2)) for r in order}
            table.append(ent)

    def det(year, arm=None):
        return [t for t in table if t["e"] is not None and t["w"]["year"] == year and (arm is None or t["w"]["arm"] == arm)]

    def nh(rows, r):
        return int(sum(t["e"][r] <= RADIUS for t in rows))

    def oh(rows):
        return int(sum(t["w"]["R30_or"] <= RADIUS for t in rows))

    score_year(TUNE)
    tune = det(TUNE)
    h18 = {r: nh(tune, r) for r in order}
    S2 = step27.select(h18, order)
    out.append(f"## selection on {TUNE}: D2 detects {len(tune)} leaks ({len(det(TUNE, 'A'))} real, {len(det(TUNE, 'B'))} injected);"
               f" R30 at the oracle day {oh(tune)}")
    for r in order:
        out.append(f"  {step27.rule_name(r):<11} {h18[r]:>3}" + ("   <- selected (S2)" if r == S2 else ""))
    out.append(f"  S2 = {step27.rule_name(S2)}, frozen before any {TEST} score below was computed")
    out.append("")
    score_year(TEST)                      # 2019 errors exist only from here on

    # ---- timing (both years, both arms)
    dts = {}
    for name, key in (("D2", "k2"), (D1L, None)):
        d_ = []
        for w, _, _, k2 in leaks:
            k = k2 if key else w[f"k_{D1L}"]
            if k >= 0:
                d_.append(k - w["k_or"])
        dts[name] = np.array(d_)
    out.append("## alarm day minus oracle half-peak day, detected leaks of both years and arms")
    for name, d_ in dts.items():
        q1, q3 = np.percentile(d_, [25, 75])
        out.append(f"  {name}: {len(d_)} detected; median {np.median(d_):+.1f}, quartiles {q1:+.0f} and {q3:+.0f},"
                   f" range {d_.min():+d} to {d_.max():+d}; median |.| {np.median(np.abs(d_)):.1f};"
                   f" within +-2 days {int((np.abs(d_) <= 2).sum())}")
    out.append("")

    test = det(TEST)
    all19 = [t for t in table if t["w"]["year"] == TEST]
    ps = [t["w"]["pi"] for t in test]
    hs = np.array([t["e"][S2] <= RADIUS for t in test])
    h0 = np.array([t["e"][L0] <= RADIUS for t in test])
    pS = localise.poisson_binomial_tail(ps, int(hs.sum())) if test else 1.0
    nd1 = sum(1 for t in all19 if t["w"][f"k_{D1L}"] >= 0)
    both = sum(1 for t in all19 if t["w"][f"k_{D1L}"] >= 0 and t["e"] is not None)
    out.append(f"## test on {TEST}: D2 detects {len(test)} of {len(all19)} 2019 leaks ({len(det(TEST, 'A'))} real,"
               f" {len(det(TEST, 'B'))} injected; D1-L {nd1}, both {both}); chance expected {sum(ps):.2f};"
               f" R30 at the oracle day {oh(test)}")
    out.append(f"  S2 = {step27.rule_name(S2)}: {int(hs.sum())} of {len(test)} (P(chance >=) {pS:.2g}); L0 at D2's alarm {int(h0.sum())}")
    for arm, lab in (("A", "real new 2019"), ("B", "injected 2019")):
        sub = det(TEST, arm)
        out.append(f"    {lab}: S2 {nh(sub, S2)}, L0 {nh(sub, L0)}, oracle day {oh(sub)} of {len(sub)}")
    out.append(f"  end to end ({TEST}, of all {len(all19)}): S2 {int(hs.sum())} (step 27, D1-L with its S: 4)")
    out.append(f"  false alarms: arm A 2019 {len(rA['fp19'])}, 2018 {len(rA['fp18'])}; arm B over the 8 sets {fpB}")
    out.append("")

    med = float(np.median(np.abs(dts["D2"])))
    out.append("## pre-registered predictions (LOG.md, step 28 plan)")
    out.append(f"  (a) median |k_al - k_or| on D2's detected leaks at most 3 days: {med:.1f}: {'HELD' if med <= 3 else 'FAILED'}")
    out.append(f"  (b) D2 detects at least 22 of the {len(all19)} 2019 leaks: {len(test)}: {'HELD' if len(test) >= 22 else 'FAILED'}")
    out.append(f"  (c) primary, end to end 2019 more than 4: {int(hs.sum())}: {'HELD' if hs.sum() > 4 else 'FAILED'}")
    out.append(f"  (d) end to end 2019 at least 8: {int(hs.sum())}: {'HELD' if hs.sum() >= 8 else 'FAILED'}")
    out.append(f"  (e) S2 beats chance on the detected 2019 leaks at P < 0.01: P = {pS:.2g}: {'HELD' if pS < 0.01 else 'FAILED'}")
    out.append(f"  (f) at most 3 false alarms in 2019 on the published data: {len(rA['fp19'])}: {'HELD' if len(rA['fp19']) <= 3 else 'FAILED'}")
    out.append("")

    h19 = {r: nh(test, r) for r in order}
    rho = spearmanr([h18[r] for r in order], [h19[r] for r in order])
    out.append("## every rule, both years (no verdicts)")
    rules_tsv = ["rule\thits_2018\thits_2019\thits_2019_real\thits_2019_injected\tn_2018\tn_2019"]
    for r in order:
        ra, rb = nh(det(TEST, "A"), r), nh(det(TEST, "B"), r)
        out.append(f"  {step27.rule_name(r):<11} {h18[r]:>4} {h19[r]:>4}  ({ra}, {rb})")
        rules_tsv.append(f"{step27.rule_name(r)}\t{h18[r]}\t{h19[r]}\t{ra}\t{rb}\t{len(tune)}\t{len(test)}")
    out.append(f"  Spearman 2018 against 2019: {rho.statistic:.2f} (P = {rho.pvalue:.2f}); best in 2019 alone"
               f" {step27.rule_name(step27.select(h19, order))} ({max(h19.values())})")

    # post hoc (declared after the registered output above was read; no verdicts): where in the leak's
    # rise each detector alarms, measured from onset as well as from the half-peak day, by leak kind,
    # and R30's hits at the alarm day (L0) by kind
    out.append("")
    out.append("## post hoc, no verdicts: alarm day against onset and half-peak day, by kind (both years, both arms)")
    out.append("  detector kind        n   median(k_al-k_on) median(k_al-k_or) median(k_or-k_on)  L0 hits  oracle-day hits")
    for name in ("D2", D1L):
        for kind in ("abrupt", "incipient"):
            sel = [(w, k2 if name == "D2" else w[f"k_{D1L}"]) for w, _, _, k2 in leaks if w["kind"] == kind]
            sel = [(w, k) for w, k in sel if k >= 0]
            a = np.array([k - k_on[w["id"]] for w, k in sel])
            b = np.array([k - w["k_or"] for w, k in sel])
            o = np.array([w["k_or"] - k_on[w["id"]] for w, _ in sel])
            if name == "D2":
                l0 = sum(1 for t in table if t["e"] is not None and t["w"]["kind"] == kind and t["e"][L0] <= RADIUS)
            else:
                l0 = sum(1 for w, _ in sel if w[f"R30_{D1L}"] <= RADIUS)
            orc = sum(1 for w, _ in sel if w["R30_or"] <= RADIUS)
            out.append(f"  {name:<8} {kind:<10} {len(sel):>3}   {np.median(a):>+8.1f}          {np.median(b):>+8.1f}"
                       f"          {np.median(o):>+8.1f}         {l0:>3}      {orc:>3}")

    cols = ["arm", "id", "kind", "year", "pi", "k_on", "k_or", "k_D1-L", "k_D2", "R30_or", "L0_D2", "S2_D2"]
    tsv = ["\t".join(cols)]
    for t in table:
        w = t["w"]
        e = t["e"] or {}
        tsv.append("\t".join([w["arm"], w["id"], w["kind"], str(w["year"]), f"{w['pi']:.4g}", str(k_on[w["id"]]), str(w["k_or"]),
                              str(w[f"k_{D1L}"]), str(t["k2"]), f"{w['R30_or']:.4g}",
                              f"{e.get(L0, math.nan):.4g}", f"{e.get(S2, math.nan):.4g}"]))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "hgrid.tsv").write_text("\n".join(tsv_h) + "\n")
    (HERE / "rules.tsv").write_text("\n".join(rules_tsv) + "\n")
    (HERE / "leaks.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
