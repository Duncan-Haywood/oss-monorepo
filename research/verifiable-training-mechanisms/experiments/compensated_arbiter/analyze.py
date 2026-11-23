"""Milestone 92 analysis: milestone 91's selected float32 arbiter rule, Q(0.95, 10, C80) per statistic and zone of
5 segments, applied with no selection to plain SGD (statistic w) and Kahan-compensated SGD (statistic wc, the
compensated weights w - c; kahan w, weights alone, as an ablation). Calibration seeds 100 to 179 from each worker's
own honest runs; control seeds 300 to 339 (milestone 91's holdout); fresh seeds 400 to 439 (the claim).
Reads results.json (run.py) and ../arbiter_threshold/summary.json (control U1); writes results.txt and summary.json.
Predictions are LOG.md's, fixed before the run."""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("at_analyze", os.path.join(HERE, "..", "arbiter_threshold", "analyze.py"))
AT = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(AT)
ZONE, conv_stats = AT.ZONE, AT.conv_stats
RULE = "Q(0.95,10,C80)"
P, K = 0.95, 10
ARMS = (("plain", "w"), ("kahan", "w"), ("kahan", "wc"))
OTHERS = ("skip1", "skip2", "sub63_20", "sub56_20")


def rule_threshold(cal):
    return AT.threshold(cal, "q", P, K)


def arr(runs, seeds, kind, stat, key):
    return np.array([runs[str(s)][kind][stat][key] for s in seeds], dtype=float)


def last_segment_diag(res):
    """Declared after reading the outcome (LOG.md): per-segment f16 conviction on the fresh seeds, and the last
    step's learning rate as a share of its segment's mean (the forged step's weight in the segment)."""
    spec = importlib.util.spec_from_file_location("m85_sched", os.path.join(HERE, "..", "optimizer_replay", "run.py"))
    m = importlib.util.module_from_spec(spec)
    import sys
    sys.modules["m85_sched"] = m
    spec.loader.exec_module(m)
    S, N = res["S"], res["N"]
    out = {}
    for sc, runs in res["runs"].items():
        lrs = m.m85.schedule(sc, m.OPTS["sgd"][1])
        d = {"lr_share": [float(lrs[j * S + S - 1] / np.mean(lrs[j * S:(j + 1) * S])) for j in range(N)]}
        for kind, stat in (("plain", "w"), ("kahan", "wc")):
            thr = rule_threshold(arr(runs, res["cal_seeds"], kind, stat, "honest"))
            for key in ("f16_1", "f16_2", "f16_5"):
                d[f"{kind}_{stat}/{key}"] = [float(v) for v in (arr(runs, res["fresh_seeds"], kind, stat, key) > thr).mean(0)]
        out[sc] = d
    return out


def analyze(res):
    sets = {"hold": res["hold_seeds"], "fresh": res["fresh_seeds"]}
    out = {"cells": {}}
    for sc, runs in res["runs"].items():
        keys = list(runs[str(sets["fresh"][0])]["plain"]["w"])
        cell = {"arms": {}, "diag": {}, "loss": {}}
        for kind, stat in ARMS:
            cal = arr(runs, res["cal_seeds"], kind, stat, "honest")
            thr = rule_threshold(cal)
            med = np.median(cal, axis=0)
            zmed = np.array([np.median(cal[:, z:z + ZONE]) for z in range(0, cal.shape[1], ZONE)])
            cell["diag"][f"{kind}_{stat}"] = {"zone_median": [float(v) for v in zmed],
                                             "last_over_first": float(zmed[-1] / np.median(cal[:, :5 * ZONE])),
                                             "seg_median": [float(v) for v in med]}
            r = {}
            for st, seeds in sets.items():
                r[st] = {}
                for key in keys:
                    conv = arr(runs, seeds, kind, stat, key) > thr
                    mean, worst, wz, z = conv_stats(conv)
                    r[st][key] = {"mean": mean, "worst": worst, "wz": wz, "count": int(conv.sum()),
                                  "zones": [float(v) for v in z]}
            cell["arms"][f"{kind}_{stat}"] = r
        for kind in ("plain", "kahan"):
            cell["loss"][kind] = float(np.mean([res["losses"][sc][str(s)][kind] for s in sets["fresh"]]))
        out["cells"][sc] = cell
    return out


