"""Step 9: matching-window ablation (14, 30, 60 days) x flow gate (0, 1 m3/h), and paired tests.

    PYTHONPATH=src python experiments/step9-windows/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-13, step 9) before any windowed or paired score was computed.
Scoring only: the six detectors run at the settings their own steps chose on 2018, and their
alarm lists are regenerated and checked against each step's alarms.tsv (step 8's code).
Writes experiments/step9-windows/results.txt and cells.tsv. A few minutes once the data are cached.
"""
from __future__ import annotations

import importlib.util
import sys
from itertools import combinations
from pathlib import Path

import numpy as np

from water_leaks import harness, score, stats
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
WINDOWS = [14, 30, 60]
PHIS = [0.0, 1.0]
PRIMARY = (30, 1.0)
PRESSURE = ("D1-F", "LILA-auto")


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    s8 = _load(EXP / "step8-gated" / "run.py", "step8")
    S = harness.setup()
    hrs, events, carried, pcols, dist = S["hrs"], S["events"], S["carried"], S["pcols"], S["dist"]
    first_scored = hrs[(s8.G + s8.WMIN) * 24]
    holdoff = (s8.G + s8.WMIN) * 24
    flows = s8.leak_flows(hrs)
    al = s8.alarm_lists(S)
    out = ["# water-leaks step 9: match window (14, 30, 60 d) x flow gate (0, 1 m3/h), and paired tests",
           "# detectors at their own steps' 2018 settings, not re-tuned; chance: 1,000 draws, seed 0, 14-day spacing",
           f"# primary rule: window {PRIMARY[0]} d, phi = {PRIMARY[1]:g} m3/h (step 8's)", "",
           "# regenerated alarm lists against the earlier steps"]
    out += s8.check_against_steps(hrs, al)

    tsv = ["window_d\tphi\tdetector\talarms\ttp\tn19\tfp\tchance_median\tchance_lo\tchance_hi\tp\tp_holm\ttp300\tp300"]
    det = {}   # (w, phi, detector) -> {pipe: 0/1} over 2019 new leaks
    pv = {}
    for phi in PHIS:
        ev, car, onsets, dropped = score.gate_events(events, carried, lambda p: (hrs, flows[p]), phi)
        for w in WINDOWS:
            win = np.timedelta64(w, "D")
            rows = []
            for k, a in al.items():
                r = harness.evaluate(hrs, a, ev, car, first_scored, onsets, win)
                sens = pcols if k in PRESSURE else [pcols[0]]
                aa = a if k in PRESSURE else [(t, 0) for t, _ in a]
                mine = harness.metrics(hrs, aa, r, ev, sens, dist)
                nul = harness.null_metrics(hrs, len(a), ev, car, first_scored, holdoff, sens, dist,
                                           onsets=onsets, window=win)
                p = float((nul["TP"] >= mine["TP"]).mean())
                p300 = float((nul["TP<=300m"] >= mine["TP<=300m"]).mean()) if k in PRESSURE else None
                det[(w, phi, k)] = {ev[i][0]: int(i in r["m"]) for i, o in enumerate(onsets) if o >= Y19}
                rows.append((k, len(a), mine["TP"], r["n19"], mine["FP"], np.median(nul["TP"]),
                             np.percentile(nul["TP"], 2.5), np.percentile(nul["TP"], 97.5), p,
                             mine["TP<=300m"], p300))
                pv[(w, phi, k)] = p
            adj = stats.holm([x[8] for x in rows])
            tag = " (primary)" if (w, phi) == PRIMARY else " (steps 1-7's rule)" if (w, phi) == (30, 0.0) else ""
            out += ["", f"## window {w} d, phi = {phi:g} m3/h{tag}" + (f"; dropped {', '.join(dropped)}" if dropped else ""),
                    "  detector    alarms | 2019 TP  FP | chance median (95%) | P(TP)  Holm(6) | TP<=300m P"]
            for (k, n, tp, n19, fp, med, lo, hi, p, t3, p3), pa in zip(rows, adj):
                loc = f"{t3:>2} {p3:.3f}" if p3 is not None else "   -    "
                out.append(f"  {k:<10} {n:>6} | {tp:>3}/{n19:<2} {fp:>3} | {med:>6.0f} ({lo:.0f} to {hi:.0f}){'':>6}| "
                           f"{p:.3f}  {pa:.3f}  | {loc}")
                tsv.append(f"{w}\t{phi:g}\t{k}\t{n}\t{tp}\t{n19}\t{fp}\t{med:g}\t{lo:g}\t{hi:g}\t{p:.3f}\t{pa:.3f}\t{t3}\t"
                           + (f"{p3:.3f}" if p3 is not None else ""))

    # paired tests at the primary rule
    w, phi = PRIMARY
    names = list(al)
    pipes = sorted(det[(w, phi, names[0])])
    vec = {k: np.array([det[(w, phi, k)][p] for p in pipes]) for k in names}
    pairs = list(combinations(names, 2))
    raw = []
    for a, b in pairs:
        bb = int(((vec[a] == 1) & (vec[b] == 0)).sum())
        cc = int(((vec[a] == 0) & (vec[b] == 1)).sum())
        raw.append((a, b, bb, cc, stats.sign_test(bb, cc)))
    adj = stats.holm([x[4] for x in raw])
    out += ["", f"## paired tests, window {w} d, phi = {phi:g}: per-leak detection on the {len(pipes)} new 2019 leaks",
            "  per-leak detections (1 = detected):",
            f"  {'pipe':>5} " + " ".join(f"{k:>9}" for k in names)]
    for i, p in enumerate(pipes):
        out.append(f"  {p:>5} " + " ".join(f"{vec[k][i]:>9}" for k in names))
    out += ["  pair                   A only  B only  exact sign P  Holm(15)"]
    for (a, b, bb, cc, p), pa in zip(raw, adj):
        out.append(f"  {a + ' vs ' + b:<22} {bb:>6}  {cc:>6}  {p:>12.3f}  {pa:>8.3f}")
    for a, b in (("M3", "D1-F"), ("LILA-auto", "D1-F")):
        d, lo, hi = stats.paired_bootstrap(vec[a], vec[b])
        out.append(f"  bootstrap over leaks (2,000, seed 9), TP({a}) - TP({b}): {d:+d} (95%: {lo:+.0f} to {hi:+.0f})")

    # predictions
    pa_ = all(pv[(ww, 1.0, "M3")] < 0.05 for ww in WINDOWS)
    pb_ = all(pv[(ww, ph, "D1-F")] >= 0.05 for ww in WINDOWS for ph in PHIS)
    pc_ = all(x >= 0.05 for x in adj)
    med = {}
    for ln in tsv[1:]:
        f = ln.split("\t")
        med.setdefault((float(f[1]), f[2]), {})[int(f[0])] = float(f[7])
    pd_ = all(m[14] <= m[30] <= m[60] for m in med.values())
    out += ["", "## pre-registered predictions (LOG.md, step 9 plan)",
            "  (a) M3 P < 0.05 at phi = 1 for every window: "
            + ", ".join(f"{ww} d {pv[(ww, 1.0, 'M3')]:.3f}" for ww in WINDOWS) + f": {'HELD' if pa_ else 'FAILED'}",
            "  (b) D1-F P >= 0.05 in all six cells: "
            + ", ".join(f"{ww}/{ph:g} {pv[(ww, ph, 'D1-F')]:.3f}" for ph in PHIS for ww in WINDOWS) + f": {'HELD' if pb_ else 'FAILED'}",
            f"  (c) no pair differs at Holm-adjusted 0.05 (smallest adjusted P {min(adj):.3f}): {'HELD' if pc_ else 'FAILED'}",
            f"  (d) chance medians non-decreasing in the window for every detector and phi: {'HELD' if pd_ else 'FAILED'}"]

    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "cells.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
