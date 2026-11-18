"""Milestone 6h: do measured CC-CV charges, fresh and aged, bear out 6d's taper model and its spare-pack counts?

6d fitted an exponential constant-voltage (CV) decay to two datasheet numbers and assumed no ageing. Here the CV
phase is read from measured charge records: NASA Ames Prognostics Center of Excellence "Li-ion Battery Aging
Datasets" (Saha and Goebel, 2007), 18650 cells B0005, B0006, B0007, B0018, rated 2 Ah, charged at 1.5 A constant
current (0.75C) to 4.2 V, then constant voltage until the current falls to 20 mA (C/100); cycled at room
temperature until capacity faded about 30%. Data: https://phm-datasets.s3.amazonaws.com/NASA/5.+Battery+Data+Set.zip
(read 2026-11-11). Not a Molicel cell, not 1C: the comparison with 6d is in ratios to a linear charge.

Predictions (written 2026-11-11, before the data was opened):
 (1) Fresh cells (each cell's first 5 complete charges): the measured time to charge 30 -> 100% of the charge
     delivered, divided by the linear time 0.7 * Q / I_cc, is 1.4 to 2.0 (6d's fitted 1C curve gave 1.71).
 (2) Aged cells (charges after discharge capacity first falls below 80% of that cell's first): the same ratio is at
     least 15% higher than fresh, because a cell with higher resistance reaches 4.2 V earlier.
 (3) The 20 -> 90% ratio stays at or below 1.10 for fresh and aged cells (the 90% ceiling still avoids most of the taper).
 (4) A single exponential I = I0 exp(-t/tau) fits ln(current) over the CV phase with R^2 >= 0.95 in fresh cells.
 (5) Hub (6d's model, 8 pads, 8 chargers, 6.0 flights/h Poisson, p95 wait <= 300 s, 3 seeds): with the charge time set
     to ratio x 42 min (6b's linear 1C time), the aged 30 -> 100% case needs at least 8 more spares than fresh.
Method: SOC within a charge is delivered charge (trapezoid integral of measured current) over that charge's total,
 so 100% means "to the 20 mA cut-off". The CV phase starts at the first sample with current below 95% of the CC
 median and voltage at or above 4.19 V. Records with a gap over 60 s, fewer than 50 samples, or total charge under 1 Ah
 are dropped and counted. Scaling the ratio measured at 0.75C onto a 1C hub is an assumption. Preliminary.
"""
import json, os, statistics as st, sys
sys.path.insert(0, os.path.dirname(__file__))
import cargo_hub_bursts as B

HERE = os.path.dirname(__file__)
LINEAR_1C_S = 0.7 * 3600            # 6b's linear 20 -> 90% time at 1C, 42 min
GRID = (9, 12, 16, 20, 24, 28, 32, 40, 48, 64)
RATE = 6.0

def groups(rows):
    by = {}
    for r in rows: by.setdefault(r["cell"], []).append(r)
    fresh, aged = [], []
    for cell, rs in by.items():
        rs.sort(key=lambda r: r["k"])
        fresh += rs[:5]
        cap0 = rs[0]["first_capacity_Ah"]
        aged += [r for r in rs if r["prev_capacity_Ah"] is not None and r["prev_capacity_Ah"] < 0.8 * cap0]
    return by, fresh, aged

def summ(rs, key):
    v = [r[key] for r in rs if key in r]
    return st.median(v), min(v), max(v), len(v)

def spares(t_chg):
    B.T_CHG = t_chg
    return next((s for s in GRID if B.avg(RATE, 1, s, 3)[1] <= 300), None)

