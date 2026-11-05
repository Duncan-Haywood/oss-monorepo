"""Completion time of a line-spacing survey by n identical boats at equal total cost.

Hull physics come from marine_hull (ITTC 1957 line, form factor, placeholder wave term).
Everything else is a stated scaling assumption, swept in experiments/run.py.
Stdlib only. Simulation only, preliminary.
"""
import math
from marine_hull.hull import RHO_SEA, power_total, resistance

M_REF, L_REF, HOTEL_REF, BATT_FRAC = 200.0, 4.0, 30.0, 0.25  # marine-hull milestone-1 boat


def boat_cost(mass, m_big, payload_cost, beta):
    """Cost relative to one big boat of mass m_big (=1): fixed payload share plus hull ~ mass^beta."""
    return payload_cost + (1.0 - payload_cost) * (mass / m_big) ** beta


def affordable(mass, m_big, payload_cost, beta):
    """Number of boats of `mass` the big boat's budget buys."""
    return int(math.floor(1.0 / boat_cost(mass, m_big, payload_cost, beta) + 1e-9))


def boat_power(mass, v, hotel_exp, e_batt=200.0, c_s=3.0, k_form=0.25, wave=1.0):
    """Electrical power (W) of a geometrically similar boat of `mass` at speed v."""
    s = (mass / M_REF) ** (1.0 / 3.0)
    length, vol = L_REF * s, mass / RHO_SEA
    r = resistance(v, length, vol, c_s, k_form, wave_scale=wave)
    return power_total(v, r, p_hotel=HOTEL_REF * (mass / M_REF) ** hotel_exp)


def survey_time(track_km, n, mass, v, hotel_exp, swap_h, base_km, e_batt=200.0):
    """Hours to finish `track_km` of survey line split evenly over n boats.

    Each boat works until its battery is spent, then returns to base (base_km each way at v),
    swaps the pack (swap_h) and goes back. Returns (hours, total_wh). None if one leg cannot
    even reach the base and return.
    """
    wh = mass * BATT_FRAC * e_batt
    p = boat_power(mass, v, hotel_exp, e_batt)
    sec_per_km = 1000.0 / v
    wh_per_km = p * sec_per_km / 3600.0
    # a sortie: out and back are driven too; usable survey km per sortie
    usable = wh / wh_per_km - 2.0 * base_km
    if usable <= 0:
        return None
    per = track_km / n
    sorties = math.ceil(per / usable - 1e-12)
    drive_km = per + 2.0 * base_km * sorties
    hours = drive_km * sec_per_km / 3600.0 + swap_h * (sorties - 1)
    return hours, drive_km * wh_per_km * n


def best_time(track_km, n, mass, hotel_exp, swap_h, base_km, speeds=None):
    """Fastest completion over `speeds` (default 0.5..4 m/s, step 0.1)."""
    best = None
    for v in (speeds or [i / 10.0 for i in range(5, 41)]):
        r = survey_time(track_km, n, mass, v, hotel_exp, swap_h, base_km)
        if r and (best is None or r[0] < best[0]):
            best = (r[0], r[1], v)
    return best
