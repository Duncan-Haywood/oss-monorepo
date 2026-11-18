"""Milestone 3f: condition each natural-feature window's focal length on the k1 a robot already knows.

Analysis only (the TUM host refused the proxy, so no re-solve). Reads milestone 3c's per-window solves
(../m3c_jackknife/results.json: intrinsics f, cx, cy, k1, k2 and their solver sd), 3c's scoring
(../m3c_jackknife/summary.json: scored windows, reference f, sd_jk) and milestone 3e's corr(f, k1) from
the same solves (../m3e_axis/results.json). The reference distortion is milestone 4n's k1 + k2 board fit.
Writes summary.json and condk1.png here. H140-H143 were written in LOG.md before this script first ran.

Conditioned estimate (Gaussian conditioning on k1 = k1_ref under the solver's covariance, k2 free):
    f_c = f + rho_fk1 * (sd_f / sd_k1) * (k1_ref - k1)
The covariance's scale cancels in the coefficient; only its shape enters.
"""
import json, os, sys
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(EXP, "m3d_pool"))
import pool  # noqa: E402

SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")


def conditioned_f(f, k1, k1_ref, sd_f, sd_k1, rho):
    """First-order f given k1 = k1_ref (bivariate Gaussian conditioning)."""
    return f + rho * (sd_f / sd_k1) * (k1_ref - k1)


def conditional_sd(sd, rho):
    return sd * np.sqrt(max(0.0, 1 - rho ** 2))


def load():
    m4n = json.load(open(os.path.join(EXP, "m4n_k2", "summary.json")))["zhang"]
    dref = {u: m4n[u]["k1k2"]["d"][:2] for u in ("fr1", "fr3")}
    res = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3c_jackknife", "results.json")))["windows"]}
    cor = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3e_axis", "results.json")))["windows"]}
    rows = []
    for w in json.load(open(os.path.join(EXP, "m3c_jackknife", "summary.json")))["windows"]:
        if w["why"] != "ok":
            continue
        key = (w["seq"], w["window"])
        r, c = res[key], cor[key]
        assert abs(r["intr"][0] - w["f"]) < 1e-6 * w["f"], key
        assert abs(c["f"] - w["f"]) < 1e-3 * w["f"], key
        k1r, k2r = dref[w["unit"]]
        f, k1, k2 = r["intr"][0], r["intr"][3], r["intr"][4]
        rho = c["corr_f_k1"]
        fc = conditioned_f(f, k1, k1r, r["sd"][0], r["sd"][3], rho)
        rows.append({"seq": w["seq"], "unit": w["unit"], "window": w["window"], "ref": w["ref"],
                     "f": f, "fc": fc, "k1": k1, "k2": k2, "dk1": k1 - k1r, "dk2": k2 - k2r,
                     "rho": rho, "rho_k2": c["corr_f_k2"], "sd_jk": w["sd_jk"],
                     "sd_jk_c": conditional_sd(w["sd_jk"], rho),
                     "e": (f - w["ref"]) / w["ref"], "ec": (fc - w["ref"]) / w["ref"],
                     "step": abs(fc - f) / f})
    rows.sort(key=lambda r: (r["seq"], r["window"]))
    return rows, dref


def ols(e, X):
    X = np.column_stack([np.ones(len(e))] + list(X))
    b, *_ = np.linalg.lstsq(X, e, rcond=None)
    resid = e - X @ b
    return [float(x) for x in b], float(1 - resid.var() / np.var(e))


