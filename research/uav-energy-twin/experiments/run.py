"""UAV leg planned in a constant-wind twin. Base case (chosen, not measured): headwind mean 0.3 V0, uniform half-width 0.25 V0."""
import math, os, random, statistics, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from uav_energy_twin.model import *

REAL = Params(0.3, 0.25)
vo = v_opt(REAL)
J0 = energy_per_dist(REAL, vo)

print("== 1. Closed forms vs Monte Carlo (300k winds), real law mu=0.3, a=0.25")
rng = random.Random(0)
print("%-6s %-12s %-12s %-10s %-10s" % ("v", "exact J", "MC J", "twin J", "Jensen x"))
for v in (0.8, 1.0, 1.2, 1.5):
    mc, st = simulate_energy(REAL, v, 300_000, rng)
    print("%-6.2f %-12.5f %-12.5f %-10.5f %-10.4f" % (v, energy_per_dist(REAL, v), mc, twin_energy(REAL, v), jensen_factor(REAL, v)))
v_t = v_twin(REAL.mu)
print("twin speed (quintic root) %.5f V0; real optimum %.5f V0; J(real opt) %.5f; twin claims %.5f at its own speed" % (v_t, vo, J0, twin_energy(REAL, v_t)))
print("zero-wind speed check: v_twin(0) = %.6f" % v_twin(0.0))

print("\n== 2. Twin planning speed and the Jensen gap on the energy claim (real a=0.25, mu=0.3)")
print("twin claim %.5f vs real expected energy at the twin's speed %.5f -> real/claim = %.4f (Jensen factor artanh(x)/x, x=a/(v-mu)=%.3f)" % (
    twin_energy(REAL, v_t), energy_per_dist(REAL, v_t), energy_per_dist(REAL, v_t) / twin_energy(REAL, v_t), REAL.a / (v_t - REAL.mu)))
print("regret of the twin's speed = %.6f (%.3f%% of J*)" % (regret(REAL, v_t), 100 * regret(REAL, v_t) / J0))

print("\n== 3. Sweep the real wind half-width a (mean fixed 0.3): claim gap, speed error, regret, and the stall cliff")
print("%-6s %-9s %-9s %-11s %-12s %-10s %-10s" % ("a", "v_real", "v_twin", "real/claim", "regret/J*", "stall P", "mu+a"))
for a in (0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0):
    r = REAL.replace(a=a)
    vr = v_opt(r)
    reg = regret(r, v_t)
    ratio = energy_per_dist(r, v_t) / twin_energy(r, v_t)
    print("%-6.2f %-9.4f %-9.4f %-11s %-12s %-10.4f %-10.2f" % (a, vr, v_t, "%.4f" % ratio if ratio < math.inf else "inf",
          "%.5f" % (reg / energy_per_dist(r, vr)) if reg < math.inf else "inf", stall_prob(r, v_t), r.mu + a))
g = v_t - REAL.mu
print("cliff: the twin speed %.4f stalls in the real wind iff mu + a > v_twin, i.e. a > %.4f" % (v_t, g))

print("\n== 4. Battery reserve: twin says B = nominal energy x (1+m). Real depletion probability (exact) at the twin's speed")
print("%-8s %-14s %-14s" % ("m", "twin says", "real depletion"))
for m in (0.0, 0.02, 0.05, 0.10, 0.20, 0.30, 0.50):
    print("%-8.2f %-14.3f %-14.4f" % (m, 0.0, depletion_prob(REAL, v_t, m)))
print("required margin for real depletion <= eps (the twin's answer is m = 0 for any eps):")
for eps in (0.25, 0.1, 0.05, 0.01, 0.001):
    m = margin_for(REAL, v_t, eps)
    print("  eps=%-6g m=%s" % (eps, "%.4f" % m if m is not None else "none (stall)"))
rng = random.Random(5)
m = margin_for(REAL, v_t, 0.05)
B = twin_energy(Params(REAL.mu, 0.0), v_t) * (1 + m)
N = 400_000
hits = sum(P(v_t) / (v_t - rng.uniform(REAL.mu - REAL.a, REAL.mu + REAL.a)) > B for _ in range(N))
print("MC check of margin %.4f: depletion %.4f (target 0.05)" % (m, hits / N))
print("required margin at the *real*-optimal speed %.4f for eps=0.05: %.4f (vs %.4f at twin speed)" % (vo, margin_for(REAL, vo, 0.05), margin_for(REAL, v_t, 0.05)))

print("\n== 5. Wrong mean wind in the twin (twin mu_hat = mu + delta, twin spread 0), real a = 0.25")
print("%-8s %-9s %-11s %-12s %-14s" % ("delta", "v_twin", "regret/J*", "stall P", "depl @ m=0.10"))
for d in (-0.2, -0.1, -0.05, 0.05, 0.1, 0.2):
    vt = v_twin(REAL.mu + d)
    reg = regret(REAL, vt)
    print("%-8.2f %-9.4f %-11s %-12.4f %-14.4f" % (d, vt, "%.5f" % (reg / J0) if reg < math.inf else "inf", stall_prob(REAL, vt), depletion_prob(REAL, vt, 0.10, plan_mu=REAL.mu + d)))

print("\n== 6. Repair by logging n real winds and refitting the twin (moment fit; 3000 fits each, real a=0.25)")
print("%-6s %-12s %-12s %-14s %-12s" % ("n", "mean regret", "P(stall)", "P(beat twin)", "twin regret"))
tw_reg = regret(REAL, v_t)
for n in (3, 5, 10, 20, 50, 200):
    rng = random.Random(100 + n)
    regs, stalls = [], 0
    for _ in range(3000):
        q = fit_uniform(REAL, n, rng)
        vq = v_opt(q)
        stalls += stall_prob(REAL, vq) > 0
        regs.append(regret(REAL, vq))
    fin = [r for r in regs if r < math.inf]
    print("%-6d %-12.6f %-12.4f %-14.3f %-12.6f" % (n, statistics.fmean(fin), stalls / len(regs), sum(r < tw_reg for r in regs) / len(regs), tw_reg))
