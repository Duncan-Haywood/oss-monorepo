"""Milestone 9v: what do a real IMU's zero offset and its temperature drift do to the pitch-rate and load-factor channels? (arithmetic on a datasheet; no simulation)

Source: Bosch BMI088 data sheet (bosch-sensortec.com, bst-bmi088-ds001.pdf, retrieved 2026-11-02), same file as 9u.
Gyro: zero-rate offset +-1 deg/s at 25 C (offset cancellation off), TCO +-0.015 deg/s per K, noise density 0.014 deg/s/sqrt(Hz).
Accelerometer: zero-g offset 20 mg at 25 C (g-range 6 g), TCO < 0.2 mg/K, noise density 190 ug/sqrt(Hz).
A constant offset is removable by averaging a static record before flight; what is left is (a) the averaging error and
(b) offset change TCO x dT between that calibration and the manoeuvre. Prints both against the channel rms that 9u
found (the break-even rms for 10% white noise, t_sp = 0.9 s), and the rms at which each error is 10% of the signal.
"""
import math

G_OFF, G_TCO, G_ND = 1.0, 0.015, 0.014          # deg/s, deg/s/K, deg/s/sqrt(Hz)
A_OFF, A_TCO, A_ND = 20.0, 0.2, 0.190           # mg, mg/K (upper bound), mg/sqrt(Hz)

print("1) factory offset, uncalibrated, against a channel rms of a few deg/s / hundredths of a g")
for q in (0.5, 1, 2, 5):
    print(f"   pitch-rate rms {q:4.1f} deg/s: offset of 1 deg/s is {100*G_OFF/q:5.0f}% of rms")
for n in (0.004, 0.01, 0.03, 0.1):
    print(f"   load-factor rms {n:5.3f} g: offset of 20 mg is {100*A_OFF/1e3/n:5.0f}% of rms")

print("\n2) after averaging a static record of T seconds (white noise only, 1/sqrt(2T) bandwidth): residual offset")
for T in (5, 30, 120):
    g = G_ND / math.sqrt(2 * T)
    a = A_ND / math.sqrt(2 * T)
    print(f"   T = {T:4d} s: gyro {g*1e3:6.2f} mdeg/s, accel {a*1e3:6.2f} ug")

print("\n3) offset change between calibration and manoeuvre, TCO x dT, and the rms at which it is 10% / 2% of the signal")
print("   dT (K) | gyro drift (deg/s) | q rms for 10% / 2% (deg/s) | accel drift (mg) | dn rms for 10% / 2% (g)")
for dT in (1, 2, 5, 10, 20):
    gd = G_TCO * dT
    ad = A_TCO * dT
    print(f"   {dT:6d} | {gd:18.3f} | {gd/0.10:9.2f} / {gd/0.02:6.2f}        | {ad:16.2f} | {ad/1e3/0.10:.4f} / {ad/1e3/0.02:.4f}")
