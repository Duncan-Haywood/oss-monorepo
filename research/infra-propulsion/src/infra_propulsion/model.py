"""Force-balance models of four freight modes and a storage-swap solver. Stdlib only.

Each mode gives the tractive force F(m) in newtons at gross mass m (kg) at its cruise speed. A carrier
(diesel, jet fuel, Li-ion pack, compressed H2, ...) supplies energy at a system specific energy eps_sys
(J per kg of store, tank or pack included) through a fuel-to-work chain efficiency. The solver finds the
smallest store mass that covers a range R at fixed gross mass M0, and so the payload left.
"""
from dataclasses import dataclass, replace

G = 9.80665
RHO_AIR = 1.2
LB_PER_TON_N_PER_KG = 4.44822 / 907.185   # 1 lb of force per short ton of mass, in N/kg
KN = 0.514444


@dataclass(frozen=True)
class Mode:
    name: str
    m0: float          # gross mass at start, kg
    m_struct: float    # everything except payload and the energy store, kg
    range_km: float    # design range
    force: object      # callable m -> N
    payload_cap: float = float("inf")  # kg, e.g. aircraft zero-fuel-weight limit


def truck(crr=0.0065, cda=5.4, v=25.0, m0=37195.0, m_struct=15000.0, range_km=800.0):
    """US 5-axle tractor-trailer. 82,000 lb = 37,195 kg is the US federal gross limit."""
    f = lambda m: crr * m * G + 0.5 * RHO_AIR * cda * v * v
    return Mode("truck", m0, m_struct, range_km, f)


def rail(v_mph=50.0, m0=9100e3, m_struct=2840e3, range_km=1500.0, car_t=91.0, axles=4, area_ft2=100.0):
    """Unit train of 100-short-ton cars, Davis (1926) resistance: per car 1.3 W + 29 N + 0.045 W V + 0.0005 A V^2 (lb).
    The aerodynamic term is charged in full to the lead car and at 12% to each trailing car."""
    w = car_t / 0.907185
    per_ton = 1.3 + 29.0 * axles / w + 0.045 * v_mph   # lb of force per short ton
    def f(m):
        cars = m / (car_t * 1000.0)
        aero_lb = 0.0005 * area_ft2 * v_mph ** 2 * (1 + 0.12 * (cars - 1))
        return per_ton * LB_PER_TON_N_PER_KG * m + aero_lb * 4.44822
    return Mode("rail", m0, m_struct, range_km, f)


def ship(c_adm=600.0, v_kn=14.0, m0=91000e3, m_struct=14000e3, range_km=20000.0):
    """Panamax bulk carrier on the Admiralty law P[kW] = D^(2/3) v^3 / C, D in tonnes displacement, v in knots."""
    v = v_kn * KN
    def f(m):
        p_kw = (m / 1000.0) ** (2 / 3) * v_kn ** 3 / c_adm
        return p_kw * 1000.0 / v
    return Mode("ship", m0, m_struct, range_km, f)


def aircraft(l_over_d=17.0, m0=396.9e3, m_struct=160.4e3, range_km=8250.0, payload_cap=118e3):
    """Freighter at cruise: thrust = W / (L/D)."""
    f = lambda m: m * G / l_over_d
    return Mode("aircraft", m0, m_struct, range_km, f, payload_cap)


MODES = {"truck": truck, "rail": rail, "ship": ship, "aircraft": aircraft}


@dataclass(frozen=True)
class Carrier:
    name: str
    eps_sys: float     # J per kg of the whole store (fuel + tank, or cell + pack)
    lhv: float         # J per kg of the part that is burned or consumed; 0 for batteries (mass does not change)
    usable: float = 1.0
    eta: dict = None   # mode -> energy-to-work efficiency


DIESEL_LHV = 42.8e6
JET_LHV = 43.2e6
H2_LHV = 120.0e6
NH3_LHV = 18.6e6


