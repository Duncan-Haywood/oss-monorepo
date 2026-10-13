import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from chirp_twin import *

PRESETS = [("fast 77 GHz", 77e9, 1e9, 40e-6, 60e-6), ("mid 77 GHz", 77e9, 1e9, 200e-6, 250e-6),
           ("slow 24 GHz", 24e9, 250e6, 1e-3, 1.2e-3)]
print("FMCW range-Doppler coupling twin. Twin reads the true range; the real up-ramp radar reads R + kappa v (+ v T).")
print("Presets: name, carrier fc, bandwidth B, ramp T, repetition interval Tpri")

print("\n== 1. kappa, range cell, unambiguous speed V, bias in cells at 30 m/s (analytic) ==")
print("preset         kappa [s]  cell [m]  V [m/s]  bias@30 m/s [m]  [cells]  (= f_D T)")
for n, fc, B, T, Tp in PRESETS:
    k = kappa(fc, T, B)
    print("%-13s %-10.4g %-9.4f %-8.2f %-16.4f %.3f" % (n, k, C / (2 * B), unamb_velocity(fc, Tp), 30 * k, bias_cells(30.0, fc, T)))

print("\n== 2. Signal-level check: beat tone simulated with exact two-way delay, Hann window, zero-padded FFT + parabola ==")
print("(R0 = 30 m at ramp start; read - R0 versus the formula kappa v and kappa v + v T)")
print("preset         v [m/s]  read-R0 [m]   kappa v [m]   kappa v + v T [m]   residual to the latter [cells]")
for n, fc, B, T, Tp in PRESETS:
    for v in (-25.0, 10.0, 25.0):
        r = measured_range(30.0, v, fc, B, T)
        print("%-13s %-8g %-13.5f %-13.5f %-19.5f %+.4f" % (n, v, r - 30.0, kappa(fc, T, B) * v, range_read(30.0, v, fc, T, B) - 30.0,
                                                           (r - range_read(30.0, v, fc, T, B)) / (C / (2 * B))))

print("\n== 3. Bias in cells stays <= (T/Tpri)/2 for |v| <= V (analytic: (v/V) T/(2 Tpri)) ==")
for n, fc, B, T, Tp in PRESETS:
    V = unamb_velocity(fc, Tp)
    print("%-13s T/Tpri=%.3f  cells at v=V: %.4f   at 2V: %.4f   at 3V: %.4f" %
          (n, T / Tp, bias_cells_unamb(V, V, T, Tp), bias_cells_unamb(2 * V, V, T, Tp), bias_cells_unamb(3 * V, V, T, Tp)))

print("\n== 4. Compensating with the wrapped Doppler speed (fast preset; V=%.2f m/s) ==" % unamb_velocity(77e9, 60e-6))
n, fc, B, T, Tp = PRESETS[0]
V = unamb_velocity(fc, Tp)
print("v/V   uncorrected [cells]   wrapped-corrected [cells]   corrected worse than none?")
for x in (0.5, 0.9, 1.1, 1.5, 1.9, 2.5, 2.9, 3.3, 3.7, 5.0):
    v = x * V
    print("%-5g %-20.4f %-27.4f %s" % (x, bias_cells_unamb(v, V, T, Tp), corrected_error_cells(v, V, T, Tp), worse_than_none(v, V)))
fr = sum(worse_than_none(V * (1 + 20 * i / 200000), V) for i in range(200000)) / 200000
print("fraction of speeds in (V, 21V) where wrapped compensation is worse than none: %.4f" % fr)

print("\n== 5. Stationary scene seen by a forward-moving radar: every point read short by kappa v cos(theta) ==")
print("(analytic closed forms; rigid 2-D Procrustes residual by numerics on a ring r=40 m, 2001 points)")
print("FOV +-deg  <cos^2>  translation bias / kv   residual rms (closed) / kv   rigid residual (numeric) / kv")
for deg in (30, 60, 90):
    phi = math.radians(deg)
    print("%-10d %-8.4f %-22.4f %-26.4f %.4f" % (deg, ring_cos2_mean(phi), ring_translation_bias(1.0, phi), ring_residual_rms(1.0, phi),
                                                 ring_rigid_residual_rms(0.01, phi, 40.0) / 0.01))
print("\nalong-track position bias and residual map distortion at v = 30 m/s, FOV +-60 deg:")
phi = math.radians(60)
for n, fc, B, T, Tp in PRESETS:
    kv = kappa(fc, T, B) * 30.0
    print("%-13s translation bias %.4f m   residual rms %.4f m   (cell %.4f m)" % (n, ring_translation_bias(kv, phi), ring_residual_rms(kv, phi), C / (2 * B)))
