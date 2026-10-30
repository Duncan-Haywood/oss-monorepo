"""Daily-mean solar harvest of a deck-mounted array and its effect on a survey boat's energy balance.

Stdlib only. Milestone 5c of the marine-hull programme: a daily average, so night is covered by the
battery and weather is ignored. Insolation, efficiency and derate are swept, not sourced.
"""


def deck_area(length, beam_ratio=0.12, fill=0.6):
    """Usable panel area (m2): fill * L * B with B = beam_ratio * L."""
    return fill * length * beam_ratio * length


def harvest_power(area, eta_pv, derate, insolation):
    """Daily-mean electrical power (W) from `area` m2 of panel at mean insolation (W/m2)."""
    return area * eta_pv * derate * insolation


def net_power(p_load, p_solar):
    """Mean drain on the battery (W); zero or negative means energy-neutral."""
    return p_load - p_solar


def range_km_solar(battery_wh, v, p_load, p_solar):
    """Range (km) at constant speed v (m/s); infinite when the array covers the load."""
    drain = net_power(p_load, p_solar)
    if drain <= 0:
        return float("inf")
    return battery_wh * 3600.0 / drain * v / 1000.0


def battery_after_panels(battery_wh, area, areal_mass, e_batt):
    """Battery energy (Wh) left when `area` m2 of panel at `areal_mass` kg/m2 displaces pack mass.

    Total vessel mass is fixed, so panel mass comes out of the battery at `e_batt` Wh/kg; never below 0.
    """
    return max(0.0, battery_wh - area * areal_mass * e_batt)
