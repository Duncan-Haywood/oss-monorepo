"""Milestone 3p: score H195-H200 from results.json (run.py) and draw tumvel.png.

Rules set in LOG.md before the run: milestone 3n's counting rule on the nfba start plus mocap over
the window; a model's solve that does not converge (status 0) is left out of that model's figures;
paired comparisons use windows where both solves converged. e = (f - f_ref) / f_ref against
milestone 4n's board calibration.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m3n_tumrs"))
import importlib.util  # noqa: E402

_s = importlib.util.spec_from_file_location("m3n_an", os.path.join(HERE, "..", "m3n_tumrs", "analyse.py"))
m3n = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3n)
REF, mad_sd, spearman, counted = m3n.REF, m3n.mad_sd, m3n.spearman, m3n.counted
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
GROUPS = SEQS + ("fr1", "fr3")
MODELS = ("est", "est_mu", "mu_shuf", "est_d", "est_mud")


def in_group(r, g):
    return r["seq"] == g or r["unit"] == g


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m3n_res = json.load(open(os.path.join(HERE, "..", "m3n_tumrs", "results.json")))
    f3n = {(w["seq"], w["window"]): w["solves"]["est"]["intr"][0]
           for w in m3n_res["windows"] if "solves" in w and "est" in w["solves"]}
    rows, fails = [], {}
    for w in res["windows"]:
        ok, why = counted(w)
        if not ok:
            fails.setdefault(w["seq"], []).append([w["window"], why])
            continue
        u = w["unit"]
        r = {"seq": w["seq"], "unit": u, "window": w["window"], "scale": w["scale"],
             "spread_m": w["mocap_spread_m"], "speed": w["speed_mps"], "f_3n": f3n.get((w["seq"], w["window"]))}
        for m in MODELS:
            s = w["solves"].get(m)
            if s is None:
                continue
            r[m] = {"conv": s["status"] > 0, "iters": s["iters"], "f": s["intr"][0],
                    "e": (s["intr"][0] - REF[u]) / REF[u], "t_r_ms": s["t_r"] * 1e3,
                    "delta_ms": s["delta"] * 1e3, "sd_delta_ms": s["sd_delta"] * 1e3,
                    "cost": s["cost"], "rms_px": s["rms_px"]}
        rows.append(r)

    def ok(r, *ms):
        return all(m in r and r[m]["conv"] for m in ms)

    def grp(g, *ms):
        return [r for r in rows if in_group(r, g) and ok(r, *ms)]

    per = {}
    for g in GROUPS:
        d = {"n": len([r for r in rows if in_group(r, g)]),
             "med_scale": float(np.median([r["scale"] for r in rows if in_group(r, g)])),
             "med_spread_m": float(np.median([r["spread_m"] for r in rows if in_group(r, g)])),
             "med_speed_mps": float(np.median([r["speed"] for r in rows if in_group(r, g)]))}
        for m in MODELS:
            rr = grp(g, m)
            if not rr:
                d[m] = {"n_conv": 0}
                continue
            e = np.array([r[m]["e"] for r in rr])
            tr = np.array([r[m]["t_r_ms"] for r in rr])
            d[m] = {"n_conv": len(rr), "med_iters": float(np.median([r[m]["iters"] for r in rr])),
                    "med_abs_e_pct": float(np.median(np.abs(e)) * 100), "med_e_pct": float(np.median(e) * 100),
                    "range_e_pct": [float(e.min() * 100), float(e.max() * 100)],
                    "med_f": float(np.median([r[m]["f"] for r in rr])),
                    "med_tr_ms": float(np.median(tr)), "mad_sd_tr_ms": mad_sd(tr)}
            if m in ("est_d", "est_mud"):
                dl = np.array([r[m]["delta_ms"] for r in rr])
                d[m].update({"med_delta_ms": float(np.median(dl)), "mad_sd_delta_ms": mad_sd(dl),
                             "range_delta_ms": [float(dl.min()), float(dl.max())],
                             "med_sd_delta_ms": float(np.median([r[m]["sd_delta_ms"] for r in rr]))})
        for a, b in (("est_mu", "est"), ("est_mu", "mu_shuf"), ("est_mud", "est_mu"), ("est_d", "est")):
            rr = grp(g, a, b)
            d[f"{a}_cost_below_{b}"] = float(np.mean([r[a]["cost"] < r[b]["cost"] for r in rr])) if rr else None
            d[f"{a}_vs_{b}_med_cost_drop"] = float(np.median([1 - r[a]["cost"] / r[b]["cost"] for r in rr])) if rr else None
            d[f"{a}_vs_{b}_n"] = len(rr)
        rr = grp(g, "est", "est_mu")
        d["est_mu_abs_e_lower_frac"] = float(np.mean([abs(r["est_mu"]["e"]) < abs(r["est"]["e"]) for r in rr])) if rr else None
        d["med_abs_e_paired"] = {"est": float(np.median([abs(r["est"]["e"]) for r in rr]) * 100),
                                 "est_mu": float(np.median([abs(r["est_mu"]["e"]) for r in rr]) * 100)} if rr else None
        d["spearman_gain_vs_speed"] = spearman([abs(r["est"]["e"]) - abs(r["est_mu"]["e"]) for r in rr],
                                               [r["speed"] for r in rr])
        rr = grp(g, "est_d", "est_mud")
        d["med_abs_delta_gap_ms"] = float(np.median([abs(r["est_d"]["delta_ms"] - r["est_mud"]["delta_ms"]) for r in rr])) if rr else None
        rr = grp(g, "est_mu", "est_mud")
        d["med_abs_f_gap_mud_mu_pct"] = float(np.median([abs(r["est_mud"]["f"] - r["est_mu"]["f"]) / r["est_mu"]["f"] for r in rr]) * 100) if rr else None
        per[g] = d

    chk = [abs(r["est"]["f"] - r["f_3n"]) / r["f_3n"] for r in rows if ok(r, "est") and r["f_3n"]]
    K, X = per["fr1"], per["fr3"]
    hyp = {
        "check_est_equals_3n": {"median_rel": float(np.median(chk)), "max_rel": float(np.max(chk)), "n": len(chk),
                                "held": bool(np.median(chk) <= 1e-4)},
        "H195": {"kinect": K["est_mu_cost_below_est"], "xtion": X["est_mu_cost_below_est"],
                 "held": bool(K["est_mu_cost_below_est"] >= 0.75 and X["est_mu_cost_below_est"] >= 0.75)},
        "H196": {"kinect": K["est_mu_cost_below_mu_shuf"], "xtion": X["est_mu_cost_below_mu_shuf"],
                 "held": bool(K["est_mu_cost_below_mu_shuf"] >= 0.75 and X["est_mu_cost_below_mu_shuf"] >= 0.75)},
        "H197": {"est_pct": K["est"]["med_abs_e_pct"], "est_mu_pct": K["est_mu"]["med_abs_e_pct"],
                 "ratio": K["est_mu"]["med_abs_e_pct"] / K["est"]["med_abs_e_pct"],
                 "held": bool(K["est_mu"]["med_abs_e_pct"] <= 0.9 * K["est"]["med_abs_e_pct"])},
        "H198": {s: {"med": per[s]["est_mud"].get("med_delta_ms"), "mad_sd": per[s]["est_mud"].get("mad_sd_delta_ms")}
                 for s in SEQS},
        "H199": {"med_abs_gap_ms": K["med_abs_delta_gap_ms"], "held": bool(K["med_abs_delta_gap_ms"] >= 2)},
        "H200": {"med_abs_f_gap_pct": K["med_abs_f_gap_mud_mu_pct"], "held": bool(K["med_abs_f_gap_mud_mu_pct"] <= 0.3)},
    }
    hyp["H198"]["held"] = bool(all(per[s]["est_mud"].get("mad_sd_delta_ms", 1e9) <= 5
                                   and abs(per[s]["est_mud"].get("med_delta_ms", 1e9)) <= 10 for s in SEQS))
    # unscored, added after the scoring: paired tests behind H197's median ratio, and the offset's sign
    from scipy import stats
    paired = {}
    for g in GROUPS + ("all",):
        rr = [r for r in rows if (g == "all" or in_group(r, g)) and ok(r, "est", "est_mu", "est_mud")]
        a = np.array([abs(r["est"]["e"]) for r in rr]); b = np.array([abs(r["est_mu"]["e"]) for r in rr])
        c = np.array([abs(r["est_mud"]["e"]) for r in rr])
        dl = np.array([r["est_mud"]["delta_ms"] for r in rr])
        paired[g] = {"n": len(rr), "med_paired_drop_pp_est_minus_est_mu": float(np.median(a - b) * 100),
                     "wilcoxon_p_est_vs_est_mu": float(stats.wilcoxon(a, b).pvalue),
                     "frac_est_mud_abs_e_below_est": float(np.mean(c < a)),
                     "med_abs_e_est_mud_pct": float(np.median(c) * 100),
                     "frac_delta_pos": float(np.mean(dl > 0)), "n_delta_pos": int((dl > 0).sum()),
                     "sign_test_p_delta": float(stats.binomtest(int((dl > 0).sum()), len(dl)).pvalue),
                     "med_delta_ms": float(np.median(dl)), "mad_sd_delta_ms": mad_sd(dl)}
    out = {"ref": REF, "hypotheses": hyp, "per_group": per, "paired_unscored": paired,
           "failures": fails, "windows": rows}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in hyp.items():
        print(k, v)
    for g in GROUPS:
        d = per[g]
        print(g, json.dumps({k: v for k, v in d.items()}, default=str)[:1500])
    print("failures", fails)
    figure(rows, per)


def figure(rows, per):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    col = {"fr1_desk": "#1f77b4", "fr1_xyz": "#ff7f0e", "fr3_stf": "#2ca02c"}
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.6))
    for s in SEQS:
        rr = [r for r in rows if r["seq"] == s and "est_mu" in r and r["est"]["conv"] and r["est_mu"]["conv"]]
        ax[0].scatter([abs(r["est"]["e"]) * 100 for r in rr], [abs(r["est_mu"]["e"]) * 100 for r in rr],
                      c=col[s], label=s, s=22)
        rd = [r for r in rows if r["seq"] == s and "est_mud" in r and r["est_mud"]["conv"] and r["est_d"]["conv"]]
        ax[1].scatter([r["est_d"]["delta_ms"] for r in rd], [r["est_mud"]["delta_ms"] for r in rd],
                      c=col[s], label=s, s=22)
    m = max(max(abs(r["est"]["e"]) for r in rows), 0.01) * 100
    ax[0].plot([0, m], [0, m], "k--", lw=0.6)
    ax[0].set_xlabel("|focal error|, shutter term, no velocity (%)")
    ax[0].set_ylabel("|focal error|, shutter term + mocap velocity (%)")
    ax[0].set_title("Focal error against the board, per window")
    ax[0].legend(fontsize=8)
    lim = [min(min(r["est_d"]["delta_ms"], r["est_mud"]["delta_ms"]) for r in rows if "est_mud" in r) - 2,
           max(max(r["est_d"]["delta_ms"], r["est_mud"]["delta_ms"]) for r in rows if "est_mud" in r) + 2]
    ax[1].plot(lim, lim, "k--", lw=0.6)
    ax[1].axhline(0, color="k", lw=0.4); ax[1].axvline(0, color="k", lw=0.4)
    ax[1].set_xlabel("offset estimate, no velocity (ms)")
    ax[1].set_ylabel("offset estimate, mocap velocity (ms)")
    ax[1].set_title("Mocap-camera offset per window")
    ax[1].legend(fontsize=8)
    ms = ("est", "est_mu", "mu_shuf", "est_mud")
    x = np.arange(len(SEQS))
    for i, mm in enumerate(ms):
        ax[2].bar(x + (i - 1.5) * 0.2, [per[s][mm].get("med_abs_e_pct", 0) for s in SEQS], 0.2, label=mm)
    ax[2].set_xticks(x)
    ax[2].set_xticklabels(SEQS)
    ax[2].set_ylabel("median |focal error| (%)")
    ax[2].set_title("By sequence and model")
    ax[2].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "tumvel.png"), dpi=110)


if __name__ == "__main__":
    main()
