"""Single-axis camera-to-gyro time offset: attitude filter error and online offset estimation.

Stylised: the true angle is a band-limited random signal; the gyro (fs_g Hz) has white noise and a
constant bias; the camera (fs_c Hz) measures the angle with white noise but its timestamps are late
by td seconds: the sample stamped t really observes angle(t - td).
"""
import math
from dataclasses import dataclass
import numpy as np

__all__ = ["Setup", "simulate", "filter_rms", "estimate_offset", "predicted_rms_offset_error"]


@dataclass(frozen=True)
class Setup:
    omega_rms: float = 30.0   # deg/s, rms angular rate of the motion
    f_band: float = 2.0       # Hz, motion bandwidth (first-order low-pass of white noise)
    gyro_noise: float = 0.2   # white rate noise density, deg/s/sqrt(Hz)
    gyro_bias: float = 0.5    # deg/s constant bias
    cam_noise: float = 0.3    # deg, per camera sample
    fs_g: float = 200.0
    fs_c: float = 30.0


def simulate(s: Setup, T: float, td: float, rng):
    """Return (t_g, gyro rate, t_c, camera angle stamped at t_c, true angle at stamp times).
    The camera sample stamped t_c really observes the angle at t_c - td (td > 0: stamp is late)."""
    fine = 2000.0
    n = int(T * fine)
    a = math.exp(-2 * math.pi * s.f_band / fine)
    w = rng.standard_normal(n)
    rate = np.empty(n)
    x = 0.0
    for i in range(n):
        x = a * x + w[i]
        rate[i] = x
    rate *= s.omega_rms / rate.std()
    ang = np.cumsum(rate) / fine
    tf = np.arange(n) / fine
    t_g = np.arange(0, T, 1 / s.fs_g)
    t_c = np.arange(1.0, T, 1 / s.fs_c)
    r_g = np.interp(t_g, tf, rate) + s.gyro_bias + s.gyro_noise * math.sqrt(s.fs_g) * rng.standard_normal(len(t_g))
    cam = np.interp(t_c - td, tf, ang) + s.cam_noise * rng.standard_normal(len(t_c))
    truth = np.interp(t_c, tf, ang)
    return t_g, r_g, t_c, cam, tf, ang


def filter_rms(s: Setup, t_g, r_g, t_c, cam, tf, ang, gain_angle=0.15, gain_bias=0.01, td_hat=0.0):
    """Complementary filter: integrate gyro minus bias estimate, correct with camera residuals.
    Returns rms angle error (deg) against the true angle, after a 5 s warm-up."""
    dt = 1 / s.fs_g
    th, b = 0.0, 0.0
    ci = 0
    err = []
    first = True
    for k, t in enumerate(t_g):
        if first:
            th = float(np.interp(t, tf, ang))
            first = False
        else:
            th += (r_g[k] - b) * dt
        while ci < len(t_c) and t_c[ci] - td_hat <= t:
            # estimate angle at the (corrected) observation time: roll back by the elapsed gyro integral
            lag = t - (t_c[ci] - td_hat)
            pred = th - (r_g[k] - b) * lag
            res = cam[ci] - pred
            th += gain_angle * res
            b -= gain_bias * res * s.fs_c
            ci += 1
        if t > 5.0:
            err.append(th - float(np.interp(t, tf, ang)))
    e = np.asarray(err)
    return float(math.sqrt(np.mean(e ** 2)))


def predicted_rms_offset_error(s: Setup, td: float) -> float:
    """First-order floor: a camera reading that observes the angle td earlier is wrong by omega*td."""
    return s.omega_rms * td


def estimate_offset(s: Setup, t_g, r_g, t_c, cam, search=0.1, iters=40):
    """Online offset estimate: integrate the bias-removed gyro and find the shift td that best aligns
    it with the camera angles (golden-section search on the detrended residual)."""
    ang_g = np.cumsum(r_g) / s.fs_g
    # remove drift from the gyro bias with a linear fit against the camera at the coarse level
    def cost(td):
        g = np.interp(t_c - td, t_g + 0.5 / s.fs_g, ang_g)  # cumsum of rate*dt is the angle half a sample after the stamp
        X = np.vstack([g, np.ones_like(t_c), t_c]).T  # free scale-1 term, offset, linear (bias) drift
        y = cam
        coef, *_ = np.linalg.lstsq(X[:, 1:], y - g, rcond=None)
        r = y - g - X[:, 1:] @ coef
        return float(np.mean(r ** 2))
    lo, hi = -search, search
    phi = (math.sqrt(5) - 1) / 2
    c, d = hi - phi * (hi - lo), lo + phi * (hi - lo)
    fc, fd = cost(c), cost(d)
    for _ in range(iters):
        if fc < fd:
            hi, d, fd = d, c, fc
            c = hi - phi * (hi - lo)
            fc = cost(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + phi * (hi - lo)
            fd = cost(d)
    return 0.5 * (lo + hi)
