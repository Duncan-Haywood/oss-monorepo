"""Two-wheel launcher: wheel speeds <-> ball speed and spin, and aiming at a target.

The launcher pinches the ball between two counter-rotating wheels stacked
vertically. If the wheels did not slip, the ball would leave at the mean of
the two surface speeds and spin at (v_top - v_bottom) / (2 r). Real machines
lose some of both to slip and ball compression, so two efficiencies scale
them. Measure them on your build with `calibrate`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import ballistics as bl
from . import court


@dataclass(frozen=True)
class WheelLauncher:
    wheel_radius: float = 0.075      # m (150 mm wheels)
    speed_efficiency: float = 0.85   # exit speed / mean wheel surface speed
    spin_efficiency: float = 0.5     # exit spin / no-slip spin
    max_rpm: float = 7000.0
    ball_radius: float = bl.DEFAULT_BALL.radius

    def exit(self, rpm_top: float, rpm_bottom: float) -> tuple[float, float]:
        """(speed m/s, topspin rad/s) for the given wheel speeds."""
        vt = rpm_top * bl.RPM * self.wheel_radius
        vb = rpm_bottom * bl.RPM * self.wheel_radius
        speed = self.speed_efficiency * (vt + vb) / 2
        spin = self.spin_efficiency * (vt - vb) / (2 * self.ball_radius)
        return speed, spin

    def wheel_rpm(self, speed: float, topspin: float) -> tuple[float, float]:
        """(rpm_top, rpm_bottom) that produce `speed` m/s and `topspin` rad/s.

        Raises ValueError if either wheel would need to exceed `max_rpm` or
        turn backwards.
        """
        total = 2 * speed / self.speed_efficiency
        diff = 2 * self.ball_radius * topspin / self.spin_efficiency
        vt, vb = (total + diff) / 2, (total - diff) / 2
        per = 1 / (bl.RPM * self.wheel_radius)
        rt, rb = vt * per, vb * per
        if min(rt, rb) < 0:
            raise ValueError(f"spin too high for this speed: a wheel would turn backwards ({rt:.0f}, {rb:.0f} rpm)")
        if max(rt, rb) > self.max_rpm:
            raise ValueError(f"needs {max(rt, rb):.0f} rpm, above the {self.max_rpm:.0f} rpm limit")
        return rt, rb


def calibrate(samples: list[tuple[float, float, float, float | None]],
              base: WheelLauncher = WheelLauncher()) -> WheelLauncher:
    """Fit the two efficiencies from measured shots.

    Each sample is (rpm_top, rpm_bottom, measured_speed_mps, measured_topspin_rpm or None).
    Speed comes from a radar gun or a slow-motion video over a known
    distance; spin from slow-motion video of a marked ball. Least squares
    through the origin, one parameter each.
    """
    num_s = den_s = num_w = den_w = 0.0
    for rt, rb, v, w_rpm in samples:
        vt = rt * bl.RPM * base.wheel_radius
        vb = rb * bl.RPM * base.wheel_radius
        mean = (vt + vb) / 2
        num_s += mean * v
        den_s += mean * mean
        if w_rpm is not None:
            nominal = (vt - vb) / (2 * base.ball_radius)
            num_w += nominal * w_rpm * bl.RPM
            den_w += nominal * nominal
    if den_s == 0:
        raise ValueError("need at least one sample with non-zero wheel speed")
    spin_eff = num_w / den_w if den_w else base.spin_efficiency
    return WheelLauncher(base.wheel_radius, num_s / den_s, spin_eff, base.max_rpm, base.ball_radius)


@dataclass(frozen=True)
class Shot:
    speed: float            # m/s at the wheels
    topspin_rpm: float
    sidespin_rpm: float
    elevation_deg: float
    azimuth_deg: float      # 0 = straight down the court (+x)
    landing: tuple[float, float]
    net_clearance: float | None
    flight_time: float      # launch to first bounce, s


def _fly(origin: bl.Vec, speed: float, elev: float, az: float, top: float, side: float,
         ball: bl.BallModel) -> bl.Flight:
    v = bl.launch_velocity(speed, elev, az)
    return bl.simulate(origin, v, bl.spin_vector(v, top, side), ball=ball, max_bounces=0)


def aim(origin: bl.Vec, target: tuple[float, float], speed: float, topspin_rpm: float = 0.0,
        sidespin_rpm: float = 0.0, ball: bl.BallModel = bl.DEFAULT_BALL, *,
        min_net_clearance: float = 0.15) -> Shot:
    """Elevation and azimuth that land a ball of the given speed and spin on `target`.

    Takes the low arc (the flatter of the two solutions), which is what a
    ball machine feeding groundstrokes wants. Raises ValueError if the
    target is out of reach at this speed or the shot would not clear the net
    by `min_net_clearance` metres.
    """
    top = topspin_rpm * bl.RPM
    side = sidespin_rpm * bl.RPM
    tx, ty = target
    ox, oy, _ = origin
    want = math.hypot(tx - ox, ty - oy)
    az = math.atan2(ty - oy, tx - ox)

    def dist(elev: float, az: float) -> tuple[float, bl.Flight]:
        f = _fly(origin, speed, elev, az, top, side, ball)
        b = f.first_bounce
        if f.hit_net or b is None:
            return -1.0, f
        return math.hypot(b.pos[0] - ox, b.pos[1] - oy), f

    elev = None
    flight = None
    for _ in range(6):
        lo = math.radians(-20)
        d_lo, _ = dist(lo, az)
        bracket = None
        e = lo
        while e < math.radians(50):
            e2 = e + math.radians(2)
            d2, _ = dist(e2, az)
            if d_lo <= want <= d2:
                bracket = (e, e2)
                break
            e, d_lo = e2, d2
        if bracket is None:
            raise ValueError(f"target {target} is out of reach at {speed:.1f} m/s")
        a, b = bracket
        for _ in range(40):
            m = (a + b) / 2
            dm, _ = dist(m, az)
            if dm < want:
                a = m
            else:
                b = m
        elev = (a + b) / 2
        _, flight = dist(elev, az)
        land = flight.first_bounce.pos
        err = math.atan2(ty - oy, tx - ox) - math.atan2(land[1] - oy, land[0] - ox)
        if abs(err) < 1e-5:
            break
        az += err
    land = flight.first_bounce.pos
    clearance = flight.net_clearance
    if clearance is not None and clearance < min_net_clearance:
        raise ValueError(f"shot clears the net by only {clearance:.2f} m; add speed, lift or depth")
    return Shot(speed, topspin_rpm, sidespin_rpm, math.degrees(elev), math.degrees(az),
                (land[0], land[1]), clearance, flight.first_bounce.t)


def default_origin(y: float = 0.0, height: float = 1.0) -> bl.Vec:
    """Launch point for a machine standing 0.5 m behind the robot-side baseline."""
    return (-court.HALF_LENGTH - 0.5, y, height)
