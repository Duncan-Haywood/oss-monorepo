"""Milestone 3b: score H104-H107 from results.json (run.py) and draw natural.png.

Per window: the start with the lowest robust cost among those that produced a solution is kept;
the window counts if that solution converged, has >= 100 tracks, inlier rms < 1.5 px and
300 < f < 1000 (rules set in LOG.md before the run).
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# Milestone 4n's target calibrations (Zhang, k1 + k2, 13 board views; experiments/m4n_k2/summary.json)
# and TUM's published calibration (mean of fx and fy; experiments/m4j_tum/tumunit.py).
M4N = json.load(open(os.path.join(HERE, "..", "m4n_k2", "summary.json")))
REF = {u: M4N["zhang"][u]["k1k2"]["f"] for u in ("fr1", "fr3")}
TUM = {"fr1": (517.3 + 516.5) / 2, "fr3": (535.4 + 539.2) / 2}
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")


def pick(w):
    sols = [s for s in w["starts"] if "intr" in s]
    if not sols:
        causes = sorted({s["status"] for s in w["starts"]})
        return None, "+".join(causes)
    best = min(sols, key=lambda s: s["cost"])
    f = best["intr"][0]
    if best["status"] != "ok":
        return best, "not_converged"
    if best["n_tracks"] < 100:
        return best, "few_tracks"
    if not best["rms_inlier"] < 1.5:
        return best, "rms"
    if not 300 < f < 1000:
        return best, "f_range"
    if not np.isfinite(best["sd"][0]) or best["sd"][0] <= 0:
        return best, "sd_undefined"    # rule added after the plan (LOG.md, milestone 3b result)
    return best, "ok"


def mad_sd(x):
    x = np.asarray(x)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    rows = []
    for w in res["windows"]:
        best, why = pick(w)
        fs = [s["intr"][0] for s in w["starts"] if "intr" in s and s["status"] == "ok"]
        spread = (max(fs) - min(fs)) / np.median(fs) if len(fs) > 1 else 0.0
        row = {"seq": w["seq"], "unit": w["unit"], "window": w["window"], "why": why,
               "rot_deg": w["motion"]["rot_deg"], "trans_m": w["motion"]["trans_m"],
               "starts_apart_1pct": bool(spread > 0.01), "best_f0": best["f0"] if best else None}
        if best is not None:
            f, sd = best["intr"][0], best["sd"][0]
            u = w["unit"]
            row.update({"f": f, "sd": sd, "intr": best["intr"], "n_tracks": best["n_tracks"],
                        "n_obs": best["n_obs"], "rms_inlier": best["rms_inlier"],
                        "rel": (f - REF[u]) / REF[u], "rel_tum": (f - TUM[u]) / TUM[u],
                        "z": (f - REF[u]) / sd, "z_tum": (f - TUM[u]) / sd})
        rows.append(row)
    ok = [r for r in rows if r["why"] == "ok"]
    per = {}
    for k in SEQS:
        rs = [r for r in rows if r["seq"] == k]
        o = [r for r in rs if r["why"] == "ok"]
        causes = {}
        for r in rs:
            if r["why"] != "ok":
                causes[r["why"]] = causes.get(r["why"], 0) + 1
        e = {"windows": len(rs), "counted": len(o), "failures": causes,
             "starts_apart_1pct": sum(r["starts_apart_1pct"] for r in rs),
             "best_f0": {str(f0): sum(r["best_f0"] == f0 for r in o) for f0 in res["f0s"]}}
        if o:
            f = np.array([r["f"] for r in o]); sd = np.array([r["sd"] for r in o])
            z = np.array([r["z"] for r in o]); zt = np.array([r["z_tum"] for r in o])
            e.update({"median_f": float(np.median(f)),
                      "median_abs_rel": float(np.median([abs(r["rel"]) for r in o])),
                      "median_rel": float(np.median([r["rel"] for r in o])),
                      "median_rel_tum": float(np.median([r["rel_tum"] for r in o])),
                      "rms_z": float(np.sqrt(np.mean(z ** 2))), "rms_z_tum": float(np.sqrt(np.mean(zt ** 2))),
                      "cover1": float(np.mean(abs(z) <= 1)), "cover2": float(np.mean(abs(z) <= 2)),
                      "median_sd": float(np.median(sd)), "median_sd_rel": float(np.median(sd / f)),
                      "spread_mad": mad_sd(f) if len(f) > 2 else None,
                      "spread_ratio": mad_sd(f) / float(np.median(sd)) if len(f) > 2 else None,
                      "median_tracks": float(np.median([r["n_tracks"] for r in o])),
                      "median_rms_inlier": float(np.median([r["rms_inlier"] for r in o])),
                      "median_rot_deg": float(np.median([r["rot_deg"] for r in rs])),
                      "median_trans_m": float(np.median([r["trans_m"] for r in rs]))})
        per[k] = e
    zall = np.array([r["z"] for r in ok])
    rmsz = float(np.sqrt(np.mean(zall ** 2))) if len(zall) else None
    hyp = {
        "H104": {"median_abs_rel_fr1_desk": per["fr1_desk"].get("median_abs_rel"),
                 "holds": per["fr1_desk"].get("median_abs_rel") is not None
                 and per["fr1_desk"]["median_abs_rel"] <= 0.02},
        "H105": {"rms_z_all": rmsz, "n": len(ok), "holds": rmsz is not None and rmsz <= 2},
        "H106": {k: per[k].get("spread_ratio") for k in SEQS},
        "H107": {"ratio_xyz_over_desk": (per["fr1_xyz"]["median_sd_rel"] / per["fr1_desk"]["median_sd_rel"])
                 if "median_sd_rel" in per["fr1_xyz"] and "median_sd_rel" in per["fr1_desk"] else None},
    }
    hyp["H106"]["holds"] = all(v is not None and v <= 2 for k, v in hyp["H106"].items())
    hyp["H107"]["holds"] = hyp["H107"]["ratio_xyz_over_desk"] is not None and hyp["H107"]["ratio_xyz_over_desk"] >= 2
    # Unscored diagnostics, chosen after the hypotheses were scored (LOG.md says so).
    diag = {}
    for k in SEQS:
        o = [r for r in ok if r["seq"] == k]
        ag = [r["z"] for r in o if not r["starts_apart_1pct"]]
        da = [r["z"] for r in o if r["starts_apart_1pct"]]
        f = np.array([r["f"] for r in o])
        u = o[0]["unit"]
        se = 1.2533 * mad_sd(f) / np.sqrt(len(f))      # sd of a median, from the across-window spread
        diag[k] = {"rms_z_starts_agree": float(np.sqrt(np.mean(np.square(ag)))) if ag else None, "n_agree": len(ag),
                   "rms_z_starts_apart": float(np.sqrt(np.mean(np.square(da)))) if da else None, "n_apart": len(da),
                   "median_f": float(np.median(f)), "median_se": float(se),
                   "median_z": float((np.median(f) - REF[u]) / se), "median_z_tum": float((np.median(f) - TUM[u]) / se)}
    out = {"references": {"zhang_k1k2": REF, "tum": TUM}, "hypotheses": hyp, "per_sequence": per,
           "diagnostics": diag,
           "windows": rows}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps(hyp, indent=1))
    print(json.dumps(diag, indent=1))
    for k in SEQS:
        print(k, {a: (round(b, 4) if isinstance(b, float) else b) for a, b in per[k].items()})
    figure(rows)


def figure(rows):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    cols = {"fr1_desk": "#1f77b4", "fr1_xyz": "#ff7f0e", "fr3_stf": "#2ca02c"}
    ax = axes[0]
    for k in SEQS:
        o = [r for r in rows if r["seq"] == k and r["why"] == "ok"]
        x = [r["window"] for r in o]
        ax.errorbar(x, [100 * r["rel"] for r in o], yerr=[200 * r["sd"] / r["f"] for r in o], fmt="o",
                    ms=3, capsize=2, color=cols[k], label=k)
    ax.axhline(0, color="k", lw=0.8)
    ax.set_xlabel("window (1.2 s each)")
    ax.set_ylabel("f error vs board calibration (%), bar = 2 sd")
    ax.set_ylim(-20, 40)
    ax.legend(fontsize=8)
    ax = axes[1]
    for k in SEQS:
        o = [r for r in rows if r["seq"] == k and r["why"] == "ok"]
        ax.scatter([r["rot_deg"] for r in o], [100 * r["sd"] / r["f"] for r in o], s=10, color=cols[k], label=k)
    ax.set_xlabel("rotation over the window (deg, motion capture)")
    ax.set_ylabel("solver sd of f (% of f)")
    ax.set_yscale("log")
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "natural.png"), dpi=130)


if __name__ == "__main__":
    main()
