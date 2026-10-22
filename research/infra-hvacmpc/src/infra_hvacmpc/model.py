"""Grey-box RC house, a thermostat and a receding-horizon LP controller on a time-of-use tariff.

Model: two states, indoor air + light contents (Ti) and the opaque envelope's mass (Te).
  Ci dTi/dt = Ua (To - Ti) + Uo2 (Te - Ti) + q + gains
  Ce dTe/dt = Uo2 (Ti - Te) + Uo2 (To - Te)
Ua is windows + infiltration (no mass), Uo2 = 2 x opaque UA (the opaque UA split in half either side of the mass).
Envelope numbers are ASHRAE 140 Case 600 as I remember them (see README): NOT checked against the standard.
Heat capacities are swept, not sourced. The "plant" is the same structure with perturbed parameters, so the
controller's model is wrong by a known amount.
"""
import csv
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
from scipy.linalg import expm
from scipy.optimize import linprog
from scipy.sparse import lil_matrix

DATA = Path(__file__).resolve().parents[2] / "data"

# assumed three-band tariff of energy-tou ($/kWh): off-peak 21-07, peak 16-21, shoulder otherwise
TOU_PRICES = tuple(0.15 if (h >= 21 or h < 7) else 0.45 if 16 <= h < 21 else 0.28 for h in range(24))
FLAT_PRICES = (0.30,) * 24


def scaled_tou(ratio):
    """Same 24 h shape, peak/off-peak price ratio set to `ratio` with the mean of TOU_PRICES kept."""
    lo, hi = 0.15, 0.45
    mean = sum(TOU_PRICES) / 24
    shape = [(p - lo) / (hi - lo) for p in TOU_PRICES]            # 0 off-peak ... 1 peak
    raw = [1 + (ratio - 1) * s for s in shape]
    k = mean / (sum(raw) / 24)
    return tuple(k * r for r in raw)


@dataclass(frozen=True)
class Params:
    ua_opaque: float = 49.9      # W/K walls 32.7 + roof 15.3 + floor 1.9 (ASHRAE 140 Case 600 U-values x areas)
    ua_window: float = 36.0      # W/K 12 m2 x U 3.0
    ua_inf: float = 21.7         # W/K 0.5 ACH x 129.6 m3 x 0.33 Wh/m3K
    ci: float = 3.0e6            # J/K air + contents (swept)
    ce: float = 8.0e6            # J/K envelope mass (swept)
    solar_area: float = 4.6      # m2 = 12 m2 window x SHGC 0.769 x 0.5 orientation/shading factor (assumed)
    internal: float = 200.0      # W continuous internal gain (ASHRAE 140 Case 600)
    qh_max: float = 6000.0       # W thermal, heating
    qc_max: float = 6000.0       # W thermal, cooling
    eta_cool: float = 0.4        # Carnot fraction of the cooling COP (assumed, swept)
    t_lo: float = 20.0           # comfort band, deg C
    t_hi: float = 24.0

    def ua_a(self):
        return self.ua_window + self.ua_inf


def load_weather(name):
    """(drybulb deg C, GHI W/m2) arrays of 8760 hours from a TMY3 file in data/."""
    rows = list(csv.DictReader(open(DATA / f"{name}.csv")))
    return (np.array([float(r["drybulb_c"]) for r in rows]), np.array([float(r["ghi_wm2"]) for r in rows]))


def cop_heat(t_out):
    """Air-source heat pump heating COP = 6.81 - 0.121 dT + 0.000630 dT^2, dT = 35 degC - T_out
    (Staffell et al. 2012, Energy Environ. Sci. 5, 9291, floor-heating fit; dT floored at 15 K)."""
    d = np.maximum(35.0 - np.asarray(t_out, float), 15.0)
    return 6.81 - 0.121 * d + 0.000630 * d ** 2


def cop_cool(t_out, eta=0.4):
    """Cooling COP = eta x Carnot between a 12 degC coil and (T_out + 10 K) condenser, capped to [2, 7]."""
    t_out = np.asarray(t_out, float)
    tc = 285.15
    th = t_out + 273.15 + 10.0
    return np.clip(eta * tc / np.maximum(th - tc, 5.0), 2.0, 7.0)


