"""Score milestone 5's pre-registered hypotheses (LOG.md, H11-H13) and draw its figure.

    python3 experiments/m5_lens/analyse.py
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M3 = os.path.join(os.path.dirname(HERE), "m3_robust", "results.json")


def rms(a):
    a = np.asarray(a, float)
    return float(np.sqrt(np.mean(a ** 2))) if len(a) else float("nan")


def boot_rms(z, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    z = np.asarray(z)
    b = [rms(rng.choice(z, len(z))) for _ in range(n)]
    return [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]


def nested(subs, alls, key):
    """z_n = (f_sub - f_all) / sqrt(sf_sub^2 - sf_all^2) over random subsets of 4-12 views."""
    zs, ks, cams, dropped = [], [], [], 0
    for r in subs:
        s = r[key]
        if r["kind"] != "random" or not 4 <= r["k"] <= 12 or s is None:
            continue
        a = alls[r["cam"]]
        v = s["sf"] ** 2 - a["sf"] ** 2
        if v <= 0:
            dropped += 1
            continue
        zs.append((s["f"] - a["f"]) / np.sqrt(v)); ks.append(r["k"]); cams.append(r["cam"])
    zs, ks, cams = np.array(zs), np.array(ks), np.array(cams)
    big = np.argsort(-np.abs(zs))
    return dict(n=len(zs), dropped=dropped, rms_z=rms(zs), ci95=boot_rms(zs),
                median_abs_z=float(np.median(np.abs(zs))), rms_z_without_top5=rms(zs[big[5:]]),
                top5_z=[float(zs[i]) for i in big[:5]],
                per_cam={c: rms(zs[cams == c]) for c in ("left", "right")},
                by_size={int(k): rms(zs[ks == k]) for k in sorted(set(ks.tolist()))})


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    m3 = json.load(open(M3))
    S = {"cams": {}, "hypotheses": {}, "unplanned": {}}
    h11, h13 = {}, {}
    for cam, c in R["cams"].items():
        row = {}
        for nk in (1, 2):
            tf, ro, fl = c[f"selfcal_k{nk}"], c[f"zhang_ro_k{nk}"], c[f"zhang_flat_k{nk}"]
            sq = lambda a, b, k: float(np.hypot(a["s" + k], b["s" + k]))
            row[f"k{nk}"] = dict(
                f=dict(flat=fl["f"], ro=ro["f"], selfcal=tf["f"]),
                cy=dict(flat=fl["cy"], ro=ro["cy"], selfcal=tf["cy"]),
                scy=dict(flat=fl["scy"], ro=ro["scy"], selfcal=tf["scy"]),
                cy_gap_ro_sigma=abs(ro["cy"] - tf["cy"]) / sq(ro, tf, "cy"),
                cy_gap_flat_sigma=abs(fl["cy"] - tf["cy"]) / sq(fl, tf, "cy"),
                cy_flat_minus_ro_px=fl["cy"] - ro["cy"],
                f_gap_ro_px=ro["f"] - tf["f"], f_flat_minus_ro_px=fl["f"] - ro["f"],
                rms_px=dict(flat=fl["rms"], ro=ro["rms"], selfcal=tf["rms"]),
                resid_corr=dict(flat=fl["resid_corr"], ro=ro["resid_corr"], selfcal=tf["resid_corr"]),
                board_heights_corr_ro_vs_selfcal=float(np.corrcoef(ro["board_heights"], tf["board_heights"])[0, 1]),
                board_rms_ro=ro["board_planarity"]["rms"], board_rms_selfcal=tf["board_planarity"]["rms"])
        row["f_shift_k2_px"] = dict(flat=c["zhang_flat_k2"]["f"] - c["zhang_flat_k1"]["f"],
                                    selfcal=c["selfcal_k2"]["f"] - c["selfcal_k1"]["f"])
        row["k2"]["k2_value"] = dict(selfcal=c["selfcal_k2"]["k2"], sk2=c["selfcal_k2"]["sk2"])
        S["cams"][cam] = row
        h11[cam] = row["k1"]["cy_gap_ro_sigma"]
        h13[cam] = row["k2"]["resid_corr"]["selfcal"]["both"]
    S["hypotheses"]["H11"] = dict(cy_gap_ro_sigma=h11, holds=all(v < 2 for v in h11.values()),
                                  note="RO and target-free agree to numerical precision: the same problem up to gauge")
    S["hypotheses"]["H13"] = dict(neighbour_corr_k2=h13, holds=all(v >= 0.1 for v in h13.values()))
    # H12: nested self-consistency with k1+k2.
    alls2 = {cam: c["selfcal_k2"] for cam, c in R["cams"].items()}
    h12 = nested(R["subsets"], alls2, "selfcal_k2")
    alls1 = {cam: c["selfcal_all"] for cam, c in m3["cams"].items()}
    h12_k1 = nested(m3["subsets"], alls1, "selfcal")
    S["hypotheses"]["H12"] = dict(k2=h12, k1_m3=h12_k1, holds=h12["rms_z"] > 1.5)
    conv = [r["selfcal_k2"]["status"] > 0 for r in R["subsets"] if r["selfcal_k2"]]
    S["convergence"] = dict(subsets=len(R["subsets"]), converged=int(sum(conv)),
                            max_nfev=int(max(r["selfcal_k2"]["nfev"] for r in R["subsets"])))
    # Unplanned/unscored: z of the k1+k2 subsets against the RO k1+k2 reference; errors k1 vs k2.
    m3k = {(r["cam"], r["kind"], r["k"], r["i"]): r["selfcal"] for r in m3["subsets"]}
    zr, zr1, e1, e2 = [], [], [], []
    for r in R["subsets"]:
        if r["kind"] != "random" or not 4 <= r["k"] <= 12:
            continue
        ref = R["cams"][r["cam"]]["zhang_ro_k2"]["f"]
        s2 = r["selfcal_k2"]; s1 = m3k[(r["cam"], r["kind"], r["k"], r["i"])]
        zr.append((s2["f"] - ref) / s2["sf"])
        zr1.append((s1["f"] - R["cams"][r["cam"]]["zhang_ro_k1"]["f"]) / s1["sf"])
        e2.append(abs(s2["f"] - ref) / ref)
        e1.append(abs(s1["f"] - R["cams"][r["cam"]]["zhang_ro_k1"]["f"]) / ref)
    S["unplanned"]["rms_z_k2_vs_ro_k2"] = dict(rms_z=rms(zr), ci95=boot_rms(zr), n=len(zr))
    S["unplanned"]["rms_z_k1_vs_ro_k1"] = dict(rms_z=rms(zr1), ci95=boot_rms(zr1), n=len(zr1))
    S["unplanned"]["median_abs_df_vs_ro"] = dict(k1=float(np.median(e1)), k2=float(np.median(e2)))
    sf_ratio = [r["selfcal_k2"]["sf"] / m3k[(r["cam"], r["kind"], r["k"], r["i"])]["sf"]
                for r in R["subsets"] if r["kind"] == "random" and 4 <= r["k"] <= 12]
    S["unplanned"]["median_sf_ratio_k2_over_k1"] = float(np.median(sf_ratio))
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1)
    figure(S)
    print(json.dumps({k: S["hypotheses"][k]["holds"] for k in S["hypotheses"]}))
    for key in ("k2", "k1_m3"):
        h = S["hypotheses"]["H12"][key]
        print("H12", key, round(h["rms_z"], 3), h["ci95"], h["per_cam"], "median|z|", round(h["median_abs_z"], 3),
              "w/o top5", round(h["rms_z_without_top5"], 3), [round(z, 1) for z in h["top5_z"]], h["n"], h["dropped"])
    print("unplanned", json.dumps(S["unplanned"]))
    for cam in S["cams"]:
        print(cam, json.dumps(S["cams"][cam], default=float)[:1500])


def figure(S):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    labels = [("flat", "Zhang, flat board"), ("ro", "Zhang, released board"), ("selfcal", "target-free BA")]
    for j, cam in enumerate(("left", "right")):
        for nk, mk in ((1, "o"), (2, "s")):
            r = S["cams"][cam][f"k{nk}"]
            for i, (key, lab) in enumerate(labels):
                x = j * 4 + i + (nk - 1.5) * 0.25
                ax[0].errorbar(x, r["cy"][key], yerr=2 * r["scy"][key], fmt=mk, color=f"C{i}", capsize=3,
                               label=f"{lab}, k1{'+k2' if nk > 1 else ''}" if j == 0 else None)
    ax[0].axhline(240, color="0.6", lw=0.8, ls=":")
    ax[0].set_xticks([1, 5]); ax[0].set_xticklabels(["left camera", "right camera"])
    ax[0].set_ylabel("principal point c$_y$ (px), ±2σ")
    ax[0].set_title("c$_y$: the flat-board assumption moves it")
    ax[0].legend(fontsize=7, loc="lower right")
    h = S["hypotheses"]["H12"]
    for key, lab, c in (("k1_m3", "k1 lens (milestone 3)", "C3"), ("k2", "k1 + k2 lens", "C2")):
        bs = h[key]["by_size"]
        ax[1].plot(list(map(int, bs)), list(bs.values()), "o-", color=c, label=f"{lab}: rms z {h[key]['rms_z']:.2f}")
    ax[1].axhline(1, color="0.5", lw=0.8, ls="--")
    ax[1].set_xlabel("views in subset"); ax[1].set_ylabel("rms nested z of f (ideal 1)")
    ax[1].set_title("Adding k2 does not make σ honest")
    ax[1].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "cy_and_k2.png"), dpi=130)


if __name__ == "__main__":
    main()
