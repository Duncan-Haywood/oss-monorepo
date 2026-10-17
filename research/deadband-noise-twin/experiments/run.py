"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from deadband_noise_twin.model import *

print("Deadband twin: integrator plant x+ = x + f(u), u = -K(x+n). Twin f(u)=u; real f = deadband width d (d=0.1 unless stated).")
D = 0.1

K = 0.5
print("\n== 1. Measurement noise s: stationary rms error, twin (exact s*sqrt(K/(2-K))) vs real deadband (simulated, n=2e5, K=0.5) ==")
print("s       twin rms   real rms   real/twin")
K = 0.5
for s in (0.0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.2):
    real = stationary_rms(K, D, s, seed=11)
    tw = twin_rms(K, s)
    print("%-7g %-10.4f %-10.4f %s" % (s, tw, real, "%.2f" % (real / tw) if tw else "inf"))

print("\n== 2. Dither U(-a,a) added to u (K=0.5, d=0.1): real stationary rms ==")
print("a       s=0        s=0.02     s=0.05")
for a in (0.0, 0.02, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3):
    row = [stationary_rms(K, D, s, a=a, seed=21) for s in (0.0, 0.02, 0.05)]
    print("%-7g %-10.4f %-10.4f %-10.4f" % ((a,) + tuple(row)))
print("twin rms (no dither) at s=0.02 / 0.05: %.4f / %.4f" % (twin_rms(K, 0.02), twin_rms(K, 0.05)))

print("\n== 3. Inverse-deadband compensation with assumed width dh under noise (K=0.5, d=0.1, s=0.02), stationary rms ==")
for dh in (0.0, 0.08, 0.1, 0.12, 0.15):
    print("dh=%-5g rms %.4f" % (dh, stationary_rms(K, D, 0.02, seed=31, dh=dh)))