def discretise(p, dt=3600.0):
    """Exact zero-order-hold step x+ = A x + Bq q + Bw [To, gains]; x = (Ti, Te)."""
    uo2 = 2 * p.ua_opaque
    ua = p.ua_a()
    a = np.array([[-(ua + uo2) / p.ci, uo2 / p.ci],
                  [uo2 / p.ce, -2 * uo2 / p.ce]])
    b = np.array([[1 / p.ci, ua / p.ci, 1 / p.ci],
                  [0.0, uo2 / p.ce, 0.0]])          # columns: q, To, gains
    m = np.zeros((5, 5))
    m[:2, :2] = a * dt
    m[:2, 2:] = b * dt
    e = expm(m)
    return e[:2, :2], e[:2, 2:]


def gains(p, ghi):
    return p.internal + p.solar_area * np.asarray(ghi, float)


def _start(p, t0):
    return np.array([21.0, 21.0]) if t0 is None else np.array(t0, float)


def thermostat_year(plant, t_out, ghi, prices, sp_heat=21.0, sp_cool=24.0, kp=500.0, ki=150.0, hours=None, t0=None):
    """PI thermostat on the plant (heating below sp_heat, cooling above sp_cool, nothing between, integral clamped
    to the equipment limit). A P-only thermostat droops below its set-point by q/kp and flatters its own bill.
    Returns dict of cost ($), kWh electric, discomfort (K h outside the plant's comfort band), indoor trace."""
    A, B = discretise(plant)
    g = gains(plant, ghi)
    n = len(t_out) if hours is None else hours
    x = _start(plant, t0)
    ch, cc = cop_heat(t_out), cop_cool(t_out, plant.eta_cool)
    cost = kwh = disc = 0.0
    ih = ic = 0.0
    ti = np.empty(n)
    for k in range(n):
        eh, ec = sp_heat - x[0], x[0] - sp_cool
        qh = min(max(kp * eh + ih, 0.0), plant.qh_max)
        qc = min(max(kp * ec + ic, 0.0), plant.qc_max)
        ih = min(max(ih + ki * eh, 0.0), plant.qh_max)
        ic = min(max(ic + ki * ec, 0.0), plant.qc_max)
        q = qh - qc
        e = (qh / ch[k] + qc / cc[k]) / 1000.0
        cost += e * prices[k % 24]
        kwh += e
        ti[k] = x[0]
        disc += max(plant.t_lo - x[0], 0.0, x[0] - plant.t_hi)
        x = A @ x + B @ np.array([q, t_out[k], g[k]])
    return dict(cost=cost, kwh=kwh, disc=disc, ti=ti)


def _plan(model, x0, to_f, g_f, ch_f, cc_f, price_f, slack_cost):
    """LP over N hours: min sum price (qh/COPh + qc/COPc)/1000 + slack_cost (s_lo + s_hi); returns first (qh, qc)."""
    A, B = discretise(model)
    n = len(to_f)
    # variables per hour: qh, qc, slo, shi, then states Ti_1..Ti_N, Te_1..Te_N
    nv = 4 * n + 2 * n
    iq = lambda k: 4 * k
    iti = lambda k: 4 * n + k          # state after step k
    ite = lambda k: 5 * n + k
    c = np.zeros(nv)
    for k in range(n):
        c[iq(k)] = price_f[k] / ch_f[k] / 1000.0
        c[iq(k) + 1] = price_f[k] / cc_f[k] / 1000.0
        c[iq(k) + 2] = slack_cost
        c[iq(k) + 3] = slack_cost
    aeq = lil_matrix((2 * n, nv))
    beq = np.zeros(2 * n)
    for k in range(n):
        for s, (it, rowA, rowB) in enumerate(((iti, A[0], B[0]), (ite, A[1], B[1]))):
            r = 2 * k + s
            aeq[r, it(k)] = 1.0
            if k == 0:
                beq[r] = rowA[0] * x0[0] + rowA[1] * x0[1]
            else:
                aeq[r, iti(k - 1)] = -rowA[0]
                aeq[r, ite(k - 1)] = -rowA[1]
            aeq[r, iq(k)] = -rowB[0]
            aeq[r, iq(k) + 1] = rowB[0]
            beq[r] += rowB[1] * to_f[k] + rowB[2] * g_f[k]
    # comfort: Ti_k + slo_k >= t_lo ; Ti_k - shi_k <= t_hi
    aub = lil_matrix((2 * n, nv))
    bub = np.zeros(2 * n)
    for k in range(n):
        aub[2 * k, iti(k)] = -1.0
        aub[2 * k, iq(k) + 2] = -1.0
        bub[2 * k] = -model.t_lo
        aub[2 * k + 1, iti(k)] = 1.0
        aub[2 * k + 1, iq(k) + 3] = -1.0
        bub[2 * k + 1] = model.t_hi
    bounds = []
    for k in range(n):
        bounds += [(0, model.qh_max), (0, model.qc_max), (0, None), (0, None)]
    bounds += [(None, None)] * (2 * n)
    res = linprog(c, A_ub=aub.tocsr(), b_ub=bub, A_eq=aeq.tocsr(), b_eq=beq, bounds=bounds, method="highs")
    if res.status != 0:
        return 0.0, 0.0
    return res.x[0], res.x[1]


