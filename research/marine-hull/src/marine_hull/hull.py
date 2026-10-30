"""First-order resistance and endurance of a small displacement survey boat.

Friction from the ITTC 1957 line times a form factor, plus a wave-resistance term that is
deliberately simple (see `wave_resistance_fraction`). Stdlib only. Preliminary: this is
milestone 1 of the marine-hull programme, a calculator with analytic checks, not a validated
resistance prediction. Every input that is not from a source is swept in experiments/run.py.
"""
import math

G = 9.80665
RHO_SEA = 1025.0     # kg/m3, seawater at 15 C, 35 g/kg (ITTC recommended value, to be re-checked)
NU_SEA = 1.1892e-6   # m2/s, same condition
RHO_FRESH = 999.1    # kg/m3, fresh water at 15 C
NU_FRESH = 1.1386e-6


def cf_ittc57(re):
    """ITTC 1957 model-ship correlation line: 0.075 / (log10 Re - 2)^2."""
    if re <= 0:
        raise ValueError("Reynolds number must be positive")
    return 0.075 / (math.log10(re) - 2.0) ** 2


def froude_length(v, length):
    return v / math.sqrt(G * length)


def wetted_area(displaced_volume, length, c_s):
    """S = c_s * sqrt(V * L); c_s is a hull-form constant (swept, not sourced)."""
    return c_s * math.sqrt(displaced_volume * length)


def wave_resistance_fraction(fr, hump=0.4, peak=0.35):
    """Wave resistance as a fraction of viscous (friction plus form) resistance.

    A placeholder, not a published curve: (Fr/peak)^4 up to Fr = peak, then a gentle rise,
    scaled by `hump`. `resistance(wave_scale=...)` sweeps it from 0 to 1 because a published
    curve is milestone 2. At Fr = 0.2 and the defaults it is 0.4 * (0.2/0.35)^4 = 4%.
    """
    return hump * min(1.0, (fr / peak) ** 4) if fr < peak else hump * (1.0 + 2.0 * (fr - peak))


def resistance(v, length, volume, c_s, k_form, n_hulls=1, interference=0.0, rho=RHO_SEA,
               nu=NU_SEA, wave_scale=1.0):
    """Total resistance (N) of `n_hulls` identical hulls, each of `volume` (m3) and `length` (m).

    interference: viscous interference factor on the form factor (catamaran), added to k_form.
    """
    s = wetted_area(volume, length, c_s)
    re = v * length / nu
    cv = (1.0 + k_form + interference) * cf_ittc57(re)
    r_visc = 0.5 * rho * v * v * s * cv
    r_wave = r_visc * wave_scale * wave_resistance_fraction(froude_length(v, length))
    return n_hulls * (r_visc + r_wave)


def power_total(v, resist, eta_prop=0.55, eta_motor=0.85, p_hotel=30.0):
    """Electrical power (W): R v / (eta_prop eta_motor) + hotel/payload load."""
    return resist * v / (eta_prop * eta_motor) + p_hotel


def range_km(battery_wh, v, resist, **kw):
    """Range at constant speed: battery energy over (power / speed)."""
    p = power_total(v, resist, **kw)
    return battery_wh * 3600.0 / p * v / 1000.0
