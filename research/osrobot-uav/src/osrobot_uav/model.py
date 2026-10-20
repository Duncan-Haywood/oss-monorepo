"""Stylised mass-closure sizing of a purpose-built UAV for a targeted-observation mission.

A mission is: carry a payload of mass `m_pay` and power `p_pay` a distance `dist` out, loiter `loiter` seconds,
and return, with a reserve. Two airframes are sized: a quadrotor-class multirotor (free: rotor diameter) and a
fixed wing (free: wing area). Every coefficient marked ASSUMED is a round textbook-range value, not a
measurement of any product. SI units throughout (m, s, kg, W, J).
"""
import math

G = 9.81
RHO = 1.225  # air density, sea level

# ---- ASSUMED technology constants -------------------------------------------------------------
E_PACK = 180 * 3600.0     # J/kg, pack-level specific energy (Li-ion class)
DOD = 0.8                 # usable fraction of pack energy
RESERVE = 0.2             # extra energy kept back, as a fraction of mission energy
ETA_DRIVE = 0.85 * 0.95   # motor x speed controller
M_AVIONICS = 0.15         # kg, flight controller, radio, GPS
P_AVIONICS = 5.0          # W
PWR_MASS = 0.4e-3         # kg/W, motors + controllers + props per watt of peak power
TW_PEAK = 2.0             # peak power as a multiple of hover (multirotor) or cruise (fixed wing) power
FRAME_FRAC = 0.18         # multirotor frame + wiring as a fraction of all-up mass
FM = 0.70                 # rotor figure of merit
N_ROT = 4
CDA_K = 0.012             # multirotor drag area (m^2) = CDA_K * m^(2/3)
WING_MASS = 1.0           # kg/m^2 of wing, including fuselage share
FUS_MASS = 0.30           # kg of fuselage + tail, per kg^(1/3) of all-up mass (scaled by m**(1/3))
AR, CD0, OSW = 8.0, 0.03, 0.8
ETA_PROP = 0.7            # propeller efficiency (fixed wing)
BANK_N = 1.0 / math.cos(math.radians(20))  # load factor in a 20 degree loiter orbit
CLMAX = 1.2
STALL_MARGIN = 1.3
ROTOR_MASS = 1.2          # kg per rotor at 1 m diameter, scaled as d^2.5 (propeller + arm)
MAX_WING_LOADING = 15.0   # kg/m^2, a hand-launch / belly-landing limit
V_MAX = 35.0              # m/s, speed cap


class Mission:
    def __init__(self, dist, loiter, m_pay, p_pay=5.0):
        self.dist, self.loiter, self.m_pay, self.p_pay = dist, loiter, m_pay, p_pay


# ---- multirotor -----------------------------------------------------------------------------
def hover_power(m, d_rotor):
    """Electrical hover power: momentum theory (W = (mg)^1.5 / sqrt(2 rho A)) over FM and drive efficiency."""
    area = N_ROT * math.pi * (d_rotor / 2) ** 2
    return (m * G) ** 1.5 / math.sqrt(2 * RHO * area) / (FM * ETA_DRIVE)


def fwd_power(m, d_rotor, v):
    """Level forward flight: induced velocity from v_i = v_h^2 / sqrt(v^2 + v_i^2), plus parasite power."""
    area = N_ROT * math.pi * (d_rotor / 2) ** 2
    T = m * G
    vh = math.sqrt(T / (2 * RHO * area))
    vi = vh
    for _ in range(60):
        vi = vh * vh / math.sqrt(v * v + vi * vi)
    cda = CDA_K * m ** (2 / 3)
    return (T * vi / FM + 0.5 * RHO * cda * v ** 3) / ETA_DRIVE


def mr_best_speed(m, d_rotor):
    """Speed minimising energy per metre, by golden-section search on [1, 30] m/s."""
    f = lambda v: fwd_power(m, d_rotor, v) / v
    a, b = 1.0, 30.0
    r = (math.sqrt(5) - 1) / 2
    for _ in range(60):
        c, d = b - r * (b - a), a + r * (b - a)
        if f(c) < f(d):
            b = d
        else:
            a = c
    v = (a + b) / 2
    return v, fwd_power(m, d_rotor, v)


def mr_mission_energy(m, d_rotor, ms):
    v, p = mr_best_speed(m, d_rotor)
    e = p * 2 * ms.dist / v + (hover_power(m, d_rotor) + P_AVIONICS + ms.p_pay) * ms.loiter
    e += (P_AVIONICS + ms.p_pay) * 2 * ms.dist / v
    return e


def mr_nonbattery(m, d_rotor, ms):
    peak = TW_PEAK * hover_power(m, d_rotor)
    return (ms.m_pay + M_AVIONICS + PWR_MASS * peak + FRAME_FRAC * m
            + N_ROT * ROTOR_MASS * d_rotor ** 2.5)


# ---- fixed wing -----------------------------------------------------------------------------
def fw_power(m, S, v, n=1.0):
    """Electrical power in level flight at load factor n: parabolic polar over propulsive efficiency."""
    q = 0.5 * RHO * v * v
    cl = n * m * G / (q * S)
    cd = CD0 + cl * cl / (math.pi * OSW * AR)
    return q * S * cd * v / (ETA_PROP * 0.85 * 0.95)


