"""Milestone 9u: what does '10% of channel rms' mean for a real IMU? (arithmetic on a datasheet, no simulation)

Source: Bosch BMI088 data sheet (bosch-sensortec.com, bst-bmi088-ds001.pdf, retrieved 2026-11-02):
gyro noise 0.014 deg/s/sqrt(Hz) (0.1 deg/s rms at BW 47 Hz); accelerometer output noise 190 ug/sqrt(Hz) (g-range 3 g, 25 C).
Experiments 9j to 9s sample at dt = t_sp/20 and add noise = fraction x channel rms. White density only: bias drift is not in it.
Prints: sensor noise rms for the Nyquist bandwidth at several short-period times, and the channel rms at which that
noise equals 10% (and 2%) of the channel rms.
"""
import math

GYRO = 0.014      # deg/s/sqrt(Hz)
ACC = 190e-6      # g/sqrt(Hz)
print("sensor white noise over the Nyquist band 1/(2 dt), dt = t_sp/20")
print("t_sp (s) | fs (Hz) | gyro rms (deg/s) | accel rms (mg) | q rms for 10% / 2% (deg/s) | dn rms for 10% / 2% (g)")
for tsp in (0.4, 0.6, 0.9, 1.5, 2.5):
    dt = tsp / 20
    bw = 1 / (2 * dt)
    g = GYRO * math.sqrt(bw)
    a = ACC * math.sqrt(bw)
    print(f"{tsp:8.1f} | {1/dt:7.1f} | {g:16.3f} | {a*1e3:14.2f} | {g/0.10:8.2f} / {g/0.02:6.2f}      | {a/0.10:.4f} / {a/0.02:.4f}")
print("check: at BW 47 Hz the gyro rms is", round(GYRO * math.sqrt(47), 3), "deg/s (data sheet: 0.1)")
