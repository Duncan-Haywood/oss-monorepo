"""REMUS 100M datasheet figures (HII, 2022, 'C51 Systems 100M Unmanned Underwater Vehicle') and the
hotel load they imply. Milestone 4c.

Datasheet, all at 3.0 kn (1.5 m/s) with standard sensors active: length 1.85 m, diameter 0.19 m,
weight 38.6 kg, 1.5 kWh battery, estimated endurance 10 h, maximum range 67 km, speed 0 to 2.3 m/s.
The endurance and range disagree (10 h at 1.5 m/s is 54 km; 67 km is 12.4 h), so both are used.
"""
import math

LENGTH, DIAMETER, MASS = 1.85, 0.19, 38.6
BATTERY_WH = 1500.0
V_REF = 1.5
V_MAX = 2.3
ENDURANCE_H, RANGE_M = 10.0, 67e3


def total_power(endurance_h=None, range_m=None):
    """Mean electrical power (W) at V_REF implied by the battery and one datasheet figure."""
    if (endurance_h is None) == (range_m is None):
        raise ValueError("give exactly one of endurance_h, range_m")
    hours = endurance_h if endurance_h is not None else range_m / V_REF / 3600.0
    return BATTERY_WH / hours


def cylinder_c_s():
    """Wetted-area constant S = c_s sqrt(V L) of a plain cylinder of the datasheet size (ends ignored)."""
    s = math.pi * DIAMETER * LENGTH
    return s / math.sqrt(MASS / 1025.0 * LENGTH)


def implied_hotel(p_total, p_propulsion):
    """Everything that is not propulsion at V_REF (W); negative means the drag model is too high."""
    return p_total - p_propulsion
