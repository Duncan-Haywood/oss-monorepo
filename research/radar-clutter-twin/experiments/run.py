"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from radar_clutter_twin import *

N = 16
cache = GridCache()
print("CA-CFAR, N=%d reference cells, independent gamma texture per cell (shape nu), twin = Gaussian clutter" % N)

print("\n== 1. Real false-alarm probability when the threshold is set in the Gaussian twin ==")
print("design Pfa  nu     alpha_twin  real Pfa     inflation x")
for pf in (1e-2, 1e-4, 1e-6):
    a = alpha_twin(pf, N)
    for nu in (1.5, 2, 5, 20, 100):
        r = pfa_real(a, N, cache(nu))
        print("%-10g  %-5g  %-10.3f  %-11.3e  %.2f" % (pf, nu, a, r, r / pf))

print("\n== 2. Exact law vs direct Monte Carlo (design Pfa 1e-2, 400k trials, alpha=%.3f) ==" % alpha_twin(1e-2, N))
a = alpha_twin(1e-2, N)
print("Gaussian twin           MC %.4f  (design 0.0100)" % simulate_pfa(a, N, math.inf, 400000, 11))
for nu in (2, 5):
    print("nu=%d iid texture        MC %.4f  exact %.4f" % (nu, simulate_pfa(a, N, nu, 400000, 12 + nu), pfa_real(a, N, cache(nu))))
    print("nu=%d shared texture     MC %.4f  (CFAR: design 0.0100)" % (nu, simulate_pfa(a, N, nu, 400000, 30 + nu, shared=True)))

print("\n== 3. Threshold that restores the design Pfa in real clutter ==")
print("design Pfa  nu   alpha_real/alpha_twin   extra threshold (dB)")
for pf in (1e-2, 1e-4, 1e-6):
    for nu in (2, 5, 20):
        ar = alpha_for_pfa(pf, N, cache(nu))
        print("%-10g  %-3g  %-22.3f  %.2f" % (pf, nu, ar / alpha_twin(pf, N), 10 * math.log10(ar / alpha_twin(pf, N))))

print("\n== 4. Inflation vs threshold, and the alpha->inf limit Gamma(nu+N)/(Gamma(nu)(nu-1)^N) ==")
for nu in (5, 20):
    print("nu=%d limit %.4g" % (nu, inflation_limit(nu, N)))
    for al in (1e1, 1e2, 1e3, 1e4, 1e5, 1e6):
        print("  alpha=%-8g twin Pfa %-10.3e inflation %.4g (%.3f of limit)" % (al, pfa_twin(al, N), inflation(al, N, cache(nu)), inflation(al, N, cache(nu)) / inflation_limit(nu, N)))

print("\n== 5. Window length (nu=5, design Pfa 1e-4) ==")
for n in (8, 16, 32, 64):
    a = alpha_twin(1e-4, n)
    r = pfa_real(a, n, cache(5))
    print("N=%-3d alpha_twin %.2f  real Pfa %.3e  inflation %.2f  limit %.3g" % (n, a, r, r / 1e-4, inflation_limit(5, n)))

print("\n== 6. Calibrating the twin with n real clutter cells (moment fit of nu, then recalibrate); design Pfa 1e-4, N=16, 200 trials ==")
print("true nu  n cells   median ratio  p90 ratio  max ratio  frac fit Gaussian   uncalibrated twin ratio")
for nu in (2, 5):
    unc = pfa_real(alpha_twin(1e-4, N), N, cache(nu)) / 1e-4
    for n in (100, 300, 1000, 3000, 10000):
        o, g = calibration_trials(nu, n, 1e-4, N, 200, 7 + n, cache)
        print("%-7g  %-8d  %-12.2f  %-9.2f  %-9.1f  %-18.2f  %.2f" % (nu, n, o[100], o[180], o[-1], g, unc))
print("empirical threshold from real cells alone needs ~100/Pfa = %.0e cells for 10%% relative error at Pfa=1e-4" % (100 / 1e-4))
