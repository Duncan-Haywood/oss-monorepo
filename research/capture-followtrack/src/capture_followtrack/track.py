"""Noisy, delayed pedestrian detections and a constant-velocity Kalman tracker for capture-followplan's planner.

Each step every pedestrian is detected: its true position `latency` seconds ago plus Gaussian noise (sigma, per axis).
Association is assumed perfect (detection i belongs to track i), which flatters the tracker; see the README.
Each track is a per-axis [position, velocity] Kalman filter with white-acceleration process noise `q`, run in the
delayed time frame and extrapolated by the latency, so the planner gets estimated positions and velocities.
The plaza is a torus (capture-follow), so measurements are unwrapped against the track before the update.
"""
import random
from collections import deque

from capture_follow.model import delta, wrap


class _Axis:
    def __init__(self, x, r):
        self.x, self.v = x, 0.0
        self.p = [[r, 0.0], [0.0, 4.0]]   # velocity prior sd 2 m/s

    def step(self, z, dt, q, r):
        z = self.x + delta(z, wrap(self.x))
        x = self.x + self.v * dt
        p = self.p
        a = p[0][0] + dt * (p[1][0] + p[0][1]) + dt * dt * p[1][1] + q * dt ** 4 / 4
        b = p[0][1] + dt * p[1][1] + q * dt ** 3 / 2
        d = p[1][1] + q * dt * dt
        s = a + r
        ka, kb = a / s, b / s
        y = z - x
        self.x, self.v = x + ka * y, self.v + kb * y
        self.p = [[(1 - ka) * a, (1 - ka) * b], [(1 - ka) * b, d - kb * b]]


class _Seen:
    def __init__(self, x, y):
        self.p = (x, y)


class Tracker:
    def __init__(self, seed, sigma=0.3, latency=0.25, dt=0.25, q=0.5):
        self.rng = random.Random(seed + 7919)   # separate stream: crowds stay identical to the other controllers
        self.sigma, self.dt, self.q = sigma, dt, q
        self.lag = int(round(latency / dt))
        self.lat = self.lag * dt
        self.hist = None
        self.tracks = None

    def update(self, peds):
        cur = [(w.p[0], w.p[1]) for w in peds]
        if self.hist is None:
            self.hist = deque([cur] * (self.lag + 1), maxlen=self.lag + 1)
            r = self.sigma ** 2 + 1e-6
            self.tracks = [(_Axis(x, r), _Axis(y, r)) for x, y in cur]
        self.hist.append(cur)
        old = self.hist[0]
        r = self.sigma ** 2 + 1e-6
        seen, vels = [], []
        for (ax, ay), (ox, oy) in zip(self.tracks, old):
            ax.step(wrap(ox + self.rng.gauss(0, self.sigma)), self.dt, self.q, r)
            ay.step(wrap(oy + self.rng.gauss(0, self.sigma)), self.dt, self.q, r)
            seen.append(_Seen(wrap(ax.x + ax.v * self.lat), wrap(ay.x + ay.v * self.lat)))
            vels.append((ax.v, ay.v))
        return seen, vels
