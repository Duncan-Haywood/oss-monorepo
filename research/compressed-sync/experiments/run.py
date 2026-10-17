"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from compressed_sync import *

A = [1.0, 0.25, 0.05]
eta, sg = 0.2, 1.0

print("== 1. Coordinate-wise (rand-k) compression: exact vs literal simulation (H=4, 3 modes a=1,.25,.05; 150k rounds) ==")
print("N   alpha  rho    omega  exact     sim       ratio  floor/uncompressed")
H = 4
for N, al, rho in ((4, 0.5, 0.25), (4, 0.5, 0.1), (16, 0.8, 0.1), (16, 0.8, 0.05)):
    om = (1 - rho) / rho
    th = floor_coord(A, eta, sg, N, H, al, om)
    emp = sim_floor("randk", rho, A, eta, sg, H, al, N, 150000, 1000, seed=1)
    print("%-3d %.2f   %.2f   %5.1f  %.5f  %.5f  %.3f  %.2f" % (N, al, rho, om, th, emp, emp / th, th / floor_coord(A, eta, sg, N, H, al, 0.0)))

print("\n== 2. Stability: alpha_max = 2/(s(1+omega/N)); extra workers restore the step but not the floor ==")
s = curvature(eta, 1.0, H)
print("s=%.3f (stiffest mode)" % s)
print("N     omega  alpha_max   floor multiplier at small alpha (1+omega)")
for N, om in ((1, 0), (4, 9), (16, 9), (64, 9), (16, 99), (256, 99)):
    print("%-5d %-6d %.3f       %.0f" % (N, om, alpha_max_coord(s, N, om), 1 + om))

print("\n== 3. Norm-scaled compression: exact vs simulation (idealised dithering and a real 2-level stochastic rounding) ==")
N, al = 4, 0.6
print("quantiser         kappa  exact     sim       ratio  floor/uncompressed")
for kind, par in (("dither", 0.5), ("dither", 1.5), ("round", 2), ("round", 1)):
    kp = par if kind == "dither" else kappa_rounding(3, par)
    th = floor_norm(A, eta, sg, N, H, al, kp)
    emp = sim_floor(kind, par, A, eta, sg, H, al, N, 150000, 1000, seed=2)
    print("%-8s %-7s %.3f  %.5f  %.5f  %.3f  %.2f" % (kind, par, kp, th, emp, emp / th, th / floor_norm(A, eta, sg, N, H, al, 0.0)))

print("\n== 4. Norm scaling vs coordinate-wise at equal total error energy (kappa = omega = 1): where the error lands, not how much loss ==")
print("D   H    loss coord   loss norm   norm/coord")
for D, H_ in ((3, 1), (3, 16), (16, 1), (16, 16)):
    a_list = [1.0 * 0.5 ** k for k in range(D)]              # curvatures 1, 1/2, 1/4, ...
    al, N, om = 0.5, 8, 1.0
    fc = floor_coord(a_list, eta, sg, N, H_, al, om)
    fn = floor_norm(a_list, eta, sg, N, H_, al, om)
    print("%-3d %-4d %.5f     %.5f     %.4f" % (D, H_, fc, fn, fn / fc))
a_list = [1.0, 0.25, 0.05]
s_l = [curvature(eta, a, 16) for a in a_list]
Vw_l = [worker_noise(eta, a, sg, 16) for a in a_list]
vn = var_norm(s_l, Vw_l, 0.5, 8, 1.0)
vc = [var_coord(s, v, 0.5, 8, 1.0) for s, v in zip(s_l, Vw_l)]
print("per-mode variance at H=16, alpha=0.5, N=8 (a=1, .25, .05): coord %s  norm %s" % (["%.5f" % x for x in vc], ["%.5f" % x for x in vn]))
print("norm/coord per mode: %s ; norm-scaling share of mode variance that is |d|-injected: %s" %
      (["%.2f" % (x / y) for x, y in zip(vn, vc)], ["%.2f" % extra_share_flat(s_l, Vw_l, 0.5, 8, 1.0, j) for j in range(3)]))

print("\n== 5. Stability of norm scaling: (kappa/D) sum_j alpha s_j/(N(2-alpha s_j)) < 1 (many modes cannot help; one big kappa kills it) ==")
for D in (4, 32, 256):
    s_l = [0.5] * D
    for kp in (1.0, 5.0, 20.0):
        print("D=%-4d kappa=%-5.1f stable at alpha=1, N=4: %s   (kappa/D)*sum A = %.3f" % (D, kp, stable_norm(s_l, 1.0, 4, kp),
              kp / D * sum(1.0 * s / (4 * (2 - s)) for s in s_l)))

print("\n== 6. Compress or sync less? Equal communication per inner step: keep fraction rho with H, versus uncompressed with H/rho (a=(1,.25,.05), eta=0.2, N=8) ==")
N = 8
print("alpha  base(H=4,rho=1)  compress rho=.25 (H=4)  sync-less (H=16,rho=1)  compress rho=.0625 (H=4)  sync-less (H=64)")
for al in (1.0, 0.5, 0.2):
    def f(H_, rho):
        return floor_coord(A, eta, sg, N, H_, al, (1 - rho) / rho)
    print("%.1f    %.5f          %.5f                 %.5f                 %.5f                    %.5f" % (al, f(4, 1), f(4, 0.25), f(16, 1), f(4, 0.0625), f(64, 1)))
print("contraction of the flattest mode (a=0.05) per inner step: H=4: %.5f  H=16: %.5f  (identical per-step at alpha=1)" %
      ((1 - curvature(eta, .05, 4)) ** (1 / 4), (1 - curvature(eta, .05, 16)) ** (1 / 16)))
