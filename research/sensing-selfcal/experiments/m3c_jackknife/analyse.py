"""Milestone 3c: score H124-H129 from results.json (run.py) and draw jackknife.png.

A window is scored if its re-solve passes milestone 3b's counting rules (converged, >= 100 tracks,
inlier rms < 1.5 px, 300 < f < 1000, a defined solver sd) and its jackknife is defined (>= 10 of
the 12 delete-one solves converge with 300 < f < 1000). Rules set in LOG.md before the run.
"""
import json, os, sys
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jk  # noqa: E402

M4N = json.load(open(os.path.join(HERE, "..", "m4n_k2", "summary.json")))
REF = {u: M4N["zhang"][u]["k1k2"]["f"] for u in ("fr1", "fr3")}
TUM = {"fr1": (517.3 + 516.5) / 2, "fr3": (535.4 + 539.2) / 2}
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
SDS = ("sd_ba", "sd_jk", "sd_track", "sd_view")


def mad_sd(x):
    x = np.asarray(x)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def classify(w):
    if "intr" not in w:
        return w.get("status", "no_solution")
    f = w["intr"][0]
    if w["status"] != "ok":
        return "not_converged"
    if w["n_tracks"] < 100:
        return "few_tracks"
    if not w["rms_inlier"] < 1.5:
        return "rms"
    if not 300 < f < 1000:
        return "f_range"
    if not np.isfinite(w["sd"][0]) or w["sd"][0] <= 0:
        return "sd_undefined"
    good = [o for o in w["jk"] if o["status"] == "ok"]
    if len(good) < 10:
        return "jk_undefined"
    return "ok"


def rms(x):
    x = np.asarray(x, float)
    return float(np.sqrt(np.mean(x ** 2)))


def block(o):
    e = {"n": len(o)}
    for s in SDS:
        sd = np.array([r[s] for r in o], float)
        rel = np.array([r["f"] - r["ref"] for r in o])
        z = rel / sd
        zt = np.array([r["f"] - r["tum"] for r in o]) / sd
        e[s] = {"rms_z": rms(z), "rms_z_tum": rms(zt), "cover1": float(np.mean(abs(z) <= 1)),
                "cover2": float(np.mean(abs(z) <= 2)), "median_sd_rel": float(np.median(sd / [r["f"] for r in o])),
                "median_sd": float(np.median(sd))}
    return e


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))["windows"]
    rows = []
    jk_fail = {}
    for w in res:
        why = classify(w)
        row = {"seq": w["seq"], "unit": w["unit"], "window": w["window"], "why": why,
               "rot_deg": w["rot_deg"], "trans_m": w["trans_m"], "f_m3b": w.get("f_m3b")}
        for o in w.get("jk", []):
            if o["status"] != "ok":
                jk_fail[o["status"]] = jk_fail.get(o["status"], 0) + 1
        if "intr" in w:
            f = w["intr"][0]
            u = w["unit"]
            fs = [o["f"] for o in w.get("jk", []) if o["status"] == "ok"]
            row.update({"f": f, "ref": REF[u], "tum": TUM[u], "rel": (f - REF[u]) / REF[u],
                        "sd_ba": w["sd"][0], "sd_track": w.get("sd_track"), "sd_view": w.get("sd_view"),
                        "sd_jk": jk.jk_sd(fs) if len(fs) >= 2 else None, "n_jk": len(fs),
                        "jk_fs": fs, "lag1": w.get("lag1"),
                        "d_m3b": (f - w["f_m3b"]) / w["f_m3b"] if w.get("f_m3b") else None})
        rows.append(row)
    ok = [r for r in rows if r["why"] == "ok"]
    per = {k: block([r for r in ok if r["seq"] == k]) for k in SEQS}
    allb = block(ok)
    for k in SEQS:
        o = [r for r in ok if r["seq"] == k]
        f = np.array([r["f"] for r in o])
        per[k]["spread_mad"] = mad_sd(f)
        per[k]["spread_over_median_sd"] = {s: mad_sd(f) / per[k][s]["median_sd"] for s in SDS}
        per[k]["spearman_sd_rot"] = {s: float(stats.spearmanr([r[s] for r in o], [r["rot_deg"] for r in o])[0])
                                     for s in SDS}
        sd = np.array([r["sd_jk"] for r in o])
        wts = 1 / sd ** 2
        mu = float((wts * f).sum() / wts.sum())
        per[k]["ivw_mean_jk"] = mu
        per[k]["ivw_rel"] = (mu - o[0]["ref"]) / o[0]["ref"]
        per[k]["ivw_se_naive"] = float(1 / np.sqrt(wts.sum()))
        lx = [r["lag1"][0] for r in o if r["lag1"] and r["lag1"][0] is not None]
        ly = [r["lag1"][1] for r in o if r["lag1"] and r["lag1"][1] is not None]
        per[k]["lag1_median"] = [float(np.median(lx)), float(np.median(ly))]
        rs = [r for r in rows if r["seq"] == k]
        per[k]["windows"] = len(rs)
        per[k]["excluded"] = {c: sum(r["why"] == c for r in rs) for c in sorted({r["why"] for r in rs}) if c != "ok"}
    gate = [r for r in ok if r["sd_jk"] / r["f"] <= 0.02]
    hyp = {
        "H124": {"rms_z_jk": allb["sd_jk"]["rms_z"], "n": len(ok)},
        "H125": {k: per[k]["sd_jk"]["rms_z"] for k in SEQS},
        "H126": {k: per[k]["spread_over_median_sd"]["sd_jk"] for k in SEQS},
        "H127": {"ratio_xyz_over_desk": per["fr1_xyz"]["sd_jk"]["median_sd_rel"] / per["fr1_desk"]["sd_jk"]["median_sd_rel"]},
        "H128": {"rms_z_track": allb["sd_track"]["rms_z"]},
        "H129": {"share": len(gate) / len(ok), "n": len(gate),
                 "median_abs_rel": float(np.median([abs(r["rel"]) for r in gate])) if gate else None},
    }
    hyp["H124"]["holds"] = hyp["H124"]["rms_z_jk"] <= 2
    hyp["H125"]["holds"] = all(hyp["H125"][k] <= 2 for k in SEQS)
    hyp["H126"]["holds"] = all(0.5 <= hyp["H126"][k] <= 2 for k in SEQS)
    hyp["H127"]["holds"] = hyp["H127"]["ratio_xyz_over_desk"] >= 2
    hyp["H128"]["holds"] = hyp["H128"]["rms_z_track"] <= 2
    hyp["H129"]["holds"] = hyp["H129"]["share"] >= 0.25 and hyp["H129"]["median_abs_rel"] is not None \
        and hyp["H129"]["median_abs_rel"] <= 0.02
    # Post hoc (chosen after H124-H129 were scored): how much of each window's jackknife variance
    # comes from its single most influential keyframe.
    top = {}
    for k in SEQS:
        sh = []
        for r in ok:
            if r["seq"] != k:
                continue
            fs = np.array(r["jk_fs"]); dv = (fs - fs.mean()) ** 2
            sh.append(float(dv.max() / dv.sum()))
        top[k] = {"median_top_share": float(np.median(sh)), "share_over_half": float(np.mean(np.array(sh) > 0.5))}
    d = [abs(r["d_m3b"]) for r in rows if r.get("d_m3b") is not None]
    repro = {"n": len(d), "within_0.1pct": int(sum(x < 0.001 for x in d)), "within_1pct": int(sum(x < 0.01 for x in d)),
             "median_abs": float(np.median(d))}
    out = {"references": {"zhang_k1k2": REF, "tum": TUM}, "reproduction_vs_m3b": repro, "hypotheses": hyp,
           "all": allb, "per_sequence": per, "jk_failures": jk_fail,
           "post_hoc_top_keyframe_share": top, "windows": rows}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps(hyp, indent=1))
    print("top keyframe share (post hoc)", top)
    print("repro", repro, "jk failures", jk_fail)
    print("all", json.dumps(allb))
    for k in SEQS:
        print(k, json.dumps(per[k]))
    figure(ok)


