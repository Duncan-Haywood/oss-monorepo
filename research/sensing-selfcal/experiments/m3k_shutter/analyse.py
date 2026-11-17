"""Milestone 3k: score H167-H171 from results.json (run.py) and the stored TUM windows.

    python3 analyse.py        # writes summary.json and shutter.png
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(EXP, "m3e_axis"))
from axis import spearman  # noqa: E402


def shift(j, f_true):
    return (j["rs"]["intr"][0] - j["gs"]["intr"][0]) / f_true


def med(x):
    return float(np.median(x)) if len(x) else float("nan")


def part_a(jobs, f, tr):
    out = {}
    for ax in ("pitch", "yaw", "roll"):
        out[ax] = {}
        for r in sorted({j["rate"] for j in jobs}):
            js = [j for j in jobs if j["axis"] == ax and j["rate"] == r]
            e = [shift(j, f) for j in js]
            iso = [float(np.mean(j["pred_kf"])) for j in js] if ax == "pitch" else [0.0] * len(js)
            out[ax][str(r)] = {"n": len(js), "median_e": med(e), "median_abs_e": med(np.abs(e)),
                               "e": e, "g": med(np.array(e) / (r * tr)), "median_iso": med(iso),
                               "median_abs_shift_in_sd": med([abs(shift(j, f)) * f / j["gs"]["sd_f"] for j in js]),
                               "median_dk1": med([j["rs"]["intr"][3] - j["gs"]["intr"][3] for j in js]),
                               "converged": sum(j["rs"]["status"] > 0 and j["gs"]["status"] > 0 for j in js)}
    return out


def tum_windows():
    m3c = json.load(open(os.path.join(EXP, "m3c_jackknife", "summary.json")))["windows"]
    m3e = {(w["seq"], w["window"]): w for w in json.load(open(os.path.join(EXP, "m3e_axis", "results.json")))["windows"]}
    out = []
    for w in m3c:
        if w.get("why") != "ok" or "rel" not in w:
            continue
        a = m3e.get((w["seq"], w["window"]))
        if a is None:
            continue
        out.append({"seq": w["seq"], "window": w["window"], "abs_e": abs(w["rel"]), "e": w["rel"],
                    "rate": np.radians(a["rot_total_mocap"]) / (33 / 30.0)})
    return out


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    f, tr = R["intr"][0], R["t_r"]
    A = [j for j in R["jobs"] if j["part"] == "A"]
    B = [j for j in R["jobs"] if j["part"] == "B"]
    a = part_a(A, f, tr)
    P = a["pitch"]
    hyp = {}
    r21 = P["2.0"]["median_e"] / P["1.0"]["median_e"]
    r051 = P["0.5"]["median_e"] / P["1.0"]["median_e"]
    hyp["H167"] = {"ratio_2_to_1": r21, "ratio_05_to_1": r051, "held": bool(1.6 <= r21 <= 2.4 and 0.4 <= r051 <= 0.6)}
    amp = P["1.0"]["median_abs_e"] / abs(P["1.0"]["median_iso"])
    hyp["H168"] = {"median_abs_e": P["1.0"]["median_abs_e"], "median_abs_iso": abs(P["1.0"]["median_iso"]),
                   "amplification": amp, "held": bool(amp >= 2)}
    yr = a["yaw"]["1.0"]["median_abs_e"] / P["1.0"]["median_abs_e"]
    rr = a["roll"]["1.0"]["median_abs_e"] / P["1.0"]["median_abs_e"]
    hyp["H169"] = {"yaw_over_pitch": yr, "roll_over_pitch": rr, "held": bool(yr <= 0.5 and rr <= 0.5)}
    g = P["1.0"]["g"]
    xb = np.array([g * tr * np.mean(np.array(j["w"])[:, 0]) for j in B])
    yb = np.array([shift(j, f) for j in B])
    slope, icpt = np.polyfit(xb, yb, 1)
    r2 = float(np.corrcoef(xb, yb)[0, 1] ** 2)
    hyp["H170"] = {"g_pitch": g, "slope": float(slope), "intercept": float(icpt), "r2": r2, "n": len(B),
                   "held": bool(0.5 <= slope <= 1.5 and r2 >= 0.5)}
    T = tum_windows()
    for w in T:
        w["implied_abs_e"] = abs(g) * w["rate"] * tr
        w["rate_needed"] = w["abs_e"] / (abs(g) * tr)
    frac = float(np.mean([w["implied_abs_e"] >= 0.5 * w["abs_e"] for w in T]))
    hyp["H171"] = {"n": len(T), "share_implied_ge_half_observed": frac, "held": bool(frac >= 0.5)}
    per_seq = {}
    for s in sorted({w["seq"] for w in T}):
        ws = [w for w in T if w["seq"] == s]
        per_seq[s] = {"n": len(ws), "median_abs_e": med([w["abs_e"] for w in ws]),
                      "median_rate_rad_s": med([w["rate"] for w in ws]),
                      "median_implied_abs_e": med([w["implied_abs_e"] for w in ws]),
                      "median_rate_needed_rad_s": med([w["rate_needed"] for w in ws]),
                      "median_needed_over_mocap": med([w["rate_needed"] / w["rate"] for w in ws])}
    unscored = {
        "part_b": {str(sg): {"n": sum(j["sigma"] == sg for j in B),
                             "sd_e": float(np.std([shift(j, f) for j in B if j["sigma"] == sg], ddof=1)),
                             "median_abs_e": med([abs(shift(j, f)) for j in B if j["sigma"] == sg]),
                             "converged": sum(j["rs"]["status"] > 0 and j["gs"]["status"] > 0 for j in B if j["sigma"] == sg)}
                   for sg in sorted({j["sigma"] for j in B})},
        "gs_median_abs_err": med([abs(j["gs"]["intr"][0] - f) / f for j in R["jobs"]]),
        "tum_per_sequence": per_seq,
        "tum_spearman_rate_abs_e": spearman([w["rate"] for w in T], [w["abs_e"] for w in T]),
        "tum_median_implied_abs_e": med([w["implied_abs_e"] for w in T]),
        "tum_median_abs_e": med([w["abs_e"] for w in T]),
    }
    S = {"part_a": {ax: {r: {k: v for k, v in c.items() if k != "e"} for r, c in d.items()} for ax, d in a.items()},
         "hypotheses": hyp, "unscored": unscored, "tum_windows": T}
    json.dump(S, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in hyp.items():
        print(k, {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in v.items()})
    print(json.dumps(unscored, indent=1)[:2500])
    figure(a, xb, yb, T, g, tr)


def figure(a, xb, yb, T, g, tr):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 3, figsize=(13, 4))
    for name, c in (("pitch", "C0"), ("yaw", "C1"), ("roll", "C2")):
        rates = sorted(float(r) for r in a[name])
        for r in rates:
            e = a[name][str(r)]["e"]
            ax[0].scatter([r] * len(e), np.array(e) * 100, s=10, color=c, alpha=0.5)
        ax[0].plot(rates, [a[name][str(r)]["median_e"] * 100 for r in rates], color=c, label=name)
    ax[0].plot(sorted(float(r) for r in a["pitch"]), [a["pitch"][str(r)]["median_iso"] * 100 for r in sorted(float(r) for r in a["pitch"])],
               "k--", label="isotropic first order (pitch)")
    ax[0].set_xlabel("constant angular rate (rad/s), readout 1/30 s"); ax[0].set_ylabel("focal shift, rolling - global (%)")
    ax[0].legend(fontsize=8); ax[0].set_title("A: one axis, constant rate")
    ax[1].scatter(xb * 100, yb * 100, s=10)
    lim = max(abs(xb).max(), abs(yb).max()) * 100
    ax[1].plot([-lim, lim], [-lim, lim], "k--", lw=0.8)
    ax[1].set_xlabel("g x t_r x mean keyframe pitch rate (%)"); ax[1].set_ylabel("focal shift (%)")
    ax[1].set_title("B: hand-held random rates")
    for s, c in (("fr1_desk", "C0"), ("fr1_xyz", "C1"), ("fr3_stf", "C2")):
        ws = [w for w in T if w["seq"] == s]
        ax[2].scatter([w["implied_abs_e"] * 100 for w in ws], [w["abs_e"] * 100 for w in ws], s=12, color=c, label=s)
    m = max(max(w["abs_e"] for w in T), max(w["implied_abs_e"] for w in T)) * 100
    ax[2].plot([0, m], [0, m], "k--", lw=0.8); ax[2].plot([0, m / 2], [0, m], "k:", lw=0.8)
    ax[2].set_xlabel("implied |shift| at mocap mean rate, all pitch (%)"); ax[2].set_ylabel("observed |f error| (%)")
    ax[2].legend(fontsize=8); ax[2].set_title("TUM windows (milestone 3c)")
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "shutter.png"), dpi=110)


if __name__ == "__main__":
    main()
