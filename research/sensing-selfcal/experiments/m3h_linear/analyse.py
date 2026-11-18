"""Milestone 3h: score H149-H153 (written in ../../LOG.md before run.py first ran) from results.json.
Writes summary.json and linear.png here."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def spearman(a, b):
    def rank(x):
        x = np.asarray(x, float)
        o = np.argsort(x, kind="mergesort")
        r = np.empty(len(x))
        r[o] = np.arange(len(x))
        for v in np.unique(x):          # average ties
            m = x == v
            r[m] = r[m].mean()
        return r
    return float(np.corrcoef(rank(a), rank(b))[0, 1])


def rows(res):
    out = []
    for w in res["windows"]:
        if w.get("why") not in ("ok",):
            continue
        ref = res["cams"][w["cam"]]["zhang_k1k2"]
        f = w["intr"][0]
        sd = float(np.sqrt(w["cov"][0][0]))
        for p in w["pinned"]:
            if p["status_p"] == 0 or not p["k_kept"]:
                continue
            out.append({"cam": w["cam"], "n": w["n"], "i": w["i"], "t": p["t"], "f": f, "fc": p["fc"], "fp": p["fp"],
                        "fref": ref["f"], "step_c": abs(p["fc"] - f) / f, "gap": abs(p["fp"] - p["fc"]) / f,
                        "ratio": (p["fp"] - f) / (p["fc"] - f) if p["fc"] != f else np.nan,
                        "rel_gap": abs(p["fp"] - p["fc"]) / abs(p["fp"] - f) if p["fp"] != f else np.nan,
                        "same_sign": bool(np.sign(p["fc"] - f) == np.sign(p["fp"] - f)),
                        "sd_ratio_p": p["sd_p"] / sd, "sd_ratio_c": p["sd_ratio_c"],
                        "e": abs(f - ref["f"]) / ref["f"], "ep": abs(p["fp"] - ref["f"]) / ref["f"],
                        "ec": abs(p["fc"] - ref["f"]) / ref["f"],
                        "dk1": abs(w["intr"][3] - ref["k1"]), "dk2": abs(w["intr"][4] - ref["k2"])})
    return out


def med(x):
    x = np.asarray([v for v in x if np.isfinite(v)])
    return float(np.median(x)) if len(x) else float("nan")


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    n_win = len(res["windows"])
    n_ok = sum(w.get("why") == "ok" for w in res["windows"])
    R = rows(res)
    t1 = [r for r in R if r["t"] == 1.0]
    hyp = {}
    m_rel = med([r["rel_gap"] for r in t1])
    frac_sign = float(np.mean([r["same_sign"] for r in t1]))
    hyp["H149"] = {"median_rel_gap": m_rel, "same_sign_frac": frac_sign, "n": len(t1),
                   "holds": bool(m_rel <= 0.25 and frac_sign >= 0.9)}
    rho = spearman([r["step_c"] for r in R], [r["gap"] for r in R])
    hyp["H150"] = {"spearman": rho, "n": len(R), "holds": bool(rho >= 0.5)}
    band = [r for r in R if 0.05 <= r["step_c"] <= 0.15]
    mr = med([r["ratio"] for r in band])
    hyp["H151"] = {"n_pairs": len(band), "median_ratio": mr,
                   "scored": len(band) >= 20, "holds": bool(len(band) >= 20 and 0.67 <= mr <= 1.5)}
    sdq = med([abs(r["sd_ratio_p"] - r["sd_ratio_c"]) / r["sd_ratio_c"] for r in t1])
    hyp["H152"] = {"median_rel_diff": sdq, "median_sd_ratio_p": med([r["sd_ratio_p"] for r in t1]),
                   "median_sd_ratio_c": med([r["sd_ratio_c"] for r in t1]), "holds": bool(sdq <= 0.2)}
    e0, ep = med([r["e"] for r in t1]), med([r["ep"] for r in t1])
    hyp["H153"] = {"median_err_free": e0, "median_err_pinned": ep, "ratio": ep / e0, "holds": bool(ep <= 0.6 * e0)}

    per = {}
    for cam in ("left", "right"):
        for n in res["sizes"]:
            s = [r for r in t1 if r["cam"] == cam and r["n"] == n]
            per[f"{cam}_{n}"] = {"n": len(s), "median_step_c": med([r["step_c"] for r in s]),
                                 "median_ratio": med([r["ratio"] for r in s]),
                                 "median_rel_gap": med([r["rel_gap"] for r in s]),
                                 "median_err_free": med([r["e"] for r in s]), "median_err_pinned": med([r["ep"] for r in s]),
                                 "median_err_firstorder": med([r["ec"] for r in s]),
                                 "median_sd_ratio_p": med([r["sd_ratio_p"] for r in s]),
                                 "median_sd_ratio_c": med([r["sd_ratio_c"] for r in s])}
    by_t = {str(t): {"n": len([r for r in R if r["t"] == t]),
                     "median_step_c": med([r["step_c"] for r in R if r["t"] == t]),
                     "median_ratio": med([r["ratio"] for r in R if r["t"] == t]),
                     "median_gap": med([r["gap"] for r in R if r["t"] == t])} for t in res["ts"]}
    edges = [0, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 1.0]
    bins = []
    for a, b in zip(edges[:-1], edges[1:]):
        s = [r for r in R if a <= r["step_c"] < b]
        if s:
            rat = np.array([r["ratio"] for r in s])
            bins.append({"lo": a, "hi": b, "n": len(s), "median_ratio": med(rat),
                         "q25_ratio": float(np.nanpercentile(rat, 25)), "q75_ratio": float(np.nanpercentile(rat, 75)),
                         "median_gap": med([r["gap"] for r in s])})
    dropped = sum(len(w.get("pinned", [])) for w in res["windows"]) - len(R)
    out = {"n_windows": n_win, "n_ok": n_ok, "n_pairs": len(R), "pairs_dropped": dropped,
           "max_step_c": float(max(r["step_c"] for r in R)),
           "hypotheses": hyp, "per_cam_size_t1": per, "by_t": by_t, "ratio_by_step": bins}
    out["post_hoc_3g"] = post_hoc_3g(bins)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(json.dumps({"hyp": hyp, "n_ok": n_ok, "dropped": dropped, "post": out["post_hoc_3g"], "per": per}, indent=1))
    plot(R)


def post_hoc_3g(bins):
    """Post hoc (added after H149-H153 were scored): shrink each of milestone 3g's two-term steps by
    the median re-solve/first-order ratio of this milestone's step bin, and re-score 3g's errors.
    A transfer from board windows to TUM windows, so indicative only."""
    g = json.load(open(os.path.join(HERE, "..", "m3g_condk12", "summary.json")))["windows"]
    big = [b for b in bins if b["n"] >= 10]

    def shrink(step):
        for b in big:
            if b["lo"] <= step < b["hi"]:
                return b["median_ratio"]
        return big[-1]["median_ratio"]       # beyond the last well-populated bin: carry it
    out = {}
    for name, sel in (("all", lambda w: True), ("fr1_desk", lambda w: w["seq"] == "fr1_desk"),
                      ("fr1_xyz", lambda w: w["seq"] == "fr1_xyz"), ("fr3_stf", lambda w: w["seq"] == "fr3_stf")):
        ws = [w for w in g if sel(w)]
        ea = [(w["f"] + shrink(w["step2"]) * (w["fc2"] - w["f"]) - w["ref"]) / w["ref"] for w in ws]
        out[name] = {"n": len(ws), "median_abs_e_solved": med([abs(w["e"]) for w in ws]),
                     "median_abs_ec2": med([abs(w["ec2"]) for w in ws]), "median_abs_e_adj": med(np.abs(ea)),
                     "median_signed_e_adj": med(ea), "median_signed_ec2": med([w["ec2"] for w in ws])}
    return out


def plot(R):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for cam, mk in (("left", "o"), ("right", "s")):
        s = [r for r in R if r["cam"] == cam]
        ax[0].scatter([100 * (r["fc"] - r["f"]) / r["f"] for r in s], [100 * (r["fp"] - r["f"]) / r["f"] for r in s],
                      s=8, marker=mk, alpha=0.5, label=f"{cam} camera")
    lim = max(abs(100 * (r["fc"] - r["f"]) / r["f"]) for r in R) * 1.05
    ax[0].plot([-lim, lim], [-lim, lim], "k--", lw=0.8, label="re-solve = first order")
    ax[0].axvspan(5, 15, color="0.9", zorder=0); ax[0].axvspan(-15, -5, color="0.9", zorder=0)
    ax[0].set_xlabel("first-order step in f (%), milestone 3g's formula")
    ax[0].set_ylabel("re-solved step in f (%), k1, k2 pinned")
    ax[0].legend(fontsize=8)
    ax[0].set_title("Pinning distortion: predicted vs re-solved f")
    st = np.array([r["step_c"] for r in R]) * 100
    rat = np.array([r["ratio"] for r in R])
    ax[1].scatter(st, rat, s=6, alpha=0.4)
    ax[1].set_xscale("log")
    ax[1].axhline(1, color="k", lw=0.8, ls="--")
    ax[1].axhspan(0.67, 1.5, color="0.9", zorder=0)
    ax[1].set_ylim(-0.5, 3)
    ax[1].set_xlabel("first-order step |f_c - f| / f (%)")
    ax[1].set_ylabel("re-solved step / first-order step")
    ax[1].set_title("Where the linearisation holds")
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "linear.png"), dpi=130)


if __name__ == "__main__":
    main()
