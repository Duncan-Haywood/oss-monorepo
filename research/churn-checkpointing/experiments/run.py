from churn_checkpointing import *
lam, C, R = 0.01, 1.0, 5.0
print("== exact segment time vs Monte Carlo ==")
for w in (2, 8, 20):
    print(f"w={w:3d} exact={seg_time(w,lam,C,R):8.4f} mc={simulate_segment(w,lam,C,R,300000,seed=1):8.4f}")
print("== Lambert-W optimum vs Young-Daly (C=1) ==")
for l in (1e-4, 1e-3, 1e-2, 5e-2, 0.2):
    ws, wy = w_opt(l, C), w_young(l, C)
    print(f"lam={l:<7g} w*={ws:8.3f} young={wy:8.3f} young/w*={wy/ws:.3f} overhead@w*={overhead(ws,l,C,R):.4f} overhead@young={overhead(wy,l,C,R):.4f}")
print("== misspecified interval a*w*  (lam=0.01, C=1, R=5) ==")
for a in (0.25, 0.5, 0.8, 1.25, 2, 4):
    print(f"a={a:<5} overhead ratio={misspec_ratio(a,lam,C,R):.4f}")
print("== synchronous scaling wall (lam=1e-4 per worker, C=1, R=5) ==")
for n in (1, 10, 100, 1000, 3000, 10000):
    L = n * 1e-4
    print(f"n={n:6d} w*={w_opt(L,C):8.2f} efficiency={sync_efficiency(n,1e-4,C,R):.4f}")
print("n_half(50%) =", n_half(1e-4, C, R), " n at 90% =", n_half(1e-4, C, R, 0.9), " C=10:", n_half(1e-4, 10.0, R))
print("== elastic crossover (rho = per-failure rebalance cost) ==")
for rho in (50, 200, 1000):
    print(f"rho={rho:5d} elastic eff={elastic_efficiency(1e-4,rho):.4f} crossover n={crossover_n(1e-4,C,R,rho)}")
print("== heterogeneous pool: 100 reliable (1e-4) + 100 flaky (5e-3) ==")
k, th, allth = best_prefix([1e-4]*100 + [5e-3]*100, C, R)
print(f"best k={k} throughput={th:.2f}; all 200 workers throughput={allth[-1]:.2f}; k=100 throughput={allth[99]:.2f}")
