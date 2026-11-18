"""Milestone 3i, part B: score H158-H160 (written in ../../LOG.md before run.py first ran) from
results.json, and draw principal.png from it and part A's tum_summary.json (run tum.py first).
Writes board_summary.json here."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def med(x):
    x = np.asarray([v for v in x if np.isfinite(v)], float)
    return float(np.median(x)) if len(x) else float("nan")


def rows(res):
    out = []
    h3 = {(w["cam"], w["n"], w["i"]): w for w in
          json.load(open(os.path.join(HERE, "..", "m3h_linear", "results.json")))["windows"]}
    for w in res["windows"]:
        if w.get("why") != "ok":
            continue
        o = h3[(w["cam"], w["n"], w["i"])]
        assert o["views"] == w["views"] and np.allclose(o["intr"], w["intr"], rtol=1e-9), "not milestone 3h's windows"
        ref = res["cams"][w["cam"]]["zhang_k1k2"]
        f = w["intr"][0]
        sd = float(np.sqrt(w["cov"][0][0]))
        a = w["pinned_all"]
        base = {"cam": w["cam"], "n": w["n"], "i": w["i"], "f": f, "fref": ref["f"],
                "e": abs(f - ref["f"]) / ref["f"],
                "dcx": w["intr"][1] - ref["cx"], "dcy": w["intr"][2] - ref["cy"],
                "all_ok": bool(a["status_p"] > 0 and a["kept"]),
                "e_all_p": abs(a["fp"] - ref["f"]) / ref["f"], "e_all_c": abs(a["fc"] - ref["f"]) / ref["f"]}
        for p in w["pinned"]:
            if p["status_p"] == 0 or not p["kept"]:
                continue
            out.append({**base, "t": p["t"], "fc": p["fc"], "fp": p["fp"],
                        "step_c": abs(p["fc"] - f) / f,
                        "ratio": (p["fp"] - f) / (p["fc"] - f) if p["fc"] != f else np.nan,
                        "rel_gap": abs(p["fp"] - p["fc"]) / abs(p["fp"] - f) if p["fp"] != f else np.nan,
                        "same_sign": bool(np.sign(p["fc"] - f) == np.sign(p["fp"] - f)),
                        "sd_ratio_p": p["sd_p"] / sd, "sd_ratio_c": p["sd_ratio_c"],
                        "ep": abs(p["fp"] - ref["f"]) / ref["f"], "ec": abs(p["fc"] - ref["f"]) / ref["f"]})
    return out


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    R = rows(res)
    t1 = [r for r in R if r["t"] == 1.0]
    hyp = {}
    m_rel, frac = med([r["rel_gap"] for r in t1]), float(np.mean([r["same_sign"] for r in t1]))
    hyp["H158"] = {"median_rel_gap": m_rel, "same_sign_frac": frac, "n": len(t1),
                   "held": bool(m_rel <= 0.25 and frac >= 0.9)}
    e0, ep = med([r["e"] for r in t1]), med([r["ep"] for r in t1])
    hyp["H159"] = {"median_err_free": e0, "median_err_c_pinned": ep, "ratio": ep / e0, "held": bool(ep <= e0)}
    ok4 = [r for r in t1 if r["all_ok"]]
    e4 = med([r["e_all_p"] for r in ok4])
    hyp["H160"] = {"n": len(ok4), "median_err_all4_pinned": e4, "median_err_free": e0, "ratio": e4 / e0,
                   "held": bool(e4 <= 0.6 * e0)}
    per = {}
    for cam in ("left", "right"):
        for n in res["sizes"]:
            s = [r for r in t1 if r["cam"] == cam and r["n"] == n]
            per[f"{cam}_{n}"] = {"n": len(s), "median_step_c": med([r["step_c"] for r in s]),
                                 "median_ratio": med([r["ratio"] for r in s]),
                                 "median_err_free": med([r["e"] for r in s]),
                                 "median_err_c_pinned": med([r["ep"] for r in s]),
                                 "median_err_all4": med([r["e_all_p"] for r in s if r["all_ok"]]),
                                 "median_abs_dcx": med([abs(r["dcx"]) for r in s]),
                                 "median_abs_dcy": med([abs(r["dcy"]) for r in s])}
    by_t = {str(t): {"n": len([r for r in R if r["t"] == t]),
                     "median_step_c": med([r["step_c"] for r in R if r["t"] == t]),
                     "median_ratio": med([r["ratio"] for r in R if r["t"] == t]),
                     "median_err_p": med([r["ep"] for r in R if r["t"] == t])} for t in res["ts"]}
    out = {"n_windows": len(res["windows"]), "n_ok": sum(w.get("why") == "ok" for w in res["windows"]),
           "n_pairs": len(R), "n_all4_ok": len(ok4), "board_reference": {c: res["cams"][c]["zhang_k1k2"] for c in res["cams"]},
           "hypotheses": hyp, "per_cam_size_t1": per, "by_t": by_t,
           "unscored": {"median_sd_ratio_p_t1": med([r["sd_ratio_p"] for r in t1]),
                        "median_sd_ratio_c_t1": med([r["sd_ratio_c"] for r in t1]),
                        "median_err_all4_firstorder": med([r["e_all_c"] for r in ok4])}}
    json.dump(out, open(os.path.join(HERE, "board_summary.json"), "w"), indent=1)
    print(json.dumps({k: out[k] for k in ("n_ok", "n_pairs", "n_all4_ok", "hypotheses", "by_t", "unscored")}, indent=1))
    for k, v in per.items():
        print(k, json.dumps({a: round(b, 5) if isinstance(b, float) else b for a, b in v.items()}))
    plot(R)


def plot(R):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    tum = json.load(open(os.path.join(HERE, "tum_summary.json")))["windows"]
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for cam, mk in (("left", "o"), ("right", "s")):
        s = [r for r in R if r["cam"] == cam]
        ax[0].scatter([100 * (r["fc"] - r["f"]) / r["f"] for r in s], [100 * (r["fp"] - r["f"]) / r["f"] for r in s],
                      s=8, marker=mk, alpha=0.5, label=f"board, {cam} camera")
    lim = max(abs(100 * (r["fc"] - r["f"]) / r["f"]) for r in R) * 1.05
    ax[0].plot([-lim, lim], [-lim, lim], "k--", lw=0.8, label="re-solve = first order")
    ax[0].set_xlabel("first-order step in f (%), principal point pinned")
    ax[0].set_ylabel("re-solved step in f (%)")
    ax[0].set_title("Board windows: predicted vs re-solved", fontsize=9)
    ax[0].legend(fontsize=8)
    for s, mk in zip(("fr1_desk", "fr1_xyz", "fr3_stf"), "o^s"):
        rs = [r for r in tum if r["seq"] == s]
        ax[1].scatter([100 * r["e"] for r in rs], [100 * r["ec_c"] for r in rs], marker=mk, label=s, alpha=.75)
    v = [100 * r[k] for r in tum for k in ("e", "ec_c")]
    lm = [min(v) - 1, max(v) + 1]
    ax[1].plot(lm, lm, c="grey", lw=.5); ax[1].axhline(0, c="grey", lw=.5)
    ax[1].set_xlim(lm); ax[1].set_ylim(lm)
    ax[1].set_xlabel("f error, as solved (%)"); ax[1].set_ylabel("f error, principal point pinned (%)")
    ax[1].set_title("TUM natural-feature windows, first order", fontsize=9)
    ax[1].legend(fontsize=8)
    fig.suptitle("Self-calibrated focal length with the board's principal point pinned", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "principal.png"), dpi=120)


if __name__ == "__main__":
    main()
