import math, random
from forgetting_audit import *

d, r, T = 16, 2, 24
print(f"setup: d={d} r={r} T={T} tasks, |e_init|=1; loss = |P e|^2 at the final checkpoint; one audit sample per job")

print("\nE1 exact law vs simulation (6000 jobs each): mean loss of the task at position t (lag T-t) and of a fresh task")
rng = random.Random(1)
cases = [("honest", (1, 1), lambda g: 1.0), ("skip 20%", moments_skip(.2), lambda g: 0.0 if g.random() < .2 else 1.0),
         ("step 0.5", moments_step(.5), lambda g: .5)]
pools = {}
for name, m, draw in cases:
    per, fr = collect(d, r, T, draw, 6000, rng)
    pools[name] = (per, fr)
    print(f" {name:9s} rho={rho(d,r,m):.4f} lam={lam(d,r,m):.4f}")
    for t in (1, 8, 16, 22, 24):
        sim = sum(per[t-1]) / len(per[t-1])
        print(f"   t={t:2d} (lag {T-t:2d}): law {audit_mean(d,r,m,t,T):.5f} sim {sim:.5f}")
    print(f"   fresh      : law {fresh_mean(d,r,m,T):.5f} sim {sum(fr)/len(fr):.5f}")

print(f"\nE2 skipped vs honest task at the same lag (theory): ratio -> floor d/(d-r) = {ratio_floor(d,r):.4f}")
for k in (1, 2, 4, 8, 16, 32, 64):
    print(f" lag {k:2d}: skipped/honest = {skip_ratio(d,r,k):.3f}")
for rt in (2.0, 1.5, 1.3, 1.2):
    print(f" ratio >= {rt}: window k <= {window(d,r,rt):.2f}")
for dd, rr in [(16, 2), (64, 2), (64, 8), (256, 4)]:
    print(f" d={dd} r={rr}: floor {ratio_floor(dd,rr):.3f}, ratio>=2 window k<= {window(dd,rr,2.0):.1f}, lag of ratio 1.5*floor: {window(dd,rr,1.5*ratio_floor(dd,rr)):.1f}")

print("\nE3 jobs needed (alpha=.05, power .8) to catch a trainer that skips 20% of tasks, by audit position")
h = pools["honest"]; c = pools["skip 20%"]
rows = [(t, samples_needed(h[0][t-1], c[0][t-1])) for t in range(1, T + 1)]
for t, n in rows:
    if t in (1, 2, 4, 8, 12, 16, 20, 22, 23, 24):
        print(f"  t={t:2d} (lag {T-t:2d}): N = {n:8.1f}")
nf = samples_needed(h[1], c[1])
print(f"  fresh task        : N = {nf:8.1f}")
best = min(rows, key=lambda x: x[1])
print(f"  best old-task position t={best[0]} (lag {T-best[0]}), N = {best[1]:.1f}")

print("\nE4 cheater economics: skip fraction s (compute saved) vs jobs the verifier needs (fresh-task audit, T=24, 8000 jobs/pool)")
rng = random.Random(4)
_, h0 = collect(d, r, T, lambda g: 1.0, 8000, rng)
for s in (0.02, 0.05, 0.1, 0.2, 0.4):
    _, hs = collect(d, r, T, lambda g, s=s: 0.0 if g.random() < s else 1.0, 8000, rng)
    n = samples_needed(h0, hs)
    N = math.ceil(n)
    size, pw = test_power(h0, hs, N, .05, 1000, rng)
    print(f"  s={s:4.2f}: N={n:8.1f}  N*s^2={n*s*s:6.2f}  empirical size {size:.3f} power {pw:.3f} at N={N}")

print("\nE5 same, partial training (step fraction a on every task), fresh-task audit")
for a in (0.95, 0.9, 0.8, 0.5):
    _, ha = collect(d, r, T, lambda g, a=a: a, 8000, rng)
    n = samples_needed(h0, ha)
    print(f"  a={a}: fresh-loss law ratio {fresh_mean(d,r,moments_step(a),T)/fresh_mean(d,r,(1,1),T):.2f}, N={n:.1f}")

print("\nE6 horizon effect: jobs needed to catch 10% skipping with a fresh-task audit vs T")
for Tn in (4, 8, 16, 32, 48):
    _, f0 = collect(d, r, Tn, lambda g: 1.0, 6000, rng)
    _, f1 = collect(d, r, Tn, lambda g: 0.0 if g.random() < .1 else 1.0, 6000, rng)
    print(f"  T={Tn:2d}: mean-loss ratio {fresh_mean(d,r,moments_skip(.1),Tn)/fresh_mean(d,r,(1,1),Tn):.2f}, N={samples_needed(f0,f1):.1f}")
