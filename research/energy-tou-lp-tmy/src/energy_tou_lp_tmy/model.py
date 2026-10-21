"""Rolling-horizon home-battery control on MEASURED-derived irradiance (PVGIS typical-meteorological-year files),
with a clear-sky-index ("smart persistence") PV forecast, scored against what actually happens.

`energy-tou-lp-forecast` used seeded synthetic weather whose cloudiness is independent from day to day, so
yesterday told it nothing. Real weather has structure a forecast can use: the sun's path is known exactly, so only
the cloudiness (the clear-sky index) has to be predicted. The LP, tariff, wear charge and execution rule are the
sibling projects', unchanged.
"""
import csv
import math
import os
import sys

for _sib in ("energy-tou-lp", "energy-tou", "energy-home"):
    _p = os.path.join(os.path.dirname(__file__), "..", "..", "..", _sib, "src")
    if _p not in sys.path:
        sys.path.append(_p)

import numpy as np  # noqa: E402
from energy_home import clear_sky_ghi  # noqa: E402
from energy_tou_lp.model import lp_dispatch  # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data")
# site: (file, latitude, longitude, standard-time offset from UTC in hours)
SITES = {"golden-co": (39.74, -105.18, -7), "phoenix-az": (33.45, -112.07, -7), "seattle-wa": (47.61, -122.33, -8)}


def load_ghi(site):
    """Hourly GHI (W/m^2), 8760 values re-indexed so hour 0 is local standard-time midnight on 1 January."""
    lat, lon, off = SITES[site]
    with open(os.path.join(DATA, site + ".csv")) as f:
        utc = np.array([float(r["ghi_wm2"]) for r in csv.DictReader(f)])
    return np.roll(utc, off)


def clear_sky(site, shift=-0.5):
    """Haurwitz clear-sky GHI for the 8760 local hours. `shift` moves the sampling instant within the hour; -0.5 evaluates at the hour label itself, the shift that
    best matches PVGIS's timestamps (best single value at 3 sites; -0.25 to -0.75 individually, see README)."""
    lat, lon, off = SITES[site]
    # local standard time -> local solar time (longitude correction; equation of time ignored, < 16 min)
    corr = lon / 15.0 - off
    out = np.zeros(8760)
    for i in range(8760):
        day, hr = divmod(i, 24)
        out[i] = clear_sky_ghi(lat, day, hr + shift + corr)
    return out


def yesterday_index(actual, cs, s):
    """Clear-sky index of the 24 h before hour `s`: sum(actual)/sum(clear sky), over hours with sun."""
    a, c = actual[max(s - 24, 0):s], cs[max(s - 24, 0):s]
    return float(a.sum() / c.sum()) if c.sum() > 0 else 0.0


def forecast_pv(kind, ghi, cs, s, e, sigma=0.0, rng=None):
    """GHI forecast for hours s..e-1 made at hour s from ghi[:s] only (except 'perfect' and 'noisy').

    perfect: the truth.  persistence: the same hour yesterday.
    smart: yesterday's clear-sky index applied to the known clear-sky curve of the target hour.
    smart_week: the mean of the last 7 daily clear-sky indices (smoother).
    """
    if kind == "perfect":
        return ghi[s:e].copy()
    if kind == "noisy":
        return np.maximum(ghi[s:e] * (1.0 + sigma * rng.standard_normal(e - s)), 0.0)
    out = np.zeros(e - s)
    if kind == "persistence":
        for i, t in enumerate(range(s, e)):
            u = t - 24
            while u >= s:
                u -= 24
            out[i] = ghi[u] if u >= 0 else 0.0
        return out
    if kind == "smart":
        k = yesterday_index(ghi, cs, s)
    elif kind == "smart_week":
        ks = [yesterday_index(ghi, cs, s - 24 * j) for j in range(7) if s - 24 * j > 0]
        k = float(np.mean(ks)) if ks else 0.0
    else:
        raise ValueError(kind)
    return k * cs[s:e]


def forecast_load(kind, load, s, e):
    """Load forecast: the truth, or the same hour yesterday (beyond 24 h known: step back a further day)."""
    if kind == "perfect":
        return load[s:e].copy()
    out = np.zeros(e - s)
    for i, t in enumerate(range(s, e)):
        u = t - 24
        while u >= s:
            u -= 24
        out[i] = load[u] if u >= 0 else 0.0
    return out


def tmy_dispatch(home, ghi, cs, load, prices, export, pv_kind="perfect", load_kind="perfect", wear=0.0,
                 window=36, step=24, sigma=0.0, seed=0):
    """Plan `window` h from forecasts made at each day's start, execute `step` h on actual PV and load."""
    rng = np.random.default_rng(seed)
    k_pv = home.pv_kw * home.perf_ratio / 1000.0
    load = np.asarray(load, float)
    n = len(load)
    cap = home.batt_kwh * home.usable
    pmax = home.batt_kwh * home.c_rate
    eta = math.sqrt(home.rt_eff)
    soc = cost = thr = 0.0
    for s in range(0, n, step):
        e = min(s + window, n)
        pv_f = k_pv * forecast_pv(pv_kind, ghi, cs, s, e, sigma, rng)
        ld_f = forecast_load(load_kind, load, s, e)
        direct = np.minimum(pv_f, ld_f)
        plan = lp_dispatch(home, pv_f - direct, ld_f - direct, prices[s:e], export, wear, soc0=soc)
        for i in range(min(step, n - s)):
            t = s + i
            pv_a = k_pv * ghi[t]
            direct_a = min(pv_a, load[t])
            sur, need = pv_a - direct_a, load[t] - direct_a
            c_pv = min(plan["charge_pv"][i], sur)
            c_g = min(plan["charge_grid"][i], max(pmax - c_pv, 0.0))
            room = max(cap - soc, 0.0) / eta
            if c_pv + c_g > room:
                scale = room / (c_pv + c_g) if c_pv + c_g > 0 else 0.0
                c_pv, c_g = c_pv * scale, c_g * scale
            d = min(plan["discharge"][i], need, soc * eta)
            soc = min(max(soc + eta * (c_pv + c_g) - d / eta, 0.0), cap)
            cost += prices[t] * (need - d + c_g) - export * (sur - c_pv)
            thr += d
    return dict(cost=float(cost), throughput=float(thr))


def day_errors(kind, ghi, cs):
    """Forecast skill on its own: hourly RMSE / mean daylight GHI (nRMSE) and daily-energy MAE / mean daily energy,
    for the day-ahead forecast made at each local midnight (days 8..364 so every method has history)."""
    se = ae = n = tot = dsum = 0.0
    for d in range(8, 365):
        s = d * 24
        f = forecast_pv(kind, ghi, cs, s, s + 24)
        a = ghi[s:s + 24]
        day = cs[s:s + 24] > 0
        se += float(np.sum((f[day] - a[day]) ** 2))
        n += int(day.sum())
        tot += float(a[day].sum())
        ae += abs(float(f.sum() - a.sum()))
        dsum += float(a.sum())
    return math.sqrt(se / n) / (tot / n), ae / dsum
