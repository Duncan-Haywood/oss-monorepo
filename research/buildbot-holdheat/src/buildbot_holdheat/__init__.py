"""Thermal reading of buildbot-payload's static joint torques."""
import math


def hold_time(u, rho):
    """Time to reach the winding limit, in units of the thermal time constant, holding at
    fraction `u` of peak torque when the continuous rating is fraction `rho` of peak.

    First-order thermal model with copper loss ~ torque^2 and steady rise at rho equal to the
    limit: T(t)/Tmax = (u/rho)^2 (1 - exp(-t/tau)). Infinite when u <= rho."""
    if u <= rho:
        return math.inf
    return -math.log(1.0 - (rho / u) ** 2)


def loss_ratio(u_load, u_base):
    """Copper loss of the loaded pose over the unloaded one: sum(u^2) with equal motor loss at peak."""
    b = sum(x * x for x in u_base)
    return sum(x * x for x in u_load) / b if b else math.inf
