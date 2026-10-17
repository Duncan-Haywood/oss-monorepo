"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from compressed_outer import *

s, Vw = 1.0, 0.25          # eta=0.5, a=2, H=1, sigma=1

print("== 1. Stationary variance vs literal simulation (M=6, alpha=0.8; 300k rounds) ==")
print("compressor          exact     sim       ratio")
for name, kind, prm, th in (
        ("none", "none", 1.0, floor_multiplicative(s, Vw, 0.8, 6, 0.0)),
        ("sparse r=0.5", "sparse", 0.5, floor_multiplicative(s, Vw, 0.8, 6, omega_sparse(0.5))),
        ("sparse r=0.2", "sparse", 0.2, floor_multiplicative(s, Vw, 0.8, 6, omega_sparse(0.2))),
        ("dither D=1.0", "dither", 1.0, floor_dither(s, Vw, 1.0, 0.8, 6)),
        ("dither D=2.0", "dither", 2.0, floor_dither(s, Vw, 2.0, 0.8, 6))):
    emp = simulate_var(kind, s, Vw, 0.8, 6, prm, 300000, 1000, seed=1)
    print("%-19s %.5f   %.5f   %.3f" % (name, th, emp, emp / th))

print("\n== 2. Participation is sparsification of a whole worker (N=12, alpha=0.6) ==")
N, al = 12, 0.6
for p in (1.0, 0.5, 0.25):
    pp = al * Vw / (N * p * s * (2 - al * s * (1 + (1 - p) / (N * p))))
    print("p=%.2f  omega=%.2f  floor=%.5f  partial-participation Rule B=%.5f" % (p, omega_participation(p),
          floor_multiplicative(s, Vw, al, N, omega_participation(p)), pp))

print("\n== 3. Stability and speed: c = 1+omega/M; largest step 2/(s c); best contraction 1-1/c ==")
print("M    r      omega   c       alpha_s max   best rho   rounds to 1e-6 at best")
for M, r in ((8, 1.0), (8, 0.5), (8, 0.1), (32, 0.1), (32, 0.02), (256, 0.02)):
    om = omega_sparse(r)
    c = c_factor(M, om)
    print("%-4d %-6.2f %-7.1f %-7.3f %-13.3f %-10.3f %.1f" % (M, r, om, c, 2 / c, best_contraction(M, om),
          rounds_to(1e-6, 1 / c, M, om)))

print("\n== 4. Fixed bandwidth B (in units of d coordinates per round), sparsification split over M workers ==")
Bd, al = 4.0, 0.8
print("B/d=%.0f alpha s=%.1f; small-step floor is the same (alpha Vw d/(B s (2-alpha s c)) -> Vw/(B/d) as alpha->0)" % (Bd, al))
print("M     r=B/(Md)  c       floor")
for M in (4, 8, 16, 64, 1024):
    print("%-5d %-9.4f %-7.4f %.5f" % (M, Bd / M, c_bandwidth(M, Bd), floor_bandwidth_sparse(s, Vw, al, M, Bd)))
print("c -> 1 + d/B = %.3f; largest M before alpha s c = 2 at alpha s = 1.8, B/d=4: %.1f; at alpha s = 1.2: %s" %
      (1 + 1 / Bd, m_max_stable(1.8, Bd), m_max_stable(1.2, Bd)))

print("\n== 5. Dithered quantisation: bits (exact entropy) vs noise, Gaussian report of std 1 ==")
print("R bits  delta    Vq/Vw     high-res Vq/Vw  entropy check(sim)")
for R in (0.5, 1, 2, 3, 4, 6):
    dl = delta_for_rate(1.0, R)
    print("%-7.1f %-8.4f %-9.4f %-15.4f %.3f" % (R, dl, dither_noise(dl), dither_rate_penalty(R), empirical_bits(1.0, dl, 100000, seed=2)))
print("high-resolution formula understates the noise below ~2 bits: at R=1 it says %.3f, exact %.3f (%.1fx)" % (
    dither_rate_penalty(1), dither_noise(delta_for_rate(1.0, 1.0)), dither_noise(delta_for_rate(1.0, 1.0)) / dither_rate_penalty(1)))

print("\n== 6. Fixed bandwidth B, M = B/(R d) workers each sending R bits/coordinate; small-step floor = (d/B) * R (1+Vq/Vw) ==")
print("R bits  factor R(1+Vq/Vw)   vs 8 bits   vs sparse at 16-bit values (16)")
best = min(((bandwidth_factor(R / 100, 1.0), R / 100) for R in range(50, 300)))
for R in (0.25, 0.5, 1, 1.5, 2, 3, 4, 8, 16):
    f = bandwidth_factor(R, 1.0)
    print("%-7.2f %-19.4f %-11.3f %.3f" % (R, f, f / bandwidth_factor(8, 1.0), f / 16))
print("minimum: R=%.2f bits, factor %.4f (8 bits: %.3f, 16 bits: %.3f)" % (best[1], best[0], bandwidth_factor(8, 1.0), bandwidth_factor(16, 1.0)))
print("with only M<=N workers available, R = B/(N d): the floor is (d/B) R(1+Vq/Vw) as above, so spare workers should be used first")

print("\n== 7. Simulation check at exactly matched bandwidth M R = B/d = 4 (alpha=0.05, report std sqrt(Vw)) ==")
for M in (1, 2, 4, 8):
    R = Bd / M
    dl = delta_for_rate(math.sqrt(Vw), R)
    th = floor_dither(s, Vw, dl, 0.05, M)
    emp = simulate_var("dither", s, Vw, 0.05, M, dl, 150000, 2000, seed=4)
    print("M=%-2d R=%-4.2f delta=%.3f  exact %.5f  sim %.5f  ratio %.3f" % (M, R, dl, th, emp, emp / th))
