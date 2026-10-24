"""Writes experiments/results.txt. About 3-4 minutes."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from dataclasses import replace
from sensing_syncskew import Setup, simulate, filter_rms, estimate_sync

HERE = os.path.dirname(__file__)
out = []


def p(s=""):
    print(s)
    out.append(s)


S = Setup()
T = 40.0
p("# sensing-syncskew: excitation needed to fit the camera-gyro offset, and what clock skew does (synthetic)")
p(f"setup: {S}; window {T:.0f} s; 8 seeds per cell unless stated")

p("\n## A. Excitation: offset fit vs motion (true td = 20 ms, no skew; success = |error| < 5 ms)")
p("omega_rms (deg/s) | success (of 8) | rms error (ms)")
for om in (0.3, 1, 2, 4, 8, 16, 30):
    s = replace(S, omega_rms=om)
    e = np.array([estimate_sync(s, *simulate(s, T, 0.02, 0.0, np.random.default_rng(600 + k))[:4], fit_skew=False)[0] - 0.02
                  for k in range(8)])
    p(f"{om} | {int(np.sum(np.abs(e) < 0.005))} | {1000*np.sqrt(np.mean(e**2)):.1f}")

p("\n## B. Clock skew: attitude error with td0 = 0 and skew, window 40 s (td reaches skew*40 s by the end)")
p("skew (ppm) | drift at 40 s (ms) | rms error, no correction (deg) | fixed-offset fit (deg) | offset+skew fit (deg) | fitted skew (ppm)")
ref = np.mean([filter_rms(S, *simulate(S, T, 0.0, 0.0, np.random.default_rng(700 + k))) for k in range(4)])
for ppm in (0, 100, 500, 1000, 2000):
    sk = ppm * 1e-6
    u, f1, f2, fs = [], [], [], []
    for k in range(4):
        d = simulate(S, T, 0.0, sk, np.random.default_rng(700 + k))
        u.append(filter_rms(S, *d))
        td1, _ = estimate_sync(S, *d[:4], fit_skew=False)
        f1.append(filter_rms(S, *d, td0_hat=td1))
        td2, sk2 = estimate_sync(S, *d[:4])
        f2.append(filter_rms(S, *d, td0_hat=td2, skew_hat=sk2))
        fs.append(sk2 * 1e6)
    p(f"{ppm} | {ppm*1e-6*T*1000:.0f} | {np.mean(u):.3f} | {np.mean(f1):.3f} | {np.mean(f2):.3f} | {np.mean(fs):.0f}")
p(f"reference with no offset and no skew: {ref:.3f} deg")

p("\n## C. Skew recovery vs window length (true skew 500 ppm, td0 = 5 ms, 8 seeds)")
p("window (s) | mean skew estimate (ppm) | rms skew error (ppm)")
for Tw in (10, 20, 40, 80):
    est = np.array([estimate_sync(S, *simulate(S, Tw, 0.005, 5e-4, np.random.default_rng(800 + k))[:4])[1] for k in range(8)])
    p(f"{Tw} | {est.mean()*1e6:.0f} | {1e6*np.sqrt(np.mean((est-5e-4)**2)):.0f}")

with open(os.path.join(HERE, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
