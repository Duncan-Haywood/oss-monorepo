"""Quantizing real sensor vs ideal-sensor twin.  Real MSE by simulation (n steps, paired across gains)."""
import math
from quantization_twin import *

N = 100000
GRID = [0.02 * i for i in range(1, 50)]
print(f"plant a=0.9 Q=1; steady-state fixed-gain filter; n={N} steps, gain grid step 0.02")
for R in (1.0, 0.01):
    a, Q = 0.9, 1.0
    Kt = opt_gain(a, Q, R)
    print(f"\n== sensor noise R={R} (sigma_v={math.sqrt(R):.2f}); twin gain {Kt:.3f}, twin claim {mse(Kt, a, Q, R):.4f}")
    print("   D   D/sig  Ksh    K*    real(Kt) real(Ksh) real(K*) sheppard-pred(Ksh)  regret_twin regret_sh")
    for D in (0.0, 0.5, 1.0, 2.0, 4.0, 8.0):
        Ksh = sheppard_gain(a, Q, R, D)
        Ks, ms, g, m = best_gain(a, Q, R, D, N, seed=3, grid=GRID)
        rt, rs = simulate_mse([Kt, Ksh], a, Q, R, D, N, seed=3)
        pred = mse(Ksh, a, Q, R + D * D / 12)
        print(f"{D:5.1f} {D/math.sqrt(R):6.2f} {Ksh:5.3f} {Ks:5.2f} {rt:8.4f} {rs:8.4f} {ms:8.4f} {pred:12.4f}"
              f" {rt/ms-1:12.1%} {rs/ms-1:9.1%}")
