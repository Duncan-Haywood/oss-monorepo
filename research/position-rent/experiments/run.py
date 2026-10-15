import math
from position_rent import *

print("1. Rents are conditional mutual information; ratio of successive rents -> exp(-Chernoff)")
for a in (0.6, 0.7, 0.8):
    r = rents_iid(a, 30)
    print(f" a={a}: rent_1={r[0]:.4f} rent_2={r[1]:.4f} rent_10={r[9]:.4f} rent_30={r[29]:.5f} total_30={sum(r):.4f} "
          f"(ln2={math.log(2):.4f}) ratio_29={r[29]/r[28]:.3f} e^-C={math.exp(-chern(a)):.3f} monotone={all(x>y for x,y in zip(r,r[1:]))}")

print("2. Explicit LMSR simulation (a=0.7, b=1, n=5, 200000 trials) vs exact")
p, mm = simulate_lmsr([0.7] * 5, 1.0, 200000)
ex = rents_iid(0.7, 5)
print(" sim  :", [round(x, 4) for x in p], "MM loss", round(-mm, 4))
print(" exact:", [round(x, 4) for x in ex], "total", round(sum(ex), 4), "worst case b ln2 =", round(math.log(2), 4))

print("3. Order redistributes a fixed total: accuracies [0.9,0.7,0.6,0.55]")
for name, o in (("best-first", [.9, .7, .6, .55]), ("worst-first", [.55, .6, .7, .9])):
    r = rents(o)
    print(f" {name:11s} rents {[round(x, 4) for x in r]} total {sum(r):.4f}")
print(" pair (a1=0.8 vs a2=0.7): first / second rent of the 0.8 trader:", [round(x, 4) for x in pair_premium(0.8, 0.7)])
print(" pair (a1=0.7 vs a2=0.7): first / second rent:", [round(x, 4) for x in pair_premium(0.7, 0.7)])

print("4. Entry with cost c: how many verifiers a subsidy b buys (a=0.7, c=0.005)")
for b in (0.1, 0.25, 0.5, 1, 2, 5):
    n = entry_count(0.7, b, 0.005)
    tot = b * sum(rents_iid(0.7, max(n, 1)))
    print(f" b={b:<4} n*={n:3d} accuracy={accuracy(0.7, n) if n else 0.5:.4f} expected MM loss={tot:.4f} worst case={b*math.log(2):.4f} entrants' cost={n*0.005:.4f}")

print("5. Liquidity needed for the n-th verifier to break even (a=0.7, c=0.005)")
for n in (1, 5, 11, 21, 41):
    print(f" n={n:3d} b>={b_for_size(0.7, n, 0.005):8.3f} accuracy={accuracy(0.7, n):.4f}")
