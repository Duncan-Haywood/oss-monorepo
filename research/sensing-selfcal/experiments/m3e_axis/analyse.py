"""Milestone 3e: score H135-H139 (written in LOG.md before run.py was first run).

Reads results.json (this milestone's re-solves: axis spread D, corr(f,k)), milestone 3c's
summary.json (f, error against the board reference, sd_jk) and reuses milestone 3d's pooling.
Writes summary.json and axis.png here.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "m3d_pool"))
import axis  # noqa: E402
import pool  # noqa: E402

SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")


def load():
    res = {(r["seq"], r["window"]): r for r in json.load(open(os.path.join(HERE, "results.json")))["windows"]}
    m3c = json.load(open(os.path.join(HERE, "..", "m3c_jackknife", "summary.json")))["windows"]
    rows = []
    for w in m3c:
        if w["why"] != "ok":
            continue
        r = res[(w["seq"], w["window"])]
        assert abs(r["f"] / w["f"] - 1) < 1e-3, ("re-solve does not reproduce 3c", w["seq"], w["window"], r["f"], w["f"])
        rows.append({**{k: w[k] for k in ("seq", "window", "f", "ref", "sd_jk", "rot_deg")},
                     "err": abs(w["rel"]), "rel": w["rel"],
                     **{k: r[k] for k in ("D_solver", "D_mocap", "rot_total_mocap", "rot_total_solver",
                                         "corr_f_k1", "corr_f_k2")}})
    return rows


def gated_blocks(rows, thr, k=5):
    out = []
    for s in SEQS:
        rs = sorted([r for r in rows if r["seq"] == s and r["D_solver"] >= thr], key=lambda r: r["window"])
        for b in pool.blocks(rs, k):
            b["seq"] = s
            out.append(b)
    return out


def block_stats(bl):
    if not bl:
        return {"n_blocks": 0}
    z = np.array([(b["re"] - b["ref"]) / b["sd_re"] for b in bl])
    e = np.array([abs(b["med"] / b["ref"] - 1) for b in bl])
    return {"n_blocks": len(bl), "rms_z_re": float(np.sqrt((z ** 2).mean())),
            "median_abs_err_med": float(np.median(e)),
            "median_abs_err_re": float(np.median([abs(b["re"] / b["ref"] - 1) for b in bl]))}


def gate(rows, thr):
    kept = [r for r in rows if r["D_solver"] >= thr]
    per = {s: {"n": sum(r["seq"] == s for r in rows), "kept": sum(r["seq"] == s for r in kept)} for s in SEQS}
    return kept, per


def main():
    rows = load()
    D = np.array([r["D_solver"] for r in rows]); err = np.array([r["err"] for r in rows])
    med = {s: {k: float(np.median([r[k] for r in rows if r["seq"] == s]))
               for k in ("D_solver", "D_mocap", "rot_total_mocap", "rot_total_solver", "err")} for s in SEQS}
    for s in SEQS:
        rs = [r for r in rows if r["seq"] == s]
        med[s]["n"] = len(rs)
        # roll share: the part of total rotation that the axis swing does not explain (descriptive)
        med[s]["median_axis_over_total_mocap"] = float(np.median([r["D_mocap"] / r["rot_total_mocap"] for r in rs]))
        med[s]["median_sdjk_over_f"] = float(np.median([r["sd_jk"] / r["f"] for r in rs]))
    h = {}
    x = med["fr1_xyz"]["D_solver"]
    h["H135"] = {"xyz": x, "desk": med["fr1_desk"]["D_solver"], "fr3": med["fr3_stf"]["D_solver"],
                 "held": bool(x <= 0.5 * med["fr1_desk"]["D_solver"] and x <= 0.5 * med["fr3_stf"]["D_solver"])}
    rho = axis.spearman(D, err)
    h["H136"] = {"spearman_D_err": rho, "held": bool(rho <= -0.3)}
    thr = float(np.quantile(D, 1 / 3))
    kept, per = gate(rows, thr)
    drop_xyz = 1 - per["fr1_xyz"]["kept"] / per["fr1_xyz"]["n"]
    other_n = per["fr1_desk"]["n"] + per["fr3_stf"]["n"]
    drop_other = 1 - (per["fr1_desk"]["kept"] + per["fr3_stf"]["kept"]) / other_n
    h["H137"] = {"threshold_deg": thr, "per_seq": per, "drop_xyz": drop_xyz, "drop_desk_fr3": drop_other,
                 "held": bool(drop_xyz >= 0.5 and drop_other <= 0.25)}
    mk, ma = float(np.median([r["err"] for r in kept])), float(np.median(err))
    h["H138"] = {"median_err_kept": mk, "median_err_all": ma, "ratio": mk / ma, "held": bool(mk <= 0.75 * ma)}
    rs = axis.spearman(D, [r["D_mocap"] for r in rows])
    h["H139"] = {"spearman_solver_mocap": rs, "held": bool(rs >= 0.8)}
    unsc = {
        "spearman_D_sdjk_over_f": axis.spearman(D, [r["sd_jk"] / r["f"] for r in rows]),
        "spearman_Dmocap_err": axis.spearman([r["D_mocap"] for r in rows], err),
        "spearman_rot_total_mocap_err": axis.spearman([r["rot_total_mocap"] for r in rows], err),
        "spearman_abs_corr_f_k1_err": axis.spearman([abs(r["corr_f_k1"]) for r in rows], err),
        "spearman_abs_corr_f_k2_err": axis.spearman([abs(r["corr_f_k2"]) for r in rows], err),
        "spearman_D_signed_rel": axis.spearman(D, [r["rel"] for r in rows]),
        "median_abs_corr_f_k1": {s: float(np.median([abs(r["corr_f_k1"]) for r in rows if r["seq"] == s])) for s in SEQS},
        "median_abs_corr_f_k2": {s: float(np.median([abs(r["corr_f_k2"]) for r in rows if r["seq"] == s])) for s in SEQS},
        "re_k5_all": block_stats(gated_blocks(rows, -1.0)),
        "re_k5_gated": block_stats(gated_blocks(rows, thr)),
        "re_k5_gated_per_seq": {s: block_stats([b for b in gated_blocks(rows, thr) if b["seq"] == s]) for s in SEQS},
        "sensitivity": {},
    }
    for name, q in (("lower_quartile", 0.25), ("median", 0.5)):
        t = float(np.quantile(D, q)); kp, pr = gate(rows, t)
        unsc["sensitivity"][name] = {"threshold_deg": t, "per_seq": pr,
                                     "median_err_kept": float(np.median([r["err"] for r in kp])),
                                     "re_k5_gated": block_stats(gated_blocks(rows, t))}
    out = {"n_scored": len(rows), "per_sequence": med, "hypotheses": h, "unscored": unsc, "windows": rows}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in h.items():
        print(k, "HELD" if v["held"] else "refuted", {a: b for a, b in v.items() if a not in ("held", "per_seq")})
    print(json.dumps(med, indent=1)); print(json.dumps({k: v for k, v in unsc.items()}, indent=1))
    figure(rows, thr)


def figure(rows, thr):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    col = {"fr1_desk": "#1f77b4", "fr1_xyz": "#d62728", "fr3_stf": "#2ca02c"}
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for s in SEQS:
        rs = [r for r in rows if r["seq"] == s]
        ax[0].scatter([r["D_solver"] for r in rs], [100 * r["err"] for r in rs], c=col[s], label=s, s=18)
        ax[1].scatter([r["D_mocap"] for r in rs], [r["D_solver"] for r in rs], c=col[s], s=18)
    ax[0].axvline(thr, color="0.5", ls="--", lw=1)
    ax[0].set_xlabel("optical-axis spread from the solve (deg)"); ax[0].set_ylabel("|f error| vs board (%)")
    ax[0].legend(frameon=False, fontsize=8); ax[0].set_title("error against axis spread (dashed: tercile gate)", fontsize=9)
    m = max(max(r["D_mocap"] for r in rows), max(r["D_solver"] for r in rows))
    ax[1].plot([0, m], [0, m], color="0.6", lw=1)
    ax[1].set_xlabel("axis spread from motion capture (deg)"); ax[1].set_ylabel("axis spread from the solve (deg)")
    ax[1].set_title("solver poses against motion capture", fontsize=9)
    fig.tight_layout(); fig.savefig(os.path.join(HERE, "axis.png"), dpi=110)


if __name__ == "__main__":
    main()
