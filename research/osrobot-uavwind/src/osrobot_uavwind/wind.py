"""Steady-wind extension of osrobot-uav (imported from ../osrobot-uav/src).

A steady, uniform wind `w` (m/s) blows along the line to the site, so the outbound leg is a headwind and the
return a tailwind (the worst case for the pair of legs is a crosswind-free line; a crosswind is not modelled).
Ground speed is `v - w` out and `v + w` back, so a leg pair at airspeed v takes 2 d v / (v^2 - w^2). The airspeed is
re-optimised for the wind. On station the aircraft must not be blown away:
  * multirotor: it holds position by flying at airspeed w; power is the larger of hover power and forward-flight
    power at w (CREDIT = False, the default), or the forward-flight power alone (CREDIT = True, which lets a
    steady wind lower the power through translational lift);
  * fixed wing: it orbits at its minimum-power speed, raised to WIND_K * w if the wind is stronger than that, so
    the orbit drifts no further than its own radius per turn (ASSUMED; a real orbit is a trochoid).
All other constants come from osrobot_uav.model. Nothing is a measurement of any product.
"""
import math
from osrobot_uav import model as M

MR_VMAX = 20.0   # ASSUMED m/s, multirotor airspeed cap
WIND_K = 1.2     # ASSUMED fixed-wing orbit airspeed as a multiple of the wind when the wind is strong


class WindMission(M.Mission):
    def __init__(self, dist, loiter, m_pay, p_pay=5.0, wind=0.0):
        super().__init__(dist, loiter, m_pay, p_pay)
        self.wind = wind


def _argmin(f, lo, hi, n=60):
    """Golden-section minimum of a unimodal f on [lo, hi]."""
    r = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    for _ in range(n):
        c, d = b - r * (b - a), a + r * (b - a)
        if f(c) < f(d):
            b = d
        else:
            a = c
    return (a + b) / 2


def leg_time_factor(v, w):
    """Seconds of flight per metre of one out-and-back path (both legs), 2 v / (v^2 - w^2)."""
    return 2 * v / (v * v - w * w)


# ---- multirotor -----------------------------------------------------------------------------
def mr_transit(m, d, w):
    """(airspeed, power) minimising energy per out-and-back metre, or None if w >= MR_VMAX."""
    if w >= MR_VMAX * 0.95:
        return None
    lo = max(1.0, w * 1.05 + 0.5)
    f = lambda v: M.fwd_power(m, d, v) * leg_time_factor(v, w)
    v = _argmin(f, lo, MR_VMAX)
    return v, M.fwd_power(m, d, v)


CREDIT = False   # True: a station-keeping multirotor gets momentum-theory translational lift (power falls with w)


def mr_station_power(m, d, w):
    """Power to hold position in wind w. By default never below hover power (CREDIT False, conservative);
    with CREDIT True the forward-flight power at airspeed w is used, which falls below hover at moderate w
    (steady, known wind; no gusts, tilt-dependent drag or attitude margin)."""
    h = M.hover_power(m, d)
    if w <= 0:
        return h
    f = M.fwd_power(m, d, w)
    return f if CREDIT else max(h, f)


def mr_mission_energy(m, d, ms):
    t = mr_transit(m, d, ms.wind)
    if t is None:
        return float("inf")
    v, p = t
    k = leg_time_factor(v, ms.wind)
    base = M.P_AVIONICS + ms.p_pay
    return (p + base) * ms.dist * k + (mr_station_power(m, d, ms.wind) + base) * ms.loiter


# ---- fixed wing -----------------------------------------------------------------------------
def fw_transit(m, S, w):
    _, _, vmin = M.fw_speeds(m, S)
    lo = max(vmin, w * 1.05 + 0.5)
    if lo >= M.V_MAX:
        return None
    f = lambda v: M.fw_power(m, S, v) * leg_time_factor(v, w)
    v = _argmin(f, lo, M.V_MAX)
    return v, M.fw_power(m, S, v)


def fw_loiter_speed(m, S, w):
    _, vl, _ = M.fw_speeds(m, S)
    v = max(vl, WIND_K * w)
    return v if v <= M.V_MAX else None


def fw_mission_energy(m, S, ms):
    t, vl = fw_transit(m, S, ms.wind), fw_loiter_speed(m, S, ms.wind)
    if t is None or vl is None:
        return float("inf")
    v, p = t
    base = M.P_AVIONICS + ms.p_pay
    return (p + base) * ms.dist * leg_time_factor(v, ms.wind) + (M.fw_power(m, S, vl, M.BANK_N) + base) * ms.loiter


def fw_nonbattery(m, S, ms):
    """As osrobot_uav's, but the motor is sized for the (windy) transit power."""
    if m / S > M.MAX_WING_LOADING:
        return float("inf")
    t, vl = fw_transit(m, S, ms.wind), fw_loiter_speed(m, S, ms.wind)
    if t is None or vl is None:
        return float("inf")
    peak = M.TW_PEAK * t[1]
    return ms.m_pay + M.M_AVIONICS + M.PWR_MASS * peak + M.WING_MASS * S + M.FUS_MASS * m ** (1 / 3)


# ---- VTOL: the windy fixed wing plus the same lift system (hover phase not changed by wind: ASSUMED) -------
def vtol_mission_energy(m, S, ms):
    return M.CRUISE_DRAG * fw_mission_energy(m, S, ms) + (M.hover_power(m, M.D_LIFT) + M.P_AVIONICS) * M.VTOL_HOVER_S


def vtol_nonbattery(m, S, ms):
    nb = fw_nonbattery(m, S, ms)
    return nb + M.LIFT_FRAC * m + M.PWR_MASS * M.TW_PEAK * M.hover_power(m, M.D_LIFT)


def _best(energy, nonbat, ms, xs):
    best = None
    for x in xs:
        r = M.close(energy, nonbat, ms, x)
        if r and (best is None or r["mass"] < best["mass"]):
            best = r
    return best


def size_multirotor(ms):
    return _best(mr_mission_energy, lambda m, d, ms_: M.mr_nonbattery(m, d, ms_), ms,
                 [0.05 + 0.01 * i for i in range(56)])


def size_fixedwing(ms):
    return _best(fw_mission_energy, fw_nonbattery, ms, [0.05 + 0.01 * i for i in range(196)])


def size_vtol(ms):
    return _best(vtol_mission_energy, vtol_nonbattery, ms, [0.05 + 0.02 * i for i in range(98)])


# ---- a frozen design flown in wind ------------------------------------------------------------
def frozen_loiter(kind, design, ms):
    """Seconds on station left for a frozen design (mass and battery fixed) in `ms.wind`, or None if it cannot
    make the round trip or cannot hold station in that wind."""
    m, x, w = design["mass"], design["x"], ms.wind
    usable = design["m_bat"] * M.DOD * M.E_PACK / (1 + M.RESERVE)
    base = M.P_AVIONICS + ms.p_pay
    if kind == "mr":
        t = mr_transit(m, x, w)
        if t is None:
            return None
        transit = (t[1] + base) * ms.dist * leg_time_factor(t[0], w)
        stn = mr_station_power(m, x, w) + base
    else:
        t, vl = fw_transit(m, x, w), fw_loiter_speed(m, x, w)
        if t is None or vl is None:
            return None
        transit = (t[1] + base) * ms.dist * leg_time_factor(t[0], w)
        stn = M.fw_power(m, x, vl, M.BANK_N) + base
    if usable <= transit:
        return None
    return (usable - transit) / stn
