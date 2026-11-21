"""Milestone 88 analysis: sub-batch proxy forgeries against the fp16 referee (global and zoned thresholds) and the
float32 arbiter. Reads results.json (run.py) and ../adaptive_forgery/summary.json (milestone 87, for the controls F2
and F8), writes results.txt and summary.json. Rules and predictions are LOG.md's, fixed before the run."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MARGIN = 10.0
ZONE = 5
REF = {"sgd": ("W", ("w",)), "momentum": ("WM", ("w", "m")), "adam": ("WMV", ("w", "m", "v"))}


def arr(runs, seeds, mode, stat, key):
    return np.array([runs[str(s)][mode][stat][key] for s in seeds], dtype=float)  # seeds x N


def saved(b, q, batch=64, s=20):
    return q * (batch - b) / (batch * s)


def analyze(res):
    test, cal, qs, bs = res["test_seeds"], res["cal_seeds"], res["qs"], res["bs"]
    out = {}
    for opt, scheds in res["runs"].items():
        kind = res["opts"][opt][0]
        rname, ss = REF[kind]
        out[opt] = {}
        for sc, runs in scheds.items():
            keys = list(runs[str(test[0])]["fp16"]["w"])
            nseg = len(runs[str(test[0])]["fp16"]["w"]["honest"])
            fth, zth, rth = {}, {}, {}
            for s in ss:
                c = arr(runs, cal, "fp16", s, "honest")
                fth[s] = float(c.max())
                zth[s] = np.repeat([c[:, z:z + ZONE].max() for z in range(0, nseg, ZONE)], ZONE)[:nseg]
                rth[s] = MARGIN * float(arr(runs, cal, "reorder", s, "honest").max())
            cells = {}
            for k in keys:
                fx = {s: arr(runs, test, "fp16", s, k) for s in ss}
                conv = np.any([arr(runs, test, "reorder", s, k) > rth[s] for s in ss], axis=0)
                gflag = np.any([fx[s] > fth[s] for s in ss], axis=0)
                zflag = np.any([fx[s] > zth[s] for s in ss], axis=0)
                cells[k] = {"median": {s: float(np.median(fx[s])) for s in ss},
                            "flag_global": float(gflag.mean()), "d_global": float((gflag & conv).mean()),
                            "flag_zoned": float(zflag.mean()), "d_main": float((zflag & conv).mean())}
            # F1: sub64 identical to honest, every mode, statistic and seed
            f1 = all(arr(runs, test + cal, md, s, f"sub64_{q}").tolist() == arr(runs, test + cal, md, s, "honest").tolist()
                     for q in qs for md in ("fp16", "reorder") for s in ss)
            cands = [(saved(b, q), b, q, cells[f"sub{b}_{q}"]["d_main"]) for q in qs for b in bs]
            ok = [c for c in cands if c[3] <= 0.5]
            fr = max(ok) if ok else (0.0, 64, 0, 0.0)
            gok = [saved(b, q) for q in qs for b in bs if cells[f"sub{b}_{q}"]["d_global"] <= 0.5]
            # F3 monotone in b (non-increasing as b rises), tolerance 0.02
            mono = all(cells[f"sub{bs[i + 1]}_{q}"]["d_main"] <= cells[f"sub{bs[i]}_{q}"]["d_main"] + 0.02
                       for q in qs for i in range(len(bs) - 1))
            row = {"fp16_thr": fth, "reorder_thr": rth, "cells": cells, "F1_sub64_is_honest": f1,
                   "frontier": {"saved": fr[0], "b": fr[1], "q": fr[2], "d_main": fr[3]}, "F3_monotone": mono,
                   "frontier_global": max(gok) if gok else 0.0,
                   "referee": rname}
            if "m" in ss:
                sk = cells["skip1"]["median"]["m"]
                row["F4"] = {b: cells[f"sub{b}_1"]["median"]["m"] / (sk * np.sqrt(64 / b - 1)) for b in (8, 16, 32, 48)}
            out[opt][sc] = row
    return out


def report(res, out, m87):
    qs, bs = res["qs"], res["bs"]
    L = ["Milestone 88. Sub-batch proxy forgeries: for the last q of a segment's 20 steps the worker takes the gradient of",
         "only b of the step's 64 rows. Saved compute = q (64 - b) / 1280 of the segment. fp16 replay referee (W for SGD,",
         "WM for momentum, WMV for Adam); main = thresholds zoned by 5 segments; arbiter = float32 reorder on the same",
         "statistics, 10x its honest calibration max. Calibration seeds 100-139, test 0-39, 3,000 test segments per cell.",
         "d = share of test segments flagged and convicted.", ""]
    L.append("F1 code check: sub64 statistics identical to honest in every mode, statistic and seed")
    L.append("  " + ", ".join(f"{o}/{s} {r['F1_sub64_is_honest']}" for o, sr in out.items() for s, r in sr.items()))
    L.append("")
    L.append("F2 control: skip q global d against milestone 87's same-statistics referee and arbiter (max abs difference)")
    for opt, sr in out.items():
        parts = []
        for sc, r in sr.items():
            rn = r["referee"]
            diffs = [abs(r["cells"][f"skip{q}"]["d_global"] - m87[opt][sc]["cells"][f"skip{q}"][f"d_{rn}_a{rn}"]) for q in qs]
            parts.append(f"{sc} {max(diffs):.4f}")
        L.append(f"  {opt:9s} " + ", ".join(parts))
    L.append("")
    L.append("F8 honest test segments: global flag (milestone 87's) | zoned flag | two-stage convictions global / zoned")
    for opt, sr in out.items():
        for sc, r in sr.items():
            h, rn = r["cells"]["honest"], r["referee"]
            L.append(f"  {opt:9s} {sc:8s} {h['flag_global']:.4f} ({m87[opt][sc]['cells']['honest'][f'flag_{rn}']:.4f}) | "
                     f"{h['flag_zoned']:.4f} | {h['d_global']:.4f} / {h['d_main']:.4f}")
    L.append("")
    for q in qs:
        L.append(f"Main d (zoned referee + arbiter) at q = {q}, by b (skip{q} = naive skip control)")
        L.append("  opt       sched    skip  " + " ".join(f"{b:>5d}" for b in bs))
        for opt, sr in out.items():
            for sc, r in sr.items():
                c = r["cells"]
                L.append(f"  {opt:9s} {sc:8s} {c[f'skip{q}']['d_main']:.3f} " +
                         " ".join(f"{c[f'sub{b}_{q}']['d_main']:.3f}" for b in bs))
        L.append("")
    L.append("Global-threshold d at q = 1, by b (milestone 87's referee, for comparison)")
    for opt, sr in out.items():
        for sc, r in sr.items():
            c = r["cells"]
            L.append(f"  {opt:9s} {sc:8s} {c['skip1']['d_global']:.3f} " + " ".join(f"{c[f'sub{b}_1']['d_global']:.3f}" for b in bs))
    L.append("")
    L.append("F4 model check: median q = 1 mratio of sub b over (skip median x sqrt(64/b - 1)), b = 8, 16, 32, 48")
    for opt, sr in out.items():
        for sc, r in sr.items():
            if "F4" in r:
                L.append(f"  {opt:9s} {sc:8s} " + " ".join(f"{v:.2f}" for v in r["F4"].values()))
    L.append("")
    L.append("Evasion frontier: largest saved share of a segment's compute among (b, q) with main d <= 0.5; F3 monotone")
    for opt, sr in out.items():
        for sc, r in sr.items():
            f = r["frontier"]
            L.append(f"  {opt:9s} {sc:8s} {100 * f['saved']:.2f}%  (b = {f['b']}, q = {f['q']}, d = {f['d_main']:.3f})"
                     f"  monotone {r['F3_monotone']}")
    L.append("")
    L.append("Predictions")
    allc = [(o, s, r) for o, sr in out.items() for s, r in sr.items()]
    mom_adam = [(o, s, r) for o, s, r in allc if o != "sgd"]
    L.append(f"  F1 {'held' if all(r['F1_sub64_is_honest'] for _, _, r in allc) else 'REFUTED'}")
    f2 = max(abs(r["cells"][f"skip{q}"]["d_global"] - m87[o][s]["cells"][f"skip{q}"][f"d_{r['referee']}_a{r['referee']}"])
             for o, s, r in allc for q in qs)
    L.append(f"  F2 {'held' if f2 == 0 else 'REFUTED'} (max difference {f2:.4f})")
    L.append(f"  F3 {'held' if all(r['F3_monotone'] for _, _, r in allc) else 'REFUTED'} "
             f"(non-monotone cells: {[o + '/' + s for o, s, r in allc if not r['F3_monotone']]})")
    f4 = [v for _, _, r in mom_adam for v in r["F4"].values()]
    L.append(f"  F4 {'held' if all(1 / 1.5 <= v <= 1.5 for v in f4) else 'REFUTED'} (ratio range {min(f4):.2f} to {max(f4):.2f})")
    f5 = min(r["cells"][f"sub{b}_1"]["d_main"] for _, _, r in mom_adam for b in bs if b <= 32)
    L.append(f"  F5 {'held' if f5 >= 0.9 else 'REFUTED'} (smallest main d at q = 1, b <= 32: {f5:.3f})")
    f6 = max(r["frontier"]["saved"] for _, _, r in mom_adam)
    L.append(f"  F6 {'held' if f6 < 0.01 else 'REFUTED'} (largest momentum/Adam frontier {100 * f6:.2f}%)")
    sg = out.get("sgd", {})
    inr = all(0.01 <= r["frontier"]["saved"] <= 0.05 for r in sg.values())
    gt = sum(sg[s]["frontier"]["saved"] > out["momentum"][s]["frontier"]["saved"] for s in sg)
    L.append(f"  F7 {'held' if inr and gt >= 3 else 'REFUTED'} (SGD frontiers "
             f"""{', '.join(f'{100 * r["frontier"]["saved"]:.2f}%' for r in sg.values())}; larger than momentum on {gt} of 4)""")
    f8a = all(abs(r["cells"]["honest"]["flag_global"] - m87[o][s]["cells"]["honest"][f"flag_{r['referee']}"]) < 1e-9 for o, s, r in allc)
    f8b = max(r["cells"]["honest"]["flag_zoned"] for _, _, r in allc)
    f8c = max(max(r["cells"]["honest"]["d_global"], r["cells"]["honest"]["d_main"]) for _, _, r in allc)
    L.append(f"  F8 {'held' if f8a and f8b <= 0.03 and f8c == 0 else 'REFUTED'} (global flags reproduce 87: {f8a}; "
             f"largest zoned honest flag {f8b:.4f}; largest honest conviction {f8c:.4f})")
    L.append(f"  Refutation line (frontier >= 5% in a momentum or Adam cell): {'CROSSED' if f6 >= 0.05 else 'not crossed'}")
    L.append("")
    L.append("Post hoc (declared after reading the outcome): frontier under milestone 87's global thresholds vs zoned (main)")
    for opt, sr in out.items():
        L.append(f"  {opt:9s} " + ", ".join(f"{sc} {100 * r['frontier_global']:.2f}% vs {100 * r['frontier']['saved']:.2f}%"
                                            for sc, r in sr.items()))
    L.append("  (b = 63 at q = 5, 0.39%, is the largest saving the grid offers with one row shaved per step, so 0.39% frontiers sit at")
    L.append("  the grid's edge: a forger shaving one row from more than 5 steps was not tested)")
    L.append("")
    L.append("== Figure table: main d against saved share of the segment (%), q = 1, warmcos; sgd momentum adam15 adam60")
    for b in bs:
        L.append(f"  {100 * saved(b, 1):.3f} " + " ".join(f"{out[o]['warmcos']['cells'][f'sub{b}_1']['d_main']:.3f}"
                                                         for o in ("sgd", "momentum", "adam15", "adam60")))
    return "\n".join(L) + "\n"


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m87 = json.load(open(os.path.join(HERE, "..", "adaptive_forgery", "summary.json")))
    out = analyze(res)
    open(os.path.join(HERE, "results.txt"), "w").write(report(res, out, m87))
    slim = {o: {s: {k: v for k, v in r.items() if k != "cells"} | {"cells": {k: c for k, c in r["cells"].items()}}
                for s, r in sr.items()} for o, sr in out.items()}
    json.dump(slim, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    print(open(os.path.join(HERE, "results.txt")).read())


if __name__ == "__main__":
    main()
