"""Hourly solar-plus-battery model of one home on synthetic weather (stdlib only).

Everything here is a stylised assumption, not a measurement: clear-sky irradiance from the Haurwitz
model, a seeded three-state cloud chain per day, an invented load shape, and round-number prices.
"""
import math
import random
from dataclasses import dataclass

HOURS = 8760
MONTH_DAYS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def clear_sky_ghi(lat_deg, day, hour):
    """Haurwitz clear-sky global horizontal irradiance, W/m^2, at the middle of local solar `hour`."""
    decl = math.radians(23.45) * math.sin(2 * math.pi * (284 + day + 1) / 365)
    ha = math.radians(15 * (hour + 0.5 - 12))
    lat = math.radians(lat_deg)
    cz = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
    if cz <= 0.0:
        return 0.0
    return 1098.0 * cz * math.exp(-0.057 / cz)


# day types: clear, partly cloudy, overcast -> multiplier on clear-sky irradiance
SKY = (1.0, 0.55, 0.2)
# persistence of the day type (rows: today, columns: tomorrow)
SKY_CHAIN = ((0.70, 0.22, 0.08), (0.30, 0.40, 0.30), (0.15, 0.35, 0.50))


def year_weather(seed, lat_deg=40.0):
    """Hourly irradiance (W/m^2) for 365 days from a seeded day-type chain."""
    rng = random.Random(seed)
    state, out = 0, []
    for day in range(365):
        r, acc = rng.random(), 0.0
        for nxt, p in enumerate(SKY_CHAIN[state]):
            acc += p
            if r < acc:
                state = nxt
                break
        for h in range(24):
            out.append(clear_sky_ghi(lat_deg, day, h) * SKY[state])
    return out


# hourly load shape, fractions of a day's use (sums to 1): night base, morning and evening peaks
_SHAPE = [0.025, 0.022, 0.021, 0.021, 0.023, 0.032, 0.050, 0.060, 0.050, 0.038, 0.034, 0.034,
          0.036, 0.034, 0.033, 0.036, 0.046, 0.064, 0.080, 0.080, 0.070, 0.055, 0.040, 0.030]


def year_load(annual_kwh, seed):
    """Hourly home load (kW), scaled to `annual_kwh` exactly. Winter +15%, summer -15%, 10% hourly noise."""
    rng = random.Random(seed + 7919)
    raw = []
    s = sum(_SHAPE)
    for day in range(365):
        season = 1 + 0.15 * math.cos(2 * math.pi * (day - 15) / 365)
        for h in range(24):
            raw.append(season * _SHAPE[h] / s * (1 + 0.10 * (2 * rng.random() - 1)))
    k = annual_kwh / sum(raw)
    return [v * k for v in raw]


@dataclass(frozen=True)
class Home:
    pv_kw: float = 6.0            # DC rating
    perf_ratio: float = 0.80      # AC output / (rating x irradiance/1000); lumps tilt, losses, inverter
    batt_kwh: float = 0.0         # nameplate
    usable: float = 0.90          # usable share of nameplate
    rt_eff: float = 0.90          # round trip, split equally across charge and discharge
    c_rate: float = 0.5           # max charge and discharge power, kW per nameplate kWh


@dataclass(frozen=True)
class Tariff:
    import_price: float = 0.30    # $/kWh
    export_price: float = 0.05    # $/kWh


@dataclass(frozen=True)
class Costs:
    pv_per_kw: float = 2800.0     # installed, $/kW
    batt_per_kwh: float = 800.0   # installed, $/kWh nameplate
    pv_life: int = 25
    batt_life: int = 15
    rate: float = 0.06


def simulate(home, ghi, load):
    """Greedy self-consumption dispatch. Returns annual kWh totals (hourly steps, 1 h)."""
    cap = home.batt_kwh * home.usable
    pmax = home.batt_kwh * home.c_rate
    eta = math.sqrt(home.rt_eff)
    soc = 0.0
    t = dict(load=0.0, pv=0.0, direct=0.0, charge_in=0.0, discharge_out=0.0, imp=0.0, exp=0.0,
             curtailed=0.0, soc_end=0.0)
    for g, l in zip(ghi, load):
        pv = home.pv_kw * home.perf_ratio * g / 1000.0
        direct = min(pv, l)
        surplus, need = pv - direct, l - direct
        # charge from surplus: grid-side kWh `c` stores c*eta, limited by power and headroom
        c = min(surplus, pmax, (cap - soc) / eta) if cap > 0 else 0.0
        soc += c * eta
        # discharge to cover need: delivered kWh `d` costs d/eta of stored energy
        d = min(need, pmax, soc * eta) if cap > 0 else 0.0
        soc -= d / eta
        t["load"] += l
        t["pv"] += pv
        t["direct"] += direct
        t["charge_in"] += c
        t["discharge_out"] += d
        t["imp"] += need - d
        t["exp"] += surplus - c
    t["soc_end"] = soc
    t["self_consumption"] = (t["direct"] + t["charge_in"]) / t["pv"] if t["pv"] else 0.0
    t["self_sufficiency"] = 1.0 - t["imp"] / t["load"]
    return t


def capital_recovery(rate, years):
    """Annual payment per $1 of capital over `years` at `rate`."""
    return rate / (1 - (1 + rate) ** -years)


def annual_cost(home, totals, tariff, costs):
    """Annualised net cost of owning the system and buying/selling power: capital + imports - exports."""
    cap = (home.pv_kw * costs.pv_per_kw * capital_recovery(costs.rate, costs.pv_life)
           + home.batt_kwh * costs.batt_per_kwh * capital_recovery(costs.rate, costs.batt_life))
    return cap + totals["imp"] * tariff.import_price - totals["exp"] * tariff.export_price


def breakeven_battery_price(home, ghi, load, tariff, costs):
    """Installed $/kWh at which `home`'s battery just pays (annual bill saving = annualised battery cost)."""
    base = simulate(Home(home.pv_kw, home.perf_ratio, 0.0, home.usable, home.rt_eff, home.c_rate), ghi, load)
    with_b = simulate(home, ghi, load)
    bill = lambda t: t["imp"] * tariff.import_price - t["exp"] * tariff.export_price
    saving = bill(base) - bill(with_b)
    return saving / (home.batt_kwh * capital_recovery(costs.rate, costs.batt_life))
