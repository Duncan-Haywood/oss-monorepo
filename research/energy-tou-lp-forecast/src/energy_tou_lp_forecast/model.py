"""Rolling-horizon battery control driven by a FORECAST, scored against what actually happens.

`energy-tou-lp` planned each 36 h window with the true weather and load. Here the plan is made from a forecast
built only from hours already observed (or from the truth plus noise), then executed against the actual PV and
load: the battery follows the planned charge and discharge set-points, clipped by what physically exists (PV
surplus actually available, load actually to serve, state of charge). The bill is the actual one.
"""
import math
import os
import sys

for _sib in ("energy-tou-lp", "energy-tou", "energy-home"):
    _p = os.path.join(os.path.dirname(__file__), "..", "..", "..", _sib, "src")
    if _p not in sys.path:
        sys.path.append(_p)

import numpy as np  # noqa: E402
from energy_tou_lp.model import lp_dispatch  # noqa: E402


def forecast_series(kind, actual, s, e, rng=None, sigma=0.0):
    """Forecast of `actual[s:e]` made at hour `s` (knows `actual[:s]` only, except kind 'noisy').

    perfect: the truth.  persistence: the same hour yesterday (day-ahead 'it will be like yesterday').
    week_mean: mean of the same hour over the last 7 days (a seasonal-naive smoother).
    noisy: truth x (1 + sigma x N(0,1)), clipped at 0 (an abstract forecast of stated skill).
    Before enough history exists the missing days are taken from what is available; at hour 0 the forecast is zero.
    """
    actual = np.asarray(actual, float)
    h = np.arange(s, e)
    if kind == "perfect":
        return actual[s:e].copy()
    if kind == "noisy":
        return np.maximum(actual[s:e] * (1.0 + sigma * rng.standard_normal(e - s)), 0.0)
    out = np.zeros(e - s)
    lags = (24,) if kind == "persistence" else tuple(24 * k for k in range(1, 8))
    for i, t in enumerate(h):
        # lag past the forecast origin: yesterday's value of hour t is actual[t - 24*j] with t-24*j < s
        vals = []
        for lag in lags:
            j = lag // 24
            u = t - 24 * j
            while u >= s:           # beyond the 24 h already known: step back a further day
                u -= 24
            if u >= 0:
                vals.append(actual[u])
        out[i] = float(np.mean(vals)) if vals else 0.0
    return out


def forecast_dispatch(home, pv_act, load_act, prices, export, kind="perfect", sigma=0.0, wear=0.0,
                      window=36, step=24, seed=0, start=0):
    """Receding horizon from hour `start`: plan `window` h from a forecast, execute `step` h on actuals.

    pv_act/load_act are hourly kW (PV is output, not GHI). Returns dict(cost, throughput, hours).
    """
    rng = np.random.default_rng(seed)
    pv_act = np.asarray(pv_act, float)
    load_act = np.asarray(load_act, float)
    n = len(load_act)
    cap = home.batt_kwh * home.usable
    pmax = home.batt_kwh * home.c_rate
    eta = math.sqrt(home.rt_eff)
    soc = cost = thr = 0.0
    for s in range(start, n, step):
        e = min(s + window, n)
        pv_f = forecast_series(kind, pv_act, s, e, rng, sigma)
        ld_f = forecast_series(kind, load_act, s, e, rng, sigma)
        direct = np.minimum(pv_f, ld_f)
        plan = lp_dispatch(home, pv_f - direct, ld_f - direct, prices[s:e], export, wear, soc0=soc)
        for i in range(min(step, n - s)):
            t = s + i
            direct_a = min(pv_act[t], load_act[t])
            sur, need = pv_act[t] - direct_a, load_act[t] - direct_a
            c_pv = min(plan["charge_pv"][i], sur)
            c_g = plan["charge_grid"][i]
            c_g = min(c_g, max(pmax - c_pv, 0.0))
            # charging cannot overfill the battery
            room = max(cap - soc, 0.0) / eta
            if c_pv + c_g > room:
                scale = room / (c_pv + c_g) if c_pv + c_g > 0 else 0.0
                c_pv, c_g = c_pv * scale, c_g * scale
            d = min(plan["discharge"][i], need, soc * eta)
            soc = min(max(soc + eta * (c_pv + c_g) - d / eta, 0.0), cap)
            cost += prices[t] * (need - d + c_g) - export * (sur - c_pv)
            thr += d
    return dict(cost=float(cost), throughput=float(thr), hours=n - start)
