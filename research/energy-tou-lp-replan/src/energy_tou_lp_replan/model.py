"""Re-planning the home-battery LP every `step` hours on the observed state, with a nowcast PV forecast.

`energy-tou-lp-tmy` plans once a day (at local midnight) and commits 24 h. That mixes two losses: the forecast is
wrong, and the plan cannot react when the day turns out differently. Here the same LP, tariff, wear charge and
execution rule re-plan every `step` hours from the state of charge actually reached and a forecast that sees the
hours since midnight. `step=24` reproduces `energy-tou-lp-tmy` exactly (a test checks it).
"""
import math
import os
import sys

for _sib in ("energy-tou-lp-tmy", "energy-tou-lp", "energy-tou", "energy-home"):
    _p = os.path.join(os.path.dirname(__file__), "..", "..", "..", _sib, "src")
    if _p not in sys.path:
        sys.path.append(_p)

import numpy as np  # noqa: E402
from energy_tou_lp.model import lp_dispatch  # noqa: E402
from energy_tou_lp_tmy import forecast_pv, forecast_load, yesterday_index  # noqa: E402

TAU = 3.0      # hours over which the nowcast index relaxes to the 24 h index (assumed; swept in the README)


def nowcast_index(ghi, cs, s, n_sun=3):
    """Clear-sky index of the last `n_sun` sunlit hours before hour `s` (None if none in the last 24 h)."""
    idx = [t for t in range(max(s - 24, 0), s) if cs[t] > 50]
    idx = idx[-n_sun:]
    if not idx:
        return None
    c = cs[idx].sum()
    return float(ghi[idx].sum() / c) if c > 0 else None


def forecast_pv_now(kind, ghi, cs, s, e, tau=TAU):
    """GHI forecast for hours s..e-1 from ghi[:s]. Kinds of `energy_tou_lp_tmy.forecast_pv`, plus
    nowcast: the clear-sky index of the last 3 sunlit hours, relaxing exponentially (time constant `tau` h) to
    yesterday's 24 h index, times the known clear-sky curve."""
    if kind != "nowcast":
        return forecast_pv(kind, ghi, cs, s, e)
    k_day = yesterday_index(ghi, cs, s)
    k_now = nowcast_index(ghi, cs, s)
    if k_now is None:
        k_now = k_day
    h = np.arange(e - s)
    k = k_day + (k_now - k_day) * np.exp(-h / tau)
    return k * cs[s:e]


def replan_dispatch(home, ghi, cs, load, prices, export, pv_kind="smart", load_kind="persistence", wear=0.0,
                    window=36, step=24, tau=TAU):
    """Plan `window` h at every `step`-th hour, execute `step` h on actual PV and load, carry the true state of charge."""
    k_pv = home.pv_kw * home.perf_ratio / 1000.0
    load = np.asarray(load, float)
    n = len(load)
    cap = home.batt_kwh * home.usable
    pmax = home.batt_kwh * home.c_rate
    eta = math.sqrt(home.rt_eff)
    soc = cost = thr = 0.0
    for s in range(0, n, step):
        e = min(s + window, n)
        pv_f = k_pv * forecast_pv_now(pv_kind, ghi, cs, s, e, tau)
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
