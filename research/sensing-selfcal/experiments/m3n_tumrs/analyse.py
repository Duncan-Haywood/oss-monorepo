"""Milestone 3n: score H184-H188 from results.json (run.py) and draw tumrs.png.

Rules set in LOG.md before the run: a window counts if milestone 3b's counting rule holds on the
none solve's nfba start (converged, >= 100 tracks, inlier rms < 1.5 px, 300 < f < 1000, defined sd)
and mocap rates exist at every keyframe; a model's solve that does not converge (status 0) is left
out of that model's figures. e = (f - f_ref) / f_ref against milestone 4n's board calibration.
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M4N = json.load(open(os.path.join(HERE, "..", "m4n_k2", "summary.json")))
REF = {u: M4N["zhang"][u]["k1k2"]["f"] for u in ("fr1", "fr3")}
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
MODELS = ("none", "est", "est_u", "shuf", "est10", "est40")


def mad_sd(x):
    x = np.asarray(x, float)
    return float(1.4826 * np.median(np.abs(x - np.median(x)))) if len(x) else float("nan")


def counted(w):
    if w.get("status") != "ok":
        return False, w.get("status")
    n = w["nfba"]
    f = n["intr"][0]
    if n["status"] != "ok":
        return False, "not_converged"
    if n["n_tracks"] < 100:
        return False, "few_tracks"
    if not n["rms_inlier"] < 1.5:
        return False, "rms"
    if not 300 < f < 1000:
        return False, "f_range"
    if not (np.isfinite(n["sd"][0]) and n["sd"][0] > 0):
        return False, "sd_undefined"
    return True, "ok"


def spearman(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1]) if len(a) > 2 else float("nan")


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    rows, fails = [], {}
    for w in res["windows"]:
        ok, why = counted(w)
        if not ok:
            fails.setdefault(w["seq"], []).append([w["window"], why])
            continue
        u = w["unit"]
        r = {"seq": w["seq"], "unit": u, "window": w["window"], "f_3b": w["f_3b"],
             "f_nfba": w["nfba"]["intr"][0],
             "rate_rms": float(np.sqrt(np.mean(np.sum(np.array(w["rates"]) ** 2, 1))))}
        for m in MODELS:
            s = w["solves"].get(m)
            if s is None:
                continue
            r[m] = {"conv": s["status"] > 0, "f": s["intr"][0], "e": (s["intr"][0] - REF[u]) / REF[u],
                    "t_r_ms": s["t_r"] * 1e3, "sd_tr_ms": s["sd_tr"] * 1e3, "cost": s["cost"],
                    "rms_px": s["rms_px"]}
        rows.append(r)

    def vals(seq, m, key, conv=True):
        return [r[m][key] for r in rows if (seq is None or r["seq"] == seq or r["unit"] == seq)
                and m in r and (r[m]["conv"] or not conv)]

    per = {}
    for seq in SEQS + ("fr1",):
        d = {"n": len([r for r in rows if r["seq"] == seq or r["unit"] == seq])}
        for m in MODELS:
            e = np.array(vals(seq, m, "e"))
            tr = np.array(vals(seq, m, "t_r_ms"))
            d[m] = {"n_conv": len(e), "med_abs_e_pct": float(np.median(np.abs(e)) * 100) if len(e) else None,
                    "med_e_pct": float(np.median(e) * 100) if len(e) else None,
                    "range_e_pct": [float(e.min() * 100), float(e.max() * 100)] if len(e) else None,
                    "med_f": float(np.median(np.array(vals(seq, m, "f")))) if len(e) else None}
            if m != "none" and len(tr):
                d[m].update({"med_tr_ms": float(np.median(tr)), "mad_sd_tr_ms": mad_sd(tr),
                             "frac_pos": float(np.mean(tr > 0)), "range_tr_ms": [float(tr.min()), float(tr.max())],
                             "med_abs_tr_ms": float(np.median(np.abs(tr))),
                             "med_sd_tr_ms": float(np.median(vals(seq, m, "sd_tr_ms")))})
        both = [r for r in rows if (r["seq"] == seq or r["unit"] == seq) and "shuf" in r and "est" in r]
        d["est_cost_below_shuf"] = float(np.mean([r["est"]["cost"] < r["shuf"]["cost"] for r in both])) if both else None
        nc = [r for r in rows if (r["seq"] == seq or r["unit"] == seq) and "est" in r and r["est"]["conv"]]
        d["rel_cost_drop_est"] = float(np.median([1 - r["est"]["cost"] / r["none"]["cost"] for r in nc])) if nc else None
        d["spearman_gain_vs_rate"] = spearman([abs(r["none"]["e"]) - abs(r["est"]["e"]) for r in nc],
                                              [r["rate_rms"] for r in nc])
        d["med_rate_rms"] = float(np.median([r["rate_rms"] for r in nc])) if nc else None
        per[seq] = d

    chk = [abs(r["none"]["f"] - r["f_3b"]) / r["f_3b"] for r in rows]
    chk_nfba = [abs(r["f_nfba"] - r["f_3b"]) / r["f_3b"] for r in rows]
    D = per["fr1_desk"]
    F3 = per["fr3_stf"]
    hyp = {
        "check_none_equals_3b": {"median_rel": float(np.median(chk)), "max_rel": float(np.max(chk)),
                                 "median_rel_nfba": float(np.median(chk_nfba)),
                                 "held": bool(np.median(chk) <= 1e-4)},
        "H184": {"med_tr_ms": D["est"]["med_tr_ms"], "frac_pos": D["est"]["frac_pos"],
                 "held": bool(10 <= D["est"]["med_tr_ms"] <= 45 and D["est"]["frac_pos"] >= 0.75)},
        "H185": {"mad_sd_over_med": D["est"]["mad_sd_tr_ms"] / D["est"]["med_tr_ms"],
                 "held": bool(D["est"]["mad_sd_tr_ms"] <= 0.4 * D["est"]["med_tr_ms"])},
        "H186": {"ratio_abs_tr": D["shuf"]["med_abs_tr_ms"] / D["est"]["med_abs_tr_ms"],
                 "est_cost_below_shuf": D["est_cost_below_shuf"],
                 "held": bool(D["shuf"]["med_abs_tr_ms"] <= 0.3 * D["est"]["med_abs_tr_ms"]
                              and D["est_cost_below_shuf"] >= 0.75)},
        "H187": {"ratio": D["est"]["med_abs_e_pct"] / D["none"]["med_abs_e_pct"],
                 "held": bool(D["est"]["med_abs_e_pct"] <= 0.7 * D["none"]["med_abs_e_pct"])},
        "H188": {"ratio": F3["est"]["med_abs_e_pct"] / F3["none"]["med_abs_e_pct"],
                 "held": bool(F3["est"]["med_abs_e_pct"] >= 0.8 * F3["none"]["med_abs_e_pct"])},
    }
    out = {"ref": REF, "hypotheses": hyp, "per_sequence": per, "failures": fails, "windows": rows}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in hyp.items():
        print(k, v)
    for s in SEQS + ("fr1",):
        d = per[s]
        print(s, "n", d["n"], "rate", d["med_rate_rms"],
              {m: (d[m]["n_conv"], d[m]["med_abs_e_pct"] and round(d[m]["med_abs_e_pct"], 2),
                   d[m]["med_e_pct"] and round(d[m]["med_e_pct"], 2),
                   round(d[m].get("med_tr_ms", 0) or 0, 1), round(d[m].get("mad_sd_tr_ms", 0) or 0, 1),
                   round(d[m].get("frac_pos", 0) or 0, 2)) for m in MODELS},
              "costdrop", d["rel_cost_drop_est"], "est<shuf", d["est_cost_below_shuf"],
              "rho", d["spearman_gain_vs_rate"])
    print("failures", fails)
    figure(rows, per)


def figure(rows, per):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    col = {"fr1_desk": "#1f77b4", "fr1_xyz": "#ff7f0e", "fr3_stf": "#2ca02c"}
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.6))
    for s in SEQS:
        rr = [r for r in rows if r["seq"] == s and r["est"]["conv"]]
        ax[0].scatter([r["rate_rms"] for r in rr], [r["est"]["t_r_ms"] for r in rr], c=col[s], label=s, s=22)
        rs = [r for r in rows if r["seq"] == s and "shuf" in r and r["shuf"]["conv"]]
        ax[0].scatter([r["rate_rms"] for r in rs], [r["shuf"]["t_r_ms"] for r in rs], facecolors="none",
                      edgecolors=col[s], s=22, marker="s")
        ax[1].scatter([abs(r["none"]["e"]) * 100 for r in rr], [abs(r["est"]["e"]) * 100 for r in rr],
                      c=col[s], label=s, s=22)
    ax[0].axhline(0, color="k", lw=0.6)
    ax[0].set_xlabel("window's rms mocap rate (rad/s)")
    ax[0].set_ylabel("estimated readout t_r (ms)")
    ax[0].set_title("Readout per window (filled: mocap rates; open squares: shuffled)")
    ax[0].legend(fontsize=8)
    m = max(max(abs(r["none"]["e"]) for r in rows), 0.01) * 100
    ax[1].plot([0, m], [0, m], "k--", lw=0.6)
    ax[1].set_xlabel("|focal error| without shutter term (%)")
    ax[1].set_ylabel("|focal error| with mocap shutter term (%)")
    ax[1].set_title("Focal error against the board, per window")
    ax[1].legend(fontsize=8)
    ms = ("none", "est", "shuf")   # est_u converged in 6 of 54 windows: left out of the bars
    x = np.arange(len(SEQS))
    for i, mm in enumerate(ms):
        ax[2].bar(x + (i - 1) * 0.27, [per[s][mm]["med_abs_e_pct"] or 0 for s in SEQS], 0.27, label=mm)
    ax[2].set_xticks(x)
    ax[2].set_xticklabels(SEQS)
    ax[2].set_ylabel("median |focal error| (%)")
    ax[2].set_title("By sequence and model")
    ax[2].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "tumrs.png"), dpi=110)


if __name__ == "__main__":
    main()
