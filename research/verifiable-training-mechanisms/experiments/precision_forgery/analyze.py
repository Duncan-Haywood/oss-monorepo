"""Milestone 89 analysis: low-precision proxy forgeries (f16, bf16) and spread sub-batch shaving against the zoned fp16
referee (upper, and the new two-sided test) and the float32 arbiter. Reads results.json (run.py) and
../proxy_forgery/summary.json (milestone 88, for the control P2 and the q = 1, 2, 5 sub-batch cells), writes results.txt
and summary.json. Rules and predictions are LOG.md's, fixed before the run."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MARGIN = 10.0
ZONE = 5
R_COST = {"tf32": 0.5, "fp32": 67 / 989}  # FP16 dense tensor step cost over TF32 tensor / FP32 vector (H100 SXM datasheet)
REF = {"sgd": ("W", ("w",)), "momentum": ("WM", ("w", "m")), "adam": ("WMV", ("w", "m", "v"))}


def arr(runs, seeds, mode, stat, key):
    return np.array([runs[str(s)][mode][stat][key] for s in seeds], dtype=float)  # seeds x N


def saved_prec(q, r, s=20):
    return q * (1 - r) / s


def saved_sub(b, q, batch=64, s=20):
    return q * (batch - b) / (batch * s)


def zoned(c, fn, nseg):
    return np.repeat([fn(c[:, z:z + ZONE]) for z in range(0, nseg, ZONE)], ZONE)[:nseg]


def frontier(pairs):
    """Largest saved share among (saved, d) pairs with d <= 0.5 (0 if none)."""
    ok = [s for s, d in pairs if d <= 0.5]
    return max(ok) if ok else 0.0


def analyze(res, m88):
    test, cal, qs = res["test_seeds"], res["cal_seeds"], res["qs"]
    out = {}
    for opt, scheds in res["runs"].items():
        kind = res["opts"][opt][0]
        rname, ss = REF[kind]
        out[opt] = {}
        for sc, runs in scheds.items():
            keys = list(runs[str(test[0])]["fp16"]["w"])
            nseg = len(runs[str(test[0])]["fp16"]["w"]["honest"])
            fth, hi, lo, rth = {}, {}, {}, {}
            for s in ss:
                c = arr(runs, cal, "fp16", s, "honest")
                fth[s] = float(c.max())
                hi[s] = zoned(c, np.max, nseg)
                lo[s] = zoned(c, np.min, nseg)
                rth[s] = MARGIN * float(arr(runs, cal, "reorder", s, "honest").max())
            cells = {}
            for k in keys:
                fx = {s: arr(runs, test, "fp16", s, k) for s in ss}
                conv = np.any([arr(runs, test, "reorder", s, k) > rth[s] for s in ss], axis=0)
                gflag = np.any([fx[s] > fth[s] for s in ss], axis=0)
                up = np.any([fx[s] > hi[s] for s in ss], axis=0)
                two = up | np.any([fx[s] < lo[s] for s in ss], axis=0)
                cells[k] = {"median": {s: float(np.median(fx[s])) for s in ss},
                            "reorder_median": {s: float(np.median(arr(runs, test, "reorder", s, k))) for s in ss},
                            "conv": float(conv.mean()),
                            "d_global": float((gflag & conv).mean()), "flag_up": float(up.mean()),
                            "d_up": float((up & conv).mean()), "flag_two": float(two.mean()),
                            "d_two": float((two & conv).mean())}
            p1 = (all(arr(runs, test + cal, "fp16", s, "f16_20").max() == 0.0 for s in ss)
                  if "f16_20" in keys else None)
            m8 = m88[opt][sc]["cells"]
            row = {"fp16_thr": fth, "reorder_thr": rth, "cells": cells, "P1_f16_20_is_replay": p1, "referee": rname,
                   "P2": max(max(abs(cells[f"skip{q}"]["d_global"] - m8[f"skip{q}"]["d_global"]),
                                 abs(cells[f"skip{q}"]["d_up"] - m8[f"skip{q}"]["d_main"])) for q in (1, 2, 5))}
            zr = {s: MARGIN * zoned(arr(runs, cal, "reorder", s, "honest"), np.max, nseg) for s in ss}
            row["arbiter_zoned"] = {k: float(np.any([arr(runs, test, "reorder", s, k) > zr[s] for s in ss], axis=0).mean())
                                    for k in keys}
            fr = {}
            for p in res["precs"]:
                for rn, r in R_COST.items():
                    for ref in ("up", "two"):
                        fr[f"{p}_{rn}_{ref}"] = frontier([(saved_prec(q, r), cells[f"{p}_{q}"][f"d_{ref}"]) for q in qs])
            subs = [(saved_sub(b, q), cells[f"sub{b}_{q}"]["d_up"]) for q in res["sub_qs"] for b in res["sub_bs"]]
            subs += [(saved_sub(int(k[3:].split("_")[0]), int(k.split("_")[1])), c["d_main"])
                     for k, c in m8.items() if k.startswith("sub")]
            fr["sub_up"] = frontier(subs)
            fr["sub_up_m88"] = m88[opt][sc]["frontier"]["saved"]
            row["frontier"] = fr
            if opt in res.get("losses", {}):
                ls = res["losses"][opt][sc]
                h = np.array([ls[str(s)]["honest"] for s in test])
                row["loss"] = {"honest": float(h.mean())}
                for p in res["precs"]:
                    v = np.array([ls[str(s)][p] for s in test])
                    row["loss"][p] = float(v.mean())
                    row["loss"][f"{p}_rel"] = float(v.mean() / h.mean() - 1)
                    row["loss"][f"{p}_worse_seeds"] = int((v > h).sum())
            out[opt][sc] = row
    return out


def report(res, out):
    qs, precs = res["qs"], res["precs"]
    allc = [(o, s, r) for o, sr in out.items() for s, r in sr.items()]
    ma = [(o, s, r) for o, s, r in allc if o != "sgd"]
    L = ["Milestone 89. Low-precision proxy forgeries: for the last q of a segment's 20 steps the worker computes the",
         "gradient with weights and inputs rounded to float16 (f16, the referee's own recipe) or bfloat16 (bf16). Spread",
         "sub-batch shaving: b of 64 rows on every one of the last q = 10 or 20 steps. Referees as milestone 88: fp16 replay,",
         "statistics W (SGD), WM (momentum), WMV (Adam); 'up' = flag above the zoned honest calibration max (milestone 88's",
         "main); 'two' = also flag below the zoned honest calibration min; arbiter = float32 reorder, 10x its honest",
         "calibration max. Calibration seeds 100-139, test 0-39, 3,000 test segments per cell. d = share flagged and convicted.",
         "Saved compute of a precision forgery = q (1 - r) / 20, r = 0.5 (FP16 over TF32 tensor) or 0.068 (FP16 tensor over",
         "FP32 vector), H100 SXM datasheet.", ""]
    L.append("P1 code check: f16_20's fp16 statistics are exactly 0 (every statistic, segment, seed)")
    L.append("  " + ", ".join(f"{o}/{s} {r['P1_f16_20_is_replay']}" for o, s, r in allc))
    L.append("")
    L.append("P2 control: skip 1, 2, 5 against milestone 88 (max abs difference of global and main d)")
    L.append("  " + ", ".join(f"{o}/{s} {r['P2']:.4f}" for o, s, r in allc))
    L.append("")
    L.append("Honest test segments: flag up | flag two-sided | convicted up / two-sided")
    for o, s, r in allc:
        h = r["cells"]["honest"]
        L.append(f"  {o:9s} {s:8s} {h['flag_up']:.4f} | {h['flag_two']:.4f} | {h['d_up']:.4f} / {h['d_two']:.4f}")
    L.append("")
    for p in precs:
        for ref in ("up", "two"):
            L.append(f"{p}: d ({ref} referee + arbiter) by q (skip q control in brackets)")
            L.append("  opt       sched    " + " ".join(f"{'q=' + str(q):>14s}" for q in qs))
            for o, s, r in allc:
                c = r["cells"]
                L.append(f"  {o:9s} {s:8s} " + " ".join(f"{c[f'{p}_{q}'][f'd_{ref}']:.3f} ({c[f'skip{q}'][f'd_{ref}']:.3f})"
                                                       for q in qs))
            L.append("")
    L.append("Where the forgery sits: median fp16 weight ratio | median float32-reorder weight ratio | arbiter threshold (w)")
    for p in precs:
        L.append(f"  {p}, by q = {qs}")
        for o, s, r in allc:
            c = r["cells"]
            L.append(f"  {o:9s} {s:8s} honest {c['honest']['median']['w']:.4f}/{c['honest']['reorder_median']['w']:.2e}  " +
                     " ".join(f"{c[f'{p}_{q}']['median']['w']:.4f}/{c[f'{p}_{q}']['reorder_median']['w']:.2e}" for q in qs) +
                     f"  thr {r['reorder_thr']['w']:.2e}")
    L.append("")
    L.append("Arbiter alone: share of f16 segments the float32 arbiter would convict, by q")
    for o, s, r in allc:
        L.append(f"  {o:9s} {s:8s} " + " ".join(f"{r['cells'][f'f16_{q}']['conv']:.3f}" for q in qs))
    L.append("")
    L.append("Spread sub-batch shaving, d (up referee) at q = 10 and 20 by b (saved % in header)")
    hdr = [(b, q) for q in res["sub_qs"] for b in res["sub_bs"]]
    L.append("  opt       sched    " + " ".join(f"{f'{b}/{q}':>7s}" for b, q in hdr))
    L.append("                     " + " ".join(f"{100 * saved_sub(b, q):6.2f}%" for b, q in hdr))
    for o, s, r in allc:
        L.append(f"  {o:9s} {s:8s} " + " ".join(f"{r['cells'][f'sub{b}_{q}']['d_up']:7.3f}" for b, q in hdr))
    L.append("")
    L.append("Frontiers (largest saved share of a segment with d <= 0.5): f16 and bf16 at r = 0.5 / 0.068 under the up and")
    L.append("two-sided referees; sub-batch over milestone 88's grid plus q = 10, 20 (milestone 88's alone in brackets)")
    for o, s, r in allc:
        f = r["frontier"]
        L.append(f"  {o:9s} {s:8s} f16 up {100 * f['f16_tf32_up']:.1f}%/{100 * f['f16_fp32_up']:.1f}%  two "
                 f"{100 * f['f16_tf32_two']:.1f}%/{100 * f['f16_fp32_two']:.1f}%  | bf16 up {100 * f['bf16_tf32_up']:.1f}%/"
                 f"{100 * f['bf16_fp32_up']:.1f}%  two {100 * f['bf16_tf32_two']:.1f}%/{100 * f['bf16_fp32_two']:.1f}%  | "
                 f"sub {100 * f['sub_up']:.2f}% ({100 * f['sub_up_m88']:.2f}%)")
    L.append("")
    L.append("Harm: mean final held-out loss over 40 test seeds, whole run at float32 (honest) / f16 / bf16, relative change,")
    L.append("seeds where the low-precision run ends worse")
    for o, s, r in allc:
        x = r["loss"]
        L.append(f"  {o:9s} {s:8s} {x['honest']:.4f} / {x['f16']:.4f} / {x['bf16']:.4f}   f16 {100 * x['f16_rel']:+.2f}%"
                 f" ({x['f16_worse_seeds']}/40)  bf16 {100 * x['bf16_rel']:+.2f}% ({x['bf16_worse_seeds']}/40)")
    L.append("")
    L.append("Predictions")
    L.append(f"  P1 {'held' if all(r['P1_f16_20_is_replay'] for _, _, r in allc) else 'REFUTED'}")
    p2 = max(r["P2"] for _, _, r in allc)
    L.append(f"  P2 {'held' if p2 == 0 else 'REFUTED'} (max difference {p2:.4f})")
    p3 = max(r["cells"][f"f16_{q}"]["d_up"] for _, _, r in allc for q in qs)
    L.append(f"  P3 {'held' if p3 <= 0.03 else 'REFUTED'} (largest up-referee d on f16: {p3:.4f})")
    p4a = max(r["cells"]["honest"]["flag_two"] for _, _, r in allc)
    p4b = max(r["cells"]["honest"]["d_two"] for _, _, r in allc)
    p4c = min(r["cells"]["f16_20"]["flag_two"] for _, _, r in allc)
    L.append(f"  P4 {'held' if p4a <= 0.03 and p4b == 0 and p4c == 1 else 'REFUTED'} (largest honest two-sided flag "
             f"{p4a:.4f}; largest honest conviction {p4b:.4f}; smallest f16_20 flag {p4c:.4f})")
    p5 = min(r["cells"]["f16_20"]["d_two"] for _, _, r in ma)
    L.append(f"  P5 {'held' if p5 >= 0.9 else 'REFUTED'} (smallest momentum/Adam two-sided d on f16_20: {p5:.3f})")
    p6a = max(r["cells"][f"f16_{q}"]["d_two"] for _, _, r in allc for q in qs if q <= 5)
    p6b = min(r["frontier"]["f16_tf32_two"] for _, _, r in ma)
    L.append(f"  P6 {'held' if p6a <= 0.2 and p6b >= 0.125 else 'REFUTED'} (largest two-sided d on f16 q <= 5: {p6a:.3f};"
             f" smallest momentum/Adam f16 frontier at r = 0.5: {100 * p6b:.1f}%)")
    p7a = min(r["cells"][f"bf16_{q}"]["d_up"] for _, _, r in ma for q in qs if q >= 5)
    p7b = [r["cells"]["bf16_1"]["d_up"] for _, _, r in ma]
    L.append(f"  P7 {'held' if p7a >= 0.9 and all(0.2 <= v <= 0.9 for v in p7b) else 'REFUTED'} (smallest bf16 q >= 5 d:"
             f" {p7a:.3f}; bf16_1 d range {min(p7b):.3f} to {max(p7b):.3f})")
    m1 = [(o, s, r) for o, s, r in ma if o in ("momentum", "adam15")]
    p8a = min(r["cells"]["sub63_20"]["d_up"] for _, _, r in m1)
    p8b = max(r["frontier"]["sub_up"] for _, _, r in m1)
    L.append(f"  P8 {'held' if p8a >= 0.8 and p8b < 0.01 else 'REFUTED'} (smallest sub63_20 d in momentum/Adam 1e-3:"
             f" {p8a:.3f}; largest sub frontier there {100 * p8b:.2f}%)")
    p9a = max(abs(r["loss"]["f16_rel"]) for _, _, r in allc)
    p9b = max(abs(r["loss"]["bf16_rel"]) for _, _, r in allc)
    L.append(f"  P9 {'held' if p9a <= 0.01 and p9b <= 0.03 else 'REFUTED'} (largest |relative loss change| f16 "
             f"{100 * p9a:.2f}%, bf16 {100 * p9b:.2f}%)")
    prices = all(r["frontier"]["f16_tf32_two"] < 0.05 for _, _, r in ma)
    L.append(f"  Pricing line (f16 frontier at r = 0.5 under 5% in every momentum and Adam cell, two-sided): "
             f"{'MET: the referee prices low-precision proxies' if prices else 'not met: low precision is a hole'}")
    L.append("")
    L.append("Post hoc (declared after reading the outcome): an arbiter-only audit, the float32 reorder replay with its")
    L.append("threshold zoned by 5 segments (10x the zone's honest calibration max), applied to every segment with no fp16 referee")
    L.append("  opt       sched    honest | f16 by q | bf16 by q | skip1 sub63_10")
    for o, s, r in allc:
        z = r["arbiter_zoned"]
        L.append(f"  {o:9s} {s:8s} {z['honest']:.4f} | " + " ".join(f"{z[f'f16_{q}']:.3f}" for q in qs) + " | " +
                 " ".join(f"{z[f'bf16_{q}']:.3f}" for q in qs) + f" | {z['skip1']:.3f} {z['sub63_10']:.3f}")
    L.append("")
    L.append("== Figure table: two-sided d against forged steps q, warmcos; f16 sgd momentum adam15 adam60, then bf16 (up)")
    for q in qs:
        c = {o: out[o]["warmcos"]["cells"] for o in ("sgd", "momentum", "adam15", "adam60")}
        L.append(f"  {q} " + " ".join(f"{c[o][f'f16_{q}']['d_two']:.3f}" for o in c) + " " +
                 " ".join(f"{c[o][f'bf16_{q}']['d_up']:.3f}" for o in c))
    return "\n".join(L) + "\n"


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m88 = json.load(open(os.path.join(HERE, "..", "proxy_forgery", "summary.json")))
    out = analyze(res, m88)
    open(os.path.join(HERE, "results.txt"), "w").write(report(res, out))
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    print(open(os.path.join(HERE, "results.txt")).read())


if __name__ == "__main__":
    main()
