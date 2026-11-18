"""Milestone 3m: score H178-H183 from results.json (run.py) and check the exact-gyro solves against
milestone 3l's results.json.

    python3 analyse.py        # writes summary.json and gyrofault.png
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M3L = os.path.join(HERE, "..", "m3l_gyro", "results.json")


def med(x):
    x = np.asarray(x, float)
    return float(np.median(x)) if len(x) else float("nan")


def f_of(j, m):
    return j[m]["intr"][0]


def delta(j, fault, model, f, prefix=""):
    """Paired shift of a fault solve against the exact-gyro solve of the same window and model."""
    return (f_of(j, f"{fault}_{model}") - f_of(j, prefix + model)) / f


def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def fault_names(R):
    out = [(f"R{t:g}", "") for t in R["thetas_deg"]] + [(f"S{s:g}", "") for s in R["scales"]]
    out += [(f"T{1000 * d:g}", "T_") for d in R["deltas_s"]]
    return out


def stats(jobs, R, f):
    S = {}
    for fault, pre in fault_names(R):
        for model in ("known", "est"):
            k = f"{fault}_{model}"
            d = np.array([delta(j, fault, model, f, pre) for j in jobs])
            e = np.array([(f_of(j, k) - f_of(j, pre + "clean")) / f for j in jobs])
            s = {"n": len(jobs), "converged": int(sum(j[k]["status"] > 0 for j in jobs)),
                 "median_delta": med(d), "median_abs_delta": med(np.abs(d)),
                 "min_delta": float(d.min()), "max_delta": float(d.max()),
                 "median_abs_e": med(np.abs(e))}
            if model == "est":
                s["median_tr_ms"] = med([1e3 * j[k]["t_r"] for j in jobs])
            S[k] = s
    for pre in ("", "T_"):
        for m in ("none", "known", "est"):
            e = np.array([(f_of(j, pre + m) - f_of(j, pre + "clean")) / f for j in jobs])
            S[pre + m] = {"median_abs_e": med(np.abs(e)), "converged": int(sum(j[pre + m]["status"] > 0 for j in jobs))}
            if m == "est":
                S[pre + m]["median_tr_ms"] = med([1e3 * j[pre + m]["t_r"] for j in jobs])
    for d in R["deltas_s"]:
        k = f"T{1000 * d:g}"
        rel = np.array([j[k + "_rate_err"] / j["T_w_rms"] for j in jobs])
        ad = np.array([abs(delta(j, k, "known", f, "T_")) for j in jobs])
        S[k + "_rate"] = {"median_rel_rate_err": med(rel), "spearman_absdelta_vs_rel": spearman(ad, rel)}
    return S


def check(jobs, f):
    m3l = {j["seed"]: j for j in json.load(open(M3L))["jobs"] if j["part"] == "B" and j.get("sigma") == 0.3}
    d = {m: [abs(f_of(j, m) - f_of(m3l[j["seed"]], m)) / f for j in jobs] for m in ("clean", "none", "known", "est")}
    out = {m: {"median": med(v), "max": float(max(v))} for m, v in d.items()}
    out["pass"] = bool(all(out[m]["median"] <= 1e-6 for m in d))
    return out


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    f = R["intr"][0]
    jobs = R["jobs"]
    S = stats(jobs, R, f)
    C = check(jobs, f)
    tr1 = {j["seed"]: j["est"]["t_r"] for j in jobs}
    sc = {}
    for s in R["scales"]:
        k = f"S{s:g}_est"
        sc[f"{s:g}"] = med([s * j[k]["t_r"] / tr1[j["seed"]] for j in jobs])
    a = lambda k: S[k]["median_abs_delta"]   # noqa: E731
    H = {
        "H178": {"R1_known": a("R1_known"), "held": a("R1_known") <= 0.001},
        "H179": {"R10_known": a("R10_known"), "ratio_10_over_1": a("R10_known") / a("R1_known")},
        "H180": {"S1.02_est": a("S1.02_est"), "S1.05_est": a("S1.05_est"), "median_s_tr_ratio": sc},
        "H181": {"S1.05_known": a("S1.05_known"), "held": 0.0005 <= a("S1.05_known") <= 0.004},
        "H182": {"T10_known": a("T10_known"), "T20_known": a("T20_known"),
                 "held": a("T10_known") <= 0.006 and a("T20_known") <= 0.012},
        "H183": {"R10": [a("R10_est"), a("R10_known")], "T20": [a("T20_est"), a("T20_known")],
                 "held": a("R10_est") >= 0.8 * a("R10_known") and a("T20_est") >= 0.8 * a("T20_known")},
    }
    H["H179"]["held"] = a("R10_known") <= 0.01 and 5 <= H["H179"]["ratio_10_over_1"] <= 20
    H["H180"]["held"] = (a("S1.02_est") <= 1e-4 and a("S1.05_est") <= 1e-4
                         and all(abs(v - 1) <= 0.005 for v in sc.values()))
    out = {"f_true": f, "check_vs_m3l": C, "hypotheses": H, "stats": S}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(json.dumps({"check": C, "H": H}, indent=1))
    for k, s in S.items():
        print(k, {x: round(v, 6) if isinstance(v, float) else v for x, v in s.items()})
    figure(jobs, R, f)


def figure(jobs, R, f):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    names = fault_names(R)
    for model, mk, off in (("known", "o", -0.12), ("est", "s", 0.12)):
        y = [100 * S_abs(jobs, n, model, f, p) for n, p in names]
        x = np.arange(len(names)) + off
        ax[0].plot(x, np.maximum(y, 2e-3), mk, label=f"readout {model}")
        for xi, yi in zip(x, y):
            if yi < 2e-3:
                ax[0].annotate("absorbed\n(<1e-6 %)", (xi, 2e-3), textcoords="offset points", xytext=(0, 8),
                               ha="center", fontsize=7)
    ax[0].set_xticks(range(len(names)), [n for n, _ in names], rotation=30)
    ax[0].set_ylabel("median |focal shift from the fault| (%)")
    ax[0].set_title("R: rotated (deg), S: scaled, T: late (ms); 30 windows")
    ax[0].set_yscale("log")
    ax[0].set_ylim(1e-3, 3)
    ax[0].legend(fontsize=8)
    rel = [j[f"T{1000 * d:g}_rate_err"] / j["T_w_rms"] for d in R["deltas_s"] for j in jobs]
    ad = [100 * abs(delta(j, f"T{1000 * d:g}", "known", f, "T_")) for d in R["deltas_s"] for j in jobs]
    ax[1].loglog(rel, ad, ".", alpha=0.6)
    from matplotlib.ticker import NullFormatter
    ax[1].xaxis.set_minor_formatter(NullFormatter())
    ax[1].set_xlabel("gyro rate error / rms rate (time offset)")
    ax[1].set_ylabel("|focal shift| (%), readout known")
    ax[1].set_title("part T: 2, 5, 10, 20 ms offsets")
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "gyrofault.png"), dpi=110)


def S_abs(jobs, fault, model, f, pre):
    return med([abs(delta(j, fault, model, f, pre)) for j in jobs])


if __name__ == "__main__":
    main()
