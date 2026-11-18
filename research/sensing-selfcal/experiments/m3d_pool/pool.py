"""Milestone 3d: pool natural-feature windows by milestone 3c's keyframe-jackknife sd.

Analysis only: reads ../m3c_jackknife/summary.json (per-window f, sd_jk, motion-capture rotation)
and writes summary.json and pool.png here. No solve is re-run. Hypotheses H130-H134 and the rules
below were written in LOG.md before this script was first run on the 3c data.

Blocks: within a sequence, the scored windows (3c's rule) in time order; a block of size K is
K consecutive scored windows (sliding, step 1). Each block gives three pooled estimates of f:
  ivw    inverse-variance mean under sd_jk, sd = 1/sqrt(sum w)        (treats windows as independent)
  re     DerSimonian-Laird random-effects mean, sd = 1/sqrt(sum w*)   (adds the between-window spread)
  med    plain median of the K window f's (point only, milestone 3b's pooling)
Gate (H134): drop windows whose motion-capture rotation is below GATE_DEG before blocking (a stand-in
for a gyro, which reads rotation directly); the solver never sees it.
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
KS = (1, 2, 3, 5, 8)
K_MAIN = 5
GATE_DEG = 5.0
GATE_SENS = (3.0, 10.0)


def dl_pool(f, sd):
    """DerSimonian-Laird random-effects mean and its sd; tau2 >= 0."""
    f = np.asarray(f, float); v = np.asarray(sd, float) ** 2
    w = 1 / v
    mu_f = (w * f).sum() / w.sum()
    k = len(f)
    if k < 2:
        return float(mu_f), float(np.sqrt(1 / w.sum())), 0.0
    q = (w * (f - mu_f) ** 2).sum()
    c = w.sum() - (w ** 2).sum() / w.sum()
    tau2 = max(0.0, (q - (k - 1)) / c)
    ws = 1 / (v + tau2)
    mu = (ws * f).sum() / ws.sum()
    return float(mu), float(np.sqrt(1 / ws.sum())), float(tau2)


def ivw_pool(f, sd):
    f = np.asarray(f, float); w = 1 / np.asarray(sd, float) ** 2
    return float((w * f).sum() / w.sum()), float(np.sqrt(1 / w.sum()))


def blocks(rows, k):
    out = []
    for i in range(len(rows) - k + 1):
        b = rows[i:i + k]
        f = [r["f"] for r in b]; sd = [r["sd_jk"] for r in b]; ref = b[0]["ref"]
        mi, si = ivw_pool(f, sd)
        mr, sr, tau2 = dl_pool(f, sd)
        out.append({"start": b[0]["window"], "ref": ref,
                    "ivw": mi, "sd_ivw": si, "re": mr, "sd_re": sr, "tau": float(np.sqrt(tau2)),
                    "med": float(np.median(f))})
    return out


def score(bl):
    if not bl:
        return {"n": 0}
    ref = np.array([b["ref"] for b in bl])
    e = {"n": len(bl)}
    for m in ("ivw", "re"):
        x = np.array([b[m] for b in bl]); sd = np.array([b["sd_" + m] for b in bl])
        z = (x - ref) / sd
        e[m] = {"rms_z": float(np.sqrt(np.mean(z ** 2))), "cover2": float(np.mean(abs(z) <= 2)),
                "median_abs_rel": float(np.median(abs(x - ref) / ref)),
                "median_sd_rel": float(np.median(sd / x)),
                "usable": float(np.mean((sd / x <= 0.02) & (abs(x - ref) / ref <= 0.02)))}
    x = np.array([b["med"] for b in bl])
    e["med"] = {"median_abs_rel": float(np.median(abs(x - ref) / ref))}
    return e


def analyse(rows, gate=None):
    per = {}
    for k in KS:
        allb, seq = [], {}
        for s in SEQS:
            o = sorted([r for r in rows if r["seq"] == s and (gate is None or r["rot_deg"] >= gate)],
                       key=lambda r: r["window"])
            b = blocks(o, k)
            seq[s] = score(b)
            seq[s]["windows"] = len(o)
            allb += b
        per[k] = {"all": score(allb), "seq": seq}
    return per


def main():
    src = json.load(open(os.path.join(HERE, "..", "m3c_jackknife", "summary.json")))
    rows = [r for r in src["windows"] if r["why"] == "ok"]
    base = analyse(rows)
    gated = {g: analyse(rows, g) for g in (GATE_DEG,) + GATE_SENS}
    m = base[K_MAIN]
    g = gated[GATE_DEG][K_MAIN]
    hyp = {
        "H130": {"rms_z_ivw": m["all"]["ivw"]["rms_z"], "holds": m["all"]["ivw"]["rms_z"] > 2},
        "H131": {"rms_z_re": m["all"]["re"]["rms_z"], "holds": m["all"]["re"]["rms_z"] <= 2},
        "H132": {s: m["seq"][s]["med"]["median_abs_rel"] for s in SEQS},
        "H133": {s: m["seq"][s]["re"]["usable"] for s in SEQS},
        "H134": {"windows_kept": {s: g["seq"][s]["windows"] for s in SEQS},
                 "rms_z_re_gated": g["all"]["re"]["rms_z"] if g["all"]["n"] else None},
    }
    hyp["H132"]["holds"] = all(hyp["H132"][s] <= 0.02 for s in ("fr1_desk", "fr3_stf")) and hyp["H132"]["fr1_xyz"] > 0.02
    hyp["H133"]["holds"] = all(hyp["H133"][s] >= 0.5 for s in ("fr1_desk", "fr3_stf"))
    nx = hyp["H134"]["windows_kept"]["fr1_xyz"]
    rz = hyp["H134"]["rms_z_re_gated"]
    hyp["H134"]["holds"] = (nx <= 0.5 * len([r for r in rows if r["seq"] == "fr1_xyz"])) and rz is not None and rz <= 2
    out = {"rules": {"K": KS, "K_main": K_MAIN, "gate_deg": GATE_DEG, "gate_sensitivity": GATE_SENS},
           "hypotheses": hyp, "base": base, "gated": gated}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1, default=str)
    print(json.dumps(hyp, indent=1))
    for k in KS:
        a = base[k]["all"]
        print(f"K={k} n={a['n']} ivw rmsz {a['ivw']['rms_z']:.2f} re rmsz {a['re']['rms_z']:.2f} "
              f"re cov2 {a['re']['cover2']:.2f} re sd {100*a['re']['median_sd_rel']:.2f}% "
              f"|err| re {100*a['re']['median_abs_rel']:.2f}% med {100*a['med']['median_abs_rel']:.2f}% "
              f"usable {a['re']['usable']:.2f}")
        for s in SEQS:
            q = base[k]["seq"][s]
            if q["n"]:
                print(f"   {s} n={q['n']} re rmsz {q['re']['rms_z']:.2f} sd {100*q['re']['median_sd_rel']:.2f}% "
                      f"|err| re {100*q['re']['median_abs_rel']:.2f}% ivw {100*q['ivw']['median_abs_rel']:.2f}% "
                      f"med {100*q['med']['median_abs_rel']:.2f}% usable {q['re']['usable']:.2f}")
    for gd in (GATE_DEG,) + GATE_SENS:
        a = gated[gd][K_MAIN]
        print(f"gate {gd} deg K={K_MAIN}: kept", {s: a['seq'][s]['windows'] for s in SEQS},
              "re rmsz", None if not a["all"]["n"] else round(a["all"]["re"]["rms_z"], 2),
              {s: (round(100 * a['seq'][s]['re']['median_abs_rel'], 2) if a['seq'][s]['n'] else None) for s in SEQS})
    figure(base)


def figure(base):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    cols = {"fr1_desk": "#1f77b4", "fr1_xyz": "#ff7f0e", "fr3_stf": "#2ca02c"}
    ax = axes[0]
    for s in SEQS:
        ks = [k for k in KS if base[k]["seq"][s]["n"]]
        ax.plot(ks, [100 * base[k]["seq"][s]["re"]["median_abs_rel"] for k in ks], "o-", color=cols[s], label=f"{s} |error|")
        ax.plot(ks, [100 * base[k]["seq"][s]["re"]["median_sd_rel"] for k in ks], "s--", color=cols[s], alpha=0.6,
                label=f"{s} sd (random effects)")
    ax.axhline(2, color="k", lw=0.8)
    ax.set_xlabel("windows pooled, K (1.2 s each)")
    ax.set_ylabel("% of f (median over blocks)")
    ax.legend(fontsize=6)
    ax = axes[1]
    for m, ls in (("ivw", ":"), ("re", "-")):
        for s in SEQS:
            ks = [k for k in KS if base[k]["seq"][s]["n"]]
            ax.plot(ks, [base[k]["seq"][s][m]["rms_z"] for k in ks], ls, marker="o", color=cols[s],
                    label=f"{s} {'inverse-variance' if m == 'ivw' else 'random effects'}")
    ax.axhline(1, color="k", lw=0.8); ax.axhline(2, color="k", lw=0.8, ls="--")
    ax.set_yscale("log")
    ax.set_xlabel("windows pooled, K")
    ax.set_ylabel("rms z of pooled f (1 = honest)")
    ax.legend(fontsize=6)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "pool.png"), dpi=130)


if __name__ == "__main__":
    main()
