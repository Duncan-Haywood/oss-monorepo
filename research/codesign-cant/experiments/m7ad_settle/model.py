"""Milestone 7ad: a three-state model of the position loop that predicts which designs never settle on a 1 m step.

The outer loop of every design is a PID on a double integrator: x'' = kp e_c - kd x' + ki I, I' = e, e = -x, where e_c is the
error clipped at A_P / kp (the cap of milestone 7k). For small ki the characteristic polynomial s^3 + kd s^2 + kp s + ki has a
slow real root close to -ki / kp, so whatever the integrator stores during the step's approach (I0, in m s) leaves a tail
x(t) ~ (ki / kp) I0 exp(-(ki / kp) t) that decays on a time scale kp / ki, much longer than the 6 s flight when ki / kp is small
but whose size grows with ki / kp. The tail at the end of the flight peaks near ki / kp = 1 / t.

This model ignores the attitude loop, the motor lag, the mixer and the centre-of-pressure side force; it only keeps the outer
PID, the clip, the 45 deg tilt limit as an acceleration bound (g tan 45 deg) and the integrator clip (+-2 m s). It uses the
same 1 m step, 6 s flight and 5 cm band as milestone 7y's step test. Stdlib + numpy.
"""
import numpy as np

G, A_P, T_END, DT, BAND, STEP = 9.81, 3.5, 6.0, 0.002, 0.05, 1.0
PINT_CLIP = 2.0


def step(kp, kd, ki, band_int=None, t_end=T_END, dt=DT):
    """Vectorised over designs. Returns (t, x) with x shaped (T, N). band_int: integrate only while |e| < band_int (None: always)."""
    kp, kd, ki = (np.atleast_1d(np.asarray(v, float)) for v in (kp, kd, ki))
    n = int(round(t_end / dt))
    x = np.full(kp.shape, STEP); v = np.zeros_like(x); I = np.zeros_like(x)
    pmax = A_P / kp
    out = np.empty((n, len(kp)))
    for k in range(n):
        e = -x
        upd = np.ones_like(x, bool) if band_int is None else np.abs(e) < band_int
        I = np.clip(I + np.where(upd, e, 0.0) * dt, -PINT_CLIP, PINT_CLIP)
        acc = kp * np.clip(e, -pmax, pmax) - kd * v + ki * I
        acc = np.clip(acc, -G, G)          # 45 deg tilt limit as a horizontal acceleration bound
        v = v + acc * dt; x = x + v * dt   # semi-implicit Euler
        out[k] = x
    return (np.arange(n) + 1) * dt, out


def tail(kp, kd, ki, band_int=None):
    """Mean distance from the hold point over the flight's last second, and whether it ever stays inside the band at the end."""
    t, x = step(kp, kd, ki, band_int)
    last = t > T_END - 1.0
    return np.abs(x[last]).mean(0), np.abs(x[-1]) > BAND


def slow_root(kp, kd, ki):
    """Real part of the slowest root of s^3 + kd s^2 + kp s + ki, per design."""
    return np.array([max(np.roots([1.0, d, p, i]).real) for p, d, i in zip(np.atleast_1d(kp), np.atleast_1d(kd), np.atleast_1d(ki))])
