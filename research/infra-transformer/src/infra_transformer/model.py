"""IEEE C57.91-style hourly top-oil / hot-spot / insulation-ageing model and the load scenarios that drive it.

Equations follow IEEE Std C57.91 clause 7 (as reproduced in the open literature): ultimate top-oil rise
dTO_u = dTO_R*((K^2 R + 1)/(R + 1))^n, hot-spot gradient dH = dH_R*K^(2m), top-oil approaching its ultimate
value with time constant tau_TO, ageing acceleration FAA = exp(15000/383 - 15000/(theta_H + 273)).
The standard's text is paywalled and was not available to this project: the numbers in `Xfmr` are
parameters to sweep, not verified table values (see the README).
"""
from dataclasses import dataclass, replace
from pathlib import Path
import math
import numpy as np

DATA = Path(__file__).resolve().parents[2] / "data" / "inputs.csv"
HOURS = 8760


@dataclass(frozen=True)
class Xfmr:
    rated_kva: float
    d_to_r: float = 55.0     # top-oil rise over ambient at rated load, K
    d_h_r: float = 25.0      # hot-spot rise over top oil at rated load, K (55 + 25 = 80 K hot-spot rise)
    r: float = 3.2           # load loss / no-load loss at rated load
    n: float = 0.8           # top-oil exponent
    m: float = 0.8           # winding exponent
    tau_to: float = 3.0      # top-oil time constant, h
    life_h: float = 180000.0  # normal insulation life at 110 C hot spot, h


@dataclass(frozen=True)
class Params:
    homes: int = 10
    annual_kwh: float = 10800.0   # per home, before electrification
    ua_kw_per_k: float = 0.42     # house heat-loss coefficient
    t_bal: float = 16.0           # balance temperature, C
    cop_at_8: float = 3.2         # heat pump COP at 8.3 C
    cop_slope: float = 0.054      # COP change per K
    cop_floor: float = 1.0        # resistive backup floor
    ev_kwh_day: float = 10.0
    ev_kw: float = 7.2
    arrive_mean: float = 18.0
    arrive_sd: float = 1.5
    depart: int = 7
    seed: int = 0


def aging_factor(theta_h):
    return np.exp(15000.0 / 383.0 - 15000.0 / (np.asarray(theta_h, float) + 273.0))


def simulate(load_kw, amb_c, x: Xfmr, warm_years=2):
    """Hourly load (kW, power factor 1) and ambient (C) -> (hot spot C, top-oil C, FAA). Cyclic year."""
    k = np.asarray(load_kw, float) / x.rated_kva
    amb = np.asarray(amb_c, float)
    dto_u = x.d_to_r * ((k * k * x.r + 1.0) / (x.r + 1.0)) ** x.n
    dh = x.d_h_r * k ** (2.0 * x.m)
    a = math.exp(-1.0 / x.tau_to)
    dto = np.empty(len(k))
    cur = dto_u[0]
    for _ in range(warm_years):
        for i in range(len(k)):
            cur = dto_u[i] + (cur - dto_u[i]) * a
            dto[i] = cur
    theta_h = amb + dto + dh
    return theta_h, amb + dto, aging_factor(theta_h)


def annual_lol_pct(load_kw, amb_c, x: Xfmr):
    _, _, faa = simulate(load_kw, amb_c, x)
    return float(faa.sum() / x.life_h * 100.0 * HOURS / len(faa))


def load_inputs():
    """data/inputs.csv: columns hour, h0_kw (BDEW H0 for 10,800 kWh/yr), t_greensboro, t_sandpoint, t_miami."""
    arr = np.genfromtxt(DATA, delimiter=",", names=True)
    return arr


def heat_pump_kw(temp_c, p: Params):
    q = np.maximum(0.0, p.ua_kw_per_k * (p.t_bal - temp_c))
    cop = np.clip(p.cop_at_8 + p.cop_slope * (temp_c - 8.3), p.cop_floor, 6.0)
    return q / cop


def _plugged(hour_of_day, arrive, depart):
    return (hour_of_day >= arrive) | (hour_of_day < depart)


def ev_kw(base_kw, n_ev, p: Params, smart: bool):
    """Group EV charging load (kW) for n_ev cars, each needing ev_kwh_day per night.
    uncoordinated: each car charges from arrival at ev_kw. smart: valley-fill against base_kw (perfect
    day-ahead knowledge of the other load), cars plugged in whenever home between arrival and departure."""
    out = np.zeros(len(base_kw))
    if n_ev == 0:
        return out
    rng = np.random.default_rng(p.seed)
    days = len(base_kw) // 24
    for d in range(days - 1):
        arr = np.clip(np.round(rng.normal(p.arrive_mean, p.arrive_sd, n_ev)), 16, 22).astype(int)
        t0 = d * 24
        if not smart:
            for a in arr:
                left, h = p.ev_kwh_day, t0 + a
                while left > 1e-9 and h < len(out):
                    e = min(p.ev_kw, left)
                    out[h] += e
                    left -= e
                    h += 1
        else:
            hrs = np.arange(t0 + 16, t0 + 24 + p.depart)
            hod = hrs - t0
            cap = np.array([(arr <= h).sum() if h < 24 else n_ev for h in hod], float) * p.ev_kw
            need = n_ev * p.ev_kwh_day
            base = base_kw[hrs]
            lo, hi = base.min(), base.max() + need + cap.max()
            for _ in range(60):
                lam = 0.5 * (lo + hi)
                tot = np.clip(lam - base, 0.0, cap).sum()
                lo, hi = (lam, hi) if tot < need else (lo, lam)
            out[hrs] += np.clip(lo - base, 0.0, cap)
    return out


def scenario_load(inp, climate, p: Params, hp_frac=0.0, ev_frac=0.0, smart=False, growth=1.0):
    """Hourly group load (kW) for p.homes homes. hp_frac / ev_frac = share of homes electrified."""
    h0 = inp["h0_kw"] * (p.annual_kwh / 10800.0)
    temp = inp[climate]
    base = p.homes * h0 + p.homes * hp_frac * heat_pump_kw(temp, p)
    n_ev = int(round(p.homes * ev_frac))
    return growth * (base + ev_kw(base, n_ev, p, smart))


def size_for_peak(peak_kw, loading):
    """Rated kVA so that peak_kw is `loading` per unit of rating (power factor 1)."""
    return peak_kw / loading
