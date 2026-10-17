import random, statistics, math
from sleeping_incentives import *

eta = 0.25
print("E1  leave-one-out identity: transfer_i = eta W_A (1-p_i) S_i  (exact; see tests, 300 random rounds)")
rng = random.Random(0); worst = 0
for _ in range(300):
    N = rng.randint(2, 6); w = [rng.random() + .05 for _ in range(N)]; A = sorted(rng.sample(range(N), rng.randint(2, N)))
    l = [rng.random() for _ in range(N)]; w2 = step(w, A, l, eta)
    for i in A:
        S, p, lh, WA = loo_saving(w, A, l, i); worst = max(worst, abs(w2[i] - w[i] - eta * WA * (1 - p) * S))
print(f"    max abs error {worst:.2e}")

print("\nE2  post-hoc threshold sleeping vs honest equal-skill rival (eta=.25, s0=.1): rounds until A's share > 0.9 (median of 60 seeds)")
print("    theta  kappa   predicted  measured  realised router loss")
for th in [1.0, .8, .6, .5, .4, .2]:
    k = kappa(th); rounds = []; losses = []
    for seed in range(60):
        sh, rl = sim_expost(.1, eta, th, 4000, random.Random(seed))
        rounds.append(next((t for t, s in enumerate(sh) if s > .9), None)); losses.append(sum(rl) / len(rl))
    got = [r for r in rounds if r is not None]
    pred = mean_field_rounds(.1, .9, eta, k) if k > 0 else float("inf")
    med = f"{statistics.median(got):8.0f}" if len(got) > 30 else "   never"
    print(f"    {th:4.1f}  {k:.4f}  {pred:9.0f}  {med}  {statistics.mean(losses):.4f}")

print("\nE3  ex-ante sleeping on a noisy own-loss signal, router serves the awake mixture (theta optimal per nu)")
print("    nu     theta*   g*      ledger growth eta*g (s=.5: eta s(1-s)g)   real router saving s*g at s=.5")
for nu in [0.0, .1, .3, 1.0, 3.0]:
    th, g = best_theta(nu)
    print(f"    {nu:4.1f}   {th:5.2f}   {g:.4f}   {eta*.25*g:.5f}                              {.5*g:.5f}")
rng = random.Random(5); sav = []
for seed in range(5):
    sh, rl = sim_exante(.5, 1e-7, .5, 0.0, 40000, random.Random(seed)); sav.append(.5 - sum(rl) / len(rl))
print(f"    simulated saving at nu=0, s=.5: {statistics.mean(sav):.4f} (formula {.5*g_signal(.5,0.0):.4f}); contrast E2: post-hoc saving is 0.000")

print("\nE4  sleeping tax deterrence (eta=.25): best threshold for A, and cost to an honest specialist asleep 90% of rounds")
print("    p_B    tau*=eta p_B/2   best theta at .9 tau*   at 1.1 tau*")
for pB in [1.0, .5, .1]:
    ts = tax_deterrence_threshold(eta, pB)
    print(f"    {pB:.1f}    {ts:.4f}           {tax_best_theta(eta,pB,.9*ts)[0]:.3f}                   {tax_best_theta(eta,pB,1.1*ts)[0]:.3f}")
for tau in [.125, .0625, .0125]:
    print(f"    tau={tau}: honest specialist (phi=.9) halves its wealth in {honest_decay_halflife(tau,.9):.1f} rounds")
