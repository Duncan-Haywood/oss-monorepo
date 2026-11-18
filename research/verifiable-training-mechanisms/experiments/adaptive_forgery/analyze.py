"""Milestone 87 analysis: zero-gradient forgeries (stale, coast) against the fp16 referee and the float32 arbiter,
checking weights (W), weights or first moment (WM) and, for Adam, the second moment too (WMV).
Reads results.json (run.py) and ../optimizer_replay/summary.json (milestone 86, for the control check E1), writes
results.txt and summary.json. Rules are LOG.md's, fixed before the run."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MARGIN = 10.0
REFEREES = {"W": ("w",), "WM": ("w", "m"), "WMV": ("w", "m", "v")}


def arr(runs, seeds, mode, stat, key):
    return np.array([runs[str(s)][mode][stat][key] for s in seeds], dtype=float)  # seeds x N


def analyze(res):
    test, cal = res["test_seeds"], res["cal_seeds"]
    out = {}
    for opt, scheds in res["runs"].items():
        out[opt] = {}
        for sc, runs in scheds.items():
            r0 = runs[str(test[0])]["fp16"]
            stats = list(r0)
            keys = list(r0["w"])
            fth = {s: float(arr(runs, cal, "fp16", s, "honest").max()) for s in stats}
            rth = {s: MARGIN * float(arr(runs, cal, "reorder", s, "honest").max()) for s in stats}
            flag = {s: {k: arr(runs, test, "fp16", s, k) > fth[s] for k in keys} for s in stats}
            conv = {s: {k: arr(runs, test, "reorder", s, k) > rth[s] for k in keys} for s in stats}
            row = {"fp16_thr": fth, "reorder_thr": rth, "cells": {}}
            refs = [r for r, ss in REFEREES.items() if all(s in stats for s in ss)]
            for k in keys:
                c = {"median": {s: float(np.median(arr(runs, test, "fp16", s, k))) for s in stats}}
                for r in refs:
                    f = np.any([flag[s][k] for s in REFEREES[r]], axis=0)
                    a_same = np.any([conv[s][k] for s in REFEREES[r]], axis=0)
                    c[f"flag_{r}"] = float(f.mean())
                    c[f"d_{r}_aW"] = float((f & conv["w"][k]).mean())
                    c[f"d_{r}_a{r}"] = float((f & a_same).mean())
                    c[f"aW_given_{r}"] = float((f & conv["w"][k]).sum() / max(f.sum(), 1))
                c["convict_aW"] = float(conv["w"][k].mean())
                row["cells"][k] = c
            if "m" in stats:  # E3 code check: coast commits skip's first moment, so mratio is identical
                row["coast_m_max_rel_diff"] = max(
                    float(np.max(np.abs(arr(runs, test + cal, md, "m", f"coast{q}") - arr(runs, test + cal, md, "m", f"skip{q}"))
                                 / arr(runs, test + cal, md, "m", f"skip{q}")))
                    for q in res["skips"] for md in ("fp16", "reorder"))
                row["zoned"] = zoned(runs, test, cal, stats, keys)
            out[opt][sc] = row
    return out


ZONE = 5  # post hoc (declared after reading the outcome): thresholds per zone of 5 consecutive segments


def zoned(runs, test, cal, stats, keys):
    """WM (WMV for Adam) referee with fp16 thresholds = honest calibration max within each zone of ZONE segments
    (200 calibration values per zone), then the same-statistics arbiter with the global 10x rule."""
    ss = [s for s in ("w", "m", "v") if s in stats]
    out = {}
    for k in keys:
        f = np.zeros((len(test), len(runs[str(test[0])]["fp16"]["w"][k])), bool)
        conv = np.zeros_like(f)
        for s in ss:
            c = arr(runs, cal, "fp16", s, "honest")
            x = arr(runs, test, "fp16", s, k)
            th = np.repeat([c[:, z:z + ZONE].max() for z in range(0, c.shape[1], ZONE)], ZONE)[:c.shape[1]]
            f |= x > th
            conv |= arr(runs, test, "reorder", s, k) > MARGIN * arr(runs, cal, "reorder", s, "honest").max()
        out[k] = {"flag": float(f.mean()), "d": float((f & conv).mean())}
    return out


def best(opt):
    return "WMV" if opt.startswith("adam") else "WM" if opt == "momentum" else "W"


def report(res, out, m86):
    qs = res["skips"]
    L = ["Milestone 87. Zero-gradient forgeries of a segment's last q of 20 steps against the fp16 replay referee and the",
         "float32 reorder arbiter (convicts above 10x its honest calibration max). Calibration seeds 100-139, test 0-39,",
         "3,000 test segments per cell. skip = stop early (milestone 86); stale = re-apply the last computed gradient;",
         "coast = use the first moment as the gradient. d_X_aY = flagged by referee X and convicted by arbiter Y.", ""]
    L.append("Honest test segments: flag rate (W / WM / WMV) and two-stage false convictions (referee X, arbiter X)")
    for opt, sr in out.items():
        for sc, r in sr.items():
            h = r["cells"]["honest"]
            fl = " / ".join(f"{h[f'flag_{x}']:.4f}" for x in REFEREES if f"flag_{x}" in h)
            dc = " / ".join(f"{h[f'd_{x}_a{x}']:.4f}" for x in REFEREES if f"flag_{x}" in h)
            L.append(f"  {opt:9s} {sc:8s} flag {fl}   convicted {dc}")
    L.append("")
    L.append("E1 control: skip q, W referee + aW arbiter, this run against milestone 86 (max abs difference over q)")
    for opt, sr in out.items():
        diffs = []
        for sc, r in sr.items():
            diffs.append(max(abs(r["cells"][f"skip{q}"]["d_W_aW"] - m86[opt][sc][f"skip{q}"]["d"]) for q in qs))
        L.append(f"  {opt:9s} " + ", ".join(f"{sc} {d:.4f}" for sc, d in zip(sr, diffs)))
    L.append("")
    L.append("Median fp16 statistics at q = 1 (w / m / v), by cheat")
    for opt, sr in out.items():
        for sc, r in sr.items():
            parts = []
            for ch in ("skip", "stale", "coast"):
                k = f"{ch}1"
                if k in r["cells"]:
                    parts.append(ch + " " + "/".join(f"{v:.3g}" for v in r["cells"][k]["median"].values()))
            L.append(f"  {opt:9s} {sc:8s} " + "   ".join(parts))
    L.append("")
    L.append("Detection d by q, referee W with arbiter aW | referee WM with arbiter aWM | Adam: WMV with aWMV")
    L.append("  " + f"{'opt':9s} {'sched':8s} {'cheat':6s}" + f"{'W/aW':>24s}  {'WM/aWM':>24s}  {'WMV/aWMV':>24s}")
    for opt, sr in out.items():
        for sc, r in sr.items():
            for ch in ("skip", "stale", "coast"):
                if f"{ch}1" not in r["cells"]:
                    continue
                cols = []
                for x in REFEREES:
                    key = f"d_{x}_a{x}"
                    if key in r["cells"][f"{ch}1"]:
                        cols.append(" ".join(f"{r['cells'][f'{ch}{q}'][key]:.3f}" for q in qs))
                    else:
                        cols.append("-")
                L.append(f"  {opt:9s} {sc:8s} {ch:6s}" + "".join(f"{c:>24s}  " for c in cols).rstrip())
    L.append("")
    L.append("E6: share of referee-flagged forged segments the weights-only arbiter convicts (min over q), WM referee")
    for opt, sr in out.items():
        if opt == "sgd":
            continue
        cells = []
        for sc, r in sr.items():
            vals = [r["cells"][f"{ch}{q}"]["aW_given_WM"] for ch in ("stale", "coast") for q in qs]
            cells.append(f"{sc} {min(vals):.3f}")
        L.append(f"  {opt:9s} " + ", ".join(cells))
    L.append("")
    L.append("E7: second moment's addition to the q = 1 flag rate (WMV minus WM), Adam, per cheat")
    for opt, sr in out.items():
        if not opt.startswith("adam"):
            continue
        for sc, r in sr.items():
            L.append(f"  {opt:9s} {sc:8s} " + ", ".join(
                f"{ch} {r['cells'][f'{ch}1']['flag_WMV'] - r['cells'][f'{ch}1']['flag_WM']:+.3f}"
                for ch in ("skip", "stale", "coast")))
    L.append("")
    L.append("E3 code check, coast's mratio against skip's: largest relative difference (float32 rounding of 0.9m + 0.1m)")
    L.append("  " + ", ".join(f"{o} {max(r['coast_m_max_rel_diff'] for r in sr.values()):.2g}"
                              for o, sr in out.items() if o != "sgd"))
    L.append("")
    L.append("Post hoc (declared after reading the outcome): referee thresholds zoned by 5 consecutive segments,")
    L.append("WM for momentum, WMV for Adam, same-statistics arbiter. Honest flag rate; d for coast and stale at q = 1, 2")
    for opt, sr in out.items():
        if opt == "sgd":
            continue
        for sc, r in sr.items():
            z = r["zoned"]
            L.append(f"  {opt:9s} {sc:8s} honest flag {z['honest']['flag']:.4f} convicted {z['honest']['d']:.4f}   "
                     + "  ".join(f"{ch}{q} {z[f'{ch}{q}']['d']:.3f}" for ch in ("skip", "coast", "stale") for q in (1, 2)))
    L.append("")
    L.append("== Figure table: adam60 warmcos, d by q (W/aW skip, coast; WM/aWM coast; WMV/aWMV coast)")
    L.append("  q  skip_W  coast_W  coast_WM  coast_WMV")
    c = out["adam60"]["warmcos"]["cells"]
    for q in qs:
        L.append(f"  {q:<3d} {c[f'skip{q}']['d_W_aW']:.3f} {c[f'coast{q}']['d_W_aW']:8.3f}"
                 f" {c[f'coast{q}']['d_WM_aWM']:9.3f} {c[f'coast{q}']['d_WMV_aWMV']:10.3f}")
    return "\n".join(L) + "\n"


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m86 = json.load(open(os.path.join(HERE, "..", "optimizer_replay", "summary.json")))
    out = analyze(res)
    txt = report(res, out, m86)
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
