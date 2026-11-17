"""Summarise results.json into summary.json and draw the milestone-1 figure.

    python3 experiments/m1_real/analyse.py
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def rms(a):
    a = np.asarray(a, float)
    return float(np.sqrt(np.mean(a ** 2)))


def boot_rms(z, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    z = np.asarray(z)
    b = [rms(rng.choice(z, len(z))) for _ in range(n)]
    return [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    S = {"cams": {}, "by_size": {}, "overall": {}}
    for cam, c in R["cams"].items():
        z1, s = c["zhang_k1"], c["selfcal_all"]["init1.3_k1"]
        S["cams"][cam] = dict(
            zhang_f=z1["f"], zhang_sf=z1["sf"], zhang_rms=z1["rms"], zhang_cy=z1["cy"], zhang_cx=z1["cx"],
            zhang_k1=z1["k1"], zhang_k2_f=c["zhang_k2"]["f"],
            selfcal_f=s["f"], selfcal_sf=s["sf"], selfcal_rms=s["rms"], selfcal_cx=s["cx"], selfcal_cy=s["cy"],
            selfcal_k1=s["k1"], selfcal_k2model_f=c["selfcal_all"]["init1.3_k2"]["f"],
            selfcal_init07_f=c["selfcal_all"]["init0.7_k1"]["f"],
            rel_gap_pct=100 * (s["f"] - z1["f"]) / z1["f"],
            z_all=(s["f"] - z1["f"]) / np.hypot(s["sf"], z1["sf"]),
            sigma_ratio=s["sf"] / z1["sf"],
            cy_gap_sigma=(s["cy"] - z1["cy"]) / np.hypot(s["scy"], z1["scy"]),
            cx_gap_sigma=(s["cx"] - z1["cx"]) / np.hypot(s["scx"], z1["scx"]))
    zs_ref, zs_self, zs_zhang, ratios, fails = [], [], [], [], 0
    for r in R["subsets"]:
        c = R["cams"][r["cam"]]
        fr, fs = c["zhang_k1"]["f"], c["selfcal_all"]["init1.3_k1"]["f"]
        s, z = r["selfcal"], r["zhang"]
        if s is None or not np.isfinite(s["sf"]) or s["sf"] <= 0:
            fails += 1
            continue
        d = S["by_size"].setdefault(str(r["k"]), {"z_ref": [], "z_self": [], "z_zhang": [], "ratio": [],
                                                  "abs_gap_pct": [], "zhang_abs_gap_pct": []})
        d["z_ref"].append((s["f"] - fr) / s["sf"])
        d["z_self"].append((s["f"] - fs) / s["sf"])
        d["z_zhang"].append((z["f"] - fr) / z["sf"])
        d["ratio"].append(s["sf"] / z["sf"])
        d["abs_gap_pct"].append(100 * abs(s["f"] - fr) / fr)
        d["zhang_abs_gap_pct"].append(100 * abs(z["f"] - fr) / fr)
    for k, d in S["by_size"].items():
        zs_ref += d["z_ref"]; zs_self += d["z_self"]; zs_zhang += d["z_zhang"]; ratios += d["ratio"]
        S["by_size"][k] = dict(n=len(d["z_ref"]), rms_z_ref=rms(d["z_ref"]), rms_z_self=rms(d["z_self"]),
                               rms_z_zhang=rms(d["z_zhang"]), median_sigma_ratio=float(np.median(d["ratio"])),
                               median_abs_gap_pct=float(np.median(d["abs_gap_pct"])),
                               median_zhang_abs_gap_pct=float(np.median(d["zhang_abs_gap_pct"])),
                               max_abs_gap_pct=float(np.max(d["abs_gap_pct"])))
    S["overall"] = dict(n=len(zs_ref), failed=fails,
                        rms_z_ref=rms(zs_ref), rms_z_ref_ci=boot_rms(zs_ref),
                        rms_z_self=rms(zs_self), rms_z_self_ci=boot_rms(zs_self),
                        rms_z_zhang=rms(zs_zhang), rms_z_zhang_ci=boot_rms(zs_zhang),
                        cover2_ref=float(np.mean(np.abs(zs_ref) <= 2)),
                        cover2_zhang=float(np.mean(np.abs(zs_zhang) <= 2)),
                        median_sigma_ratio=float(np.median(ratios)))
    json.dump(S, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(json.dumps(S["overall"], indent=1))
    for k in sorted(S["by_size"], key=int):
        print(k, {a: round(b, 3) for a, b in S["by_size"][k].items()})
    for cam, c in S["cams"].items():
        print(cam, {a: round(float(b), 4) for a, b in c.items()})

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    ks = sorted(S["by_size"], key=int)
    x = [int(k) for k in ks]
    ax[0].plot(x, [S["by_size"][k]["rms_z_ref"] for k in ks], "o-", label="target-free BA")
    ax[0].plot(x, [S["by_size"][k]["rms_z_zhang"] for k in ks], "s--", label="Zhang (known board)")
    ax[0].axhline(1, color="grey", lw=0.8)
    ax[0].axhline(2, color="grey", lw=0.8, ls=":")
    ax[0].set_xlabel("views in subset")
    ax[0].set_ylabel("rms z of f vs all-view Zhang")
    ax[0].set_title("Is the reported σ_f honest? (1 = yes)")
    ax[0].legend(fontsize=8)
    ax[1].plot(x, [S["by_size"][k]["median_abs_gap_pct"] for k in ks], "o-", label="target-free BA")
    ax[1].plot(x, [S["by_size"][k]["median_zhang_abs_gap_pct"] for k in ks], "s--", label="Zhang (known board)")
    ax[1].set_xlabel("views in subset")
    ax[1].set_ylabel("median |f − f_ref| / f_ref (%)")
    ax[1].set_title("Focal-length error, 2 real cameras")
    ax[1].set_yscale("log")
    ax[1].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "selfcal_vs_zhang.png"), dpi=110)


if __name__ == "__main__":
    main()
