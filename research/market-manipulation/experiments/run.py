from market_manipulation import *
import math

q, tau, c, N, eps = 0.3, 0.6, 0.05, 5, 0.01

print("== E1  manipulation loss = extra informed rent = b KL(q||tau)  (q=.3, tau=.6, eps=.01) ==")
for b in (0.1, 0.5, 2.0):
    extra = informed_rent(q, tau, b, eps) - informed_rent(q, q, b, eps)
    print(f"  b={b:<4} manipulator loss {manip_loss(q, q, tau, b):.5f}  extra informed rent {extra:.5f}  informed-manipulator cost {informed_manip_cost(q, tau, b):.5f}")

print("\n== E2  accuracy vs liquidity b, mu=0.5 (N=5 potential informed, c=0.05) ==")
print("  b      rent@q  rent@tau  e0     e1     acc(mu=0)  acc(mu=.5)  gain/mu")
for b in (0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 1.0):
    R0 = informed_rent(q, q, b, eps); R1 = informed_rent(q, tau, b, eps)
    print(f"  {b:<5} {R0:7.4f} {R1:8.4f}  {entry_prob(R0,c,N):.3f}  {entry_prob(R1,c,N):.3f}  {accuracy(0,q,tau,b,c,N,eps):.4f}     {accuracy(.5,q,tau,b,c,N,eps):.4f}      {accuracy_gain(q,tau,b,c,N,eps):+.4f}")
lo, hi = help_band(q, tau, c, N, eps)
print(f"  manipulation strictly raises accuracy for b in ({lo:.3f}, {hi:.3f}); hurts below (gain -(1-2q) = {-(1-2*q):.2f} when nobody enters), neutral above")

print("\n== E3  executable-LMSR Monte Carlo vs formulas (mu=.5, 150k trials) ==")
for b in (0.1, 0.15, 0.2):
    r = simulate(0.5, q, tau, b, c, N, eps, 150000, seed=7)
    print(f"  b={b}: acc MC {r['accuracy']:.4f} formula {accuracy(.5,q,tau,b,c,N,eps):.4f} | entry@tau MC {r['entry1']:.3f} formula {entry_prob(informed_rent(q,tau,b,eps),c,N):.3f}"
          f" | manip loss MC {r['manip_loss']:.4f} formula {manip_loss(q,q,tau,b):.4f} | entrant net profit MC {r['entrant_net']:+.4f} (formula 0)")

print("\n== E4  how hard must the manipulator push? band edges vs target price tau ==")
for t in (0.5, 0.6, 0.75, 0.9):
    band = help_band(q, t, c, N, eps)
    print(f"  tau={t}: cost b=0.2 uninformed {manip_loss(q,q,t,0.2):.4f}, informed {informed_manip_cost(q,t,0.2):.4f}; helps for b in " + (f"({band[0]:.3f}, {band[1]:.3f})" if band else "never"))

print("\n== E5  manipulator budget as the subsidy that buys the information (b=.15, mu=.5) ==")
b = 0.15
e0 = entry_prob(informed_rent(q,q,b,eps),c,N); e1 = entry_prob(informed_rent(q,tau,b,eps),c,N)
print(f"  entry prob rises {e0:.3f} -> {e1:.3f}; expected transfer per market mu*b*KL = {0.5*b*kl(q,tau):.4f}; accuracy {accuracy(0,q,tau,b,c,N,eps):.4f} -> {accuracy(.5,q,tau,b,c,N,eps):.4f}")
