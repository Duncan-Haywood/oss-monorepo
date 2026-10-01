import random
from latency_twin.model import *

a, b, r, s2 = 1.1, 1.0, 1.0, 1.0
k0 = lqr_gain(a, b, r)
print(f"plant a={a} b={b} r={r} s2={s2}; zero-delay LQR gain k0={k0:.4f}; delay margin of k0 = {delay_margin(a, b, k0)} steps")

print("\n1. Twin without latency (gain k0 on the delayed reading) vs delay-aware optimum (Smith predictor)")
print(" d  stable_k_interval          rho(k0)   cost(k0)   smith_opt  ratio   best_static_k  static_cost  ratio")
for d in range(0, 6):
    rng = static_gain_stable_range(a, b, d)
    f, _ = closed_loop(a, b, k0, d, 0)
    rho = spectral_radius(f)
    c0 = cost(a, b, r, s2, k0, d)
    so = smith_cost(a, b, r, s2, d)
    ks, cs = best_static_gain(a, b, r, s2, d)
    iv = "empty" if rng is None else f"({rng[0]:.3f}, {rng[1]:.3f})"
    print(f" {d}  {iv:<24} {rho:8.4f}  {c0:9.3f}  {so:9.3f}  {c0 / so:6.2f}  {ks if ks else float('nan'):10.4f}  {cs:10.3f}  {cs / so:6.2f}")

print("\n2. Cost ratio to the delay-aware optimum when the twin assumes delay dh but the real delay is d (rows dh, cols d)")
print("dh\\d " + "".join(f"{d:>9}" for d in range(0, 6)))
for dh in range(0, 6):
    row = []
    for d in range(0, 6):
        c = cost(a, b, r, s2, k0, d, dh)
        row.append("   unstab" if c == float("inf") else f"{c / smith_cost(a, b, r, s2, d):9.2f}")
    print(f"{dh:>4} " + "".join(row))

print("\n3. Delay margin of the zero-delay LQR gain vs plant instability a (b=1, r=1)")
for aa in (1.02, 1.05, 1.1, 1.2, 1.5, 2.0):
    kk = lqr_gain(aa, 1.0, 1.0)
    print(f" a={aa:4.2f}  k0={kk:.3f}  delay margin={delay_margin(aa, 1.0, kk)}")

print("\n4. Samples to identify the delay (adjacent-lag confusion prob alpha): Gaussian formula vs Monte Carlo")
rng = random.Random(1)
for snr in (0.25, 1.0, 4.0):
    for n in (10, 40, 160):
        print(f" snr={snr:4.2f} n={n:4d}  gauss={id_error_gauss(snr, n):.4f}  mc={id_error_mc(snr, n, rng):.4f}")
for snr in (0.25, 1.0, 4.0):
    print(f" snr={snr:4.2f}  n for alpha=1e-2: {id_samples(snr, 1e-2):7.1f}   alpha=1e-3: {id_samples(snr, 1e-3):7.1f}")
