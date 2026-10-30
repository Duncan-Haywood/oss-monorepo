"""Froude scaling of a cargo UAV, and what a 1:N model cannot reproduce.

Stdlib only. A dynamically (Froude) scaled model at length ratio n = L_model / L_full keeps
the Froude number V^2 / (g L) and the relative density mu = m / (rho L^3) equal. Everything
below follows from those two; the exponents are the standard table (Wolowicz, Brown and
Gilbert 1979, NASA TP-1435, Table 4; rows checked against the paper, see tests).
"""
import math

G = 9.80665
# ISA troposphere (ICAO Doc 7488 / ISO 2533): exact constants.
T0, P0, LAPSE, R_AIR, GAMMA = 288.15, 101325.0, 0.0065, 287.053, 1.4
MU_REF, T_REF, S_SUTH = 1.716e-5, 273.15, 110.4  # Sutherland's law for air

# Exponent of n for each quantity in a Froude-scaled model (same density, same g).
EXPONENTS = {
    "length": 1.0, "area": 2.0, "volume": 3.0, "mass": 3.0, "weight": 3.0,
    "velocity": 0.5, "time": 0.5, "frequency": -0.5, "acceleration": 0.0,
    "force": 3.0, "moment": 4.0, "inertia": 5.0, "power": 3.5, "energy": 4.0,
    "angular_rate": -0.5, "reynolds": 1.5, "mach": 0.5,
}


def isa(h_m):
    """(T K, p Pa, rho kg/m3, mu Pa s, a m/s) at geopotential height h_m, 0..11 km."""
    t = T0 - LAPSE * h_m
    p = P0 * (t / T0) ** (G / (R_AIR * LAPSE))
    rho = p / (R_AIR * t)
    mu = MU_REF * (t / T_REF) ** 1.5 * (T_REF + S_SUTH) / (t + S_SUTH)
    return t, p, rho, mu, math.sqrt(GAMMA * R_AIR * t)


def scale(quantity, n):
    """Factor model/full for `quantity` at length ratio n (0 < n <= 1)."""
    return n ** EXPONENTS[quantity]


def cf_turbulent(re):
    """Schlichting's turbulent flat-plate skin friction, 0.455 / log10(Re)^2.58 (Re 5e5..1e9)."""
    return 0.455 / math.log10(re) ** 2.58


def cf_laminar(re):
    """Blasius laminar flat plate, 1.328 / sqrt(Re)."""
    return 1.328 / math.sqrt(re)


def cf_mixed(re, re_trans=5e5):
    """Flat-plate Cf: Blasius laminar below Re_trans, else turbulent less the laminar-run
    correction A/Re (Schlichting), A = 0.074 Re_t^0.8 - 1.328 Re_t^0.5.

    Valid for attached flow. Real wings below Re ~ 2e5 often have separation bubbles that this
    does not capture, so the model's drag is a lower bound there (README, limitations).
    """
    if re <= re_trans:
        return cf_laminar(re)
    a = 0.074 * re_trans ** 0.8 - 1.328 * re_trans ** 0.5
    return cf_turbulent(re) - a / re


def airframe(mass, span, aspect_ratio, cl_cruise, k_form, s_wet_ratio, e_oswald, alt=0.0, tripped=False):
    """Drag polar and cruise point of a fixed-wing aircraft with the given numbers.

    s_wet_ratio = S_wet / S_ref. Returns a dict at trim speed for lift = weight at cl_cruise.
    tripped=True uses the fully turbulent Cf at every Re (a boundary-layer trip, the usual practice
    on small models; below Re 5e5 it is an extrapolation of Schlichting's formula).
    CD0 = Cf(Re_mac) * k_form * s_wet_ratio, CD = CD0 + CL^2 / (pi e AR).
    """
    _, _, rho, mu, a_snd = isa(alt)
    s_ref = span ** 2 / aspect_ratio
    mac = span / aspect_ratio
    v = math.sqrt(2 * mass * G / (rho * s_ref * cl_cruise))
    re = rho * v * mac / mu
    cd0 = (cf_turbulent(re) if tripped else cf_mixed(re)) * k_form * s_wet_ratio
    cdi = cl_cruise ** 2 / (math.pi * e_oswald * aspect_ratio)
    ld = cl_cruise / (cd0 + cdi)
    p_aero = mass * G * v / ld
    return dict(mass=mass, span=span, s_ref=s_ref, v=v, re=re, mach=v / a_snd, cd0=cd0,
                cdi=cdi, ld=ld, p_aero=p_aero)


def model_of(full, n, **kw):
    """The Froude-scaled model of airframe `full` (a dict from `airframe`), same density and cl."""
    return airframe(full["mass"] * n ** 3, full["span"] * n, kw["aspect_ratio"], kw["cl_cruise"],
                    kw["k_form"], kw["s_wet_ratio"], kw["e_oswald"], kw.get("alt", 0.0), kw.get("tripped", False))


def battery_fraction(ld, range_m, e_spec_j_per_kg, eta_total, reserve=1.0):
    """Battery mass / aircraft mass to fly `range_m` at L/D `ld` (Breguet-type, electric)."""
    return reserve * range_m / (ld * e_spec_j_per_kg * eta_total / G)
