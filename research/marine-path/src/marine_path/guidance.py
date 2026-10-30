"""Line-of-sight guidance for a straight survey line along +x through y = 0.

Cross-track error y is positive to port. Plain LOS: psi_d = -atan2(y, delta). Integral LOS
(Borhaug, Pavlov and Pettersen 2008; Fossen 2011 sec. 12): psi_d = -atan2(y + kappa*yint, delta)
with d yint/dt = delta*y / (delta^2 + (y + kappa*yint)^2), which removes the steady offset a cross
current leaves under plain LOS.
"""
import math


def los(y, delta):
    return -math.atan2(y, delta)


class ILOS:
    """Integral LOS with gain kappa and look-ahead delta."""

    def __init__(self, delta, kappa):
        self.delta, self.kappa, self.yint = delta, kappa, 0.0

    def heading(self, y, dt):
        e = y + self.kappa * self.yint
        self.yint += dt * self.delta * y / (self.delta ** 2 + e * e)
        return -math.atan2(e, self.delta)


def steady_los_offset(delta, speed, cross_current):
    """Analytic steady cross-track error of plain LOS under heading control in a cross current cy.
    Zero ground cross velocity, speed*sin(psi_d) + cy = 0 with sin(psi_d) = -y/sqrt(delta^2+y^2),
    gives y = delta*tan(asin(cy/speed)); infinite once the current reaches the boat speed."""
    s = cross_current / speed
    if abs(s) >= 1:
        return math.inf
    return delta * math.tan(math.asin(s))
