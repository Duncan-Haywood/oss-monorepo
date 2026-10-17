from decision_scoring import *

print("E1 plain Brier (tau_s=1/2) with reserve c0: decision loss of accept-iff-report<=tau_d, q~U[0,1]")
print(" tau_d  optimum   no reserve(c0=0)   best reserve c0*  loss at c0*   recentred(tau_s=tau_d) loss")
for td in (0.2, 0.3, 0.5, 0.7, 0.9):
    opt = opt_loss(td)
    c, l = best_reserve(td, .5)
    rc = eq_loss(td, td, truthful_reserve(td, td))
    print(f" {td:<5} {opt:.4f}   {eq_loss(td,.5,0.0):.4f} ({eq_loss(td,.5,0.0)/opt:.2f}x)      {c:.3f}          "
          f"{l:.4f} ({l/opt:.3f}x)   {rc:.4f} ({rc/opt:.3f}x)")

print("\nE2 feasibility: reserve interval [lo,hi] (truthful iff lo<=c0<=hi), tau_d=0.7")
for ts in (0.3, 0.5, 0.7, 0.8, 1.0):
    lo, hi = reserve_interval(.7, ts)
    print(f" tau_s={ts}: lo={lo:.4f} hi={hi:.4f}  " + ("feasible, c0=%.4f" % truthful_reserve(.7, ts) if lo <= hi + 1e-12 else "INFEASIBLE"))

print("\nE3 information rent (E excess over the reserve, q~U[0,1]) as tau_s rises above tau_d=0.5")
for ts in (0.5, 0.6, 0.8, 1.0):
    print(f" tau_s={ts}: rent={rent(.5, ts):.4f}   (tau_d^3/3 = {.5**3/3:.4f} at tau_s=tau_d)")

print("\nE4 exploration variant (accept w.p. eps in the reject region, pay S/eps): tau=0.7, r=q=0.9, plain Brier")
print(" eps    payment mean  payment std  extra decision loss  (reserve approach: std of S alone, loss 0)")
m0, v0 = ipw_payment_moments(.9, .9, .5, 1.0)
for eps in (1.0, 0.3, 0.1, 0.03):
    m, v = ipw_payment_moments(.9, .9, .5, eps)
    print(f" {eps:<5} {m:.4f}        {v**.5:.4f}       {explore_cost(.7, eps):.5f}")
