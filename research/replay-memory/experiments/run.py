import random
from forgetting_law import peak_lag
from replay_memory import *

print("E1 exact partial-replay curve vs simulation, d=12 r=4, m stored examples replayed every 3rd step (6000 runs)")
rng = random.Random(1)
for m in (1, 2, 3):
    sim = simulate_curve(12, 4, lambda t, g, m=m: m if t % 3 == 0 else 0, 8, 6000, rng)
    ex = curve(12, 4, lambda t, m=m: m if t % 3 == 0 else 0, 8)
    print(f" m={m}: " + " ".join(f"{e:.4f}/{s:.4f}" for e, s in zip(ex, sim)) + "   (exact/sim, steps 1..8)")

print("\nE2 one replay at its best step: fraction of the full-memory saving kept with m of r stored examples")
for d, r in [(12, 4), (32, 4), (32, 8), (128, 8), (128, 16)]:
    print(f" d={d:3d} r={r:2d} peak lag {peak_lag(d,r):6.2f}  " +
          "  ".join(f"m/r={m/r:.2f}: {one_shot_benefit(d, r, m):.3f} (t*={best_one_shot(d,r,m)[0]})" for m in range(1, r + 1) if r <= 8 or m in (r // 4, r // 2, 3 * r // 4, r)))

print("\nE3 Bernoulli replay at rate q: total forgetting as a fraction of no replay, by memory m/r")
for d, r in [(32, 8), (128, 16)]:
    print(f" d={d} r={r}")
    for q in (0.05, 0.1, 0.25, 0.5):
        print(f"   q={q:4.2f}: " + "  ".join(f"m={m}: {total_bernoulli(d,r,q,m)/total_none(d,r):.3f}" for m in (r // 4, r // 2, 3 * r // 4, r)))

print("\nE4 fixed budget of c examples per step: rate c/m with m per replay. Best m and total fraction of no replay")
for d, r in [(32, 8), (128, 16), (12, 4), (64, 4)]:
    print(f" d={d} r={r}")
    for c in (0.25, 0.5, 1.0, 2.0):
        m, tot, allv = best_split(d, r, c)
        print(f"   c={c:4.2f}: best m={m:2d} total {tot/total_none(d,r):.3f}   " +
              "  ".join(f"m={k}: {v/total_none(d,r):.3f}" for k, v in allv.items() if k in (1, r // 2, r)))

print("\nE5 peak of the expected curve, periodic replay every 4 steps (d=128 r=8, peak lag 10.8)")
for m in (0, 2, 4, 6, 8):
    print(f" m={m}: peak (step, loss) {peak(128, 8, lambda t, m=m: m if t % 4 == 0 else 0, 400)}")

print("\nE6 replay size vs budget at fixed rate: minimum m/r to reach half of the full-memory Bernoulli saving (q=0.25)")
for d, r in [(32, 8), (128, 16), (32, 4)]:
    z, f = total_none(d, r), total_bernoulli(d, r, 0.25, r)
    half = next(m for m in range(1, r + 1) if z - total_bernoulli(d, r, 0.25, m) >= (z - f) / 2)
    print(f" d={d} r={r}: m={half} of {r} ({half/r:.2f}) gives half; m=r/2 gives {(z-total_bernoulli(d,r,0.25,r//2))/(z-f):.3f} of the saving")
