import math, random
from audit_staffing import *

print("E1 Erlang C vs simulation (M/M/10, R=8, 200k time units)")
rng = random.Random(1)
m, p, w = simulate(10, 8.0, lambda r: r.expovariate(1.0), 200000, rng)
print(f"  P(wait): exact {erlang_c(10,8):.4f}  sim {p:.4f}   E[Wq]: exact {mean_wait(10,8):.4f}  sim {m:.4f}")
for t in (0.5, 1.0, 2.0):
    print(f"  P(Wq>{t}): exact {wait_tail(10,8,t):.4f}  sim {sum(1 for x in w if x>t)/len(w):.4f}")

print("\nE2 square-root staffing for P(wait) <= 0.2: exact minimal c vs R + beta sqrt(R), beta=%.3f" % hw_beta(0.2))
print("  R        exact c   R+b*sqrt(R)   spare capacity   utilisation")
for R in (5, 20, 100, 500, 2500, 10000):
    c = min_servers(R, 0.2)
    print(f"  {R:<8} {c:<9} {hw_servers(R,0.2):<13.1f} {str(round(100*(c-R)/R,1))+chr(37):<16}{R/c:.3f}")

print("\nE3 stake vs verifier capacity: lam=100 jobs/unit, G=1, audit takes s=1, wage w=1 per verifier, capital rate r=0.01, window d0=1, P(wait)<=0.2")
print("  stake S  audit a   R      c     cost")
for S in (0.5, 1, 2, 4, 9, 15, 30, 60):
    v, c, R = cost(S, 100, 1, 1, 1, 0.01, 1, 0.2)
    print(f"  {S:<8} {audit_prob(1,S):<8.3f} {R:<6.1f} {c:<5} {v:.2f}")
v, S, c, R = best_stake(100, 1, 1, 1, 0.01, 1, 0.2)
print(f"  optimum S={S:.2f} (first-order sqrt rule S*={stake_star(1,1,1,0.01,1):.2f}), c={c}, cost {v:.2f}")
print("  how the optimum moves with capital cost r (w=1):")
for r in (0.0025, 0.01, 0.04, 0.16, 0.64):
    v, S, c, R = best_stake(100, 1, 1, 1, r, 1, 0.2, S_max=200)
    print(f"    r={r:<6} exact S={S:<7.2f} rule S*={max(stake_star(1,1,1,r,1),0):<7.2f} c={c:<4} cost {v:.2f}")

print("\nE4 service variability: E[Wq] at c=10, R=8, simulated vs Allen-Cunneen (cs2 = squared coeff. of variation)")
print("  service           cs2    sim      Allen-Cunneen")
for name, cs2, f in (("deterministic", 0.0, lambda r: 1.0), ("exponential", 1.0, lambda r: r.expovariate(1.0)),
                     ("lognormal s=1", math.exp(1) - 1, lambda r: r.lognormvariate(-0.5, 1.0)),
                     ("lognormal s=1.5", math.exp(2.25) - 1, lambda r: r.lognormvariate(-1.125, 1.5))):
    rng = random.Random(7)
    m = simulate(10, 8.0, f, 300000, rng)[0]
    print(f"  {name:<17} {cs2:<6.2f} {m:<8.3f} {allen_cunneen(10,8.0,1.0,cs2):.3f}")

print("\nE5 bursty audit demand (geometric batches, mean b, exponential service, c=10, R=8): E[Wq] and P(wait)")
print("  b   sim E[Wq]  sim P(wait)   Poisson E[Wq]   Allen-Cunneen with ca2=E[B^2]/E[B]")
for b in (1, 2, 4):
    q = 1.0 / b
    samp = lambda r, q=q: 1 + int(math.log(1 - r.random()) / math.log(1 - q)) if q < 1 else 1
    rng = random.Random(11)
    m, p, _ = simulate(10, 8.0, lambda r: r.expovariate(1.0), 300000, rng, batch=(samp, b))
    EB2 = (2 - q) / q ** 2
    print(f"  {b:<3} {m:<10.3f} {p:<13.3f} {mean_wait(10,8):<15.3f} {allen_cunneen(10,8.0,EB2/b,1.0):.3f}")

print("\nE6 flaky verifiers: each of c up with probability u for the period; c needed for P(wait)<=0.2 at R=20 (u=1: %d)" % min_servers(20, 0.2))
print("  u      c needed   naive c/u   extra")
for u in (0.99, 0.95, 0.9, 0.8, 0.7):
    c = flaky_servers(20.0, u, 0.2)
    print(f"  {u:<6} {c:<10} {min_servers(20,0.2)/u:<11.1f} {c-min_servers(20,0.2)/u:+.1f}")
