"""Single-axis camera-to-gyro sync with clock skew: how much motion the fit needs, and what skew does.

Stylised. Same world as `sensing-timesync` (band-limited random angle, 200 Hz biased noisy gyro, 30 Hz
noisy camera angle), but the camera's stamp error is td(t) = td0 + skew * t: the camera clock runs fast
or slow against the gyro clock by `skew` (1e-4 = 100 ppm), so the sample stamped t really observes the
angle at t - td(t). Self-contained; it does not import `sensing_timesync`.
"""
import math
from dataclasses import dataclass
import numpy as np

__all__ = ["Setup", "simulate", "filter_rms", "estimate_sync"]


@dataclass(frozen=True)
class Setup:
    omega_rms: float = 30.0   # deg/s rms angular rate
    f_band: float = 2.0       # Hz motion bandwidth
    gyro_noise: float = 0.2   # deg/s/sqrt(Hz)
    gyro_bias: float = 0.5    # deg/s
    cam_noise: float = 0.3    # deg per camera sample
    fs_g: float = 200.0
    fs_c: float = 30.0


def simulate(s: Setup, T: float, td0: float, skew: float, rng):
    """Return (t_g, gyro rate, t_c, camera angle, fine time, true angle)."""
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
    cam = np.interp(t_c - (td0 + skew * t_c), tf, ang) + s.cam_noise * rng.standard_normal(len(t_c))
    return t_g, r_g, t_c, cam, tf, ang


def filter_rms(s: Setup, t_g, r_g, t_c, cam, tf, ang, td0_hat=0.0, skew_hat=0.0,
               gain_angle=0.15, gain_bias=0.01):
    """Complementary filter that shifts each camera stamp by td0_hat + skew_hat * t. rms error (deg) after 5 s."""
    dt = 1 / s.fs_g
    th, b, ci, first = 0.0, 0.0, 0, True
    err = []
    t_obs = t_c - (td0_hat + skew_hat * t_c)
    for k, t in enumerate(t_g):
        if first:
            th, first = float(np.interp(t, tf, ang)), False
        else:
            th += (r_g[k] - b) * dt
        while ci < len(t_c) and t_obs[ci] <= t:
            pred = th - (r_g[k] - b) * (t - t_obs[ci])
            res = cam[ci] - pred
            th += gain_angle * res
            b -= gain_bias * res * s.fs_c
            ci += 1
        if t > 5.0:
            err.append(th - float(np.interp(t, tf, ang)))
    return float(math.sqrt(np.mean(np.square(err))))


def _golden(f, lo, hi, iters):
    phi = (math.sqrt(5) - 1) / 2
    c, d = hi - phi * (hi - lo), lo + phi * (hi - lo)
    fc, fd = f(c), f(d)
    for _ in range(iters):
        if fc < fd:
            hi, d, fd = d, c, fc
            c = hi - phi * (hi - lo)
            fc = f(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + phi * (hi - lo)
            fd = f(d)
    return 0.5 * (lo + hi)


def estimate_sync(s: Setup, t_g, r_g, t_c, cam, fit_skew=True, search_td=0.1, search_skew=2e-3, iters=22):
    """Align the integrated gyro with the camera angles. Returns (td0, skew); skew is 0 when fit_skew is False.
    The gyro bias drift is absorbed by a free constant and linear term, as in `sensing-timesync`."""
    ang_g = np.cumsum(r_g) / s.fs_g
    tg = t_g + 0.5 / s.fs_g
    X = np.vstack([np.ones_like(t_c), t_c]).T

    def cost(td, sk):
        g = np.interp(t_c - (td + sk * t_c), tg, ang_g)
        y = cam - g
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        return float(np.mean((y - X @ coef) ** 2))

    if not fit_skew:
        return _golden(lambda td: cost(td, 0.0), -search_td, search_td, 40), 0.0
    best = {}

    def inner(sk):
        td = _golden(lambda x: cost(x, sk), -search_td, search_td, iters)
        best[sk] = td
        return cost(td, sk)

    sk = _golden(inner, -search_skew, search_skew, iters)
    return _golden(lambda x: cost(x, sk), -search_td, search_td, iters), sk
