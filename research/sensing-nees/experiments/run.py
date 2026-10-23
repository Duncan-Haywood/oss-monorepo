"""NEES of INS/GNSS filters under flicker accelerometer bias. Writes results.txt."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_nees.model import (G, DT, calibrate_scale, filter_spec_oracle, filter_spec_white,
                                filter_spec_rw, monte_carlo, nees, adev, truth_bias,
                                rw_from_allan)

N = 70e-6 * G           # ICM-42688-P accelerometer noise density, 70 ug/sqrt(Hz) (TDK product page)
OUT = (10, 30, 60, 120, 300)
R = 400


def allan_read(scale, N, taus=(1, 10, 100), seed=5, n=1_000_000):
    rng = np.random.default_rng(seed)
    x = truth_bias(scale, n, 1, rng)[0] + rng.standard_normal(n) * N / np.sqrt(DT)
    return {t: adev(x, t) for t in taus}


lines = []
store = {}


def emit(s=""):
    print(s, flush=True)
    lines.append(s)


emit(f"white accel density N = {N:.3e} m/s^2/sqrt(Hz) (70 ug/sqrt(Hz)), GNSS 2 m at 1 Hz, "
     f"IMU {1/DT:.0f} Hz, warm-up 600 s with GNSS, R = {R} paths")
emit("columns: filter, then NEES/dof at outage 10 30 60 120 300 s, then RMS pos error (m) and "
     "claimed sigma_pos (m) at 300 s")
for Bug in (10, 30, 100, 300):
    B = Bug * 1e-6 * G
    sc = calibrate_scale(B, N)
    ar = allan_read(sc, N)
    emit()
    emit(f"== bias instability B = {Bug} ug  (flicker scale {sc:.3e} m/s^2; read-off Allan at "
         f"1/10/100 s = " + " ".join(f"{ar[t] / G * 1e6:.0f}" for t in (1, 10, 100)) + " ug)")
    specs = [("oracle(5 GM)", filter_spec_oracle(sc, N)), ("white only", filter_spec_white(N))]
    for t0 in (1, 10, 100):
        specs.append((f"RW tuned @{t0}s", filter_spec_rw(rw_from_allan(ar[t0], t0, N), N)))
    for name, sp in specs:
        t, pe, ve, bl = monte_carlo(sp, sc, N, R=R)
        ne = [nees(pe, ve, bl, int(round(s / DT)) - 1) for s in OUT]
        rms = float(np.sqrt((pe[:, -1] ** 2).mean()))
        sig = float(np.sqrt(bl[-1][0, 0]))
        store[(Bug, name)] = ne
        emit(f"{name:16s} " + " ".join(f"{v:9.2f}" for v in ne) + f"   rms {rms:8.2f}  claim {sig:8.2f}")
emit()
emit("== Z. NEES per dof at B = 100 ug: outage_s, oracle, RW@100, RW@10, RW@1")
for i, s_ in enumerate(OUT):
    emit(f"{s_:5d} " + " ".join(f"{store[(100, n_)][i]:9.2f}" for n_ in
                                ("oracle(5 GM)", "RW tuned @100s", "RW tuned @10s", "RW tuned @1s")))
with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(lines) + "\n")
