"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from rain_twin.model import (uniform_rain_range, moment_ratio, cell_moment, mean_atten_per_km, var_atten, sample_r_det, detect_prob, brier)

K, G, RFS, ELL, P, M = 0.012, 1.2, 20.0, 1.0, 0.2, 10.0
N = 6000
RANGES = [4 + 16 * (i + 0.5) / 80 for i in range(80)]    # 4-20 km


def pct(s, q):
    return s[min(len(s) - 1, int(q * len(s)))]


mean_rate = P * M
eff_rate = cell_moment(G, P, M) ** (1 / G)               # rate whose power-law attenuation equals the mean attenuation
print("Rain twin: r_fs=%g km clear air, one-way k=%g dB/km per (mm/h)^g, g=%g, cells %g km, wet p=%g, wet mean %g mm/h (mean rate %g)" % (RFS, K, G, ELL, P, M, mean_rate))

print("\n== 1. Jensen gap of the rain-rate power law ==")
print("E[R^g]/(E R)^g = p^(1-g) Gamma(1+g) = %.4f ; mean two-way attenuation %.4f dB/km vs mean-rate twin %.4f dB/km" % (
    moment_ratio(G, P), mean_atten_per_km(K, G, P, M), 2 * K * mean_rate ** G))
print("rate with the same mean attenuation (mean-matched twin): %.3f mm/h vs mean rate %.3f" % (eff_rate, mean_rate))

print("\n== 2. Detection range: clear air vs mean-rate twin vs mean-matched twin vs real (%d storm fields) ==" % N)
real = sample_r_det(N, ELL, K, G, RFS, P, M, seed=1)
r_mean = uniform_rain_range(RFS, K, G, mean_rate)
r_eff = uniform_rain_range(RFS, K, G, eff_rate)
print("clear air %.2f km | mean-rate twin (Lambert W) %.3f km | mean-matched twin %.3f km" % (RFS, r_mean, r_eff))
print("real r_det: mean %.3f, median %.3f, 5%% %.3f, 25%% %.3f, 75%% %.3f, 95%% %.3f km" % (
    sum(real) / N, pct(real, .5), pct(real, .05), pct(real, .25), pct(real, .75), pct(real, .95)))
print("P(real r_det >= mean-rate twin range) = %.3f ; P(real r_det >= mean-matched twin range) = %.3f ; P(real r_det < r_fs) = %.4f" % (
    detect_prob(real, r_mean), detect_prob(real, r_eff), 1 - detect_prob(real, RFS - 1e-9)))
print("fraction of fields that are fully dry on the 20 cells (0.8^20) = %.4f" % (0.8 ** 20))

print("\n== 3. Brier score against real outcomes, ranges 4-20 km, 6000 fresh fields ==")
ev = sample_r_det(N, ELL, K, G, RFS, P, M, seed=2)
twins = {
    "clear air (detect iff r<=r_fs)": lambda r: 1.0 if r <= RFS else 0.0,
    "mean-rate twin": lambda r: 1.0 if r <= r_mean else 0.0,
    "mean-matched twin": lambda r: 1.0 if r <= r_eff else 0.0,
    "ensemble, true rain model": lambda r: detect_prob(real, r),
}
ens_wrong = sample_r_det(N, ELL, K, G, RFS, 0.1, 20.0, seed=3)         # same mean rate 2 mm/h, twice as intermittent
twins["ensemble, p=0.1 m=20 (same mean rate)"] = lambda r: detect_prob(ens_wrong, r)
ens_unif = sample_r_det(N, ELL, K, G, RFS, 1.0, 2.0, seed=4)            # same mean rate, exponential everywhere (never dry)
twins["ensemble, p=1 m=2 (same mean rate)"] = lambda r: detect_prob(ens_unif, r)
for name, f in twins.items():
    print("%-40s Brier %.4f" % (name, brier(f, ev, RANGES)))
print("irreducible (ensemble true model, in-sample) mean of f(1-f) = %.4f" % (sum(detect_prob(real, r) * (1 - detect_prob(real, r)) for r in RANGES) / len(RANGES)))

print("\n== 4. Cell length at fixed marginals (same mean rate, same mean attenuation): spread of r_det ==")
print("ell km   closed-form var A(20) sd of r_det   P(r_det >= r_mean)   Brier mean-rate   Brier ensemble")
for ell in (0.5, 1.0, 2.0, 4.0, 10.0):
    s = sample_r_det(N, ell, K, G, RFS, P, M, seed=5)
    e = sample_r_det(N, ell, K, G, RFS, P, M, seed=6)
    mu = sum(s) / N
    sd = math.sqrt(sum((x - mu) ** 2 for x in s) / N)
    print("%5.1f    %8.2f               %6.3f        %.3f                %.4f            %.4f" % (
        ell, var_atten(RFS, ell, K, G, P, M), sd, detect_prob(s, r_mean),
        brier(lambda r: 1.0 if r <= r_mean else 0.0, e, RANGES), brier(lambda r, s=s: detect_prob(s, r), e, RANGES)))
