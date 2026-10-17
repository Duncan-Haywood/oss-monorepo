"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import numpy as np
from collections import Counter
from ambient_rechime.sim import (Params, URGENCY, contexts, utility, best_n, mean_utility, simulate, with_)

P = Params()
C = contexts()
NS = (0, 1, 2, 3, 4)
print(f"{len(C)} contexts x {len(URGENCY)} urgency classes; tones every {P.gap} s, cancelled on look\n")

print("1. Best number of tones by urgency (share of contexts; 0 = plain glance)")
for u, (d, w, _) in URGENCY.items():
    cnt = Counter(best_n(P, c, u, NS) for c in C)
    print(f"  {u:7s}", {n: round(cnt[n] / len(C), 2) for n in NS})

print("\n2. Mean utility per message (urgency mix) by allowed tones")
for k in (0, 1, 2, 3, 4):
    print(f"  fixed n={k}: {mean_utility(P, (k,)):.4f}")
for hi in (1, 2, 4):
    print(f"  best of 0..{hi}: {mean_utility(P, tuple(range(hi + 1))):.4f}")

print("\n3. Repeat gain by urgency (best of 0..4 minus best of 0..1)")
for u, (d, w, _) in URGENCY.items():
    g = np.mean([utility(P, best_n(P, c, u, NS), *c, d, w) - utility(P, best_n(P, c, u, NS[:2]), *c, d, w) for c in C])
    print(f"  {u:7s}: {g:.4f}")

print("\n4. Monte Carlo check (|closed form - simulation|, 200000 draws)")
rng = np.random.default_rng(0)
worst = 0.0
for stop in (True, False):
    q = with_(P, stop_on_look=stop)
    for c in [(6, 0.5, 1, False), (12, 1.0, 0, True), (3, 0.0, 1, False)]:
        for u, (d, w, _) in URGENCY.items():
            for n in (0, 1, 3):
                worst = max(worst, abs(utility(q, n, *c, d, w) - simulate(q, n, *c, d, w, 200000, rng)))
print(f"  worst abs difference over {2*3*3*3} cases: {worst:.4f}")

print("\n5. Gain of repeating (best of 0..4 minus best of 0..1, per message) vs gap and cancelling")
print("  gap  stop  gain")
for stop in (True, False):
    for gap in (1.0, 3.0, 6.0, 12.0):
        q = with_(P, gap=gap, stop_on_look=stop)
        print(f"  {gap:4.1f} {str(stop):5s} {mean_utility(q, NS) - mean_utility(q, NS[:2]):.4f}")

print("\n6. Mean utility vs chime_mask (high urgency, tones n=1 vs best of 0..4, all contexts)")
print("  mask  one_tone  best_0to4")
for m in (0.0, 0.25, 0.5, 0.75, 1.0):
    q = with_(P, chime_mask=m)
    d, w, _ = URGENCY["high"]
    one = np.mean([max(utility(q, n, *c, d, w) for n in (0, 1)) for c in C])
    best = np.mean([max(utility(q, n, *c, d, w) for n in NS) for c in C])
    print(f"  {m:4.2f}  {one:.4f}   {best:.4f}")
