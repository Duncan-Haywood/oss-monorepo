"""Milestone 78 analysis: four drift-tolerance rules on one run (no training). Reads results.json from run.py.

Statistics per segment: drift/step (milestones 75-77), drift/lr, drift/probe. Rules: a global maximum over calibration
segments of each statistic, and milestone 77's two-zone maximum of drift/step (main zone t0 < TAIL0, tail zone the rest).
Each rule is fitted on calibration half A (seeds 100-119), half B (120-139) and all 40. Reported: threshold stability
(A/B ratio), honest false flags on the other half and on the honest test seeds, and for each cheat the flagged share
and the chance that k uniformly opened segments include a flagged one, 1 - C(N-q,k)/C(N,k), plus the paired held-out
loss change against the same seed's honest run.
Run: python3 analyze.py   (numpy; seconds). Writes results.txt."""
import json, os, sys
from math import comb
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import bootstrap_ci  # noqa: E402

D = json.load(open(os.path.join(HERE, "results.json")))
T, S, TAIL0 = D["T"], D["S"], D["TAIL0"]
N = T // S
MAIN = np.arange(N) * S < TAIL0
KS = [5, 20]
STATS = {"drift/step": "step", "drift/lr": "lr", "drift/probe": "probe"}
RULES = [("drift/step", False), ("drift/step", True), ("drift/lr", False), ("drift/probe", False)]


def mat(segs_by_seed, den):
    keys = sorted(segs_by_seed, key=int)
    return np.array([[g["drift"] / g[den] for g in segs_by_seed[k]] for k in keys])


def cal(den):
    return mat(D["cal"], den)


def test(cfg, den):
    return mat({k: v["seg"] for k, v in D["test"][cfg].items()}, den)


def fit(c, zoned):
    if not zoned:
        return np.full(N, c.max())
    th = np.empty(N)
    th[MAIN], th[~MAIN] = c[:, MAIN].max(), c[:, ~MAIN].max()
    return th


def catch(q, k):
    return 1.0 - comb(N - int(q), k) / comb(N, k)


def name(stat, zoned):
    return stat + (" zoned" if zoned else " global")


L = [f"{len(D['cal'])} calibration seeds x {N} segments (s = {S}); A = first 20 seeds, B = last 20; "
     f"zones: main t0 < {TAIL0} ({MAIN.sum()} segments), tail {(~MAIN).sum()}."]
L.append("Honest calibration distribution (all 40): coefficient of variation of the per-position median across segments,"
         " and where the maximum sits:")
for stat, den in STATS.items():
    c = cal(den)
    med = np.median(c, 0)
    j = np.unravel_index(c.argmax(), c.shape)
    L.append(f"  {stat:<12} median {np.median(c):.4g}  q999 {np.quantile(c, 0.999):.4g}  max {c.max():.4g} "
             f"(max/median {c.max() / np.median(c):.1f}; at t0 = {j[1] * S})  CV of position medians {med.std() / med.mean():.2f}  "
             f"tail/main median {np.median(c[:, ~MAIN]) / np.median(c[:, MAIN]):.2f}")
L.append("Threshold stability and honest false flags:")
for stat, zoned in RULES:
    c = cal(STATS[stat])
    A, B = c[:20], c[20:]
    tA, tB = fit(A, zoned), fit(B, zoned)
    ht = test("honest", STATS[stat])
    ratio = max(tA.max() / tB.max(), tB.max() / tA.max())
    extra = ""
    if zoned:
        ratio_main = max(tA[MAIN][0] / tB[MAIN][0], tB[MAIN][0] / tA[MAIN][0])
        extra = f" (main zone {ratio_main:.2f})"
    L.append(f"  {name(stat, zoned):<20} A {tA.max():.4g} B {tB.max():.4g}  larger/smaller {ratio:.2f}{extra}; "
             f"fit A flags B {np.mean(B > tA):.4f} test {np.mean(ht > tA):.4f}; "
             f"fit B flags A {np.mean(A > tB):.4f} test {np.mean(ht > tB):.4f}")
base = {k: v["loss"] for k, v in D["test"]["honest"].items()}
L.append("Harm: held-out loss minus the same seed's honest run, mean [95% bootstrap CI]:")
for cfg in D["test"]:
    if cfg == "honest":
        continue
    d = np.array([D["test"][cfg][k]["loss"] - base[k] for k in sorted(base, key=int)])
    lo, hi = bootstrap_ci(d)
    L.append(f"  {cfg:<16} {d.mean():+.5f} [{lo:+.5f}, {hi:+.5f}]")
for fitname, sl in (("all 40", slice(None)), ("A", slice(0, 20)), ("B", slice(20, 40))):
    L.append(f"Catch, thresholds fitted on {fitname}: flagged share / P(k=5) / P(k=20)")
    L.append("  " + f"{'config':<16}" + "".join(f"{name(s, z):>26}" for s, z in RULES))
    for cfg in D["test"]:
        row = f"  {cfg:<16}"
        for stat, zoned in RULES:
            th = fit(cal(STATS[stat])[sl], zoned)
            r = test(cfg, STATS[stat])
            q = (r > th).sum(1)
            row += f"{np.mean(r > th):>10.3f} {np.mean([catch(x, 5) for x in q]):.3f} {np.mean([catch(x, 20) for x in q]):.3f}"
        L.append(row)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
