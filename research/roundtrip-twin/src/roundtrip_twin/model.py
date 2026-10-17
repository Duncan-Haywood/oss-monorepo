"""Roundtrip twin.  A UAV flies out a distance D and back at constant airspeed v against a steady along-track wind w (headwind out,
tailwind back), with dimensionless power P(v) = (v^3 + 1/v)/2 (units of V0, the zero-wind minimum-energy-per-distance speed; P(1) = 1).
Energy of a leg is D P(v)/(ground speed).

Real round trip (v > |w|):  E = D P(v) [1/(v-w) + 1/(v+w)] = 2 D P(v) v/(v^2 - w^2); never returns if v <= |w|.
Zero-wind twin:              E = 2 D P(v)/v.  Real/twin = 1/(1 - w^2/v^2): wind does not cancel, it costs at second order.
Optimal airspeed:            E = D (v^4+1)/(v^2-w^2), minimised at u = v^2 = w^2 + sqrt(w^4+1) (zero wind: v = 1).
One-leg twin:                a twin calibrated on a single leg with effective wind w_c (+w headwind, -w tailwind) predicts 2 D P(v)/(v-w_c).
"""
import math

__all__ = ["P", "real_energy", "twin_energy", "ratio", "v_opt_real", "v_opt_twin", "regret", "one_leg_energy",
           "breakeven_margin", "simulate_roundtrip"]


def P(v):
    return (v ** 3 + 1.0 / v) / 2


def real_energy(v, w, D=1.0):
    if v <= abs(w):
        return math.inf
    return D * P(v) * (1.0 / (v - w) + 1.0 / (v + w))


def twin_energy(v, D=1.0):
    return 2.0 * D * P(v) / v


def ratio(v, w):
    """Real / zero-wind twin round-trip energy = 1/(1 - (w/v)^2)."""
    return math.inf if v <= abs(w) else 1.0 / (1.0 - (w / v) ** 2)


def v_opt_real(w):
    """argmin_v real_energy: minimiser of (v^4+1)/(v^2-w^2), u = v^2 solves u^2 - 2 w^2 u - 1 = 0."""
    return math.sqrt(w * w + math.sqrt(w ** 4 + 1.0))


def v_opt_twin():
    """Zero-wind twin optimum: minimise (v^3+1/v)/v = v^2 + v^-2, at v = 1."""
    return 1.0


def regret(w, v=None):
    """Fractional extra real energy from flying the twin-optimal airspeed instead of the real optimum."""
    v = v_opt_twin() if v is None else v
    return real_energy(v, w) / real_energy(v_opt_real(w), w) - 1.0


def one_leg_energy(v, w_c, D=1.0):
    """Round-trip prediction of a twin whose single calibration leg saw effective wind w_c (headwind > 0) and that assumes the
    return leg sees the same wind."""
    return math.inf if v <= w_c else 2.0 * D * P(v) / (v - w_c)


def breakeven_margin(v, w):
    """Battery margin m such that (1+m) times the zero-wind twin energy covers the real round trip: m = w^2/(v^2-w^2)."""
    return math.inf if v <= abs(w) else (w / v) ** 2 / (1.0 - (w / v) ** 2)


def simulate_roundtrip(v, w, D=1.0, dt=1e-4):
    """Numerical check: integrate position at ground speed v-w out, v+w back, accumulate P(v) dt."""
    if v <= abs(w):
        return math.inf
    e, x = 0.0, 0.0
    while x < D:
        x += (v - w) * dt; e += P(v) * dt
    while x > 0.0:
        x -= (v + w) * dt; e += P(v) * dt
    return e
