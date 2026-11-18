"""Step 10: cross-fitted thresholds (tune on 2019, test on 2018) and tests on the pooled leaks.

    PYTHONPATH=src python experiments/step10-crossfit/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-13, step 10) before any reverse-fold score was computed.
Forward fold: each detector at the setting its own step chose on 2018, scored on 2019's new
leaks (step 8's alarm lists, checked against each step's alarms.tsv). Reverse fold: the same
grid, the same selection rule with the years swapped (most 2019 new-leak detections at <= 2
2019 false alarms, ungated 30-day rule), scored once on 2018's leaks. Pooled over both folds:
counts against chance (Holm across six detectors) and paired sign tests (Holm across 15 pairs).
Writes experiments/step10-crossfit/results.txt, grid.tsv and pooled.tsv. About 15 minutes.
"""
from __future__ import annotations

import importlib.util
import sys
from itertools import combinations
from pathlib import Path

import numpy as np

from water_leaks import detect, harness, lila, mnf, score, stats
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
MAX_FP = 2
PHIS = [1.0, 0.0]
PRIMARY = 1.0
WINDOW = np.timedelta64(30, "D")
PRESSURE = ("D1-F", "LILA-auto")
DRAWS = 1000


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def grids(S, s1, s2, s6, s7):
    """{detector: [(setting tuple, full 2018-19 alarm list)]}, each over its own step's grid.
    M2 and M4 take weekday offsets from 2019 nights (the reverse fold's training year)."""
    hrs, P, F, Lv, f = S["hrs"], S["P"], S["F"], S["Lv"], S["fcols"]
    W, G, WMIN = s1.W, s1.G, s1.WMIN
    out = {}
    A = detect.design(hrs, Lv, F)
    out["D1-F"] = [((h,), detect.detect_sequential(P, A, W=W, g=G, wmin=WMIN, k=s1.K, h=h)[0]) for h in s1.HS]
    v = F[:, f.index("PUMP_1")]
    out["LILA-auto"] = [((d, c), lila.detect_lila(P, v, W=W, g=G, wmin=WMIN, delta=d, c_thr=c, tie="index")[0])
                        for d in s2.DELTAS for c in s2.CTHR]
    inflow = F[:, f.index("p227")] + F[:, f.index("p235")]
    q = mnf.net_demand(inflow, Lv[:, 0], tank=True)
    amr, _ = s7.amr_hourly(hrs)
    days = hrs[::24].astype("datetime64[D]")
    test19 = days >= Y19.astype("datetime64[D]")
    m1, m3 = mnf.night_min(q), mnf.night_min(q - amr)
    series = {"M1": m1, "M2": mnf.deweek(m1, days, mnf.weekday_offsets(m1, days, test19)),
              "M3": m3, "M4": mnf.deweek(m3, days, mnf.weekday_offsets(m3, days, test19))}
    for k, m in series.items():
        out[k] = [((h,), mnf.detect_mnf(m, W=W, g=G, wmin=WMIN, h=h)[0]) for h in s6.HS]
    return out


def tp_by_year(r, year):
    return (r["tp18"], r["n18"], r["fp18"]) if year == 2018 else (r["tp19"], r["n19"], r["fp19"])


def null_tp(hrs, n_alarms, ev, car, first_scored, holdoff, onsets, year, seed):
    """Chance detections of `year`'s test leaks: n_alarms at random hours over 2018-19
    (holdoff apart), scored by the same rule (harness.null_metrics' draw, any year)."""
    rng = np.random.default_rng(seed)
    lo, H = int((first_scored - hrs[0]).astype(int)), len(hrs)
    span = H - lo - (n_alarms - 1) * holdoff
    out = np.empty(DRAWS, int)
    for j in range(DRAWS):
        t = lo + np.sort(rng.integers(0, span, n_alarms)) + np.arange(n_alarms) * holdoff
        r = harness.evaluate(hrs, [(int(x), 0) for x in t], ev, car, first_scored, onsets, WINDOW)
        out[j] = len(tp_by_year(r, year)[0])
    return out


