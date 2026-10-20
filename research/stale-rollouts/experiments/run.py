import math, random
from stale_rollouts import *

print("E1 ESS fraction e^{-d^2}: exact vs Kish ESS from 200000 simulated weights (seed 4)")
rng = random.Random(4)
for d in (0.25, 0.5, 1.0, 1.5):
    *_, k = simulate(d, 1e12, 200000, rng)
    print(f"  delta={d:4.2f}  exact {ess_fraction(d):.4f}  simulated {k:.4f}  Var w exact {math.exp(d*d)-1:.4f}")

print("E2 truncated IS: closed-form bias/variance vs simulation (delta=1, c=3, 1e6 draws, seed 5)")
rng = random.Random(5)
d, c, n = 1.0, 3.0, 1000000
m1 = m2 = 0.0
for _ in range(n):
    z = rng.gauss(0, 1); w = min(math.exp(d * z - .5 * d * d), c); m1 += w * z; m2 += (w * z) ** 2
cm, cs = trunc_moments(d, c)
print(f"  mean  closed {cm:.4f} sim {m1/n:.4f} (true {d});  E[(w_c z)^2] closed {cs:.4f} sim {m2/n:.4f}; weight mass lost {trunc_mass_lost(d,c):.4f}")

print("E3 MSE of the policy-shift estimate, n=100 stale samples: plain IS vs best cap")
for d in (0.5, 1.0, 1.5, 2.0, 3.0):
    cb, eb = best_cap(d, 100)
    print(f"  delta={d:3.1f}  plain {mse_plain(d,100):12.4f}  best cap c={cb:7.2f} MSE {eb:8.4f}  ratio {mse_plain(d,100)/eb:9.1f}x")

print("E4 staleness window k_max = floor(sqrt(ln(1/rho))/drift)")
for rho in (0.5, 0.25, 0.1):
    print("  rho=%.2f  " % rho + "  ".join(f"drift {dr}: k_max={window(rho,dr)}" for dr in (0.05, 0.1, 0.25, 0.5)))

print("E5 value of a stale batch: n=1000 samples at lag k with drift 0.2 -> effective fresh samples")
for k in (0, 1, 2, 4, 8, 12):
    print(f"  lag {k:2d}  delta={0.2*k:.2f}  ESS {effective_size(1000, 0.2*k):8.1f}")
