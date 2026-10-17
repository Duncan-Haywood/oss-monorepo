from outer_momentum import *

def grid(kap, n=200):
    return [kap ** (i / (n - 1)) / kap for i in range(n)]

kap = 1000
print(f"E1 inner steps precondition the outer problem, kappa={kap}, eta=1/a_max: H, kappa_H, kappa/H, tuned HB rate, plain-average rate")
for H in (1, 4, 16, 64, 256, 1024, 4096):
    lo, hi = curvature(1, 1 / kap, H), 1.0
    print(f" H={H:5d} kappa_H {kappa_H(1/kap,1,1,H):8.2f} kappa/H {kap/H:8.2f}  HB {hb_optimal(lo,hi)[2]:.4f}  avg {gd_optimal(lo,hi)[2]:.4f}")

print("\nE2 literal simulation vs exact rate (kappa=200 log-grid of 12 modes, 200-round window)")
a12 = grid(200, 12)
for kind, al, be in (("heavy", .9, .6), ("nesterov", .7, .9)):
    for H in (1, 7, 40):
        rho = rate(spectrum(a12, 1, H), al, be, kind)
        tr = simulate(a12, 1, H, al, be, kind, 600)
        print(f" {kind:8s} alpha={al} beta={be} H={H:3d} exact {rho:.4f} simulated {(tr[-1]/tr[-201])**(1/200):.4f}")

print("\nE3 fixed DiLoCo outer optimiser (Nesterov 0.7/0.9) vs retuned heavy ball, kappa=1000: rounds to 1e-6")
for H in (1, 16, 64, 256, 1024):
    ss = spectrum(grid(kap), 1, H)
    lo, hi = min(ss), max(ss)
    dflt = rate([lo + (hi - lo) * j / 400 for j in range(401)], .7, .9, "nesterov")
    al, be, q = hb_optimal(lo, hi)
    print(f" H={H:5d} default rate {dflt:.4f} rounds {rounds(dflt,1e-6):7.1f} | tuned rate {q:.4f} rounds {rounds(q,1e-6):6.1f} (alpha*={al:.2f} beta*={be:.3f}) | slowdown x{rounds(dflt,1e-6)/rounds(q,1e-6):.1f}")

print("\nE4 optimal sync interval H* for wallclock = rounds x (H + C), eps=1e-6")
print(" kappa    C   H*(mom)  time    H=1 time  speedup | H*(plain avg)  time")
for k in (1e3, 1e4):
    for C in (10, 100, 1000):
        H, t = best_H(k, C, 1e-6)
        H1 = wallclock(k, 1, C, 1e-6)
        Hg, tg = best_H(k, C, 1e-6, momentum=False)
        print(f" {k:6.0f} {C:4d} {H:7d} {t:8.0f} {H1:9.0f}   x{H1/t:5.1f} | {Hg:8d} {tg:9.0f}")
