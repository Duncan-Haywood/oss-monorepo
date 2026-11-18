"""Milestone 3o: score H189-H194 from results.json (run.py).

    python3 analyse.py        # writes summary.json and offset.png
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = ("known", "est", "known_d", "est_d")


def med(x):
    x = np.asarray(x, float)
    return float(np.median(x)) if len(x) else float("nan")


def rsd(x):
    x = np.asarray(x, float)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def key(m, d):
    return f"{m}@{1000 * d:g}"


def ok(j, k):
    return j[k]["status"] > 0


def stats(jobs, R):
    f, tr = R["intr"][0], R["t_r"]
    S = {}
    for d in R["deltas_s"]:
        for m in MODELS:
            k, k0 = key(m, d), key(m, 0.0)
            J = [j for j in jobs if ok(j, k) and ok(j, k0)]
            D = np.array([(j[k]["intr"][0] - j[k0]["intr"][0]) / f for j in J])
            e = np.array([(j[k]["intr"][0] - j["clean"]["intr"][0]) / f for j in J])
            s = {"n": len(jobs), "converged": int(sum(ok(j, k) for j in jobs)), "counted": len(J),
                 "median_iters": med([j[k]["iters"] for j in jobs]),
                 "median_Delta": med(D), "median_abs_Delta": med(np.abs(D)),
                 "min_Delta": float(D.min()), "max_Delta": float(D.max()),
                 "median_abs_e": med(np.abs(e))}
            if m.startswith("est"):
                trs = np.array([j[k]["t_r"] for j in J])
                s["median_tr_ms"] = 1e3 * med(trs)
                s["median_abs_tr_err_rel"] = med(np.abs(trs - tr) / tr)
            if m.endswith("_d"):
                err = np.array([j[k]["delta"] - d for j in J])
                sd = np.array([j[k]["sd_delta"] for j in J])
                s.update({"median_dhat_err_ms": 1e3 * med(err), "median_abs_dhat_err_ms": 1e3 * med(np.abs(err)),
                          "min_dhat_err_ms": 1e3 * float(err.min()), "max_dhat_err_ms": 1e3 * float(err.max()),
                          "median_sd_delta_ms": 1e3 * med(sd)})
                if m == "est_d":
                    s["median_corr_tr_delta"] = med([j[k]["corr_tr_delta"] for j in J])
            S[k] = s
    return S


def score(jobs, R, S):
    D = R["deltas_s"]
    H = {}
    v = {f"{1000 * d:g}": S[key("known_d", d)]["median_abs_dhat_err_ms"] for d in D}
    H["H189"] = {"median_abs_err_ms": v, "held": bool(all(x <= 2.0 for x in v.values()))}
    v = {f"{1000 * d:g}": S[key("est_d", d)]["median_abs_dhat_err_ms"] for d in D}
    t = {f"{1000 * d:g}": S[key("est_d", d)]["median_abs_tr_err_rel"] for d in D}
    H["H190"] = {"median_abs_err_ms": v, "median_abs_tr_err_rel": t,
                 "held": bool(all(x <= 4.0 for x in v.values()) and all(x <= 0.10 for x in t.values()))}
    a, b = S[key("known_d", 0.02)]["median_abs_Delta"], S[key("known", 0.02)]["median_abs_Delta"]
    H["H191"] = {"known_d": a, "known": b, "ratio": a / b, "held": bool(a <= 0.3 * b)}
    pairs = {"known_d_vs_known": (S[key("known_d", 0.0)]["median_abs_e"], S[key("known", 0.0)]["median_abs_e"]),
             "est_d_vs_est": (S[key("est_d", 0.0)]["median_abs_e"], S[key("est", 0.0)]["median_abs_e"])}
    H["H192"] = {k: {"free": p[0], "fixed": p[1]} for k, p in pairs.items()}
    H["H192"]["held"] = bool(all(p[0] <= p[1] + 0.001 for p in pairs.values()))
    z = []
    for d in D:
        k = key("known_d", d)
        z += [(j[k]["delta"] - d) / j[k]["sd_delta"] for j in jobs if ok(j, k) and j[k]["sd_delta"] > 0]
    r = rsd(z)
    H["H193"] = {"robust_sd_z": r, "n": len(z), "held": bool(0.67 <= r <= 1.5)}
    k = key("known_d", 0.01)
    J = [j for j in jobs if ok(j, k)]
    rho = spearman([abs(j[k]["delta"] - 0.01) for j in J], [j["a_rms"] for j in J])
    H["H194"] = {"spearman": rho, "held": bool(rho <= -0.3)}
    return H


def plot(jobs, R, S):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    D = np.array(R["deltas_s"]) * 1e3
    fig, ax = plt.subplots(1, 3, figsize=(13, 3.8))
    for m, c in zip(("known_d", "est_d"), ("C0", "C3")):
        for d in R["deltas_s"]:
            k = key(m, d)
            y = [1e3 * j[k]["delta"] for j in jobs if ok(j, k)]
            ax[0].scatter(np.full(len(y), 1e3 * d) + (-0.4 if m == "known_d" else 0.4), y, s=8, c=c, alpha=0.6,
                          label=m if d == R["deltas_s"][0] else None)
    ax[0].plot(D, D, "k--", lw=0.8)
    ax[0].set_xlabel("true offset δ (ms)"); ax[0].set_ylabel("estimated δ̂ (ms)"); ax[0].legend(fontsize=8)
    ax[0].set_title("offset recovered per window")
    for m, c in zip(MODELS, ("C1", "C2", "C0", "C3")):
        ax[1].plot(D, [100 * S[key(m, d)]["median_abs_Delta"] for d in R["deltas_s"]], "o-", c=c, label=m)
    ax[1].set_xlabel("true offset δ (ms)"); ax[1].set_ylabel("median |Δf| vs δ = 0 (%)"); ax[1].legend(fontsize=8)
    ax[1].set_title("focal shift caused by the offset")
    for m, c in zip(("est", "est_d"), ("C2", "C3")):
        ax[2].plot(D, [S[key(m, d)]["median_tr_ms"] for d in R["deltas_s"]], "o-", c=c, label=m)
    ax[2].axhline(1e3 * R["t_r"], c="k", ls="--", lw=0.8)
    ax[2].set_xlabel("true offset δ (ms)"); ax[2].set_ylabel("median readout t̂_r (ms)"); ax[2].legend(fontsize=8)
    ax[2].set_title("readout with offset fixed / free")
    fig.suptitle("Milestone 3o: gyro-camera offset in a 1.2 s rolling-shutter window (30 synthetic windows)", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "offset.png"), dpi=110)


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    jobs = R["jobs"]
    S = stats(jobs, R)
    H = score(jobs, R, S)
    out = {"n_windows": len(jobs), "median_a_rms": med([j["a_rms"] for j in jobs]),
           "median_w_rms": med([j["w_rms"] for j in jobs]),
           "clean_converged": int(sum(ok(j, "clean") for j in jobs)), "stats": S, "hypotheses": H}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    plot(jobs, R, S)
    print(json.dumps(H, indent=1))


if __name__ == "__main__":
    main()
