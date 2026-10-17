import random
from stake_screening import *

V, c, h, rho, tm = 1.0, 0.3, 0.5, 0.1, 0.6
print("E1 two types (thL=0.05, thH=0.40, c=0.3, rho=0.1): reliable type's rent by the unreliable type's stake s_H")
for s in (0, 0.1, 0.3, 0.6, 1.0):
    print(f" s_H={s:.1f}  wage_H {wage_H_two_type(0.4, s, c, rho):.4f}  rent_L {rent_two_type(0.05, 0.4, s, c, rho):.4f}")

print("\nE2 serve the unreliable type? pi_H needed (thL=0.05, thH=0.4, V=1, c=0.3, h=0.5)")
print(f" threshold pi_H* = {pi_threshold(0.05,0.4,V,c,h):.4f}")
for piH in (0.5, 0.6, 0.63, 0.64, 0.7, 0.9):
    print(f" pi_H={piH:.2f}  serve both: {serve_both(0.05, 0.4, piH, V, c, h)}")

print("\nE3 flat contract, th~U[0,0.6]: best wage, participation, pool fault rate, profit by forced stake s")
base = best_wage(0.0, V, c, h, rho, tm)[1]
for s in (0, 0.1, 0.3, 0.6, 1.0):
    w, p = best_wage(s, V, c, h, rho, tm)
    t = cutoff(w, s, c, rho, tm)
    print(f" s={s:.1f}  w* {w:.4f}  accept {t/tm:.3f}  pool fault rate {pool_fault_rate(w,s,c,rho,tm):.4f}  "
          f"profit {p:.5f} ({p/base:.3f} of s=0)  mean worker rent {flat_rent(w,s,c,rho,tm):.5f}  rent factor {(c+(1+rho)*s)/c:.2f}")

print("\nE4 best stake in [0,1] over harm h and capital cost rho (always 0?)")
for hh in (0.0, 0.5, 2.0, 5.0):
    print(f" h={hh}: " + "  ".join(f"rho={r}: s*={best_stake(V,c,hh,r,tm,ns=100)[0]:.2f}" for r in (0.0, 0.1, 0.3)))

print("\nE5 flat contract vs simulation (s=0.2, 400000 draws)")
w, p = best_wage(0.2, V, c, h, rho, tm)
sp, sa, sf = simulate_flat(w, 0.2, V, c, h, rho, tm, 400000, random.Random(5))
print(f" profit exact {p:.5f} sim {sp:.5f}; accept exact {cutoff(w,0.2,c,rho,tm)/tm:.4f} sim {sa:.4f}; pool fault exact {pool_fault_rate(w,0.2,c,rho,tm):.4f} sim {sf:.4f}")

print("\nE6 random menus of k contracts never beat the best flat contract (grid n=400; 3000 menus per k)")
w0, _ = best_wage(0.0, V, c, h, rho, tm)
print(f" flat s=0: {menu_profit([(w0,0.0)],V,c,h,rho,tm,400):.5f}")
rng = random.Random(0)
for k in (2, 3, 4):
    print(f" k={k}: best random menu {random_menu_search(V,c,h,rho,tm,k,3000,rng):.5f}")

print("\nE7 stake tax on reliable workers: deterrence stake s_d, profit lost vs no stake, wage and acceptance")
for s in (0.1, 0.3, 0.6):
    w, p = best_wage(s, V, c, h, rho, tm)
    w0, p0 = best_wage(0.0, V, c, h, rho, tm)
    print(f" s_d={s:.1f}  profit loss {(p0-p)/p0*100:5.1f}%  wage {w0:.3f}->{w:.3f}  accept {cutoff(w0,0,c,rho,tm)/tm:.3f}->{cutoff(w,s,c,rho,tm)/tm:.3f}")