def main():
    s1 = _load(EXP / "step1-baseline" / "run.py", "step1")
    s2 = _load(EXP / "step2-lila" / "run.py", "step2")
    s6 = _load(EXP / "step6-mnf" / "run.py", "step6")
    s7 = _load(EXP / "step7-mnf2" / "run.py", "step7")
    s8 = _load(EXP / "step8-gated" / "run.py", "step8")
    S = harness.setup()
    hrs, events, carried = S["hrs"], S["events"], S["carried"]
    first_scored = hrs[(s8.G + s8.WMIN) * 24]
    holdoff = (s8.G + s8.WMIN) * 24
    flows = s8.leak_flows(hrs)
    fwd = s8.alarm_lists(S)
    out = ["# water-leaks step 10: cross-fitted thresholds (forward: tune 2018, test 2019; reverse: tune 2019, test 2018)",
           "# selection (both folds): most tuning-year detections at <= 2 tuning-year false alarms, ungated 30-day rule;",
           "#   ties to fewer false alarms, then the larger parameter(s)",
           f"# scoring rules: window 30 d, phi in {PHIS} m3/h (primary {PRIMARY:g}); chance {DRAWS} draws per fold, "
           "14-day spacing, forward seed 0, reverse seed 1, summed draw by draw", "",
           "# forward-fold alarm lists against the earlier steps"]
    out += s8.check_against_steps(hrs, fwd)

    # reverse fold: grid, selection on 2019 under the ungated rule
    G_ = grids(S, s1, s2, s6, s7)
    fwd_setting = {"D1-F": (240,), "LILA-auto": (1.0, 20), "M1": (3,), "M2": (12,), "M3": (3,), "M4": (3,)}
    grid_tsv = ["detector\tsetting\talarms\ttp18\tn18\tfp18\ttp19\tn19\tfp19"]
    rev, rev_setting = {}, {}
    out += ["", "# reverse-fold grid, ungated 30-day rule (2018 shown for reference; selection reads 2019 only)"]
    for k, rows in G_.items():
        best = None
        for setting, a in rows:
            r = harness.evaluate(hrs, a, events, carried, first_scored)
            grid_tsv.append(f"{k}\t{','.join(map(str, setting))}\t{len(a)}\t{len(r['tp18'])}\t{r['n18']}\t{len(r['fp18'])}"
                            f"\t{len(r['tp19'])}\t{r['n19']}\t{len(r['fp19'])}")
            key = (len(r["tp19"]), -len(r["fp19"])) + tuple(setting)
            if len(r["fp19"]) <= MAX_FP and (best is None or key > best[0]):
                best = (key, setting, a)
            if setting == fwd_setting[k] and k not in ("M2", "M4"):   # M2/M4 offsets differ by fold
                same = sorted(t for t, _ in a) == sorted(t for t, _ in fwd[k])
                if not same:
                    raise SystemExit(f"{k}: grid run at the forward setting differs from step 8's alarm list")
        rev[k], rev_setting[k] = best[2], best[1]
        out.append(f"  {k:<10} forward setting {fwd_setting[k]} -> reverse setting {best[1]} "
                   f"({len(best[2])} alarms over 2018-19; 2019 TP {best[0][0]}, FP {-best[0][1]})")
    (HERE / "grid.tsv").write_text("\n".join(grid_tsv) + "\n")

    pooled_tsv = ["phi\tdetector\tfold\tpipe\tonset\tdetected"]
    det, pval = {}, {}
    for phi in PHIS:
        ev, car, onsets, dropped = score.gate_events(events, carried, lambda p: (hrs, flows[p]), phi)
        out += ["", f"## phi = {phi:g} m3/h" + (" (primary)" if phi == PRIMARY else " (steps 1-7's rule)")
                + (f"; dropped {', '.join(dropped)}" if dropped else ""),
                "  detector   | fwd 2019 TP  FP | rev 2018 TP  FP | pooled TP | chance median (95%) | P(TP)  Holm(6)"]
        rows = []
        for k in fwd:
            cells, nul = [], np.zeros(DRAWS, int)
            vec = {}
            for fold, a, year, seed in (("fwd", fwd[k], 2019, 0), ("rev", rev[k], 2018, 1)):
                r = harness.evaluate(hrs, a, ev, car, first_scored, onsets, WINDOW)
                tp, n, fp = tp_by_year(r, year)
                cells.append((len(tp), n, len(fp)))
                nul += null_tp(hrs, len(a), ev, car, first_scored, holdoff, onsets, year, seed)
                for i, o in enumerate(onsets):
                    inyear = o >= Y19 if year == 2019 else first_scored <= o < Y19
                    if inyear:
                        hit = int(i in tp)
                        vec[(fold, ev[i][0])] = hit
                        pooled_tsv.append(f"{phi:g}\t{k}\t{fold}\t{ev[i][0]}\t{str(o)[:16]}\t{hit}")
            tot = cells[0][0] + cells[1][0]
            p = float((nul >= tot).mean())
            det[(phi, k)] = vec
            pval[(phi, k)] = p
            rows.append((k, cells, tot, np.median(nul), np.percentile(nul, 2.5), np.percentile(nul, 97.5), p))
        adj = stats.holm([x[6] for x in rows])
        for (k, c, tot, med, lo, hi, p), pa in zip(rows, adj):
            pval[(phi, k, "holm")] = pa
            out.append(f"  {k:<10} | {c[0][0]:>5}/{c[0][1]:<2} {c[0][2]:>3} | {c[1][0]:>5}/{c[1][1]:<2} {c[1][2]:>3} | "
                       f"{tot:>4}/{c[0][1] + c[1][1]:<2} | {med:>6.0f} ({lo:.0f} to {hi:.0f}){'':>6}| {p:.3f}  {pa:.3f}")
    (HERE / "pooled.tsv").write_text("\n".join(pooled_tsv) + "\n")

    # paired tests on the pooled leaks at the primary rule
    names = list(fwd)
    keys = sorted(det[(PRIMARY, names[0])])
    vec = {k: np.array([det[(PRIMARY, k)][x] for x in keys]) for k in names}
    raw = []
    for a, b in combinations(names, 2):
        bb = int(((vec[a] == 1) & (vec[b] == 0)).sum())
        cc = int(((vec[a] == 0) & (vec[b] == 1)).sum())
        raw.append((a, b, bb, cc, stats.sign_test(bb, cc)))
    adj = stats.holm([x[4] for x in raw])
    out += ["", f"## paired tests on the {len(keys)} pooled leaks, phi = {PRIMARY:g}",
            "  per-leak detections (1 = detected):", f"  {'fold':>4} {'pipe':>5} " + " ".join(f"{k:>9}" for k in names)]
    for i, (fold, p) in enumerate(keys):
        out.append(f"  {fold:>4} {p:>5} " + " ".join(f"{vec[k][i]:>9}" for k in names))
    out += ["  pair                   A only  B only  exact sign P  Holm(15)"]
    for (a, b, bb, cc, p), pa in zip(raw, adj):
        out.append(f"  {a + ' vs ' + b:<22} {bb:>6}  {cc:>6}  {p:>12.3f}  {pa:>8.3f}")
    for a, b in (("M3", "D1-F"), ("LILA-auto", "D1-F")):
        d, lo, hi = stats.paired_bootstrap(vec[a], vec[b])
        out.append(f"  bootstrap over pooled leaks (2,000, seed 9), TP({a}) - TP({b}): {d:+d} (95%: {lo:+.0f} to {hi:+.0f})")

    changed = sum(rev_setting[k] != fwd_setting[k] for k in names)
    pa_ = pval[(PRIMARY, "M3", "holm")] < 0.05
    pb_ = pval[(PRIMARY, "D1-F")] >= 0.05
    pc_ = all(x >= 0.05 for x in adj)
    out += ["", "## pre-registered predictions (LOG.md, step 10 plan)",
            f"  (a) M3 pooled beats chance at Holm 0.05, phi = 1: Holm P {pval[(PRIMARY, 'M3', 'holm')]:.3f}: {'HELD' if pa_ else 'FAILED'}",
            f"  (b) D1-F pooled P >= 0.05, phi = 1: P {pval[(PRIMARY, 'D1-F')]:.3f}: {'HELD' if pb_ else 'FAILED'}",
            f"  (c) no pair separable at Holm 0.05 (smallest adjusted P {min(adj):.3f}): {'HELD' if pc_ else 'FAILED'}",
            f"  (d) reverse setting differs from forward for >= 3 of 6 detectors: {changed} of 6: {'HELD' if changed >= 3 else 'FAILED'}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
