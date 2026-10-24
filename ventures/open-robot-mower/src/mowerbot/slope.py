"""How steep a lawn the mower can work: traction and tip-over limits.

Rigid-body statics with rear drive wheels and two front casters:

* climbing straight up (casters uphill): the drive wheels must push
  m g (sin a + crr cos a) with friction mu on their share of the weight,
  which grows as the slope throws weight back onto them;
* driving straight down: the same wheels must hold the mower back;
* across the slope: it slides when tan a > mu, or tips when the centre of
  mass passes over the downhill wheel line, tan a > (track / 2) / h.

The friction coefficients are assumptions (dry mown grass ~0.5-0.6,
wet grass much less); the centre of mass comes from the CAD layout but
the bought-in masses are estimates. The result is a planning number for
choosing which lawns to try, not a safety rating. Mow slopes first with
the blade removed, in dry conditions, and stay well under the limit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Chassis:
    wheelbase: float = 0.405    # m, rear axle to caster contact (cad params: wheelbase)
    cg_x: float = 0.133         # m forward of the rear axle (cad manifest: centre_of_mass_mm)
    cg_h: float = 0.123         # m above the ground (cad manifest)
    track: float = 0.384        # m
    mu: float = 0.55            # drive tyre on dry grass (assumption)
    mu_wet: float = 0.30        # wet grass (assumption)
    crr: float = 0.12


@dataclass
class SlopeReport:
    climb_deg: float
    descend_deg: float
    slide_deg: float
    tip_side_deg: float
    tip_back_deg: float
    limit_deg: float
    limiting: str

    @property
    def limit_percent(self) -> float:
        return 100 * math.tan(math.radians(self.limit_deg))


def _solve(ok, lo=0.0, hi=60.0) -> float:
    """Largest angle in [lo, hi] degrees for which ok(angle) holds (bisection)."""
    if not ok(math.radians(lo)):
        return lo
    if ok(math.radians(hi)):
        return hi
    for _ in range(60):
        mid = (lo + hi) / 2
        if ok(math.radians(mid)):
            lo = mid
        else:
            hi = mid
    return lo


def rear_load_fraction(c: Chassis, a: float, uphill: bool) -> float:
    """Share of weight on the drive wheels, facing up (uphill=True) or down the slope."""
    s = c.cg_h * math.sin(a) / c.wheelbase
    base = (c.wheelbase - c.cg_x) / c.wheelbase * math.cos(a)
    return base + s if uphill else base - s


def analyse(c: Chassis = Chassis(), wet: bool = False) -> SlopeReport:
    mu = c.mu_wet if wet else c.mu

    def climb_ok(a):
        return mu * rear_load_fraction(c, a, True) >= math.sin(a) + c.crr * math.cos(a)

    def descend_ok(a):
        # Holding back: rolling resistance helps.
        return mu * rear_load_fraction(c, a, False) >= max(0.0, math.sin(a) - c.crr * math.cos(a))

    def back_ok(a):
        # Facing uphill, tipping backwards over the rear axle.
        return c.cg_x * math.cos(a) > c.cg_h * math.sin(a)

    climb = _solve(climb_ok)
    descend = _solve(descend_ok)
    slide = math.degrees(math.atan(mu))
    tip_side = math.degrees(math.atan(c.track / 2 / c.cg_h))
    tip_back = _solve(back_ok, hi=89.0)
    limits = {"climbing traction": climb, "descending traction": descend, "sliding sideways": slide,
              "tipping sideways": tip_side, "tipping backwards": tip_back}
    name = min(limits, key=limits.get)
    return SlopeReport(climb, descend, slide, tip_side, tip_back, limits[name], name)
