import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from delayed_routing import *

SEEDS = 8

print("== E1  bound tightness: measured regret / [ln N/eta + eta T/8 + eta D/2], eta=eta_opt(D) ==")
T, N = 4000, 8
for name, gen in (("bernoulli gap .1", lambda s: bernoulli_losses(T, N, 0.1, s)),
                  ("switching b=100", lambda s: switching_losses(T, N, 100, s))):
    for mean in (0, 5, 20, 100):
        rs = []
        for s in range(SEEDS):
            ls = gen(s); dl = geometric_delays(T, mean, 100 + s); D = sum(outstanding(dl))
            eta = eta_opt(N, T, D); o = play(ls, dl, eta); rs.append(o["regret"] / bound(N, T, o["D"], eta))
        m, se = run_stats(rs); print(f"{name:18s} mean delay {mean:4d}  regret/bound = {m:.3f} +- {se:.3f}")

print("\n== E2  punish-the-leader adversary, N=2, T=4000: regret vs constant delay d ==")
T = 4000
print(" d    regret(eta_delay-blind)  regret(eta_opt(D))   bound(eta_opt)   sqrt(1+4d) growth of bound")
base = None
for d in (0, 1, 3, 10, 30, 100):
    dl = [d] * T; D = sum(outstanding(dl))
    blind = play([[0, 0]] * T, dl, eta_oracle(2, T), adversary=punish_leader(2))["regret"]
    e = eta_opt(2, T, D); tuned = play([[0, 0]] * T, dl, e, adversary=punish_leader(2))["regret"]
    b = bound(2, T, D, e); base = base or b
    print(f"{d:4d}  {blind:9.1f}              {tuned:9.1f}          {b:9.1f}       x{b/base:.2f} (theory x{math.sqrt(1+4*d*(1-d/(2*T))*1.0):.2f})")

print("\n== E3  heterogeneous fleet vs uniform delay at the same D: switching losses N=8 T=4000 ==")
T, N = 4000, 8
for frac, slow in ((0.02, 500), (0.1, 100), (0.5, 20), (1.0, 10)):
    rs_m, rs_g = [], []
    for s in range(SEEDS):
        ls = switching_losses(T, N, 100, s)
        dm = mixed_delays(T, frac, slow, 200 + s); Dm = sum(outstanding(dm)); e = eta_opt(N, T, Dm)
        rs_m.append(play(ls, dm, e)["regret"])
        dg = geometric_delays(T, frac * slow, 300 + s); Dg = sum(outstanding(dg)); e = eta_opt(N, T, Dg)
        rs_g.append(play(ls, dg, e)["regret"])
    (a, sa), (b, sb) = run_stats(rs_m), run_stats(rs_g)
    print(f"frac slow {frac:4.2f} x delay {slow:3d} (mean {frac*slow:5.1f}): mixed fleet regret {a:6.1f}+-{sa:4.1f}   geometric same mean {b:6.1f}+-{sb:4.1f}")

print("\n== E4  learning-rate rules under mean delay 20, switching b=100, N=8, T=4000 ==")
T, N = 4000, 8
res = {k: [] for k in ("delay-blind", "oracle eta_opt(D)", "adaptive (observed)", "3x too big", "3x too small")}
for s in range(SEEDS):
    ls = switching_losses(T, N, 100, s); dl = geometric_delays(T, 20, 400 + s); D = sum(outstanding(dl)); e = eta_opt(N, T, D)
    res["delay-blind"].append(play(ls, dl, eta_oracle(N, T))["regret"])
    res["oracle eta_opt(D)"].append(play(ls, dl, e)["regret"])
    res["adaptive (observed)"].append(play(ls, dl, eta_adaptive(N))["regret"])
    res["3x too big"].append(play(ls, dl, 3 * e)["regret"])
    res["3x too small"].append(play(ls, dl, e / 3)["regret"])
for k, v in res.items():
    m, se = run_stats(v); print(f"{k:22s} regret {m:7.1f} +- {se:4.1f}")

print("\n== E5  subsidy of an LMSR router that must hit per-round regret target 0.05 ==")
N = 8
print("mean delay  rounds needed T*  (bound 2sqrt(lnN*T(1/8+dbar/2)) <= 0.05 T)   liquidity b=1/eta   worst-case MM loss b ln N")
for dbar in (0, 5, 20, 100):
    # D ~ dbar*T; solve for T: 2 sqrt(lnN (1/8 + dbar/2) T) = 0.05 T  -> T = 4 lnN (1/8+dbar/2)/0.05^2
    Ts = 4 * math.log(N) * (1 / 8 + dbar / 2) / 0.05 ** 2
    eta = eta_opt(N, Ts, dbar * Ts); b = lmsr_liquidity(eta)
    print(f"{dbar:9d}  {Ts:16,.0f}                                                       {b:10.1f}        {b*math.log(N):10.1f}")
