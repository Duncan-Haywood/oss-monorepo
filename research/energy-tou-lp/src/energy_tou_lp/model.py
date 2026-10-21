"""Optimal (linear-program) battery dispatch for the `energy-tou` home model.

Prices, weather and load are inherited from `energy-home` / `energy-tou` (assumed, synthetic). The LP sees the
whole horizon (perfect foresight), so its bill is a LOWER bound on any real controller's bill.
"""
import math
import os
import sys

for _sib in ("energy-home", "energy-tou"):
    _p = os.path.join(os.path.dirname(__file__), "..", "..", "..", _sib, "src")
    if _p not in sys.path:
        sys.path.append(_p)

import numpy as np  # noqa: E402
from scipy.optimize import linprog  # noqa: E402
from scipy.sparse import coo_matrix  # noqa: E402
from energy_home import Home, capital_recovery  # noqa: E402
from energy_tou import simulate_tou  # noqa: E402


def _net(home, ghi, load):
    """Hourly PV surplus and residual need after direct use (direct use is never worse than storing)."""
    pv = np.array([home.pv_kw * home.perf_ratio * g / 1000.0 for g in ghi])
    ld = np.asarray(load, float)
    direct = np.minimum(pv, ld)
    return pv - direct, ld - direct


def lp_dispatch(home, surplus, need, prices, export, wear=0.0, soc0=0.0, end_soc_min=0.0):
    """Minimise import cost - export revenue + wear x discharge over the horizon.

    Per hour: c_pv (PV surplus into the battery), c_g (grid into the battery), d (battery to load).
    Returns dict(cost, charge_pv, charge_grid, discharge, soc_end). `cost` excludes the wear charge.
    """
    n = len(need)
    cap = home.batt_kwh * home.usable
    pmax = home.batt_kwh * home.c_rate
    eta = math.sqrt(home.rt_eff)
    if cap <= 0:
        cost = float(np.sum(need * prices) - np.sum(surplus) * export)
        z = np.zeros(n)
        return dict(cost=cost, charge_pv=z, charge_grid=z, discharge=z, soc_end=0.0)
    # variable blocks: c_pv[0:n], c_g[n:2n], d[2n:3n], soc after hour t [3n:4n]
    # cost = sum price*(need - d + c_g) - export*(surplus - c_pv) + wear*d
    cvec = np.concatenate([np.full(n, export), prices, -prices + wear, np.zeros(n)])
    idx = np.arange(n)
    # soc_t - soc_{t-1} - eta*(c_pv+c_g) + d/eta = 0
    rows = np.concatenate([idx, idx, idx, idx, idx[1:]])
    cols = np.concatenate([3 * n + idx, idx, n + idx, 2 * n + idx, 3 * n + idx[:-1]])
    vals = np.concatenate([np.ones(n), np.full(n, -eta), np.full(n, -eta), np.full(n, 1 / eta), -np.ones(n - 1)])
    a_eq = coo_matrix((vals, (rows, cols)), shape=(n, 4 * n)).tocsr()
    b_eq = np.zeros(n)
    b_eq[0] = soc0
    # power: c_pv + c_g <= pmax
    a_ub = coo_matrix((np.ones(2 * n), (np.concatenate([idx, idx]), np.concatenate([idx, n + idx]))), shape=(n, 4 * n)).tocsr()
    b_ub = np.full(n, pmax)
    bounds = ([(0, float(s)) for s in surplus] + [(0, pmax)] * n
              + [(0, float(min(v, pmax))) for v in need] + [(0, cap)] * (n - 1) + [(end_soc_min, cap)])
    r = linprog(cvec, A_ub=a_ub, b_ub=b_ub, A_eq=a_eq, b_eq=b_eq, bounds=bounds, method="highs")
    if not r.success:
        raise RuntimeError(r.message)
    x = r.x
    cpv, cg, d, soc = x[:n], x[n:2 * n], x[2 * n:3 * n], x[3 * n:]
    cost = float(np.sum(prices * (need - d + cg)) - export * np.sum(surplus - cpv))
    return dict(cost=cost, charge_pv=cpv, charge_grid=cg, discharge=d, soc_end=float(soc[-1]))


def rolling_dispatch(home, surplus, need, prices, export, wear=0.0, window=36, step=24):
    """Receding-horizon control: solve `window` hours with a perfect forecast, commit `step` hours, repeat."""
    n = len(need)
    soc, cost, throughput = 0.0, 0.0, 0.0
    for s in range(0, n, step):
        e = min(s + window, n)
        r = lp_dispatch(home, surplus[s:e], need[s:e], prices[s:e], export, wear, soc0=soc)
        k = min(step, n - s)
        eta = math.sqrt(home.rt_eff)
        c = r["charge_pv"][:k] + r["charge_grid"][:k]
        d = r["discharge"][:k]
        soc = min(max(soc + float(np.sum(eta * c - d / eta)), 0.0), home.batt_kwh * home.usable)
        cost += float(np.sum(prices[s:s + k] * (need[s:s + k] - d + r["charge_grid"][:k]))
                      - export * np.sum(surplus[s:s + k] - r["charge_pv"][:k]))
        throughput += float(np.sum(d))
    return dict(cost=cost, throughput=throughput)


def rule_run(home, ghi, load, tou, policy, grid_charge):
    """The `energy-tou` fixed rule, plus its battery throughput (kWh delivered by the battery)."""
    t = simulate_tou(home, ghi, load, tou, policy, grid_charge)
    surplus, need = _net(home, ghi, load)
    # d = need - imp + grid_in  (energy balance of the import line)
    d = float(np.sum(need)) - t["imp"] + t["grid_in"]
    return dict(cost=t["cost"], throughput=d)


def breakeven(saving, home, rate=0.06, life=15):
    """Installed $/kWh at which an annual `saving` ($) just pays for the battery."""
    return saving / (home.batt_kwh * capital_recovery(rate, life))


def year_prices(tou, n):
    return np.array([tou.prices[i % 24] for i in range(n)])


def no_battery_bill(home, ghi, load, tou):
    h0 = Home(home.pv_kw, home.perf_ratio, 0.0, home.usable, home.rt_eff, home.c_rate)
    return simulate_tou(h0, ghi, load, tou)["cost"]
