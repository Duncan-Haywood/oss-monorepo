"""Milestone 90 analysis: four audits of milestone 89's forgeries on fresh test seeds 200 to 239, priced by audit compute.
  A  two-stage (milestone 89): two-sided zoned fp16 referee, flagged segments to the global float32 arbiter
  B  arbiter-only: float32 arbiter on every segment, threshold 10x the zone's honest calibration max (5-segment zones)
  C  quantile referee: upper fp16 threshold at the zone's (1 - f) honest calibration quantile, f = 0.01, 0.05, then B
  sampled arbiter at rate p (cost p, catch p x B) and mixed (A everywhere plus B on a random share p of the rest)
Audit compute per segment in float32-replay units: arbiter replay 1, fp16 referee replay r (0.5 or 0.068). Reads
results.json (run.py) and ../precision_forgery/summary.json (milestone 89, control Q1); writes results.txt and
summary.json. Rules and predictions are LOG.md's, fixed before the run."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MARGIN = 10.0
ZONE = 5
FS = (0.01, 0.05)
R_COST = {"tf32": 0.5, "fp32": 67 / 989}  # fp16 tensor replay cost over a TF32 tensor / FP32 vector one (H100 SXM)
P_MIX = 0.1
STATS = {"sgd": ("w",), "momentum": ("w", "m"), "adam": ("w", "m", "v")}


def arr(runs, seeds, mode, stat, key):
    return np.array([runs[str(s)][mode][stat][key] for s in seeds], dtype=float)  # seeds x N


def zoned(c, fn, nseg):
    return np.repeat([fn(c[:, z:z + ZONE]) for z in range(0, nseg, ZONE)], ZONE)[:nseg]


def zq(f):
    return lambda v: float(np.quantile(v, 1.0 - f, method="higher"))


def saved_prec(q, r, s=20):
    return q * (1 - r) / s


def frontier(pairs):
    ok = [s for s, d in pairs if d <= 0.5]
    return max(ok) if ok else 0.0


def analyze(res):
    test, cal, qs = res["test_seeds"], res["cal_seeds"], res["qs"]
    out = {}
    for opt, scheds in res["runs"].items():
        ss = STATS[res["opts"][opt][0]]
        out[opt] = {}
        for sc, runs in scheds.items():
            keys = list(runs[str(test[0])]["fp16"]["w"])
            nseg = len(runs[str(test[0])]["fp16"]["w"]["honest"])
            fth, rth, hi, lo, zr, qhi = {}, {}, {}, {}, {}, {f: {} for f in FS}
            for s in ss:
                c = arr(runs, cal, "fp16", s, "honest")
                rc = arr(runs, cal, "reorder", s, "honest")
                fth[s], rth[s] = float(c.max()), MARGIN * float(rc.max())
                hi[s], lo[s] = zoned(c, np.max, nseg), zoned(c, np.min, nseg)
                zr[s] = MARGIN * zoned(rc, np.max, nseg)
                for f in FS:
                    qhi[f][s] = zoned(c, zq(f), nseg)
            cells = {}
            for k in keys:
                fx = {s: arr(runs, test, "fp16", s, k) for s in ss}
                rx = {s: arr(runs, test, "reorder", s, k) for s in ss}
                conv_g = np.any([rx[s] > rth[s] for s in ss], axis=0)
                B = np.any([rx[s] > zr[s] for s in ss], axis=0)
                two = np.any([fx[s] > hi[s] for s in ss] + [fx[s] < lo[s] for s in ss], axis=0)
                A = two & conv_g
                c = {"flag_two": float(two.mean()), "A": float(A.mean()), "B": float(B.mean()),
                     "B_not_A": float((B & ~A).mean())}
                for f in FS:
                    fl = np.any([fx[s] > qhi[f][s] for s in ss], axis=0)
                    c[f"flagC{f}"] = float(fl.mean())
                    c[f"C{f}"] = float((fl & B).mean())
                cells[k] = c
            h = cells["honest"]
            row = {"fp16_thr": fth, "reorder_thr": rth, "cells": cells, "budget": {}}
            for rn, r in R_COST.items():
                costA = r + h["flag_two"]
                costM = costA + P_MIX
                bud = {"costA": costA, "costM": costM}
                for k in keys:
                    ck = cells[k]
                    bud[k] = {"A": ck["A"], "sampled_eqA": min(1.0, costA) * ck["B"],
                              "mixed": ck["A"] + P_MIX * ck["B_not_A"], "sampled_eqM": min(1.0, costM) * ck["B"]}
                row["budget"][rn] = bud
            row["frontier_A_f16"] = {rn: frontier([(saved_prec(q, r), cells[f"f16_{q}"]["A"]) for q in qs])
                                     for rn, r in R_COST.items()}
            row["frontier_B_f16"] = {rn: frontier([(saved_prec(q, r), cells[f"f16_{q}"]["B"]) for q in qs])
                                     for rn, r in R_COST.items()}
            out[opt][sc] = row
    return out


def report(res, out, m89):
    qs = res["qs"]
    allc = [(o, s, r) for o, sr in out.items() for s, r in sr.items()]
    ma = [(o, s, r) for o, s, r in allc if o != "sgd"]
    m1 = [(o, s, r) for o, s, r in ma if o in ("momentum", "adam15")]
    L = ["Milestone 90. Milestone 89's forgeries on fresh test seeds 200-239 (calibration 100-139), 3,000 test segments",
         "per cell. Audits: A two-stage (two-sided zoned fp16 referee, then global float32 arbiter, milestone 89);",
         "B arbiter-only (float32 reorder replay of every segment, 10x the zone's honest calibration max, 5-segment zones);",
         "C quantile referee (upper fp16 threshold = zone's (1 - f) honest calibration quantile, then B). Audit compute per",
         "segment in float32-replay units: arbiter 1, fp16 referee r = 0.5 (FP16 over TF32 tensor) or 0.068 (over FP32",
         "vector), H100 SXM datasheet. Sampled arbiter at rate p catches p x B; mixed = A plus B on a share 0.1 of the rest.",
         ""]
    q1 = all(r["fp16_thr"] == m89[o][s]["fp16_thr"] and r["reorder_thr"] == m89[o][s]["reorder_thr"] for o, s, r in allc)
    L.append(f"Q1 control: calibration thresholds equal milestone 89's in every cell: {q1}")
    L.append("")
    L.append("Honest test segments: two-sided flag | A convicted | B convicted (count of 3,000) | C flag f=0.01, 0.05 | C conv")
    for o, s, r in allc:
        h = r["cells"]["honest"]
        L.append(f"  {o:9s} {s:8s} {h['flag_two']:.4f} | {h['A']:.4f} | {h['B']:.4f} ({round(3000 * h['B'])}) | "
                 f"{h['flagC0.01']:.4f} {h['flagC0.05']:.4f} | {h['C0.01']:.4f} {h['C0.05']:.4f}")
    L.append("")
    for fam in ("f16", "bf16"):
        for aud in ("A", "B", "C0.01", "C0.05"):
            L.append(f"{fam}: {aud} catch rate by q = {qs}")
            for o, s, r in allc:
                L.append(f"  {o:9s} {s:8s} " + " ".join(f"{r['cells'][f'{fam}_{q}'][aud]:.3f}" for q in qs))
            L.append("")
    others = ["skip1", "skip2", "sub63_10", "sub63_20", "sub62_20", "sub56_20"]
    L.append("Other cheats, A / B: " + ", ".join(others))
    for o, s, r in allc:
        c = r["cells"]
        L.append(f"  {o:9s} {s:8s} " + "  ".join(f"{c[k]['A']:.3f}/{c[k]['B']:.3f}" for k in others))
    L.append("")
    show = ["f16_1", "f16_5", "f16_10", "bf16_5", "sub63_20", "skip1"]
    for rn, r0 in R_COST.items():
        L.append(f"Equal audit budget, r = {r0:.3f}: cost of A | catch A / sampled arbiter at A's cost, for {', '.join(show)}")
        for o, s, r in allc:
            b = r["budget"][rn]
            L.append(f"  {o:9s} {s:8s} {b['costA']:.3f} | " + "  ".join(f"{b[k]['A']:.3f}/{b[k]['sampled_eqA']:.3f}"
                                                                     for k in show))
        L.append(f"  mixed (cost A + {P_MIX}): mixed / sampled arbiter at the mixed cost")
        for o, s, r in allc:
            b = r["budget"][rn]
            L.append(f"  {o:9s} {s:8s} {b['costM']:.3f} | " + "  ".join(f"{b[k]['mixed']:.3f}/{b[k]['sampled_eqM']:.3f}"
                                                                     for k in show))
        L.append("")
    L.append("f16 frontier (largest saved share with catch <= 0.5) at r = 0.5 / 0.068: A | B")
    for o, s, r in allc:
        fa, fb = r["frontier_A_f16"], r["frontier_B_f16"]
        L.append(f"  {o:9s} {s:8s} {100 * fa['tf32']:.1f}%/{100 * fa['fp32']:.1f}% | {100 * fb['tf32']:.1f}%/"
                 f"{100 * fb['fp32']:.1f}%")
    L.append("")
    L.append("Predictions")
    L.append(f"  Q1 {'held' if q1 else 'REFUTED'}")
    a = min(r["cells"]["f16_1"]["B"] for _, _, r in allc)
    b = min(r["cells"]["f16_1"]["B"] for _, _, r in ma)
    c = min(r["cells"]["bf16_1"]["B"] for _, _, r in allc)
    d = max(r["cells"]["honest"]["B"] for _, _, r in allc)
    L.append(f"  Q2 {'held' if a >= 0.75 and b >= 0.9 and c >= 0.8 and d <= 0.001 else 'REFUTED'} (smallest B on f16_1 "
             f"{a:.3f}, momentum/Adam {b:.3f}; smallest B on bf16_1 {c:.3f}; largest honest B {d:.4f})")
    e = min(r["cells"][f"{p}_{q}"]["B"] for _, _, r in allc for p in ("f16", "bf16") for q in qs if q >= 2)
    L.append(f"  Q3 {'held' if e >= 0.95 else 'REFUTED'} (smallest B on f16/bf16 q >= 2: {e:.3f})")
    f_ = max(r["cells"][f"f16_{q}"]["A"] for _, _, r in allc for q in qs if q <= 5)
    g = min(r["frontier_A_f16"]["tf32"] for _, _, r in ma)
    L.append(f"  Q4 {'held' if f_ <= 0.2 and g >= 0.125 else 'REFUTED'} (largest A on f16 q <= 5: {f_:.3f}; smallest"
             f" momentum/Adam A frontier at r = 0.5: {100 * g:.1f}%)")
    h1 = min(r["cells"]["bf16_20"]["C0.05"] for _, _, r in ma)
    h2 = max(r["cells"]["honest"]["flagC0.05"] for _, _, r in allc)
    h3 = max(r["cells"]["honest"]["C0.05"] for _, _, r in allc)
    L.append(f"  Q5 {'held' if h1 >= 0.5 and h2 <= 0.07 and h3 <= 0.001 else 'REFUTED'} (smallest momentum/Adam C0.05 on"
             f" bf16_20 {h1:.3f}; largest honest C0.05 flag {h2:.4f}, conviction {h3:.4f})")
    i = max(r["cells"][f"f16_{q}"]["C0.05"] for _, _, r in allc for q in qs)
    L.append(f"  Q6 {'held' if i <= 0.08 else 'REFUTED'} (largest C0.05 on f16: {i:.3f})")
    j = [(r["budget"]["tf32"]["f16_5"]["sampled_eqA"] - r["budget"]["tf32"]["f16_5"]["A"]) for _, _, r in ma]
    L.append(f"  Q7 {'held' if min(j) > 0 else 'REFUTED'} (sampled minus A on f16_5 at r = 0.5: {min(j):+.3f} to "
             f"{max(j):+.3f})")
    k = [(r["budget"]["fp32"]["sub63_20"]["A"] - r["budget"]["fp32"]["sub63_20"]["sampled_eqA"]) for _, _, r in m1]
    L.append(f"  Q8 {'held' if min(k) > 0 else 'REFUTED'} (A minus sampled on sub63_20 at r = 0.068, momentum/Adam 1e-3:"
             f" {min(k):+.3f} to {max(k):+.3f})")
    gap = []
    for _, _, r in ma:
        bb = r["budget"]["fp32"]
        for key in ("f16_5", "sub63_20"):
            gap.append(bb[key]["mixed"] - max(bb[key]["A"], bb[key]["sampled_eqM"]))
    L.append(f"  Q9 {'held' if min(gap) >= -0.02 else 'REFUTED'} (mixed minus the better of A and the equal-cost"
             f" sampled arbiter, f16_5 and sub63_20, r = 0.068: {min(gap):+.3f} to {max(gap):+.3f})")
    rep = b >= 0.75 and d <= 0.001
    L.append(f"  Replication line (B convicts f16_1 in >= 0.75 of momentum/Adam segments and <= 0.1% of honest ones):"
             f" {'replicated' if rep else 'NOT replicated'}")
    L.append("")
    worst = ["f16_5", "f16_10", "bf16_5", "sub63_20", "skip1"]
    L.append("Post hoc (declared after reading the outcome): worst-case catch over the forgers " + ", ".join(worst) + ",")
    L.append("r = 0.068 and r = 0.5: A | sampled arbiter at A's cost | mixed | sampled arbiter at the mixed cost")
    for rn in R_COST:
        for o, s, r in allc:
            b = r["budget"][rn]
            w = [min(b[k][m] for k in worst) for m in ("A", "sampled_eqA", "mixed", "sampled_eqM")]
            L.append(f"  {rn:4s} {o:9s} {s:8s} " + " | ".join(f"{v:.3f}" for v in w))
    L.append("")
    L.append("== Figure table: warmcos, catch rate against forged f16 steps q; A then B for sgd momentum adam15 adam60")
    for q in qs:
        c = {o: out[o]["warmcos"]["cells"][f"f16_{q}"] for o in ("sgd", "momentum", "adam15", "adam60")}
        L.append(f"  {q} " + " ".join(f"{c[o]['A']:.3f}" for o in c) + " " + " ".join(f"{c[o]['B']:.3f}" for o in c))
    return "\n".join(L) + "\n"


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m89 = json.load(open(os.path.join(HERE, "..", "precision_forgery", "summary.json")))
    out = analyze(res)
    open(os.path.join(HERE, "results.txt"), "w").write(report(res, out, m89))
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    print(open(os.path.join(HERE, "results.txt")).read())


if __name__ == "__main__":
    main()