def report(res, out, m91):
    cells = out["cells"]
    qs = res["qs"]
    L = ["Milestone 92. Plain against Kahan-compensated SGD, float32 reorder arbiter, rule " + RULE + " (milestone 91's",
         "selected rule, applied unchanged). Calibration seeds 100-179 (each worker's own honest runs); control 300-339",
         "(milestone 91's holdout); fresh 400-439. 3,000 segments per cell and set; 'worst' = least-convicted zone of 15.",
         "Arms: plain_w (milestone 91), kahan_w (Kahan weights only, ablation), kahan_wc (compensated weights w - c).", ""]
    u1 = True
    bad = []
    for sc in cells:
        ref = m91["cells"][f"sgd/{sc}"]["rules"][RULE]["hold"]
        mine = cells[sc]["arms"]["plain_w"]["hold"]
        for k, v in ref.items():
            for f in ("mean", "worst", "wz", "count"):
                if mine[k][f] != v[f]:
                    u1 = False
                    bad.append((sc, k, f, mine[k][f], v[f]))
    L.append(f"U1 control: plain_w on seeds 300-339 equals milestone 91's holdout figures for {RULE}, every cheat and"
             f" cell: {u1}" + (f" (first mismatches: {bad[:3]})" if bad else ""))
    L.append("")
    L.append("Diagnosis (calibration seeds): honest median statistic per zone (zones 0, 4, 7, 10, 12, 13, 14) and zone 14"
             " / median of zones 0-4")
    for sc in cells:
        for arm in ("plain_w", "kahan_w", "kahan_wc"):
            d = cells[sc]["diag"][arm]
            zm = d["zone_median"]
            L.append(f"  {sc:7s} {arm:8s} " + " ".join(f"{zm[z]:.2e}" for z in (0, 4, 7, 10, 12, 13, 14))
                     + f" | {d['last_over_first']:.2f}")
    L.append("")
    for st, lab in (("hold", "control 300-339"), ("fresh", "FRESH 400-439")):
        L.append(f"{lab}: honest convictions (of 3,000) | f16_1 mean, worst zone (index) | bf16_1 mean, worst |"
                 " smallest mean over f16/bf16 q >= 1; arms plain_w || kahan_w || kahan_wc")
        for sc in cells:
            parts = []
            for arm in ("plain_w", "kahan_w", "kahan_wc"):
                r = cells[sc]["arms"][arm][st]
                q1 = min(r[f"{p}_{q}"]["mean"] for p in ("f16", "bf16") for q in qs)
                parts.append(f"{r['honest']['count']:2d} | {r['f16_1']['mean']:.3f} {r['f16_1']['worst']:.3f}"
                             f" ({r['f16_1']['wz']:2d}) | {r['bf16_1']['mean']:.3f} {r['bf16_1']['worst']:.3f} | {q1:.3f}")
            L.append(f"  {sc:7s} " + "  ||  ".join(parts))
        L.append("")
    L.append("FRESH, f16_1 conviction per zone (0..14), plain_w then kahan_wc:")
    for sc in cells:
        for arm in ("plain_w", "kahan_wc"):
            L.append(f"  {sc:7s} {arm:8s} " + " ".join(f"{v:.2f}" for v in cells[sc]["arms"][arm]["fresh"]["f16_1"]["zones"]))
    L.append("")
    if "last" in out:
        L.append("Declared after reading: FRESH per-segment conviction, segments 70-74 (zone 14), and the last step's")
        L.append("learning rate as a share of its segment's mean; then the smallest per-segment rate over segments 0-73")
        for sc, d in out["last"].items():
            L.append(f"  {sc:7s} lr share " + " ".join(f"{v:.3f}" for v in d["lr_share"][70:75]))
            for arm in ("plain_w", "kahan_wc"):
                for key in ("f16_1", "f16_2", "f16_5"):
                    v = d[f"{arm}/{key}"]
                    L.append(f"  {sc:7s} {arm:8s} {key}: " + " ".join(f"{x:.3f}" for x in v[70:75])
                             + f" | min over 0-73 {min(v[:74]):.3f}")
        L.append("")
    L.append("FRESH, other cheats, mean conviction plain_w / kahan_wc: " + ", ".join(OTHERS))
    for sc in cells:
        L.append(f"  {sc:7s} " + "  ".join(f"{cells[sc]['arms']['plain_w']['fresh'][k]['mean']:.3f}/"
                                          f"{cells[sc]['arms']['kahan_wc']['fresh'][k]['mean']:.3f}" for k in OTHERS))
    L.append("")
    L.append("FRESH, mean held-out loss, plain | kahan | relative difference")
    for sc in cells:
        a, b = cells[sc]["loss"]["plain"], cells[sc]["loss"]["kahan"]
        L.append(f"  {sc:7s} {a:.5f} | {b:.5f} | {(b - a) / a:+.4%}")
    L.append("")

    def g(arm, st, sc, key, f):
        return cells[sc]["arms"][arm][st][key][f]
    L.append("Predictions")
    L.append(f"  U1 {'held' if u1 else 'REFUTED'}")
    lp = [cells[sc]["diag"]["plain_w"]["last_over_first"] for sc in cells]
    lk = [cells[sc]["diag"]["kahan_wc"]["last_over_first"] for sc in cells]
    L.append(f"  U2 {'held' if min(lp) >= 5 and max(lk) <= 2 else 'REFUTED'} (zone 14 / zones 0-4 honest median:"
             f" plain_w {min(lp):.2f} to {max(lp):.2f}, kahan_wc {min(lk):.2f} to {max(lk):.2f})")
    wk = [g("kahan_wc", "fresh", sc, "f16_1", "worst") for sc in cells]
    wp = [g("plain_w", "fresh", sc, "f16_1", "worst") for sc in cells]
    L.append(f"  U3 {'held' if min(wk) >= 0.95 and sum(v <= 0.4 for v in wp) >= 3 else 'REFUTED'} (fresh worst-zone"
             f" f16_1: kahan_wc {min(wk):.3f} to {max(wk):.3f}; plain_w " + ", ".join(f"{v:.3f}" for v in wp) + ")")
    hk = [g("kahan_wc", "fresh", sc, "honest", "count") for sc in cells]
    L.append(f"  U4 {'held' if max(hk) <= 3 and sum(hk) <= 8 else 'REFUTED'} (fresh honest convictions, kahan_wc:"
             f" largest {max(hk)} per cell, {sum(hk)} of 12,000; plain_w "
             f"{sum(g('plain_w', 'fresh', sc, 'honest', 'count') for sc in cells)})")
    e = min(g("kahan_wc", "fresh", sc, f"{p}_{q}", "mean") for sc in cells for p in ("f16", "bf16") for q in qs)
    bw = min(g("kahan_wc", "fresh", sc, "bf16_1", "worst") for sc in cells)
    L.append(f"  U5 {'held' if e >= 0.97 and bw >= 0.95 else 'REFUTED'} (fresh kahan_wc smallest mean over f16/bf16"
             f" q >= 1 {e:.3f}; bf16_1 worst zone {bw:.3f})")
    ka = [g("kahan_w", "fresh", sc, "f16_1", "worst") for sc in cells]
    L.append(f"  U6 {'held' if min(ka) < 0.9 else 'REFUTED'} (fresh kahan_w worst-zone f16_1: "
             + ", ".join(f"{v:.3f}" for v in ka) + ")")
    rd = [abs(cells[sc]["loss"]["kahan"] / cells[sc]["loss"]["plain"] - 1) for sc in cells]
    L.append(f"  U7 {'held' if max(rd) <= 0.01 else 'REFUTED'} (largest relative loss difference {max(rd):.4%})")
    u8 = min(g("kahan_wc", "fresh", sc, k, "mean") - g("plain_w", "fresh", sc, k, "mean") for sc in cells for k in OTHERS)
    L.append(f"  U8 {'held' if u8 >= -0.01 else 'REFUTED'} (smallest kahan_wc minus plain_w mean over {', '.join(OTHERS)}:"
             f" {u8:+.3f})")
    L.append(f"  Failure line (kahan_wc worst-zone f16_1 < 0.8 in some cell): {'FAILED' if min(wk) < 0.8 else 'not met'}")
    L.append("")
    L.append("== Figure table: FRESH, worst-zone f16_1 conviction per cell; plain_w, kahan_w, kahan_wc")
    for sc in cells:
        L.append(f"  {sc} {g('plain_w', 'fresh', sc, 'f16_1', 'worst'):.3f} {g('kahan_w', 'fresh', sc, 'f16_1', 'worst'):.3f}"
                 f" {g('kahan_wc', 'fresh', sc, 'f16_1', 'worst'):.3f}")
    return "\n".join(L) + "\n"


def compact(out):
    small = {"rule": RULE, "cells": {}}
    for sc, cell in out["cells"].items():
        small["cells"][sc] = {"loss": cell["loss"],
                              "diag": {a: {k: v for k, v in d.items() if k != "seg_median"} for a, d in cell["diag"].items()},
                              "arms": cell["arms"]}
    small["last"] = out.get("last")
    return small


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m91 = json.load(open(os.path.join(HERE, "..", "arbiter_threshold", "summary.json")))
    out = analyze(res)
    out["last"] = last_segment_diag(res)
    txt = report(res, out, m91)
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    json.dump(compact(out), open(os.path.join(HERE, "summary.json"), "w"), separators=(",", ":"), default=float)
    print(txt)


if __name__ == "__main__":
    main()
