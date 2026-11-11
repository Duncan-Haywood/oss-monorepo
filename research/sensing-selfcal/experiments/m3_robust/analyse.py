"""Score milestone 3's pre-registered hypotheses (LOG.md, H8-H10, H4 second test) and draw its figure.

    python3 experiments/m3_robust/analyse.py
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = 0.005
GOOD, BAD = 0.01, 0.02
SIGMAS = ("sf", "sf_cr_view", "sf_cr_point", "sf_hc0", "sf_jack")
LABEL = {"sf": "reported (Gauss-Newton)", "sf_cr_view": "sandwich, by view", "sf_cr_point": "sandwich, by corner",
         "sf_hc0": "sandwich, unclustered", "sf_jack": "jackknife over views"}


def rms(a):
    a = np.asarray(a, float)
    return float(np.sqrt(np.mean(a ** 2))) if len(a) else float("nan")


def boot_rms(z, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    z = np.asarray(z)
    b = [rms(rng.choice(z, len(z))) for _ in range(n)]
    return [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]


def auc(bad, good):
    """P(score of a bad update > score of a good one), ties count half."""
    bad, good = np.asarray(bad), np.asarray(good)
    if not len(bad) or not len(good):
        return float("nan")
    gt = (bad[:, None] > good[None, :]).mean()
    eq = (bad[:, None] == good[None, :]).mean()
    return float(gt + 0.5 * eq)


def rows(R):
    out = []
    for r in R["subsets"]:
        c = R["cams"][r["cam"]]
        fr = c["zhang_k1"]["f"]
        s = r["selfcal"]
        if s is None or not np.isfinite(s["sf"]) or s["sf"] <= 0:
            continue
        d = dict(cam=r["cam"], kind=r["kind"], k=r["k"], i=r["i"], f=s["f"], conv=s["status"] > 0,
                 err=abs(s["f"] - fr) / fr, dz=s["f"] - fr, f_all=c["selfcal_all"]["f"])
        for key in SIGMAS[:-1]:
            d[key] = s[key]
        d["sf_jack"] = r["jack"]["sf_jack"] if r["jack"] else np.nan
        d["loo_conv"] = (r["jack"]["loo_converged"], r["jack"]["loo_n"]) if r["jack"] else None
        out.append(d)
    return out


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    D = rows(R)
    S = {"cams": {}, "hypotheses": {}, "by_size": {}, "unplanned": {}}
    for cam, c in R["cams"].items():
        s = c["selfcal_all"]
        S["cams"][cam] = dict(zhang_f=c["zhang_k1"]["f"], zhang_sf=c["zhang_k1"]["sf"], f=s["f"],
                              **{k: s[k] for k in SIGMAS[:-1]}, sf_jack=c["jack_all"]["sf_jack"],
                              jack_f_loo=c["jack_all"]["f_loo"])
    loo = [d["loo_conv"] for d in D if d["loo_conv"]]
    S["convergence"] = dict(subsets=len(R["subsets"]), usable=len(D), converged=sum(d["conv"] for d in D),
                            loo_solves=sum(n for _, n in loo), loo_converged=sum(c for c, _ in loo),
                            median_seconds=float(np.median([r["seconds"] for r in R["subsets"]])))
    rnd = [d for d in D if d["kind"] == "random" and 4 <= d["k"] <= 12]
    near = [d for d in D if d["kind"] == "near" and d["k"] >= 4]
    # H8: self-consistency against the target-free all-view f, nested variance.
    h8 = {}
    for key in ("sf", "sf_jack"):
        zs, cams, dropped = [], [], 0
        for d in rnd:
            sa = S["cams"][d["cam"]][key]
            v = d[key] ** 2 - sa ** 2
            if not np.isfinite(v) or v <= 0:
                dropped += 1
                continue
            zs.append((d["f"] - d["f_all"]) / np.sqrt(v)); cams.append(d["cam"])
        h8[key] = dict(n=len(zs), dropped=dropped, rms_z=rms(zs), ci95=boot_rms(zs),
                       per_cam={c: rms([z for z, cc in zip(zs, cams) if cc == c]) for c in R["cams"]})
    h8["holds"] = h8["sf"]["rms_z"] > 1.5
    S["hypotheses"]["H8_nested"] = h8
    # H9: rms z against all-view Zhang per sigma, per camera, random 4-12.
    h9 = {}
    for key in SIGMAS:
        h9[key] = {}
        for cam in R["cams"]:
            z = [d["dz"] / d[key] for d in rnd if d["cam"] == cam and np.isfinite(d[key]) and d[key] > 0]
            h9[key][cam] = dict(n=len(z), rms_z=rms(z), ci95=boot_rms(z), cover_2sigma=float(np.mean(np.abs(z) <= 2)))
        z = [d["dz"] / d[key] for d in rnd if d["k"] <= 6 and np.isfinite(d[key]) and d[key] > 0]
        h9[key]["rms_z_4to6"] = rms(z)
        zn = [d["dz"] / d[key] for d in near if np.isfinite(d[key]) and d[key] > 0]
        h9[key]["near_4to6"] = dict(n=len(zn), rms_z=rms(zn), cover_2sigma=float(np.mean(np.abs(zn) <= 2)) if zn else None)
    h9["holds_jack"] = all(0.7 <= h9["sf_jack"][c]["rms_z"] <= 1.4 for c in R["cams"])
    h9["sandwich_fails_4to6_as_predicted"] = h9["sf_cr_view"]["rms_z_4to6"] > 1.4
    S["hypotheses"]["H9"] = h9
    # rms z by size for the figure and table.
    for cam in R["cams"]:
        for k in range(4, 13):
            v = [d for d in rnd if d["cam"] == cam and d["k"] == k]
            S["by_size"][f"{cam}_{k}"] = {key: rms([d["dz"] / d[key] for d in v]) for key in SIGMAS}
            S["by_size"][f"{cam}_{k}"]["median_ratio_jack_over_sf"] = float(np.median([d["sf_jack"] / d["sf"] for d in v]))
            S["by_size"][f"{cam}_{k}"]["median_ratio_crview_over_sf"] = float(np.median([d["sf_cr_view"] / d["sf"] for d in v]))
    # H10: AUC of sigma/f, bad vs good, all subsets of 4-12 views, both cameras.
    pool = [d for d in D if d["k"] >= 4 and np.isfinite(d["sf_jack"])]
    good = [d for d in pool if d["err"] <= GOOD]
    bad = [d for d in pool if d["err"] > BAD]
    sc = lambda v, key: [d[key] / d["f"] for d in v]
    h10 = {"n_good": len(good), "n_bad": len(bad), "auc": {key: auc(sc(bad, key), sc(good, key)) for key in SIGMAS}}
    rng = np.random.default_rng(1)
    diffs = []
    for _ in range(2000):
        g = [good[i] for i in rng.integers(0, len(good), len(good))]
        b = [bad[i] for i in rng.integers(0, len(bad), len(bad))]
        diffs.append(auc(sc(b, "sf_jack"), sc(g, "sf_jack")) - auc(sc(b, "sf"), sc(g, "sf")))
    h10["auc_diff_jack_minus_sf"] = h10["auc"]["sf_jack"] - h10["auc"]["sf"]
    h10["auc_diff_ci95"] = [float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))]
    h10["holds"] = h10["auc_diff_ci95"][0] > 0
    S["hypotheses"]["H10"] = h10
    # H4 second test: fixed gate on the jackknife sigma.
    acc = lambda v, key, t: float(np.mean([d[key] / d["f"] <= t for d in v])) if v else float("nan")
    h4 = {}
    for key in SIGMAS:
        h4[key] = dict(accept_good=acc(good, key, GATE), reject_bad=1 - acc(bad, key, GATE))
    ng = [d for d in good if d["kind"] == "near"]
    nb = [d for d in bad if d["kind"] == "near"]
    h4["near_only_jack"] = dict(n_good=len(ng), n_bad=len(nb), accept_good=acc(ng, "sf_jack", GATE),
                                reject_bad=1 - acc(nb, "sf_jack", GATE))
    h4["holds"] = h4["sf_jack"]["accept_good"] >= 0.9 and h4["sf_jack"]["reject_bad"] >= 0.9
    # Transfer: threshold maximising min(accept good, reject bad) on one camera, scored on the other.
    tr = {}
    for key in SIGMAS:
        for fit, test in (("left", "right"), ("right", "left")):
            gf = [d for d in good if d["cam"] == fit]; bf = [d for d in bad if d["cam"] == fit]
            gt = [d for d in good if d["cam"] == test]; bt = [d for d in bad if d["cam"] == test]
            cands = sorted(set(sc(gf + bf, key)))
            best = max(cands, key=lambda t: min(acc(gf, key, t), 1 - acc(bf, key, t)))
            tr[f"{key}_fit_{fit}"] = dict(threshold_pct=100 * best, fit_accept_good=acc(gf, key, best),
                                          fit_reject_bad=1 - acc(bf, key, best), test_accept_good=acc(gt, key, best),
                                          test_reject_bad=1 - acc(bt, key, best), test_n_good=len(gt), test_n_bad=len(bt))
    h4["transfer"] = tr
    S["hypotheses"]["H4_second"] = h4
    json.dump(S, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(json.dumps({k: S[k] for k in ("cams", "convergence")}, indent=1))
    print(json.dumps(S["hypotheses"], indent=1))
    print(json.dumps(S["by_size"], indent=1)[:3000])
    figure(S)


def figure(S):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
    ks = list(range(4, 13))
    sty = {"sf": ("#555555", "o-"), "sf_hc0": ("#8a8a8a", "x:"), "sf_cr_point": ("#7a5195", "s--"),
           "sf_cr_view": ("#c8553d", "^-"), "sf_jack": ("#3b6ea8", "D-")}
    for a, cam in zip(ax, ("left", "right")):
        for key in SIGMAS:
            col, ls = sty[key]
            a.plot(ks, [S["by_size"][f"{cam}_{k}"][key] for k in ks], ls, color=col, ms=4, lw=1.2, label=LABEL[key])
        a.axhline(1, color="k", lw=.8)
        a.axhspan(0.7, 1.4, color="#3b6ea8", alpha=.08)
        a.set_yscale("log")
        a.set_xlabel("views in the subset (20 random subsets each)")
        a.set_title(f"{cam} camera", fontsize=10)
    ax[0].set_ylabel("rms z of f against all-view Zhang (1 = honest)")
    ax[0].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "rms_z_by_sigma.png"), dpi=130)


if __name__ == "__main__":
    main()
