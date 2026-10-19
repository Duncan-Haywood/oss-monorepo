"""Ball state estimation from noisy 3-D position fixes.

Between bounces the ball is close to a constant-acceleration body over one
frame, so each axis gets its own two-state Kalman filter (position,
velocity). Gravity and drag, evaluated at the current velocity estimate,
are the known input; lift from unknown spin is absorbed by process noise. That is small enough to
run at camera frame rate on a Raspberry Pi in pure Python. The estimate is
then handed to `ballistics.simulate` for a drag-aware prediction.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import ballistics as bl


@dataclass
class _Axis:
    accel: float           # known input (m/s^2)
    q: float               # process-noise spectral density
    r: float               # measurement variance (m^2)
    x: float = 0.0
    v: float = 0.0
    p: list[list[float]] = field(default_factory=lambda: [[1.0, 0.0], [0.0, 100.0]])

    def predict(self, dt: float) -> None:
        self.x += self.v * dt + 0.5 * self.accel * dt * dt
        self.v += self.accel * dt
        (p00, p01), (p10, p11) = self.p
        q = self.q
        # P = F P F^T + Q for F = [[1, dt], [0, 1]], white-acceleration Q.
        n00 = p00 + dt * (p10 + p01) + dt * dt * p11 + q * dt ** 3 / 3
        n01 = p01 + dt * p11 + q * dt ** 2 / 2
        n10 = p10 + dt * p11 + q * dt ** 2 / 2
        n11 = p11 + q * dt
        self.p = [[n00, n01], [n10, n11]]

    def update(self, z: float) -> None:
        (p00, p01), (p10, p11) = self.p
        s = p00 + self.r
        k0, k1 = p00 / s, p10 / s
        y = z - self.x
        self.x += k0 * y
        self.v += k1 * y
        self.p = [[(1 - k0) * p00, (1 - k0) * p01], [p10 - k1 * p00, p11 - k1 * p01]]


class BallTracker:
    """Fuses timestamped (x, y, z) fixes into a position/velocity estimate.

    `measurement_sigma` is the 1-sigma error of a fix in metres (a stereo
    pair of 120 fps global-shutter cameras at court distance gives a few
    centimetres laterally and more in depth; set it from your own rig).
    A bounce shows up as a z-velocity sign flip that the filter cannot
    follow, so `observe` resets the filter when the innovation is large.
    """

    def __init__(self, measurement_sigma: float = 0.05, accel_noise: float = 5.0,
                 gate: float = 0.6, ball: bl.BallModel = bl.DEFAULT_BALL) -> None:
        self.ball = ball
        self._r = measurement_sigma ** 2
        self._q = accel_noise
        self._gate = gate
        self._axes: list[_Axis] | None = None
        self._t: float | None = None
        self.fixes = 0

    def _reset(self, t: float, pos: bl.Vec) -> None:
        g = -self.ball.gravity
        self._axes = [_Axis(0.0, self._q, self._r, pos[0]),
                      _Axis(0.0, self._q, self._r, pos[1]),
                      _Axis(g, self._q, self._r, pos[2])]
        self._t = t
        self.fixes = 1

    def observe(self, t: float, pos: bl.Vec) -> None:
        if self._axes is None or self._t is None or t <= self._t:
            self._reset(t, pos)
            return
        dt = t - self._t
        if self.fixes >= 2:
            accel = bl.acceleration(tuple(a.v for a in self._axes), (0.0, 0.0, 0.0), self.ball)
        else:
            accel = (0.0, 0.0, -self.ball.gravity)
        for a, acc in zip(self._axes, accel):
            a.accel = acc
            a.predict(dt)
        miss = max(abs(a.x - z) for a, z in zip(self._axes, pos))
        if self.fixes >= 3 and miss > self._gate:
            self._reset(t, pos)
            return
        for a, z in zip(self._axes, pos):
            a.update(z)
        self._t = t
        self.fixes += 1

    @property
    def ready(self) -> bool:
        return self._axes is not None and self.fixes >= 3

    def estimate(self) -> tuple[float, bl.Vec, bl.Vec]:
        """(time, position, velocity) of the latest estimate."""
        if self._axes is None or self._t is None:
            raise RuntimeError("no fixes yet")
        ax = self._axes
        return self._t, (ax[0].x, ax[1].x, ax[2].x), (ax[0].v, ax[1].v, ax[2].v)

    def predict(self, *, max_bounces: int = 1, stop_x: float | None = None,
                spin: bl.Vec = (0.0, 0.0, 0.0)) -> bl.Flight:
        """Forward-simulate from the current estimate with the full flight model.

        Spin is not observable from positions alone over a few frames, so it
        defaults to zero; pass an estimate if you have one (e.g. from the
        curvature over a longer track).
        """
        t, p, v = self.estimate()
        flight = bl.simulate(p, v, spin, ball=self.ball, max_bounces=max_bounces,
                             stop_x=stop_x, net=False)
        for s in flight.states:
            s.t += t
        return flight
