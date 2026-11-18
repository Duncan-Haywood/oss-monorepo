"""Milestone 79: a zoned quantile drift tolerance with an explicit false-flag budget f, priced as dispute cost.

No training: reads milestone 78's run (../noise_probe_tolerance/results.json). Statistic: drift / mean replayed step
norm per s = 20 segment. Zones (milestone 77): main t0 < TAIL0, tail the rest. Threshold per zone = the (1 - f)
empirical quantile of the calibration segments in that zone (f = 0 is the zoned maximum). Fitted on calibration half
A (seeds 100-119) and checked on B (120-139) and the honest test seeds; then fitted on all 40 and scored on the
cheats. A job is caught at k opened segments with the exact hypergeometric chance 1 - C(N-q,k)/C(N,k) over its q
flagged segments. Cost per honest job = k s + P(honest job flagged) C, C = dispute cost in replayed steps (swept).
Run: python3 analyze.py   (numpy; seconds). Writes results.txt and results.json."""
import json, os
from math import comb
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "noise_probe_tolerance", "results.json")
FS = [0.0, 0.001, 0.0025, 0.005, 0.01, 0.02]
KS = [1, 2, 5, 10, 20]
TARGET = "uniform 0.02"


def ratios(segs_by_seed):
    keys = sorted(segs_by_seed, key=int)
    return np.array([[g["drift"] / g["step"] for g in segs_by_seed[k]] for k in keys])


def fit_zoned_quantile(cal, main, f):
    """Per-zone threshold vector: the (1 - f) quantile of calibration ratios in each zone; f = 0 gives the max."""
    th = np.empty(cal.shape[1])
    for zone in (main, ~main):
        v = cal[:, zone]
        th[zone] = v.max() if f == 0 else np.quantile(v, 1.0 - f, method="higher")
    return th


def catch(q, k, n):
    """Chance that k of n segments opened uniformly without replacement include one of q flagged."""
    return 1.0 - comb(n - int(q), k) / comb(n, k)


def job_catch(r, th, k):
    n = r.shape[1]
    return float(np.mean([catch(q, k, n) for q in (r > th).sum(1)]))


def main():
    D = json.load(open(SRC))
    T, S, TAIL0 = D["T"], D["S"], D["TAIL0"]
    N = T // S
    MAIN = np.arange(N) * S < TAIL0
    cal = ratios(D["cal"])
    A, B = cal[:20], cal[20:]
    test = {c: ratios({k: v["seg"] for k, v in D["test"][c].items()}) for c in D["test"]}
    honest = test["honest"]
    out = {"T": T, "S": S, "N": N, "fs": FS, "ks": KS, "stability": [], "catch": {}, "cost": {}}
    L = [f"{cal.shape[0]} calibration seeds x {N} segments (s = {S}), zones main t0 < {TAIL0} ({MAIN.sum()}) / tail "
         f"({(~MAIN).sum()}); per half {20 * MAIN.sum()} main and {20 * (~MAIN).sum()} tail segments.",
         "Stability (fit A vs fit B) and held-out honest flag rates:",
         f"  {'f':>6} {'main A':>8} {'main B':>8} {'A/B':>5} {'tail A':>8} {'tail B':>8} {'A/B':>5} "
         f"{'fitA->B':>8} {'fitA->test':>10} {'fitB->A':>8} {'fitB->test':>10}"]
    for f in FS:
        tA, tB = fit_zoned_quantile(A, MAIN, f), fit_zoned_quantile(B, MAIN, f)
        mr = max(tA[MAIN][0], tB[MAIN][0]) / min(tA[MAIN][0], tB[MAIN][0])
        tr = max(tA[~MAIN][0], tB[~MAIN][0]) / min(tA[~MAIN][0], tB[~MAIN][0])
        row = dict(f=f, mainA=tA[MAIN][0], mainB=tB[MAIN][0], main_ratio=mr, tailA=tA[~MAIN][0], tailB=tB[~MAIN][0],
                   tail_ratio=tr, fitA_B=float(np.mean(B > tA)), fitA_test=float(np.mean(honest > tA)),
                   fitB_A=float(np.mean(A > tB)), fitB_test=float(np.mean(honest > tB)))
        out["stability"].append(row)
        L.append(f"  {f:>6} {row['mainA']:>8.4f} {row['mainB']:>8.4f} {mr:>5.2f} {row['tailA']:>8.4f} {row['tailB']:>8.4f} "
                 f"{tr:>5.2f} {row['fitA_B']:>8.4f} {row['fitA_test']:>10.4f} {row['fitB_A']:>8.4f} {row['fitB_test']:>10.4f}")
    L.append("Catch at k opened segments, thresholds fitted on all 40 calibration seeds (honest row = dispute chance):")
    L.append(f"  {'config':<16} {'f':>6} " + " ".join(f"{'k=' + str(k):>6}" for k in KS) + "  flagged share")
    for c, r in test.items():
        out["catch"][c] = {}
        for f in FS:
            th = fit_zoned_quantile(cal, MAIN, f)
            p = [job_catch(r, th, k) for k in KS]
            out["catch"][c][str(f)] = p
            L.append(f"  {c:<16} {f:>6} " + " ".join(f"{x:>6.3f}" for x in p) + f"  {np.mean(r > th):.4f}")
    L.append(f"Pricing: expected verifier cost per honest job = k s + P(dispute) C, as a share of T = {T}. "
             f"Cheapest (f, k) catching '{TARGET}' in at least 50% / 90% of jobs:")
    for cname, C in (("C = s", S), ("C = T", T), ("C = 10 T", 10 * T)):
        out["cost"][cname] = {}
        for goal in (0.5, 0.9):
            best = None
            for f in FS:
                for i, k in enumerate(KS):
                    if out["catch"][TARGET][str(f)][i] >= goal:
                        cost = (k * S + out["catch"]["honest"][str(f)][i] * C) / T
                        if best is None or cost < best[0]:
                            best = (cost, f, k, out["catch"][TARGET][str(f)][i], out["catch"]["honest"][str(f)][i])
            out["cost"][cname][str(goal)] = best
            L.append(f"  {cname:<9} goal {goal:.0%}: " + ("none reaches it" if best is None else
                     f"f = {best[1]}, k = {best[2]}: catch {best[3]:.3f}, honest dispute {best[4]:.3f}, cost {best[0]:.3f} T"))
    L.append("Cost of each f at k = 5 and k = 20 (share of T) for C = T and 10 T, with the uniform 2% catch:")
    for f in FS:
        cells = []
        for i, k in ((2, 5), (4, 20)):
            ph = out["catch"]["honest"][str(f)][i]
            cells.append(f"k={k}: catch {out['catch'][TARGET][str(f)][i]:.3f} dispute {ph:.3f} "
                         f"cost(T) {(k * S + ph * T) / T:.3f} cost(10T) {(k * S + ph * 10 * T) / T:.3f}")
        L.append(f"  f = {f:<6} " + " | ".join(cells))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
