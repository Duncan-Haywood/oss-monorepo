"""Milestone 86 analysis: detection of skipped steps by the fp16 referee and the float32 arbiter, per optimiser.
Reads results.json (run.py), writes results.txt and summary.json. Rules are LOG.md's, fixed before the run."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MARGIN = 10.0


def arr(runs, seeds, mode, stat, key):
    return np.array([runs[str(s)][mode][stat][key] for s in seeds], dtype=float)  # seeds x N


def analyze(res):
    test, cal = res["test_seeds"], res["cal_seeds"]
    keys = ["honest"] + [f"skip{q}" for q in res["skips"]]
    out = {}
    for opt, scheds in res["runs"].items():
        out[opt] = {}
        for sc, runs in scheds.items():
            fth = float(arr(runs, cal, "fp16", "w", "honest").max())
            rth = MARGIN * float(arr(runs, cal, "reorder", "w", "honest").max())
            row = {"fp16_thr": fth, "reorder_cal_max": rth / MARGIN,
                   "fp16_honest_median": float(np.median(arr(runs, cal, "fp16", "w", "honest"))),
                   "reorder_honest_median": float(np.median(arr(runs, cal, "reorder", "w", "honest")))}
            for k in keys:
                f = arr(runs, test, "fp16", "w", k)
                r = arr(runs, test, "reorder", "w", k)
                flag, conv = f > fth, r > rth
                row[k] = {"flag": float(flag.mean()), "convict": float(conv.mean()), "d": float((flag & conv).mean()),
                          "fp16_min": float(f.min()), "fp16_median": float(np.median(f)),
                          "d_by_seg": (flag & conv).mean(0).round(4).tolist()}
            if opt != "sgd":
                mcal = arr(runs, cal, "fp16", "m", "honest").max()
                row["m_fp16_cal_max"] = float(mcal)
                row["m_fp16_cal_median"] = float(np.median(arr(runs, cal, "fp16", "m", "honest")))
                for k in keys:
                    mm = arr(runs, test, "fp16", "m", k)
                    row[k]["m_flag"] = float((mm > mcal).mean())
                    # post hoc (declared after reading the outcome): flag on either statistic, then the arbiter
                    f = arr(runs, test, "fp16", "w", k) > fth
                    conv = arr(runs, test, "reorder", "w", k) > rth
                    row[k]["d_wm"] = float(((f | (mm > mcal)) & conv).mean())
                    row[k]["m_fp16_min"] = float(mm.min())
            out[opt][sc] = row
    return out


def report(res, out):
    L = ["Milestone 86. Replay referee (fp16) and arbiter (float32 reorder, convicts above 10x its honest calibration max)",
         "under four optimisers; committed state = weights and moments. Calibration seeds 100-139, test seeds 0-39,",
         "75 segments of s = 20 each, so 3,000 test segments per cell. skip q = the worker skips the last q of the 20 steps.",
         "d = share flagged AND convicted. wratio = ||w_committed - w_replay|| / mean replayed step.", ""]
    L.append("Honest statistics (calibration): fp16 median and max (= flag threshold), reorder median and max")
    L.append(f"  {'opt':9s} {'sched':8s} {'fp16 med':>9s} {'fp16 max':>9s} {'reord med':>10s} {'reord max':>10s}"
             f" {'fp16 m-max':>10s}")
    for opt, sc_rows in out.items():
        for sc, r in sc_rows.items():
            mm = f"{r['m_fp16_cal_max']:.3g}" if "m_fp16_cal_max" in r else "-"
            L.append(f"  {opt:9s} {sc:8s} {r['fp16_honest_median']:9.3g} {r['fp16_thr']:9.3g}"
                     f" {r['reorder_honest_median']:10.3g} {r['reorder_cal_max']:10.3g} {mm:>10s}")
    L.append("")
    L.append("Honest test segments (false alarms): fp16 flag rate, arbiter conviction rate")
    for opt, sc_rows in out.items():
        L.append("  " + opt + ": " + ", ".join(f"{sc} {r['honest']['flag']:.4f}/{r['honest']['convict']:.4f}"
                                             for sc, r in sc_rows.items()))
    L.append("")
    L.append("Detection d by skipped steps q (flag / convict / both); smallest stalled fp16 wratio over threshold")
    hdr = "  " + f"{'opt':9s} {'sched':8s}" + "".join(f"{'q=' + str(q):>9s}" for q in res["skips"]) + \
        f" {'full-stall min/thr':>19s}"
    L.append(hdr)
    for opt, sc_rows in out.items():
        for sc, r in sc_rows.items():
            cells = "".join(f"{r[f'skip{q}']['d']:9.3f}" for q in res["skips"])
            L.append(f"  {opt:9s} {sc:8s}{cells} {r['skip20']['fp16_min'] / r['fp16_thr']:19.2f}")
    L.append("")
    L.append("Flag rate alone (fp16) and conviction alone (arbiter), by q")
    for opt, sc_rows in out.items():
        for sc, r in sc_rows.items():
            fl = " ".join(f"{r[f'skip{q}']['flag']:.3f}" for q in res["skips"])
            cv = " ".join(f"{r[f'skip{q}']['convict']:.3f}" for q in res["skips"])
            L.append(f"  {opt:9s} {sc:8s} flag {fl} | convict {cv}")
    L.append("")
    L.append("First-moment statistic (fp16 mratio) flag rate by q (threshold = honest calibration max); full-stall min/max-honest")
    for opt, sc_rows in out.items():
        if opt == "sgd":
            continue
        for sc, r in sc_rows.items():
            fl = " ".join(f"{r[f'skip{q}']['m_flag']:.3f}" for q in res["skips"])
            L.append(f"  {opt:9s} {sc:8s} {fl}   {r['skip20']['m_fp16_min'] / r['m_fp16_cal_max']:.2f}")
    L.append("")
    L.append("Post hoc: d when the referee flags on EITHER statistic (weights or first moment), then the arbiter, by q")
    for opt, sc_rows in out.items():
        if opt == "sgd":
            continue
        for sc, r in sc_rows.items():
            L.append(f"  {opt:9s} {sc:8s} " + " ".join(f"{r[f'skip{q}']['d_wm']:.3f}" for q in res["skips"]))
    L.append("")
    L.append("Resolution: smallest q with d >= 0.9")
    for opt, sc_rows in out.items():
        cells = []
        for sc, r in sc_rows.items():
            qs = [q for q in res["skips"] if r[f"skip{q}"]["d"] >= 0.9]
            cells.append(f"{sc} {min(qs) if qs else 'none'}")
        L.append(f"  {opt:9s} " + ", ".join(cells))
    L.append("")
    L.append("== Figure table: warmcos, d by skipped steps q (sgd, momentum, adam15, adam60 on weights; adam60 weights or moment)")
    L.append("  q      sgd  momentum  adam15  adam60  adam60_w_or_m")
    w = {o: out[o]["warmcos"] for o in out}
    for q in res["skips"]:
        k = f"skip{q}"
        L.append(f"  {q:<3d} {w['sgd'][k]['d']:7.3f} {w['momentum'][k]['d']:9.3f} {w['adam15'][k]['d']:7.3f}"
                 f" {w['adam60'][k]['d']:7.3f} {w['adam60'][k]['d_wm']:14.3f}")
    return "\n".join(L) + "\n"


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    out = analyze(res)
    txt = report(res, out)
    f64 = os.path.join(HERE, "results_sgd_f64.json")
    if os.path.exists(f64):  # diagnostic declared after the run (LOG.md): milestones 80-84's float64-weight worker
        r2 = json.load(open(f64))
        o2 = analyze(r2)["sgd"]
        L = ["", "Diagnostic after the run: plain SGD with float64 weights (milestones 80-84's worker; numpy promoted it)",
             f"  {'sched':8s} {'fp16 med':>9s} {'fp16 max':>9s} {'reord med':>10s} {'reord max':>10s}  d by q"]
        for sc, r in o2.items():
            L.append(f"  {sc:8s} {r['fp16_honest_median']:9.3g} {r['fp16_thr']:9.3g} {r['reorder_honest_median']:10.3g}"
                     f" {r['reorder_cal_max']:10.3g}  " + " ".join(f"{r[f'skip{q}']['d']:.3f}" for q in r2["skips"]))
        txt += "\n".join(L) + "\n"
        out["sgd_f64_diagnostic"] = o2
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    slim = {o: {s: {k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != "d_by_seg"})
                    for k, v in r.items()} for s, r in sc.items()} for o, sc in out.items()}
    json.dump(slim, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