def figure(ok):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    cols = {"fr1_desk": "#1f77b4", "fr1_xyz": "#ff7f0e", "fr3_stf": "#2ca02c"}
    ax = axes[0]
    for k in SEQS:
        o = [r for r in ok if r["seq"] == k]
        ax.scatter([100 * r["sd_ba"] / r["f"] for r in o], [100 * abs(r["rel"]) for r in o], s=12, marker="x",
                   color=cols[k], alpha=0.6)
        ax.scatter([100 * r["sd_jk"] / r["f"] for r in o], [100 * abs(r["rel"]) for r in o], s=14,
                   color=cols[k], label=k)
    xx = np.logspace(-1.3, 1.6, 10)
    ax.plot(xx, xx, "k-", lw=0.8, label="|error| = 1 sd")
    ax.plot(xx, 2 * xx, "k--", lw=0.8, label="|error| = 2 sd")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("sd of f (% of f): x solver, o keyframe jackknife")
    ax.set_ylabel("|f error| vs board calibration (%)")
    ax.legend(fontsize=7)
    ax = axes[1]
    labels = {"sd_ba": "solver", "sd_track": "track sandwich", "sd_view": "keyframe sandwich", "sd_jk": "jackknife"}
    x = np.arange(len(SEQS))
    for i, s in enumerate(("sd_ba", "sd_track", "sd_view", "sd_jk")):
        v = [rms([(r["f"] - r["ref"]) / r[s] for r in ok if r["seq"] == k]) for k in SEQS]
        ax.bar(x + (i - 1.5) * 0.2, v, 0.2, label=labels[s])
    ax.axhline(1, color="k", lw=0.8)
    ax.axhline(2, color="k", lw=0.8, ls="--")
    ax.set_xticks(x); ax.set_xticklabels(SEQS)
    ax.set_yscale("log")
    ax.set_ylim(0.8, 20)
    ax.set_ylabel("rms z of f (1 = honest)")
    ax.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "jackknife.png"), dpi=130)


if __name__ == "__main__":
    main()
