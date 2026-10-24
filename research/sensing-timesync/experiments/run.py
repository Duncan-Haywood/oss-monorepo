"""Writes experiments/results.txt. ~1 minute."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from dataclasses import replace
from sensing_timesync import Setup, simulate, filter_rms, estimate_offset

HERE = os.path.dirname(__file__)
out = []


def p(s=""):
    print(s)
    out.append(s)


def rms(s, td, seeds=4, T=40.0, td_hat=0.0):
    return float(np.mean([filter_rms(s, *simulate(s, T, td, np.random.default_rng(100 + k)), td_hat=td_hat)
                          for k in range(seeds)]))


def doubling(s):
    base = rms(s, 0.0)
    grid = np.arange(0.0, 0.2001, 0.002)
    prev = 0.0
    for td in grid[1:]:
        if rms(s, td) >= 2 * base:
            # linear interpolation between the last two grid points
            return base, prev, td
        prev = td
    return base, None, None


S = Setup()
p("# sensing-timesync: camera-to-gyro time offset (single axis, synthetic, stylised)")
p(f"setup: {S}")
p("filter: complementary (fixed gains), 4 seeds x 40 s per cell; error = rms angle error after 5 s warm-up")

p("\n## A. Fused attitude error vs time offset (td > 0: camera stamp is late)")
p("td (ms) | rms error (deg) | ratio to td=0 | first-order omega_rms*td (deg)")
base = rms(S, 0.0)
for ms in (0, 2, 5, 10, 15, 20, 40, 80):
    e = rms(S, ms / 1000)
    p(f"{ms:>4} | {e:.3f} | {e/base:.2f} | {S.omega_rms*ms/1000:.3f}")

p("\n## B. Offset that doubles the error, vs motion intensity and camera noise (bracket from a 2 ms grid)")
p("omega_rms (deg/s) | cam noise (deg) | error at td=0 | doubling offset between (ms)")
for om in (10, 30, 90):
    for cn in (0.1, 0.3, 1.0):
        s = replace(S, omega_rms=om, cam_noise=cn)
        b, lo, hi = doubling(s)
        br = "not reached by 200 ms" if lo is None else f"{lo*1000:.0f}-{hi*1000:.0f}"
        p(f"{om} | {cn} | {b:.3f} | {br}")

p("\n## C. Online estimate of the offset (gyro-integral vs camera alignment fit), 6 seeds")
p("true td (ms) | window (s) | mean estimate (ms) | rms error (ms)")
for td in (0.01, 0.04):
    for T in (10, 40):
        est = np.array([estimate_offset(S, *simulate(S, T, td, np.random.default_rng(200 + k))[:4]) for k in range(6)])
        p(f"{td*1000:.0f} | {T} | {est.mean()*1000:.2f} | {np.sqrt(np.mean((est-td)**2))*1000:.2f}")
p("zero-offset control (true td = 0): estimates (ms) = " + ", ".join(
    f"{estimate_offset(S, *simulate(S, 40, 0.0, np.random.default_rng(300 + k))[:4])*1000:.2f}" for k in range(6)))

p("\n## D. Does feeding the estimate back help? (T = 40 s estimate, then filter with td_hat)")
p("true td (ms) | uncorrected rms (deg) | corrected rms (deg) | td=0 reference")
for td in (0.01, 0.04, 0.08):
    hat = estimate_offset(S, *simulate(S, 40, td, np.random.default_rng(400))[:4])
    p(f"{td*1000:.0f} | {rms(S, td):.3f} | {rms(S, td, td_hat=hat):.3f} | {base:.3f}")

p("\n## E. Excitation: estimator needs motion. Nearly still platform (omega_rms = 1 deg/s), T = 40 s")
s1 = replace(S, omega_rms=1.0)
est = np.array([estimate_offset(s1, *simulate(s1, 40, 0.02, np.random.default_rng(500 + k))[:4]) for k in range(6)])
p(f"true 20 ms: estimates (ms) = " + ", ".join(f"{e*1000:.1f}" for e in est))

with open(os.path.join(HERE, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
