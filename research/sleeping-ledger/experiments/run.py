import math, random
from sleeping_ledger import *

print("E1 random instances (300, N in 2..6, T in 20..300, random wake rates, losses in [0,1], eta in {.05,.1,.25,.5}): bounds and budget balance")
rng = random.Random(1)
bal = 0.0; slack_lin = -1e9; slack_exp = -1e9; ratio_lin = 0.0; grew = 0
for trial in range(300):
    N = rng.randint(2, 6); T = rng.randint(20, 300)
    pi = [rng.random() + .05 for _ in range(N)]; s = sum(pi); pi = [x / s for x in pi]
    q = rng.random(); awake = []; losses = []
    for t in range(T):
        A = [i for i in range(N) if rng.random() < q] or [rng.randrange(N)]
        awake.append(A); losses.append({i: (rng.choice([0, 1]) if rng.random() < .5 else rng.random()) for i in A})
    eta = rng.choice([.05, .1, .25, .5])
    o = run_ledger(pi, awake, losses, eta); e = run_ledger(pi, awake, losses, eta, "exp")
    bal = max(bal, abs(sum(o["w"]) - 1)); grew += sum(e["w"]) >= 1 - 1e-12
    for i in range(N):
        r, n, _ = per_module_regret(o, awake, losses, i)
        if n: slack_lin = max(slack_lin, r - regret_bound_linear(pi[i], n, eta)); ratio_lin = max(ratio_lin, r / regret_bound_linear(pi[i], n, eta))
        r, n, _ = per_module_regret(e, awake, losses, i)
        if n: slack_exp = max(slack_exp, r - regret_bound_exp(pi[i], T, eta))
print(f"  max |total wealth - 1| linear ledger: {bal:.2e};  exponential ledger total wealth >= 1 in {grew}/300 runs")
print(f"  worst (regret - bound), linear: {slack_lin:.3f} (max regret/bound {ratio_lin:.3f});  exponential: {slack_exp:.3f}   (negative = bound holds)")

print("E2 tightness: module 0 has loss 0 and the other N-1 modules loss 1 on its n awake rounds, all awake, eta=0.5, pi uniform")
for N, n in [(4, 20), (16, 20), (16, 200)]:
    pi = [1.0 / N] * N; awake = [list(range(N))] * n; losses = [{i: (0.0 if i == 0 else 1.0) for i in range(N)}] * n
    o = run_ledger(pi, awake, losses, 0.5); r, _, _ = per_module_regret(o, awake, losses, 0)
    print(f"  N={N:2d} n={n:3d}  regret {r:.3f}  bound {regret_bound_linear(pi[0], n, 0.5):.3f}  (ln N/eta = {math.log(N)/0.5:.3f})")

print("E3 recurring regimes: K specialists asleep outside their own regime + always-awake generalist (loss 0.3); specialist loss 0.1 in regime; forced-to-report specialists lose 0.6 outside")
print("   cumulative mixture loss per round after 40 cycles, L=25 rounds per regime (eta=0.3 ledger, eta=0.3 hedge)")
for K in [3, 6, 12]:
    cycles, L = 40, 25
    awake, losses, reg = regime_instance(K, cycles, L, seed=K)
    pi = [1.0 / (K + 1)] * (K + 1)
    o = run_ledger(pi, awake, losses, 0.3); T = len(awake)
    orc = oracle_loss(awake, losses, range(K))
    full = full_losses_for_forced(awake, losses, K, 0.6)
    h = forced_hedge(K + 1, full, 0.3, filler=0.6, awake=awake)
    fs = fixed_share_forced(K + 1, full, 0.3, 0.02, filler=0.6, awake=awake)
    reg_l = sum(o["lhat"]) - orc
    bound = sum(regret_bound_linear(pi[i], cycles * L, 0.3) for i in range(K))
    print(f"  K={K:2d} T={T:5d}  oracle {orc/T:.4f}  ledger {sum(o['lhat'])/T:.4f}  forced Hedge {sum(h)/T:.4f}  fixed-share(.02) {sum(fs)/T:.4f}  |  ledger regret {reg_l:.1f} <= bound {bound:.1f}")

print("E4 memory: loss of the ledger in the first vs last cycle (K=6, L=25): frozen wealth means no relearning after a long absence")
K = 6; cycles, L = 40, 25
awake, losses, reg = regime_instance(K, cycles, L, seed=7)
o = run_ledger([1.0 / (K + 1)] * (K + 1), awake, losses, 0.3)
per = K * L
for c in [0, 1, 2, 10, 39]:
    seg = o["lhat"][c * per:(c + 1) * per]
    print(f"  cycle {c:2d}: mean loss {sum(seg)/per:.4f}   (specialist {0.1}, generalist {0.3})")
print("   regime-0 module wealth after cycle 0 / cycle 1 / cycle 10:", " / ".join(f"{o['hist'][c * per + L - 1][0]:.4f}" for c in [0, 1, 10]))
print("   wealth of module 0 is unchanged across the other K-1 regimes:", all(abs(o['hist'][t][0] - o['hist'][L - 1][0]) < 1e-15 for t in range(L, per)))

print("E5 admitting a new module: incumbents run T1=300 rounds, entrant (loss 0.05 vs incumbents 0.4) admitted with wealth eps funded pro rata; T2=300 rounds all awake, eta=0.25")
for eps in [0.5, 0.1, 0.01, 0.001]:
    N = 4; pi = [1.0 / N] * N; rng = random.Random(5)
    awake1 = [list(range(N))] * 300; losses1 = [{i: min(1, max(0, 0.4 + rng.uniform(-.1, .1))) for i in range(N)} for _ in range(300)]
    o1 = run_ledger(pi, awake1, losses1, 0.25)
    w = admit(o1["w"], eps)
    awake2 = [list(range(N + 1))] * 300
    losses2 = [{**{i: min(1, max(0, 0.4 + rng.uniform(-.1, .1))) for i in range(N)}, N: min(1, max(0, 0.05 + rng.uniform(-.05, .05)))} for _ in range(300)]
    o2 = run_ledger(w, awake2, losses2, 0.25)
    r_e, n_e, _ = per_module_regret(o2, awake2, losses2, N)
    # entrant regret from entry
    # time for the entrant to reach half of the wealth
    half = next((t for t, h in enumerate(o2["hist"]) if h[N] > 0.5), None)
    print(f"  eps={eps:6.3f}  entrant regret {r_e:6.2f} <= {regret_bound_linear(eps, n_e, .25):6.2f}   rounds to half the market: {half}   incumbent bound inflation ln(1/(1-eps))/eta = {math.log(1/(1-eps))/.25:.4f}")
