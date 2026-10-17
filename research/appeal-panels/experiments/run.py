import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from appeal_panels import *

a, V, j = 0.7, 100.0, 1.0
print(f"jurors correct w.p. a={a}; prize V={V}; appeal fee = j*n with j={j}; cost counted in juror seats\n")
print("1. Fee window V(1-q) <= j n < V q by panel size")
for n in [1, 3, 5, 9, 11, 15, 27, 81]:
    lo, f, hi = window(n, a, V, j)
    print(f"  n={n:3d}  M={maj(n,a):.4f}  window=[{lo:7.3f}, {hi:7.3f})  fee={f:4.0f}  regime={regime(f,V,maj(n,a))}")
print(f"  smallest deterring odd n: V=100 -> {min_deterring_size(a,100,j)}, V=1000 -> {min_deterring_size(a,1000,j)}, V=10000 -> {min_deterring_size(a,10000,j)}")

print("\n2. Three-tier courts (exact vs Monte Carlo 200k)")
for name, ns, jj in [("efficient  [3,11,27] j=1   ", [3, 11, 27], 1.0), ("leaky      [3,9,27]  j=1   ", [3, 9, 27], 1.0),
                     ("cheap fees [3,11,27] j=.05 ", [3, 11, 27], 0.05), ("dear fees  [3,11,27] j=9   ", [3, 11, 27], 9.0)]:
    ex = evaluate(ns, a, V, jj); mc = simulate(ns, a, V, jj, trials=200000, seed=1)
    print(f"  {name} err={1-ex[0]:.5f} (MC {1-mc[0]:.5f}) seats={ex[1]:6.2f} (MC {mc[1]:6.2f}) tiers={ex[2]:.3f} E[wrong-side appeals]={ex[3]:.3f}")
print(f"  product law prod(1-M_k) for [3,11,27] = {error_product([3,11,27],a):.5f}; last tier alone (wasteful) err = {1-wasteful_accuracy([3,11,27],a):.5f}")

print("\n3. Equal-seat single court vs efficient appeal ladder (a=0.7, ladder n_k = 3, 11, 27, 81...)")
for K, ns in [(2, [3, 11]), (3, [3, 11, 27]), (4, [3, 11, 27, 81])]:
    acc, seats, tiers, _ = evaluate(ns, a, V, j)
    n1 = single_panel_size(seats, 1.0) + 2   # smallest odd panel that costs at least the ladder's expected seats
    print(f"  K={K}: ladder err={1-acc:.2e} at {seats:5.2f} expected seats (worst case {sum(ns)}); single panel of {n1} seats err={1-maj(n1,a):.2e}  ({(1-maj(n1,a))/(1-acc):.1f}x worse)")

print("\n4. Shared bias rho (ladder [3,11,27,81,243], V=100, j=1)")
for rho in [0, .05, .1, .3]:
    ns = [3, 11, 27, 81, 243]
    acc, seats, tiers, w = evaluate(ns, a, V, j, rho)
    print(f"  rho={rho:4.2f}: err={1-acc:.4f}  floor rho(1-a)={rho*(1-a):.4f}  seats={seats:.2f}  tiers={tiers:.3f}")