def diesel():
    return Carrier("diesel/jet", 0.95 * DIESEL_LHV, DIESEL_LHV, 1.0, {"truck": 0.40, "rail": 0.34, "ship": 0.48, "aircraft": 0.38})


def battery(wh_kg=250.0):
    return Carrier(f"Li-ion pack {wh_kg:.0f} Wh/kg", wh_kg * 3600.0, 0.0, 0.9, {"truck": 0.88, "rail": 0.85, "ship": 0.90, "aircraft": 0.80})


def h2_700bar(system_frac=0.05):
    return Carrier(f"H2 700 bar, {system_frac*100:.0f}% system", system_frac * H2_LHV, system_frac * H2_LHV, 1.0, {"truck": 0.46, "rail": 0.44, "ship": 0.45, "aircraft": 0.40})


def h2_liquid(system_frac=0.25):
    return Carrier(f"LH2, {system_frac*100:.0f}% system", system_frac * H2_LHV, system_frac * H2_LHV, 1.0, {"truck": 0.46, "rail": 0.44, "ship": 0.45, "aircraft": 0.40})


def ammonia(system_frac=0.9):
    return Carrier("ammonia", system_frac * NH3_LHV, system_frac * NH3_LHV, 1.0, {"truck": 0.40, "rail": 0.34, "ship": 0.48, "aircraft": 0.38})


def range_km(mode, car, m_store, steps=400):
    """Distance covered by a store of m_store kg, starting at the mode's gross mass m0 (burned fuel shortens the vehicle)."""
    eta = car.eta[mode.name]
    energy = m_store * car.eps_sys * car.usable          # J of carrier energy
    if car.lhv == 0.0:
        return energy * eta / mode.force(mode.m0) / 1000.0
    burn_frac = 1.0                                       # the burned mass is the energy over lhv
    m, x = mode.m0, 0.0
    dw = energy / steps                                   # J of carrier energy per step
    for _ in range(steps):
        f = mode.force(m)
        x += dw * eta / f
        m -= dw / car.lhv * burn_frac
    return x / 1000.0


def solve(mode, car):
    """Smallest store covering mode.range_km. Returns dict(store, payload, feasible, max_range_km).
    payload is limited by gross mass and by mode.payload_cap; infeasible when even a full store falls short."""
    room = mode.m0 - mode.m_struct
    full = range_km(mode, car, room)
    if full < mode.range_km:
        return {"store": room, "payload": 0.0, "feasible": False, "max_range_km": full}
    lo, hi = 0.0, room
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if range_km(mode, car, mid) >= mode.range_km:
            hi = mid
        else:
            lo = mid
    pay = min(room - hi, mode.payload_cap)
    return {"store": hi, "payload": pay, "feasible": True, "max_range_km": full}


def intensity(mode, car):
    """Energy per net tonne-km at the design range, loaded one way. Returns (MJ/tkm at wheel, MJ/tkm of carrier energy)."""
    s = solve(mode, car)
    if not s["feasible"] or s["payload"] <= 0:
        return None
    eta = car.eta[mode.name]
    m_mid = mode.m0 - 0.5 * s["store"] if car.lhv else mode.m0
    work = mode.force(m_mid) * mode.range_km * 1000.0    # J, mean-mass approximation
    tkm = s["payload"] / 1000.0 * mode.range_km
    return work / 1e6 / tkm, work / eta / 1e6 / tkm


def breakeven_wh_kg(mode, frac=0.9, lo=50.0, hi=20000.0):
    """Battery pack specific energy at which payload reaches `frac` of the diesel payload (bisection, log scale)."""
    base = solve(mode, diesel())["payload"]
    def ok(w):
        s = solve(mode, battery(w))
        return s["feasible"] and s["payload"] >= frac * base
    if not ok(hi):
        return None
    for _ in range(50):
        mid = (lo * hi) ** 0.5
        if ok(mid):
            hi = mid
        else:
            lo = mid
    return hi
