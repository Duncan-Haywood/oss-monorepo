import math
from outer_delay import *

print("E1 stability threshold on alpha*s for a delayed plain outer step: closed form 2 sin(pi/(4 tau+2)) vs spectral radius")
for t in (0, 1, 2, 4, 8, 16, 32):
    print(f" tau={t:3d} closed {stable_step(t):.6f} numeric {stable_step_bisect(t):.6f} pi/(2tau+1) {math.pi/(2*t+1):.6f}")

print("\nE2 tuned outer optimiser under delay, kappa_H=100: rate, rounds to 1e-6 (beta searched on a 0.02 grid)")
k = 100.0
for t in (0, 1, 2, 4, 8, 16):
    hb = tuned_hb(1 / k, 1.0, t, betas=None if t == 0 else [0.02 * i for i in range(25)])
    gd = tuned_gd(1 / k, 1.0, t)
    print(f" tau={t:3d} plain: alpha {gd[0]:.4f} rate {gd[1]:.5f} rounds {rounds(gd[1],1e-6):8.1f} | heavy ball: beta* {hb[1]:.2f} rate {hb[2]:.5f} rounds {rounds(hb[2],1e-6):8.1f}")
print(f" exact tau=1 plain rate kappa/(kappa+1) = {k/(k+1):.5f}")

print("\nE3 asymptotic rate 1-theta_tau/kappa_H at kappa_H=1000 (theta = (1-rate) kappa_H) vs 2 sin(pi/(4tau+2))")
for t in (1, 2, 4, 8, 16):
    a, r = tuned_gd(1e-3, 1.0, t)
    print(f" tau={t:3d} alpha/alpha_max {a/stable_step(t):.4f} theta {(1-r)*1000:.4f} 2sin {stable_step(t):.4f} rounds/kappa_H {rounds(r,1e-6)/1000:7.2f}  overlap_gain_bound {overlap_gain_bound(t):.3f}")

print("\nE4 literal simulation vs exact rate (kappa=100 log-grid of 8 modes, window of 500 rounds)")
a8 = [100 ** (i / 7) / 100 for i in range(8)]
for t, al, be in ((1, .9, 0.0), (3, .4, 0.0), (2, .3, .3)):
    for H in (1, 10):
        ss = [curvature(1.0, a, H) for a in a8]
        rho = rate(ss, al, be, t)
        tr = simulate(a8, 1.0, H, al, be, t, 3000)
        print(f" tau={t} alpha={al} beta={be} H={H:2d} exact {rho:.5f} simulated {(tr[-1]/tr[-501])**(1/500):.5f}")

print("\nE5 wallclock to 1e-6: best blocking (tau=0, tuned heavy ball) vs best overlapped (tau>=1, sync hidden behind tau rounds) vs blocking plain averaging")
Hs = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]
print(" kappa     C | blocking HB (H,time) | blocking plain (H,time) | overlapped (H,tau,time) | overlapped/blocking-HB  overlapped/blocking-plain")
for kap in (1e3, 1e4):
    for C in (10, 100, 1000, 10000):
        b = best_plan(kap, C, 1e-6, Hs, [0])
        p = best_plan(kap, C, 1e-6, Hs, [0], momentum=False)
        o = best_plan(kap, C, 1e-6, Hs, [1, 2, 3, 4, 6, 8, 12, 16, 32])
        print(f" {kap:6.0f} {C:5d} | {b[0]:5d} {b[2]:9.0f} | {p[0]:5d} {p[2]:9.0f} | {o[0]:5d} {o[1]:3d} {o[2]:9.0f} | x{o[2]/b[2]:6.2f}  x{o[2]/p[2]:5.2f}")

print("\nE6 eager outer step with fresh fraction w (g = s(w x_t + (1-w) x_{t-tau})), kappa_H=200: stable alpha*s and rounds/kappa_H (best plain step)")
print("   tau      w   stable  alpha*  rounds/kappa_H")
for t in (1, 4, 16):
    for w in (0.0, 0.25, 0.5, 0.75):
        st = mixed_stable_step(t, w)
        a, r = tuned_mixed(1 / 200, 1.0, t, w)
        print(f" {t:5d} {w:6.2f} {st:8.3f} {a:7.3f} {rounds(r,1e-6)/200:10.2f}")
print(f" (no delay, plain step: {rounds(199/201,1e-6)/200:.2f} rounds/kappa_H)")