def main():
    rows, dref = load()
    A = lambda k, rs=rows: np.array([r[k] for r in rs])  # noqa: E731
    e, ec = A("e"), A("ec")
    per = {}
    for s in SEQS:
        rs = [r for r in rows if r["seq"] == s]
        per[s] = {"n": len(rs), **{f"median_{k}": float(np.median(A(k, rs)))
                                   for k in ("k1", "k2", "dk1", "dk2", "e", "ec", "rho", "step")},
                  "median_abs_e": float(np.median(abs(A("e", rs)))),
                  "median_abs_ec": float(np.median(abs(A("ec", rs)))),
                  "spearman_dk1_e": float(stats.spearmanr(A("dk1", rs), A("e", rs))[0])}
    h = {}
    rho140 = float(stats.spearmanr(A("dk1"), e)[0])
    h["H140"] = {"spearman_dk1_e": rho140, "held": rho140 >= 0.5}
    m_all, m_c = float(np.median(abs(e))), float(np.median(abs(ec)))
    h["H141"] = {"median_abs_e": m_all, "median_abs_ec": m_c, "ratio": m_c / m_all, "held": m_c <= 0.6 * m_all}
    x = per["fr1_xyz"]["median_ec"]
    h["H142"] = {"median_ec_xyz": x, "held": abs(x) <= 0.015}
    st = float(np.median(A("step")))
    h["H143"] = {"median_step": st, "held": st <= 0.10}
    un = {"spearman_dk2_e": float(stats.spearmanr(A("dk2"), e)[0]),
          "spearman_dk1_dk2": float(stats.spearmanr(A("dk1"), A("dk2"))[0]),
          "ols_per_unit": {}, "pool_k5": {}}
    for u in ("fr1", "fr3"):
        rs = [r for r in rows if r["unit"] == u]
        b1, r2_1 = ols(A("e", rs), [A("dk1", rs)])
        b2, r2_2 = ols(A("e", rs), [A("dk1", rs), A("dk2", rs)])
        un["ols_per_unit"][u] = {"n": len(rs), "dk1": {"coef": b1, "r2": r2_1},
                                 "dk1_dk2": {"coef": b2, "r2": r2_2}}
    for name, fk, sk in (("raw", "f", "sd_jk"), ("conditioned", "fc", "sd_jk_c")):
        bl = []
        for s in SEQS:
            rs = [{"window": r["window"], "ref": r["ref"], "f": r[fk], "sd_jk": r[sk]}
                  for r in rows if r["seq"] == s]
            b = pool.blocks(rs, 5)
            un["pool_k5"].setdefault(name, {})[s] = pool.score(b)
            bl += b
        un["pool_k5"][name]["all"] = pool.score(bl)
    # Post hoc (added after H140-H143 were read; labelled so in LOG.md): radial distortion factor
    # 1 + k1 r^2 + k2 r^4 of each window against the board's, at normalised radii up to the image
    # corner (640x480 at f ~ 520 px: about 0.77).
    radial = {}
    for s in SEQS:
        rs = [r for r in rows if r["seq"] == s]
        k1r, k2r = dref[rs[0]["unit"]]
        radial[s] = {}
        for rad in (0.2, 0.4, 0.6, 0.77):
            d = [(r["k1"] - k1r) * rad ** 2 + (r["k2"] - k2r) * rad ** 4 for r in rs]
            radial[s][str(rad)] = {"median_factor_diff": float(np.median(d)),
                                   "board_factor": float(1 + k1r * rad ** 2 + k2r * rad ** 4)}
    un["post_hoc_radial"] = radial
    out = {"n_scored": len(rows), "reference_distortion": dref, "hypotheses": h,
           "per_sequence": per, "unscored": un, "windows": rows}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in h.items():
        print(k, json.dumps(v))
    for s, v in per.items():
        print(s, json.dumps({k: round(x, 4) if isinstance(x, float) else x for k, x in v.items()}))
    print("unscored", json.dumps({k: v for k, v in un.items() if k not in ("pool_k5", "post_hoc_radial")}))
    print("post_hoc_radial", json.dumps(radial))
    for name in ("raw", "conditioned"):
        p = un["pool_k5"][name]
        print("pool", name, {s: (round(p[s]["re"]["rms_z"], 2), round(100 * p[s]["re"]["median_abs_rel"], 2),
                                 round(100 * p[s]["med"]["median_abs_rel"], 2)) for s in (*SEQS, "all")})
    figure(rows)


def figure(rows):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for s, mk in zip(SEQS, "o^s"):
        rs = [r for r in rows if r["seq"] == s]
        ax[0].scatter([r["dk1"] for r in rs], [100 * r["e"] for r in rs], marker=mk, label=s, alpha=.75)
        ax[1].scatter([100 * r["e"] for r in rs], [100 * r["ec"] for r in rs], marker=mk, label=s, alpha=.75)
    ax[0].axhline(0, c="grey", lw=.5); ax[0].axvline(0, c="grey", lw=.5)
    ax[0].set_xlabel("k1 of the window minus board k1"); ax[0].set_ylabel("f error vs board (%)")
    lim = [min(100 * min(r["e"] for r in rows), 100 * min(r["ec"] for r in rows)) - 1,
           max(100 * max(r["e"] for r in rows), 100 * max(r["ec"] for r in rows)) + 1]
    ax[1].plot(lim, lim, c="grey", lw=.5); ax[1].axhline(0, c="grey", lw=.5)
    ax[1].set_xlabel("f error, as solved (%)"); ax[1].set_ylabel("f error, conditioned on board k1 (%)")
    ax[0].legend(fontsize=8)
    ax[0].set_title("Milestone 3f: does k1 carry the focal error?", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "condk1.png"), dpi=110)


if __name__ == "__main__":
    main()
