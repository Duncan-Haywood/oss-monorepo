from gossip_consensus import *

print("E1 contraction of Phi in one step (Monte Carlo vs closed form)")
for n in (8, 32, 128):
    print(f" n={n:4d} pair mc={mean_contraction(n,'pair'):.4f} exact={pair_contraction(n):.4f} | "
          f"matching mc={mean_contraction(n,'match'):.4f} exact={matching_contraction(n):.4f}")

print("E2 rounds of matching gossip to shrink E[Phi] by 1e-6 (all-reduce: 1 round)")
for n in (8, 64, 1024, 10**6):
    print(f" n={n:8d} rounds={rounds_to_eps(n,1e-6)}")

print("E3 steady-state disagreement Phi with per-round noise s2=1")
for n in (8, 32, 128):
    print(f" n={n:4d} sim={steady_phi(n,1.0,rounds=20000,burn=100):.2f} formula={stationary_phi(n,1.0):.2f}")

print("E4 one stubborn node at c=50, n=16, honest start N(0,1); honest-mean shift after t steps")
n, c = 16, 50.0
for t in (100, 500, 2000):
    m, d = stubborn_run(n, c, t, reps=150)
    pred = c - c * stubborn_gap_decay(n) ** t
    print(f" t={t:5d} unclipped mean shift={m:6.2f} predicted={pred:6.2f} (disagreement/node {d:.3f})")
    for tau in (0.5, 2.0):
        m2, d2 = stubborn_run(n, c, t, tau=tau, reps=150)
        print(f"          clip tau={tau}: shift={m2:6.2f} bound={t*clipped_drift_rate(n,tau):6.2f} (disagreement/node {d2:.3f})")

print("E5 price of clipping with no attacker: honest disagreement/node after 300 steps, n=16, start N(0,10^2)")
for tau in (None, 20.0, 5.0, 1.0):
    rng = random.Random(3); tot = 0.0
    for _ in range(100):
        x = [rng.gauss(0, 10) for _ in range(16)]
        for _ in range(300):
            i, j = rng.sample(range(16), 2); pair_step(x, i, j, tau)
        tot += phi(x) / 16
    print(f" tau={tau}: {tot/100:.2e}")
