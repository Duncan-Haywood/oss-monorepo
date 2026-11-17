"""Milestone 3l: score H172-H177 from results.json (run.py) and compare with milestone 3k's solves.

    python3 analyse.py        # writes summary.json and gyro.png
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M3K = os.path.join(HERE, "..", "m3k_shutter", "results.json")


def med(x):
    x = np.asarray(x, float)
    return float(np.median(x)) if len(x) else float("nan")


def e_of(j, m, f):
    return (j[m]["intr"][0] - j["clean"]["intr"][0]) / f


def stats(js, m, f, tr):
    js = [j for j in js if m in j]
    e = np.array([e_of(j, m, f) for j in js])
    out = {"n": len(js), "converged": int(sum(j[m]["status"] > 0 for j in js)),
           "median_e": med(e), "median_abs_e": med(np.abs(e)), "min_e": float(e.min()), "max_e": float(e.max()),
           "n_abs_over_50pct": int((np.abs(e) > 0.5).sum()),
           "median_sd_f_rel": med([j[m]["sd_f"] / f for j in js]),
           "median_abs_shift_in_sd": med([abs(e_of(j, m, f)) * f / j[m]["sd_f"] for j in js])}
    if m in ("est", "est_u", "null"):
        t = np.array([j[m]["t_r"] for j in js])
        out.update({"median_tr_ms": med(t * 1e3), "min_tr_ms": float(t.min() * 1e3), "max_tr_ms": float(t.max() * 1e3),
                    "median_sd_tr_ms": med([j[m]["sd_tr"] * 1e3 for j in js])})
        if m != "null":
            out["median_rel_tr_err"] = med(np.abs(t - tr) / tr)
    return out


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    f, tr = R["intr"][0], R["t_r"]
    jobs = R["jobs"]
    groups = {"B0.3": [j for j in jobs if j["part"] == "B" and j["sigma"] == 0.3],
              "B1.0": [j for j in jobs if j["part"] == "B" and j["sigma"] == 1.0],
              "A": [j for j in jobs if j["part"] == "A"],
              "A_pitch": [j for j in jobs if j["part"] == "A" and j["axis"] == "pitch"],
              "A_yaw": [j for j in jobs if j["part"] == "A" and j["axis"] == "yaw"]}
    models = ("none", "known", "known_u", "est", "est_u", "bias1", "bias5", "null")
    S = {g: {m: stats(js, m, f, tr) for m in models if any(m in j for j in js)} for g, js in groups.items()}

    # check against milestone 3k's nfba solves of the same windows
    k = {(j["part"], j.get("sigma"), j.get("axis"), j.get("rate"), j["seed"]): j for j in json.load(open(M3K))["jobs"]}
    dc, dn = [], []
    for j in jobs:
        o = k[(j["part"], j.get("sigma"), j.get("axis"), j.get("rate"), j["seed"])]
        dc.append(abs(j["clean"]["intr"][0] - o["gs"]["intr"][0]) / f)
        dn.append(abs(j["none"]["intr"][0] - o["rs"]["intr"][0]) / f)
    check = {"median_abs_df_clean": med(dc), "median_abs_df_none": med(dn),
             "median_abs_df_none_B0.3": med([d for d, j in zip(dn, jobs) if j["part"] == "B" and j["sigma"] == 0.3]),
             "n_df_none_over_1pct": int((np.array(dn) > 0.01).sum()), "pass": bool(med(dc) <= 1e-3 and med(dn) <= 1e-3)}

    b, a = S["B0.3"], S["A"]
    nul = np.array([j["null"]["t_r"] for j in groups["B0.3"]])
    H = {
        "H172": {"known": b["known"]["median_abs_e"], "none": b["none"]["median_abs_e"],
                 "ratio": b["known"]["median_abs_e"] / b["none"]["median_abs_e"]},
        "H173": {"known": a["known"]["median_abs_e"]},
        "H174": {"known_u": b["known_u"]["median_abs_e"], "known": b["known"]["median_abs_e"]},
        "H175": {"rel_tr_err": b["est"]["median_rel_tr_err"], "est": b["est"]["median_abs_e"],
                 "bar_e": 2 * b["known"]["median_abs_e"]},
        "H176": {"frac_within": float(np.mean(np.abs(nul) <= 0.1 * tr))},
        "H177": {"bias1": b["bias1"]["median_abs_e"], "known": b["known"]["median_abs_e"],
                 "gap_pp": 100 * abs(b["bias1"]["median_abs_e"] - b["known"]["median_abs_e"])},
    }
    H["H172"]["held"] = H["H172"]["ratio"] <= 0.25
    H["H173"]["held"] = H["H173"]["known"] <= 0.005
    H["H174"]["held"] = H["H174"]["known_u"] < H["H174"]["known"]
    H["H175"]["held"] = H["H175"]["rel_tr_err"] <= 0.2 and H["H175"]["est"] <= H["H175"]["bar_e"]
    H["H176"]["held"] = H["H176"]["frac_within"] >= 0.9
    H["H177"]["held"] = H["H177"]["gap_pp"] <= 0.3
    out = {"f_true": f, "t_r": tr, "check_vs_m3k": check, "hypotheses": H, "stats": S}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(json.dumps({"check": check, "H": H}, indent=1))
    for g in S:
        for m, s in S[g].items():
            print(g, m, {x: round(v, 5) if isinstance(v, float) else v for x, v in s.items()})
    figure(groups, f, tr)


def figure(groups, f, tr):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    ms = ["none", "known", "known_u", "est", "est_u", "bias1", "bias5"]
    js = groups["B0.3"]
    data = [[100 * e_of(j, m, f) for j in js] for m in ms]
    ax[0].boxplot(data, showfliers=True)
    ax[0].set_xticks(range(1, len(ms) + 1), ms, rotation=30)
    ax[0].axhline(0, color="grey", lw=0.8)
    ax[0].set_ylabel("focal shift e (%)")
    ax[0].set_title("hand-held 0.3 rad/s, t_r = 1/30 s (30 windows)")
    t_est = [1e3 * j["est"]["t_r"] for j in js]
    t_nul = [1e3 * j["null"]["t_r"] for j in js]
    ax[1].hist(t_est, bins=15, alpha=0.7, label="rolling-shutter data")
    ax[1].hist(t_nul, bins=15, alpha=0.7, label="global-shutter data (null)")
    ax[1].axvline(1e3 * tr, color="k", ls="--", lw=1, label="true 33.3 ms")
    ax[1].set_xlabel("readout estimated from one window (ms)")
    ax[1].set_ylabel("windows")
    ax[1].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "gyro.png"), dpi=110)


if __name__ == "__main__":
    main()