def fw_speeds(m, S):
    """(v_range, v_loiter, v_min): the speed of best L/D (minimum energy per metre) and of minimum power at the
    loiter load factor, from the parabolic polar, each raised to STALL_MARGIN x the stall speed and capped at V_MAX."""
    k = math.pi * OSW * AR
    vs = math.sqrt(2 * m * G / (RHO * S * CLMAX))
    vmin = STALL_MARGIN * vs
    v_at = lambda cl, n: math.sqrt(2 * n * m * G / (RHO * S * cl))
    vr = min(max(v_at(math.sqrt(CD0 * k), 1.0), vmin), V_MAX)
    vl = min(max(v_at(math.sqrt(3 * CD0 * k), BANK_N), vmin), V_MAX)
    return vr, vl, vmin


def fw_mission_energy(m, S, ms):
    vr, vl, _ = fw_speeds(m, S)
    base = P_AVIONICS + ms.p_pay
    return (fw_power(m, S, vr) + base) * 2 * ms.dist / vr + (fw_power(m, S, vl, BANK_N) + base) * ms.loiter


def fw_nonbattery(m, S, ms):
    if m / S > MAX_WING_LOADING:
        return float("inf")
    vr, vl, _ = fw_speeds(m, S)
    peak = TW_PEAK * fw_power(m, S, vr)
    return ms.m_pay + M_AVIONICS + PWR_MASS * peak + WING_MASS * S + FUS_MASS * m ** (1 / 3)


# ---- VTOL fixed wing: the fixed wing plus a vertical-lift system for take-off and landing -----------
LIFT_FRAC = 0.20     # ASSUMED: lift motors, rotors and booms as a fraction of all-up mass
VTOL_HOVER_S = 90.0  # ASSUMED: hover seconds per sortie (vertical take-off and landing)
D_LIFT = 0.30        # m, ASSUMED diameter of each of four lift rotors
CRUISE_DRAG = 1.10   # ASSUMED: extra cruise power for the idle lift rotors and booms


def vtol_mission_energy(m, S, ms):
    return CRUISE_DRAG * fw_mission_energy(m, S, ms) + (hover_power(m, D_LIFT) + P_AVIONICS) * VTOL_HOVER_S


def vtol_nonbattery(m, S, ms):
    nb = fw_nonbattery(m, S, ms)
    peak = TW_PEAK * hover_power(m, D_LIFT)
    return nb + LIFT_FRAC * m + PWR_MASS * peak


def size_vtol(ms, areas=None):
    areas = areas or [0.05 + 0.02 * i for i in range(0, 98)]
    best = None
    for S in areas:
        r = close(vtol_mission_energy, vtol_nonbattery, ms, S)
        if r and (best is None or r["mass"] < best["mass"]):
            best = r
    return best


# ---- closure ----------------------------------------------------------------------------------
def close(energy_fn, nonbat_fn, ms, x, m0=2.0, mmax=60.0):
    """Fixed-point iteration on all-up mass: m = non-battery(m) + E(m)(1+RESERVE)/(DOD * E_PACK).
    Returns a dict, or None if it does not converge below `mmax` kg (the design cannot do the mission)."""
    m = m0
    for _ in range(400):
        e = energy_fn(m, x, ms) * (1 + RESERVE)
        mb = e / (DOD * E_PACK)
        new = nonbat_fn(m, x, ms) + mb
        if new > mmax or math.isnan(new) or math.isinf(new):
            return None
        if abs(new - m) < 1e-7:
            return {"mass": new, "m_bat": mb, "energy_wh": e / 3600, "x": x}
        m = 0.5 * m + 0.5 * new
    return None


def size_multirotor(ms, diams=None):
    diams = diams or [0.05 + 0.01 * i for i in range(0, 56)]
    best = None
    for d in diams:
        r = close(mr_mission_energy, mr_nonbattery, ms, d)
        if r and (best is None or r["mass"] < best["mass"]):
            best = r
    return best


def size_fixedwing(ms, areas=None):
    areas = areas or [0.05 + 0.01 * i for i in range(0, 196)]
    best = None
    for S in areas:
        r = close(fw_mission_energy, fw_nonbattery, ms, S)
        if r and (best is None or r["mass"] < best["mass"]):
            best = r
    return best


# ---- a frozen design flown on a different mission ---------------------------------------------
def frozen_max_loiter(kind, design, ms):
    """Seconds of loiter a frozen design (mass and battery fixed, payload swapped) has at `ms.dist`, or None
    if it cannot even reach the site and return. Mass is held at the design's all-up mass (any payload
    difference is made up in ballast), so only the mission changes."""
    m, x = design["mass"], design["x"]
    usable = design["m_bat"] * DOD * E_PACK / (1 + RESERVE)
    if kind == "mr":
        v, p = mr_best_speed(m, x)
        transit = (p + P_AVIONICS + ms.p_pay) * 2 * ms.dist / v
        hov = hover_power(m, x) + P_AVIONICS + ms.p_pay
    else:
        vr, vl, _ = fw_speeds(m, x)
        base = P_AVIONICS + ms.p_pay
        transit = (fw_power(m, x, vr) + base) * 2 * ms.dist / vr
        hov = fw_power(m, x, vl, BANK_N) + base
    if usable <= transit:
        return None
    return (usable - transit) / hov
