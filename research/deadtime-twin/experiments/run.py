"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from deadtime_twin.model import (rate_nonpar, rate_par, invert_nonpar, invert_par, first_photon_moments, first_photon_mode,
                                 p_detect, sample_first_photons, coates_mean)

print("Deadtime twin: real = SPAD with dead time tau (flux n, x = n tau); twin = ideal linear counter (observed rate = n)")

print("\n== 1. Observed rate m*tau against true flux x = n*tau ==")
print("  x        twin     non-paralyzable   undercount    paralyzable   undercount")
for x in (0.01, 0.1, 0.5, 1, 2, 5, 10):
    a, b = rate_nonpar(x), rate_par(x)
    print("  %-6g   %-7g  %-15.4f   %-11.3f   %-11.4f   %.3f" % (x, x, a, 1 - a / x, b, 1 - b / x))

print("\n== 2. Paralyzable detector: one observed rate, two fluxes (y = m*tau; maximum y = 1/e = %.4f) ==" % (1 / math.e))
print("  y       low flux x   high flux x   ratio    twin-inverted flux (=y) vs high flux")
for y in (0.05, 0.1, 0.2, 0.3, 0.36):
    lo, hi = invert_par(y)
    print("  %-6g  %-10.4f   %-11.4f   %-7.2f  twin reads %g, %.1fx too low" % (y, lo, hi, hi / lo, y, hi / y))
print("  non-paralyzable exact inverse for comparison: y = 0.5 -> x = %.3f; y = 0.9 -> x = %.3f" % (invert_nonpar(0.5), invert_nonpar(0.9)))

print("\n== 3. First-photon timing, Gaussian pulse (sigma = 1) with N expected photons per pulse; twin: unbiased, std sigma ==")
print("  range bias in cm uses sigma = 1 ns (c*sigma/2 = 14.99 cm)")
print("  N        P(detect)   mean bias    mode bias    std       mean bias (cm)   -N/(2 sqrt(pi))")
for N in (0.01, 0.1, 0.5, 1, 2, 3, 5, 10, 30):
    m, s = first_photon_moments(N)
    print("  %-7g  %.4f      %+.4f      %+.4f      %.4f    %+7.2f          %+.4f" % (
        N, p_detect(N), m, first_photon_mode(N), s, m * 14.99, -N / (2 * math.sqrt(math.pi))))

print("\n== 4. Monte Carlo check and Coates correction (200000 pulses, seed 11) ==")
print("  N      quadrature mean   MC mean    MC P(detect)   Coates-corrected mean")
rng = random.Random(11)
for N in (1.0, 3.0, 10.0):
    M = 200000
    ts = sample_first_photons(N, M, rng)
    d = [t for t in ts if t is not None]
    print("  %-5g  %+.4f           %+.4f    %.4f         %+.4f" % (N, first_photon_moments(N)[0], sum(d) / len(d), len(d) / M, coates_mean(ts, M)))
