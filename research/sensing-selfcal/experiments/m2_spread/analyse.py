"""Score milestone 2's pre-registered hypotheses (LOG.md) and draw its figure.

    python3 experiments/m2_spread/analyse.py
"""
import json, os
import numpy as np
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
M1 = os.path.join(os.path.dirname(HERE), "m1_real", "results.json")
GATE = 0.005      # accept iff sigma_f / f <= 0.5%
GOOD, BAD = 0.01, 0.02


def rms(a):
    a = np.asarray(a, float)
    return float(np.sqrt(np.mean(a ** 2))) if len(a) else float("nan")


def boot_rms(z, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    z = np.asarray(z)
    b = [rms(rng.choice(z, len(z))) for _ in range(n)]
    return [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]


def rows(R):
    out = []
    for r in R["subsets"]:
        fr = R["cams"][r["cam"]]["zhang_k1"]["f"]
        s, z = r["selfcal"], r["zhang"]
        ok = s is not None and np.isfinite(s["sf"]) and s["sf"] > 0
        out.append(dict(cam=r["cam"], kind=r["kind"], k=r["k"], i=r["i"], spread=r["spread_deg"], ok=ok,
                        conv=bool(ok and s["status"] > 0), f=s["f"] if ok else np.nan,
                        sf=s["sf"] if ok else np.nan, err=abs(s["f"] - fr) / fr if ok else np.nan,
                        z=(s["f"] - fr) / s["sf"] if ok else np.nan, zz=(z["f"] - fr) / z["sf"],
                        zerr=abs(z["f"] - fr) / fr, cond=s["cond_intr"] if ok else np.nan,
                        corr_f_k1=s["corr_f_k1"] if ok else np.nan))
    return out


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    D = rows(R)
    S = {"cams": {}, "convergence": {}, "hypotheses": {}}
    for cam, c in R["cams"].items():
        z1, s = c["zhang_k1"], c["selfcal_all"]
        S["cams"][cam] = dict(zhang_f=z1["f"], zhang_sf=z1["sf"], selfcal_f=s["f"], selfcal_sf=s["sf"],
                              status=s["status"], nfev=s["nfev"], init07_f=c["selfcal_all_init07"]["f"],
                              k2_f=c["selfcal_all_k2"]["f"], rel_gap_pct=100 * (s["f"] - z1["f"]) / z1["f"],
                              spread_all_deg=c["spread_all_deg"], cond_intr=s["cond_intr"])
    S["convergence"] = dict(solves=len(D), failed=sum(not d["ok"] for d in D),
                            converged=sum(d["conv"] for d in D),
                            max_nfev=max(r["selfcal"]["nfev"] for r in R["subsets"] if r["selfcal"]),
                            median_seconds=float(np.median([r["seconds"] for r in R["subsets"]])))
    ok = [d for d in D if d["ok"]]
    # H2 rerun: random subsets, 4-12 views, against milestone 1.
    rnd = [d for d in ok if d["kind"] == "random" and 4 <= d["k"] <= 12]
    zr = [d["z"] for d in rnd]
    m1 = json.load(open(M1))
    m1f = {(r["cam"], r["k"], r["i"]): r["selfcal"] for r in m1["subsets"] if r["selfcal"]}
    m1z = []
    df = []
    for d in rnd:
        o = m1f.get((d["cam"], d["k"], d["i"]))
        if o:
            fr = R["cams"][d["cam"]]["zhang_k1"]["f"]
            m1z.append((o["f"] - fr) / o["sf"]); df.append(abs(o["f"] - d["f"]))
    S["hypotheses"]["H2_rerun"] = dict(n=len(zr), rms_z=rms(zr), ci95=boot_rms(zr), m1_rms_z_same_subsets=rms(m1z),
                                       median_abs_f_change_px=float(np.median(df)), max_abs_f_change_px=float(np.max(df)),
                                       holds=abs(rms(zr) - 1.94) <= 0.2,
                                       zhang_rms_z=rms([d["zz"] for d in rnd]))
    by = {}
    for d in ok:
        key = f'{d["kind"]}_{d["k"]}'
        by.setdefault(key, []).append(d)
    S["by_group"] = {k: dict(n=len(v), rms_z=rms([d["z"] for d in v]), zhang_rms_z=rms([d["zz"] for d in v]),
                             median_err_pct=100 * float(np.median([d["err"] for d in v])),
                             max_err_pct=100 * float(np.max([d["err"] for d in v])),
                             zhang_median_err_pct=100 * float(np.median([d["zerr"] for d in v])),
                             median_spread=float(np.median([d["spread"] for d in v])),
                             median_sf_over_f_pct=100 * float(np.median([d["sf"] / d["f"] for d in v])))
                     for k, v in sorted(by.items(), key=lambda kv: (kv[0].split("_")[0], int(kv[0].split("_")[1])))}
    # H6: spread vs |error|, 4-12 views, pooled kinds, per camera.
    h6 = {}
    for cam in R["cams"]:
        v = [d for d in ok if d["cam"] == cam and 4 <= d["k"] <= 12]
        rho, p = spearmanr([d["spread"] for d in v], [d["err"] for d in v])
        rho_c, _ = spearmanr([d["cond"] for d in v], [d["err"] for d in v])
        rho_s, _ = spearmanr([d["sf"] for d in v], [d["err"] for d in v])
        h6[cam] = dict(n=len(v), rho_spread_err=float(rho), p=float(p), rho_cond_err=float(rho_c),
                       rho_sigma_err=float(rho_s))
    h6["holds"] = all(h6[c]["rho_spread_err"] <= -0.3 for c in R["cams"])
    S["hypotheses"]["H6"] = h6
    # H7: near-critical subsets.
    near = [d for d in ok if d["kind"] == "near"]
    zn = [d["z"] for d in near]
    S["hypotheses"]["H7"] = dict(n=len(near), rms_z=rms(zn), ci95=boot_rms(zn), holds=rms(zn) <= 2,
                                 rms_z_4to6=rms([d["z"] for d in near if d["k"] >= 4]),
                                 zhang_rms_z=rms([d["zz"] for d in near]),
                                 frac_abs_z_gt_3=float(np.mean(np.abs(zn) > 3)))
    # H4 first test: precision gate.
    good = [d for d in ok if d["err"] <= GOOD]
    bad = [d for d in ok if d["err"] > BAD]
    acc = lambda v: float(np.mean([d["sf"] / d["f"] <= GATE for d in v])) if v else float("nan")
    S["hypotheses"]["H4_gate"] = dict(gate_sigma_over_f=GATE, n_good=len(good), n_bad=len(bad),
                                      n_between=len(ok) - len(good) - len(bad),
                                      accept_good=acc(good), reject_bad=1 - acc(bad) if bad else float("nan"),
                                      holds=bool(bad) and acc(good) >= 0.9 and 1 - acc(bad) >= 0.9,
                                      bad_accepted=[dict(cam=d["cam"], kind=d["kind"], k=d["k"], i=d["i"],
                                                         err_pct=100 * d["err"], sf_over_f_pct=100 * d["sf"] / d["f"])
                                                    for d in bad if d["sf"] / d["f"] <= GATE])
    # Unplanned, reported as such: the same gate with sigma inflated by 2 (milestone 1's measured factor).
    acc2 = lambda v: float(np.mean([2 * d["sf"] / d["f"] <= GATE for d in v])) if v else float("nan")
    S["unplanned"] = dict(gate_with_sigma_x2=dict(accept_good=acc2(good), reject_bad=1 - acc2(bad) if bad else None))
    # Unplanned (named in milestone 1's next steps): inflate sigma by kappa = rms z fitted on
    # one camera's random 4-12-view subsets, and test on the other camera's subsets.
    xc = {}
    for fit, test in (("left", "right"), ("right", "left")):
        kap = rms([d["z"] for d in rnd if d["cam"] == fit])
        for kind in ("random", "near"):
            v = [d for d in ok if d["cam"] == test and d["kind"] == kind and d["k"] >= 4]
            zt = np.array([d["z"] for d in v]) / kap
            xc[f"fit_{fit}_test_{test}_{kind}"] = dict(kappa=kap, n=len(v), rms_z=rms(zt),
                                                       cover_2sigma=float(np.mean(np.abs(zt) <= 2)))
    S["unplanned"]["cross_camera_inflation"] = xc
    json.dump(S, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(json.dumps(S["hypotheses"], indent=1)[:4000])
    print(json.dumps(S["by_group"], indent=1)[:3000])
    print(S["convergence"], S["cams"], S["unplanned"])
    figure(ok)


def figure(ok):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for kind, mk, col in (("random", "o", "#3b6ea8"), ("near", "^", "#c8553d")):
        v = [d for d in ok if d["kind"] == kind]
        ax[0].scatter([d["spread"] for d in v], [100 * d["err"] for d in v], s=12, marker=mk, c=col, alpha=.6,
                      label=f"{kind} subsets" if kind == "random" else "near-critical subsets")
        ax[1].scatter([100 * d["sf"] / d["f"] for d in v], [100 * d["err"] for d in v], s=12, marker=mk, c=col, alpha=.6)
    ax[0].set_yscale("log"); ax[1].set_yscale("log"); ax[1].set_xscale("log")
    ax[0].set_xlabel("view spread: largest angle between board normals (deg)")
    ax[0].set_ylabel("|f error| vs all-view Zhang (%)")
    ax[1].set_xlabel("reported σ_f / f (%)")
    lo, hi = ax[1].get_xlim()
    x = np.logspace(np.log10(lo), np.log10(hi), 10)
    ax[1].plot(x, x, "k--", lw=.8, label="error = σ")
    ax[1].plot(x, 2 * x, "k:", lw=.8, label="error = 2σ")
    ax[1].axvline(100 * GATE, color="grey", lw=.8)
    ax[0].legend(fontsize=8); ax[1].legend(fontsize=8)
    ax[0].set_title("Geometry vs error (both cameras)", fontsize=10)
    ax[1].set_title("Reported σ vs error; grey line = 0.5% gate", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "spread_vs_error.png"), dpi=130)


if __name__ == "__main__":
    main()
