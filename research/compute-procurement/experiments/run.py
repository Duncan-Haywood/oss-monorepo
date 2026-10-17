from compute_procurement import *
print("== VCG payment vs cost, U[0,1], no reserve (exact) ==")
for n, k in ((10, 1), (10, 5), (50, 10), (100, 50)):
    print(f"n={n:3d} k={k:3d} payment={expected_payment(n,k):.4f} k(k+1)/(n+1)={k*(k+1)/(n+1):.4f} cost={expected_cost(n,k):.4f} ratio={frugality(n,k):.3f}")
print("== optimal reserve vs v/2 (n=20, k=8) ==")
for v in (0.4, 0.8, 1.2, 1.6, 2.5):
    r = best_reserve(20, 8, v); u0 = buyer_utility(20, 8, 1.0, v); u1 = buyer_utility(20, 8, r, v)
    print(f"v={v}: r*={r:.3f} (v/2={v/2:.3f})  utility no-reserve={u0:.4f} reserve={u1:.4f} gain={u1-u0:.4f}")
print("== exact vs Monte Carlo, n=10 k=3 r=0.4 ==")
s = simulate(10, 3, 0.4, 1.0, 400000)
print(f"payment exact={expected_payment(10,3,0.4):.4f} mc={s['payment']:.4f}; cost exact={expected_cost(10,3,0.4):.4f} mc={s['cost']:.4f}")
print("== first-price equilibrium (n=8, k=3) ==")
print("bids at c=0,.2,.4,.6,.8:", [round(fp_bid(8, 3, c), 3) for c in (0, .2, .4, .6, .8)])
print(f"first-price payment mc={fp_expected_payment(8,3):.4f}  VCG={expected_payment(8,3):.4f}")
print(f"max deviation gain (n=6,k=2,c=0.3) = {fp_deviation_gain(6,2,0.3):.5f}")
