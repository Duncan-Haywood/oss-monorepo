"""Milestone 77: a tolerance split at the low-learning-rate tail (H1/H4 link). Analysis only, no training.

Reads ../concentrated_shrink/results.json: per-segment ratios (fp16 replay drift / mean replayed step norm, s = 20,
75 tiled segments) for 20 honest calibration seeds (100-119), and for 20 test seeds under an honest worker and seven
shrink cheats. Compares milestone 76's rule (one maximum over calibration segments) with a two-zone rule (one maximum
for segments whose mean lr >= 0.1 lr0, another for the rest), each fitted on calibration half A (100-109) and checked
on half B (110-119) and the honest test seeds, and the reverse. Catch at k opened segments = 1 - C(N-q,k)/C(N,k).
Run: python3 analyze.py   (numpy; seconds). Writes results.txt."""
import json, os, sys
from math import comb
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import lr_at  # noqa: E402

T, S, LR0, CUT = 1500, 20, 0.2, 0.1
N = T // S
D = json.load(open(os.path.join(HERE, "..", "concentrated_shrink", "results.json")))
CAL = np.array(D["cal_ratios"])                       # 20 seeds x 75 segments, seeds 100..119 in order
A, B = CAL[:10], CAL[10:]
MAIN = np.array([np.mean([lr_at(t, T, LR0) for t in range(j * S, j * S + S)]) >= CUT * LR0 for j in range(N)])
CONFIGS = [k for k in D["res"]]                         # 'honest', 'W=1500 all', ...
KS = [5, 20]


def fit(cal, zoned):
    if not zoned:
        return np.full(N, cal.max())
    th = np.empty(N)
    th[MAIN], th[~MAIN] = cal[:, MAIN].max(), cal[:, ~MAIN].max()
    return th


def ratios(cfg):
    r = D["res"][cfg]
    return np.array([r[sd]["ratios"] for sd in sorted(r, key=int)])


def catch(q, k):
    return 1.0 - comb(N - int(q), k) / comb(N, k)


L = [f"{CAL.shape[0]} calibration seeds x {N} segments (s = {S}); main zone = mean lr >= {CUT} lr0: {MAIN.sum()} segments "
     f"(t0 < {S * MAIN.sum()}), tail zone {(~MAIN).sum()}.",
     "Thresholds by calibration half (global max | main-zone max | tail-zone max):"]
for name, c in (("A (100-109)", A), ("B (110-119)", B), ("all 20", CAL)):
    L.append(f"  {name:<12} global {c.max():.4f} | main {c[:, MAIN].max():.4f} | tail {c[:, ~MAIN].max():.4f}  "
             f"(main/global {c[:, MAIN].max() / c.max():.2f})")
L.append(f"  A/B ratio:   global {A.max() / B.max():.2f} | main {A[:, MAIN].max() / B[:, MAIN].max():.2f} | "
         f"tail {A[:, ~MAIN].max() / B[:, ~MAIN].max():.2f}")
L.append("Honest false flags on held-out seeds (share of segments):")
for fitname, fc, other in (("fit A", A, B), ("fit B", B, A)):
    for zoned in (False, True):
        th = fit(fc, zoned)
        test = ratios("honest")
        L.append(f"  {fitname} {'zoned ' if zoned else 'global'}: other half {np.mean(other > th):.4f} "
                 f"({int((other > th).sum())}/{other.size}), test honest {np.mean(test > th):.4f} ({int((test > th).sum())}/{test.size})")
for fitname, fc in (("A", A), ("B", B), ("all 20", CAL)):
    L.append(f"Cheats, thresholds fitted on {fitname}: flag share, mean q, catch at k = {KS} (global rule -> zoned rule)")
    for cfg in CONFIGS:
        r = ratios(cfg)
        row = []
        for zoned in (False, True):
            th = fit(fc, zoned)
            q = (r > th).sum(1)
            row.append((np.mean(r > th), q.mean(), [np.mean([catch(x, k) for x in q]) for k in KS]))
        (f0, q0, c0), (f1, q1, c1) = row
        L.append(f"  {cfg:<12} flag {f0:.3f} -> {f1:.3f}  q {q0:5.2f} -> {q1:5.2f}  "
                 + "  ".join(f"k={k}: {a:.3f} -> {b:.3f}" for k, a, b in zip(KS, c0, c1)))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
