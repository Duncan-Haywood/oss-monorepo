"""Milestone 3j: score H161-H166 (written in ../../LOG.md before run.py first ran) from results.json.
Writes summary.json and tumpin.png here."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
PINS = ("k", "c", "ck")
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
BINS = (0, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.10, 0.15, 1.0)   # milestone 3h's step bins


def med(x):
    x = np.asarray([v for v in x if np.isfinite(v)], float)
    return float(np.median(x)) if len(x) else float("nan")


def rows(res, m3c):
    """One row per scored window: free f, reference, and per pin the first-order and re-solved f."""
    out = []
    for w in res["windows"]:
        if w.get("why") != "ok":
            continue
        c = m3c[(w["seq"], w["window"])]
        f, ref = w["intr"][0], c["ref"]
        r = {"seq": w["seq"], "window": w["window"], "f": f, "f_m3c": c["f"], "ref": ref,
             "e": (f - ref) / ref, "cost": w["cost"]}
        for p in PINS:
            q = w[p]
            r[p] = {"fc": q["fc"], "fp": q["fp"], "ok": bool(q["status_p"] > 0 and q["kept"]),
                    "ep": (q["fp"] - ref) / ref, "ec": (q["fc"] - ref) / ref,
                    "step_c": (q["fc"] - f) / f, "step_p": (q["fp"] - f) / f,
                    "ratio": (q["fp"] - f) / (q["fc"] - f) if q["fc"] != f else np.nan,
                    "same_sign": bool(np.sign(q["fc"] - f) == np.sign(q["fp"] - f)),
                    "sd_ratio_p": q["sd_p"] / q["sd_free"], "sd_ratio_c": q["sd_ratio_c"],
                    "cost_rise": q["cost_p"] / w["cost"] - 1.0}
        out.append(r)
    return out


def score(R):
    m_e = med([abs(r["e"]) for r in R])
    h = {}
    for name, p in (("H161", "k"), ("H162", "c"), ("H163", "ck")):
        ok = [r for r in R if r[p]["ok"]]
        m = med([abs(r[p]["ep"]) for r in ok])
        h[name] = {"pin": p, "n": len(ok), "median_abs_e_free": m_e, "median_abs_e_pinned": m,
                   "median_abs_e_first_order": med([abs(r[p]["ec"]) for r in ok]), "holds": bool(m >= m_e)}
    sg = {p: float(np.mean([r[p]["same_sign"] for r in R if r[p]["ok"]])) for p in PINS}
    h["H164"] = {"same_sign_frac": sg, "holds": bool(all(v >= 0.9 for v in sg.values()))}
    rt = {p: med([r[p]["ratio"] for r in R if r[p]["ok"]]) for p in PINS}
    h["H165"] = {"median_ratio": rt, "holds": bool(all(0.67 <= v <= 1.5 for v in rt.values()))}
    g = med([abs(r["k"]["sd_ratio_p"] - r["k"]["sd_ratio_c"]) / r["k"]["sd_ratio_c"] for r in R if r["k"]["ok"]])
    h["H166"] = {"median_rel_gap_sd_ratio": g, "holds": bool(g <= 0.2)}
    return h


def unscored(R):
    per = {}
    for s in SEQS:
        rs = [r for r in R if r["seq"] == s]
        per[s] = {"n": len(rs), "median_abs_e": med([abs(r["e"]) for r in rs]),
                  "median_e": med([r["e"] for r in rs])}
        for p in PINS:
            ok = [r for r in rs if r[p]["ok"]]
            per[s][p] = {"median_abs_ep": med([abs(r[p]["ep"]) for r in ok]),
                         "median_ep": med([r[p]["ep"] for r in ok]),
                         "median_abs_ec": med([abs(r[p]["ec"]) for r in ok]),
                         "median_step_p": med([r[p]["step_p"] for r in ok]),
                         "median_ratio": med([r[p]["ratio"] for r in ok]),
                         "median_cost_rise": med([r[p]["cost_rise"] for r in ok])}
    bins = {}
    for p in PINS:
        bins[p] = []
        for lo, hi in zip(BINS[:-1], BINS[1:]):
            b = [r[p]["ratio"] for r in R if r[p]["ok"] and lo <= abs(r[p]["step_c"]) < hi]
            bins[p].append({"lo": lo, "hi": hi, "n": len(b), "median_ratio": med(b)})
    return {"per_sequence": per, "ratio_by_step": bins,
            "cost_rise": {p: med([r[p]["cost_rise"] for r in R if r[p]["ok"]]) for p in PINS}}


def figure(R, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4.2))
    col = {"k": "#1f77b4", "c": "#d62728", "ck": "#2ca02c"}
    lab = {"k": "k1, k2 pinned", "c": "cx, cy pinned", "ck": "all four pinned"}
    lim, off = 40.0, 0
    for p in PINS:
        pts = [(100 * r[p]["step_c"], 100 * r[p]["step_p"]) for r in R if r[p]["ok"]]
        inside = [(x, y) for x, y in pts if abs(x) <= lim and abs(y) <= lim]
        off += len(pts) - len(inside)
        ax[0].scatter(*zip(*inside), s=14, alpha=0.7, color=col[p], label=lab[p])
    ax[0].plot([-lim, lim], [-lim, lim], "k--", lw=0.8)
    ax[0].set_xlim(-lim, lim)
    ax[0].set_ylim(-lim, lim)
    if off:
        ax[0].text(0.02, 0.02, f"{off} point(s) off scale (|step| > {lim:.0f}%)", transform=ax[0].transAxes, fontsize=8)
    ax[0].set_xlabel("first-order step in f (%)")
    ax[0].set_ylabel("re-solved step in f (%)")
    ax[0].set_title("TUM windows: first order vs re-solve")
    ax[0].legend(fontsize=8)
    data = [[100 * abs(r["e"]) for r in R]] + [[100 * abs(r[p]["ep"]) for r in R if r[p]["ok"]] for p in PINS]
    ax[1].boxplot(data, tick_labels=["free", "k pinned", "c pinned", "all four"], showfliers=False)
    for i, d in enumerate(data):
        ax[1].scatter(np.full(len(d), i + 1) + np.random.default_rng(i).uniform(-0.15, 0.15, len(d)), d, s=8, alpha=0.5,
                      color=("0.4", col["k"], col["c"], col["ck"])[i])
    ax[1].set_ylabel("|f - f_board| / f_board (%)")
    ax[1].set_title("focal error, 57 windows, re-solved")
    fig.tight_layout()
    fig.savefig(path, dpi=110)


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m3c = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3c_jackknife", "summary.json")))["windows"] if w["why"] == "ok"}
    R = rows(res, m3c)
    dev = max(abs(r["f"] - r["f_m3c"]) / r["f_m3c"] for r in R)
    out = {"n_windows": len(res["windows"]), "n_scored": len(R), "max_rel_dev_free_f_vs_m3c": dev,
           "n_pinned_ok": {p: sum(r[p]["ok"] for r in R) for p in PINS},
           "hypotheses": score(R), "unscored": unscored(R), "rows": R}
    # The plan said the free f would be asserted equal to milestone 3c's; 2 of 57 rebuilt windows differ by
    # more than 0.1% (this OpenCV build's SIFT), so the hypotheses are also scored on the reproduced ones.
    rep = [r for r in R if abs(r["f"] - r["f_m3c"]) / r["f_m3c"] < 1e-3]
    out["reproduced_only"] = {"n": len(rep), "hypotheses": score(rep)}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("scored", len(R), "max free-f deviation from 3c", dev, "pinned ok", out["n_pinned_ok"])
    for k, v in out["hypotheses"].items():
        print(k, json.dumps(v))
    for s, v in out["unscored"]["per_sequence"].items():
        print(s, json.dumps(v))
    print("ratio by step", json.dumps(out["unscored"]["ratio_by_step"]))
    print("cost rise", out["unscored"]["cost_rise"])
    print("reproduced only", out["reproduced_only"]["n"], json.dumps(out["reproduced_only"]["hypotheses"]))
    figure(R, os.path.join(HERE, "tumpin.png"))


if __name__ == "__main__":
    main()