def mpc_year(plant, model, t_out, ghi, prices, forecast="perfect", horizon=24, slack_cost=0.5, hours=None,
             t0=None, noise=0.0, seed=0):
    """Receding-horizon controller. `plant` is the truth, `model` is what the controller believes.
    Each hour it re-plans from the measured Ti and an Te carried by its own model, with weather forecast:
      "perfect"     the true To and gains,
      "persistence" the value 24 h earlier (step 0 is the measured current hour),
      "noise"       truth + Gaussian error of `noise` K on To (gains scaled by 1+N(0, 0.3 noise)).
    Returns the same dict as thermostat_year."""
    Ap, Bp = discretise(plant)
    Am, Bm = discretise(model)
    gp, gm = gains(plant, ghi), gains(model, ghi)
    n = len(t_out) if hours is None else hours
    x = _start(plant, t0)
    xm = x.copy()
    chp, ccp = cop_heat(t_out), cop_cool(t_out, plant.eta_cool)
    chm, ccm = cop_heat(t_out), cop_cool(t_out, model.eta_cool)
    rng = np.random.default_rng(seed)
    cost = kwh = disc = 0.0
    ti = np.empty(n)
    for k in range(n):
        idx = np.arange(k, k + horizon)
        idx = np.minimum(idx, len(t_out) - 1)
        if forecast == "perfect":
            to_f, g_f = t_out[idx].copy(), gm[idx].copy()
        elif forecast == "persistence":
            back = np.maximum(idx - 24, 0)
            to_f, g_f = t_out[back].copy(), gm[back].copy()
            to_f[0], g_f[0] = t_out[k], gm[k]
        elif forecast == "noise":
            to_f = t_out[idx] + rng.normal(0, noise, horizon)
            g_f = gm[idx] * (1 + rng.normal(0, 0.3 * noise, horizon))
            to_f[0], g_f[0] = t_out[k], gm[k]
        else:
            raise ValueError(forecast)
        pf = np.array([prices[(k + j) % 24] for j in range(horizon)])
        xm[0] = x[0]                                   # measurement update: Ti measured, Te from the model
        qh, qc = _plan(model, xm, to_f, g_f, cop_heat(to_f), cop_cool(to_f, model.eta_cool), pf, slack_cost)
        q = qh - qc
        e = (qh / chp[k] + qc / ccp[k]) / 1000.0
        cost += e * prices[k % 24]
        kwh += e
        ti[k] = x[0]
        disc += max(plant.t_lo - x[0], 0.0, x[0] - plant.t_hi)
        x = Ap @ x + Bp @ np.array([q, t_out[k], gp[k]])
        xm = Am @ xm + Bm @ np.array([q, t_out[k], gm[k]])
    return dict(cost=cost, kwh=kwh, disc=disc, ti=ti)
