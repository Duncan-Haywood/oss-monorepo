"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
from heterogeneous_steps import *

A = [1.0, 0.25, 0.05]
eta, sg = 0.2, 1.0
FLEETS = {"two speeds [1,64]": [1, 64], "geometric [1..64]": [1, 2, 4, 8, 16, 32, 64],
          "one fast in eight [1x7,256]": [1] * 7 + [256], "mild [2,4,4,8]": [2, 4, 4, 8]}

print("== 1. Information of one worker is I_inf*tanh(lam H/2): fraction of I_inf, and information per step (a=0.25, eta=0.2) ==")
a = 0.25
for H in (1, 2, 4, 8, 16, 32, 64):
    print("H=%-3d I/I_inf=%.4f  (I/I_inf)/H=%.4f" % (H, info(eta, a, sg, H) / info_inf(eta, a, sg), info(eta, a, sg, H) / info_inf(eta, a, sg) / H))

print("\n== 2. Penalty over the best weights at equal contraction (single mode) ==")
print("fleet                          a     equal   by-steps  info-weighted")
for nm, Hs in FLEETS.items():
    for a in (0.05, 0.25, 1.0):
        print("%-30s %-5.2f %.4f  %.4f    %.4f" % (nm, a, penalty_single(eta, a, sg, Hs, weights_equal(Hs)),
              penalty_single(eta, a, sg, Hs, weights_steps(Hs)), penalty_single(eta, a, sg, Hs, weights_info(Hs, eta, a))))
print("Kantorovich bound for a 2x weight span: %.4f" % kantorovich_bound(2))

print("\n== 3. Three modes (a=1,.25,.05), alpha=1, weights sum to 1: exact vs simulation (60k rounds) ==")
print("fleet                          scheme   exact     sim       ratio  vs equal")
for nm, Hs in FLEETS.items():
    base = floor_weighted(A, eta, sg, Hs, weights_equal(Hs))
    for sc, w in (("equal", weights_equal(Hs)), ("steps", weights_steps(Hs)), ("info", weights_info(Hs, eta, 0.05))):
        th = floor_weighted(A, eta, sg, Hs, w)
        emp = sim_floor(A, eta, sg, Hs, w, 1.0, 60000, 1000, seed=1)
        print("%-30s %-8s %.5f  %.5f  %.3f  %.2f" % (nm, sc, th, emp, emp / th, th / base))

print("\n== 4. Wall-clock-optimal inner steps per worker, I(H)/(C+H), by sync cost C (in inner steps) ==")
print("C     a=0.05  a=0.25  a=1.0")
for C in (0, 5, 20, 100):
    print("%-5d %-7d %-7d %d" % ((C,) + tuple(best_H_per_wallclock(eta, a, C) for a in (0.05, 0.25, 1.0))))

print("\n== 5. Keep or drop the slowest worker (equal weights, alpha=1) ==")
for Hs in ([1, 8, 8, 8], [1, 1, 1, 64]):
    full, cut = drop_slowest_equal(A, eta, sg, Hs)
    print("%s all=%.5f  without slowest=%.5f" % (Hs, full, cut))
