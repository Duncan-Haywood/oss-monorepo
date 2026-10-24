"""mimic-recalib: how many human texts of a new family does it take to re-set a detector's threshold for a 5% FPR?

For each held family F: fit the mimic-contexts n-gram detector on the other 7 families (as mimic-threshold),
score F once. Then, REPS times, draw k human texts of F as a calibration sample, set the threshold two ways
(plain empirical 95th percentile; conformal: the ceil((k+1)*0.95)-th smallest score, which guarantees
expected FPR <= 5% for exchangeable scores), and measure FPR on the human texts of F not drawn, and TPR on
the machine texts. Writes results.json and results.txt. No network, no model.
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-threshold"))
import threshold as T  # noqa: E402

KS = [5, 10, 20, 40, 80, 160]
REPS = 500
TARGET = 0.05


def plain_threshold(cal, fpr=TARGET):
    return float(np.quantile(cal, 1 - fpr))


def conformal_threshold(cal, fpr=TARGET):
    """ceil((k+1)(1-fpr))-th smallest calibration score; +inf if k is too small for the target."""
    cal = np.sort(cal)
    r = math.ceil((len(cal) + 1) * (1 - fpr))
    return float(cal[r - 1]) if r <= len(cal) else float("inf")


def simulate(sh, sm, ks=KS, reps=REPS, seed=0):
    """sh, sm: scores of the family's human and machine texts. Returns {k: {method: stats}}."""
    rng = np.random.default_rng(seed)
    sh, sm = np.asarray(sh), np.asarray(sm)
    out = {}
    for k in ks:
        acc = {"plain": [], "conformal": []}
        for _ in range(reps):
            idx = rng.permutation(len(sh))
            cal, rest = sh[idx[:k]], sh[idx[k:]]
            for name, f in (("plain", plain_threshold), ("conformal", conformal_threshold)):
                thr = f(cal)
                acc[name].append(((rest > thr).mean(), (sm > thr).mean()))
        out[k] = {}
        for name, v in acc.items():
            a = np.array(v)
            out[k][name] = {"fpr_mean": float(a[:, 0].mean()), "fpr_p10": float(np.quantile(a[:, 0], 0.1)),
                            "fpr_p90": float(np.quantile(a[:, 0], 0.9)),
                            "p_fpr_over_10": float((a[:, 0] > 0.10).mean()), "tpr_mean": float(a[:, 1].mean())}
    return out


def main():
    items = T.load()
    res = {}
    for f in T.FAMILIES:
        tr = [i for i in items if i["family"] != f]
        te = [i for i in items if i["family"] == f]
        s = np.asarray(T.fit([i["text"] for i in tr], [i["y"] for i in tr])([i["text"] for i in te]))
        y = np.array([i["y"] for i in te])
        res[f] = simulate(s[y == 0], s[y == 1])
        print(f, file=sys.stderr, flush=True)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = [f"{'family':10} {'k':>4} | plain: mean FPR [p10,p90] P(>10%) TPR | conformal: mean FPR [p10,p90] P(>10%) TPR"]
    for f, r in res.items():
        for k, m in r.items():
            p, c = m["plain"], m["conformal"]
            lines.append(f"{f:10} {k:>4} | {p['fpr_mean']:.3f} [{p['fpr_p10']:.3f},{p['fpr_p90']:.3f}] {p['p_fpr_over_10']:.2f} {p['tpr_mean']:.3f}"
                         f" | {c['fpr_mean']:.3f} [{c['fpr_p10']:.3f},{c['fpr_p90']:.3f}] {c['p_fpr_over_10']:.2f} {c['tpr_mean']:.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