if __name__ == "__main__":
    data = json.load(open(os.path.join(HERE, "nasa_charge_metrics.json")))
    rows = data["charges"]
    by, fresh, aged = groups(rows)
    print(f"Source: {data['source']}; {len(rows)} charges kept, dropped {data['dropped']}")
    print("\nPer cell: charges kept, first and last preceding discharge capacity (Ah), charges in the aged set")
    for cell, rs in by.items():
        caps = [r["prev_capacity_Ah"] for r in rs if r["prev_capacity_Ah"]]
        na = sum(1 for r in aged if r["cell"] == cell)
        print(f"  {cell}: {len(rs):3d} charges, capacity {caps[0]:.3f} -> {caps[-1]:.3f}, aged {na}")
    keys = [("ratio_30_100", "30->100% time / linear"), ("ratio_20_90", "20->90% time / linear"),
            ("ratio_30_100_c50", "30->100% (to C/50) / linear"), ("ratio_20_90_c50", "20->90% (to C/50) / linear"),
            ("q_cv_frac", "share of charge delivered in CV"), ("t_cv_s", "CV phase (min)"),
            ("t_total_s", "whole charge (min)"), ("Q_Ah", "charge delivered (Ah)"), ("tau_s", "single-exp tau (min)"),
            ("tau_hi_s", "tau, I > 0.3 I_cc (min)"), ("tau_lo_s", "tau, I <= 0.3 I_cc (min)"), ("r2_exp", "R^2 of single exponential"),
            ("T_max_C", "peak cell temperature (C)")]
    print("\nmetric                              | fresh median [min, max] (n)      | aged median [min, max] (n)")
    S = {}
    for k, name in keys:
        out = []
        for g in (fresh, aged):
            m, lo, hi, n = summ(g, k)
            if k.endswith("_s"): m, lo, hi = m / 60, lo / 60, hi / 60
            out.append(f"{m:8.3f} [{lo:7.3f}, {hi:7.3f}] ({n:3d})")
            S[(k, g is aged)] = m
        print(f"{name:35s} | " + " | ".join(out))
    rf, ra = S[("ratio_30_100", False)], S[("ratio_30_100", True)]
    print("\nPer cell, median 30->100% ratio fresh / aged:")
    for cell in by:
        f = [r["ratio_30_100"] for r in fresh if r["cell"] == cell]; a = [r["ratio_30_100"] for r in aged if r["cell"] == cell]
        print(f"  {cell}: {st.median(f):.3f} / " + (f"{st.median(a):.3f}" if a else "no aged charges"))
    print("\nPredictions:")
    print(f"  P1 fresh 30->100% ratio in [1.4, 2.0]: {rf:.3f} -> {'held' if 1.4 <= rf <= 2.0 else 'refuted'}")
    print(f"  P2 aged ratio >= 1.15 x fresh: {ra:.3f} = {ra/rf:.3f} x -> {'held' if ra >= 1.15*rf else 'refuted'}")
    r9f, r9a = S[("ratio_20_90", False)], S[("ratio_20_90", True)]
    print(f"  P3 20->90% ratio <= 1.10 fresh and aged: {r9f:.3f}, {r9a:.3f} -> {'held' if max(r9f, r9a) <= 1.10 else 'refuted'}")
    r2 = S[("r2_exp", False)]
    print(f"  P4 single exponential R^2 >= 0.95 (fresh median): {r2:.4f} -> {'held' if r2 >= 0.95 else 'refuted'}")
    print(f"\nHub (6d model, 8 pads, 8 chargers, {RATE} flights/h Poisson, 3 seeds): charge time = ratio x 42 min")
    cases = {"linear (6b)": 1.0, "6d fitted CC-CV 30-100%": 72.0 / 42, "measured fresh 20-90%": r9f, "measured aged 20-90%": r9a,
             "measured fresh 30-100%": rf, "measured aged 30-100%": ra}
    need = {}
    for n, r in cases.items():
        need[n] = spares(r * LINEAR_1C_S)
        print(f"  {n:24s} {r*42:5.1f} min  limit {8*60/(r*42):5.2f}/h  spares for p95<=300 s: {need[n] if need[n] else '>64'}")
    a, f = need["measured aged 30-100%"], need["measured fresh 30-100%"]
    if a is None and f is None:
        print("  P5 aged needs >= fresh + 8 spares: untestable as worded: both 30->100% cases put 6.0 flights/h above the"
              " 8-charger limit, so no spare count stops the queue growing")
    else:
        print(f"  P5 aged needs >= fresh + 8 spares: {a} vs {f} -> " + ("held" if (a or 99) >= (f or 99) + 8 else "refuted"))
    print("\nBy the charger limit alone (8 chargers, ratio x 42 min): flights/h the hub can sustain")
    for n in ("fresh", "aged"):
        for w in ("20_90", "30_100", "30_100_c50"):
            r = S[(f"ratio_{w}", n == "aged")]
            print(f"  {n:5s} {w:11s} ratio {r:.3f} -> {8*60/(r*42):5.2f} flights/h")
