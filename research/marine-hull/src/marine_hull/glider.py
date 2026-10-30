"""Quasi-steady buoyancy glider against a propeller AUV of the same mass and battery.

Milestone 4 of the marine-hull programme. Stdlib only. Glider model: steady glide with the
hydrodynamic force balancing the net buoyancy B, lift CL = a*alpha, drag CD = CD0 + K*alpha^2
on wing reference area A, flown at the best-glide incidence alpha* = sqrt(CD0/K). Energy per
horizontal metre is the buoyancy pump (work B*tan(gamma)/(2*eta_pump) per metre: the depth H
cancels because the pump works against p = rho*g*H once per 2H/tan(gamma) of horizontal
travel), a fixed energy per dive cycle, and the hotel load. Every glider coefficient is swept
in experiments/run_glider.py; the cited Seaglider/Slocum papers could not be fetched in this
session, so none is taken from a source. Preliminary.
"""
import math
from .hull import RHO_SEA, NU_SEA, G, wetted_area, cf_ittc57

B_MAX = 10.0   # N, about 1 L of displaced volume; a pump capacity bound (swept envelope, unsourced)


def best_glide(cd0, k):
    """alpha* (rad), lift-to-drag at alpha*."""
    return math.sqrt(cd0 / k)


def glide_state(b, a_w, cl_slope, cd0, k, rho=RHO_SEA):
    """Return (path speed U, glide angle gamma, horizontal speed) at net buoyancy b (N)."""
    alpha = best_glide(cd0, k)
    cl, cd = cl_slope * alpha, cd0 + k * alpha * alpha
    u = math.sqrt(2.0 * b / (rho * a_w * math.hypot(cl, cd)))
    gamma = math.atan2(cd, cl)
    return u, gamma, u * math.cos(gamma)


def glider_energy_per_m(b, u_h, gamma, p_hotel, eta_pump, e_cycle, depth):
    pump = b * math.tan(gamma) / (2.0 * eta_pump)
    cycle = e_cycle * math.tan(gamma) / (2.0 * depth)
    return pump + cycle + p_hotel / u_h


def auv_energy_per_m(u, length, volume, c_s, k_form, p_hotel, eta=0.55 * 0.85,
                     rho=RHO_SEA, nu=NU_SEA):
    """Submerged, no wave term: ITTC 1957 friction times (1 + k_form)."""
    s = wetted_area(volume, length, c_s)
    r = 0.5 * rho * u * u * s * (1.0 + k_form) * cf_ittc57(u * length / nu)
    return r / eta + p_hotel / u


def interp_log(xs, ys, x):
    """Linear interpolation in x; None outside [xs[0], xs[-1]] (xs ascending)."""
    if x < xs[0] or x > xs[-1]:
        return None
    for i in range(1, len(xs)):
        if x <= xs[i]:
            t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
            return ys[i - 1] + t * (ys[i] - ys[i - 1])
