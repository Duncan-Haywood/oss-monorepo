import random
from forgetting_law import peak_lag, peak_forget
from replay_law import *

print("E1 exact replay curve vs simulation, d=12 r=3, replay every 4th step (20000 runs)")
rng = random.Random(1)
sim = simulate_curve(12, 3, lambda t, g: t % 4 == 0, 12, 20000, rng)
ex = curve(12, 3, lambda t: t % 4 == 0, 12)
for t in range(1, 13):
    print(f" step {t:2d} exact {ex[t-1]:.5f} sim {sim[t-1]:.5f}")

print("\nE2 one replay: best step t* vs forgetting-peak lag, and total forgetting kept (ratio to no replay)")
for d, r in [(8, 1), (12, 3), (32, 1), (32, 4), (32, 8), (128, 8), (128, 1)]:
    t, ratio = best_one_shot(d, r)
    print(f" d={d:4d} r={r:2d} peak lag {peak_lag(d,r):6.2f}  best replay step {t:3d}  total kept {ratio:.3f}  "
          f"replay at step 1 {total_one_shot(d,r,1)/total_none(d,r):.3f}  at 2*peak {total_one_shot(d,r,max(1,round(2*peak_lag(d,r))))/total_none(d,r):.3f}")

print("\nE3 replay rate vs total forgetting (ratio to none): Bernoulli q, periodic n=1/q")
for d, r in [(12, 3), (32, 4), (128, 8), (32, 1)]:
    print(f" d={d} r={r} peak lag {peak_lag(d,r):.1f}")
    for n in (2, 3, 4, 6, 8, 12, 16, 32):
        b = total_bernoulli(d, r, 1 / n) / total_none(d, r)
        p = total_periodic(d, r, n) / total_none(d, r)
        print(f"   1/{n:2d}: bernoulli {b:.3f}  periodic {p:.3f}  {'periodic better' if p < b else 'RANDOM better'}")

print("\nE4 Bernoulli total vs simulation (d=12 r=3, T=200 steps, 3000 runs)")
rng = random.Random(3)
for q in (0.1, 0.25, 0.5):
    s = simulate_bernoulli_total(12, 3, q, 200, 3000, rng)
    print(f" q={q}: exact {total_bernoulli(12,3,q):.4f} sim {s:.4f}")

print("\nE5 replay rate needed to keep a fraction of total forgetting")
for d, r in [(12, 3), (32, 4), (128, 8), (32, 1), (128, 1)]:
    print(f" d={d:3d} r={r}: " + "  ".join(f"keep {f:.2f}: q={replay_rate_for(d,r,f):.3f}" for f in (0.75, 0.5, 0.25, 0.1)))

print("\nE6 peak of the expected curve under replay (d=32 r=4)")
print(f" none: peak {peak(32,4,lambda t: False,400)}")
for n in (2, 4, 8, 16):
    print(f" every {n:2d}: peak (step, loss) {peak(32,4,lambda t,n=n: t%n==0,400)}")

print("\nE7 big tasks (2r >= d): one replay recovers everything")
print(f" d=6 r=3: total after replay at step 1 {total_one_shot(6,3,1):.4f}, none {total_none(6,3):.4f}")
