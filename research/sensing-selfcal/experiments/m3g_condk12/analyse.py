"""Milestone 3g: condition each natural-feature window's focal length on BOTH distortion terms
(k1, k2) a robot already knows from its last board calibration.

Analysis only (the TUM host refused the proxy, so no re-solve; that is milestone 3h). Milestone 3f
conditioned on k1 alone because corr(k1, k2) seemed unstored; milestone 3b's results.json keeps the
full 5x5 intrinsics covariance of every start, and the lowest-cost start is exactly milestone 3c's
solve (asserted below). Reads ../m3b_natural/results.json, ../m3c_jackknife/{results,summary}.json,
../m3f_condk1/summary.json (to reproduce its k1-only numbers) and ../m4n_k2/summary.json (reference
distortion). Writes summary.json and condk12.png here. H144-H148 were written in LOG.md before this
script first ran.

Conditioned estimate (Gaussian conditioning on a subset k of the intrinsics, the rest free):
    f_c = f + S_fk S_kk^-1 (k_ref - k),   sd ratio = sqrt(S_ff - S_fk S_kk^-1 S_kf) / sqrt(S_ff)
The covariance's scale cancels in f_c and in the ratio; only its shape enters.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(EXP, "m3d_pool"))
import pool  # noqa: E402

SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
IDX = {"f": 0, "cx": 1, "cy": 2, "k1": 3, "k2": 4}


def condition(intr, cov, which, ref):
    """f given intrinsics[which] = ref under N(intr, cov). Returns (f_c, conditional/marginal sd ratio)."""
    intr, cov = np.asarray(intr, float), np.asarray(cov, float)
    j = [IDX[w] for w in which]
    S_fk = cov[0, j]
    S_kk = cov[np.ix_(j, j)]
    g = np.linalg.solve(S_kk, S_fk)
    fc = intr[0] + g @ (np.asarray(ref, float) - intr[j])
    var_c = cov[0, 0] - S_fk @ g
    return float(fc), float(np.sqrt(max(var_c, 0.0) / cov[0, 0]))


def best_start(w):
    sols = [s for s in w["starts"] if "intr" in s]
    return min(sols, key=lambda s: s["cost"])


def load():
    m4n = json.load(open(os.path.join(EXP, "m4n_k2", "summary.json")))["zhang"]
    dref = {u: m4n[u]["k1k2"]["d"][:2] for u in ("fr1", "fr3")}
    m3b = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3b_natural", "results.json")))["windows"]}
    m3c = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3c_jackknife", "results.json")))["windows"]}
    m3f = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3f_condk1", "summary.json")))["windows"]}
    rows = []
    for w in json.load(open(os.path.join(EXP, "m3c_jackknife", "summary.json")))["windows"]:
        if w["why"] != "ok":
            continue
        key = (w["seq"], w["window"])
        b, c = best_start(m3b[key]), m3c[key]
        intr, cov = np.array(b["intr"]), np.array(b["cov"])
        assert np.allclose(intr, c["intr"], rtol=1e-9, atol=1e-12), key
        assert np.allclose(np.sqrt(np.diag(cov)), c["sd"], rtol=1e-9), key
        k1r, k2r = dref[w["unit"]]
        fc1, r1 = condition(intr, cov, ("k1",), (k1r,))
        assert abs(fc1 - m3f[key]["fc"]) < 1e-6 * fc1, (key, fc1, m3f[key]["fc"])
        fc2, r2 = condition(intr, cov, ("k1", "k2"), (k1r, k2r))
        fck2, _ = condition(intr, cov, ("k2",), (k2r,))
        sd = np.sqrt(np.diag(cov))
        ref = w["ref"]
        rows.append({"seq": w["seq"], "unit": w["unit"], "window": w["window"], "ref": ref,
                     "f": intr[0], "fc1": fc1, "fc2": fc2, "fck2": fck2,
                     "e": (intr[0] - ref) / ref, "ec1": (fc1 - ref) / ref, "ec2": (fc2 - ref) / ref,
                     "eck2": (fck2 - ref) / ref, "step2": abs(fc2 - intr[0]) / intr[0],
                     "corr_k1k2": float(cov[3, 4] / (sd[3] * sd[4])), "sd_ratio_c2": r2, "sd_ratio_c1": r1,
                     "sd_jk": w["sd_jk"], "sd_jk_c2": w["sd_jk"] * r2})
    rows.sort(key=lambda r: (r["seq"], r["window"]))
    return rows, dref


def main():
    rows, dref = load()
    A = lambda k, rs=rows: np.array([r[k] for r in rs])  # noqa: E731
    per = {}
    for s in SEQS:
        rs = [r for r in rows if r["seq"] == s]
        per[s] = {"n": len(rs),
                  **{f"median_{k}": float(np.median(A(k, rs)))
                     for k in ("e", "ec1", "ec2", "eck2", "step2", "corr_k1k2", "sd_ratio_c2", "sd_ratio_c1")},
                  **{f"median_abs_{k}": float(np.median(abs(A(k, rs)))) for k in ("e", "ec1", "ec2", "eck2")}}
    h = {}
    m_e, m_c2 = float(np.median(abs(A("e")))), float(np.median(abs(A("ec2"))))
    h["H144"] = {"median_abs_e": m_e, "median_abs_ec2": m_c2, "ratio": m_c2 / m_e, "held": m_c2 <= 0.6 * m_e}
    x = per["fr1_xyz"]["median_ec2"]
    h["H145"] = {"median_ec2_xyz": x, "held": abs(x) <= 0.015}
    h["H146"] = {s: {"median_abs_ec2": per[s]["median_abs_ec2"], "median_abs_ec1": per[s]["median_abs_ec1"]}
                 for s in ("fr1_desk", "fr1_xyz")}
    h["H146"]["held"] = all(h["H146"][s]["median_abs_ec2"] < h["H146"][s]["median_abs_ec1"]
                            for s in ("fr1_desk", "fr1_xyz"))
    h["H147"] = {"median_abs_ec2_fr3": per["fr3_stf"]["median_abs_ec2"], "median_abs_e_fr3": per["fr3_stf"]["median_abs_e"],
                 "held": per["fr3_stf"]["median_abs_ec2"] <= per["fr3_stf"]["median_abs_e"]}
    st = float(np.median(A("step2")))
    h["H148"] = {"median_step2": st, "held": st <= 0.10}
    un = {"median_abs_eck2_all": float(np.median(abs(A("eck2")))), "pool_k5": {}}
    for name, fk, sk in (("raw", "f", "sd_jk"), ("conditioned_k1k2", "fc2", "sd_jk_c2")):
        bl = []
        for s in SEQS:
            rs = [{"window": r["window"], "ref": r["ref"], "f": r[fk], "sd_jk": r[sk]} for r in rows if r["seq"] == s]
            b = pool.blocks(rs, 5)
            un["pool_k5"].setdefault(name, {})[s] = pool.score(b)
            bl += b
        un["pool_k5"][name]["all"] = pool.score(bl)
    out = {"n_scored": len(rows), "reference_distortion": dref, "hypotheses": h,
           "per_sequence": per, "unscored": un, "windows": rows}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in h.items():
        print(k, json.dumps(v))
    for s, v in per.items():
        print(s, json.dumps({k: round(x, 4) if isinstance(x, float) else x for k, x in v.items()}))
    print("median |e| conditioning on k2 alone:", round(un["median_abs_eck2_all"], 4))
    for name in un["pool_k5"]:
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
        ax[0].scatter([100 * r["e"] for r in rs], [100 * r["ec1"] for r in rs], marker=mk, label=s, alpha=.75)
        ax[1].scatter([100 * r["e"] for r in rs], [100 * r["ec2"] for r in rs], marker=mk, label=s, alpha=.75)
    vals = [100 * r[k] for r in rows for k in ("e", "ec1", "ec2")]
    lim = [min(vals) - 1, max(vals) + 1]
    for a, t in zip(ax, ("k1 pinned (milestone 3f)", "k1 and k2 pinned (milestone 3g)")):
        a.plot(lim, lim, c="grey", lw=.5); a.axhline(0, c="grey", lw=.5)
        a.set_xlim(lim); a.set_ylim(lim)
        a.set_xlabel("f error, as solved (%)"); a.set_ylabel("f error, conditioned (%)")
        a.set_title(t, fontsize=9)
    ax[0].legend(fontsize=8)
    fig.suptitle("Self-calibrated focal length with the board's distortion pinned, first order", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "condk12.png"), dpi=110)


if __name__ == "__main__":
    main()
