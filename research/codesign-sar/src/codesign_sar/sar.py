"""Wheel-legged search-and-rescue rover on stylised rubble: design -> mass, cost, then a learned speed/flipper policy
scored on held-out terrains. Pure stdlib. Quasi-static statics for steps, an energy rule for momentum, no dynamics
solver: see README "Limitations". Terrain friction follows research/terrain-twin (Gamma, CV 0.5, patchy)."""
import math
import random

G = 9.81
# design x = [R wheel radius mm, L wheelbase mm, F flipper length mm, T drive torque N m per wheel, B battery Wh]
NAMES = ("R_mm", "L_mm", "F_mm", "T_Nm", "B_Wh")
LB = (25.0, 120.0, 0.0, 0.2, 5.0)
UB = (90.0, 320.0, 150.0, 2.0, 40.0)
COST_CAP = 120.0          # USD parts cap (assumed prices, README "Bill of materials")
PAYLOAD_KG = 0.6          # sensor / radio-relay payload
HC_MM = 60.0              # centre-of-mass height above the axle line, mm
N_SEG, SEG_M = 40, 0.5    # terrain: 40 segments of 0.5 m = 20 m
MU0, CV = 0.9, 0.5
RETAIN = 0.3              # share of kinetic energy usable to lift over a step
C_RR, ETA = 0.05, 0.5     # rolling resistance, drivetrain efficiency
RECOVER_S = 5.0


def cost_usd(x):
    R, L, F, T, B = x
    motors = 2 * (4.0 + 14.0 * T)
    plastic = plastic_g(x) * 0.025          # USD per gram of filament
    return motors + plastic + 0.35 * B + 25.0   # +25 USD fixed: controller, radio, wiring


def plastic_g(x):
    R, L, F, T, B = x
    wheels = 4 * math.pi * (R / 10) ** 2 * 2.0 * 0.3      # cm^3: 4 wheels, 20 mm wide, 30% infill
    body = (L / 10) * 8 * 0.5 * 0.4 * 2                   # frame
    flipper = 2 * (F / 10) * 2.0 * 0.4 * 0.5
    return (wheels + body + flipper) * 1.24


def mass_kg(x):
    R, L, F, T, B = x
    return PAYLOAD_KG + 2 * (0.1 + 0.2 * T) + plastic_g(x) / 1000 + 0.0067 * B + 0.25


def _climb_ok(R, h, W, P, T, mu):
    """Edge-contact statics (README): wheel of radius R at a step of height h carries axle load W if
    P*cot(phi) + f/sin(phi) >= W, with traction f <= min(T/R, friction limit) and thrust P from the other axle."""
    if h <= 0:
        return True
    if h >= R:
        return False
    phi = math.acos((R - h) / R)
    s, c = math.sin(phi), math.cos(phi)
    f = T / R
    if s > mu * c:
        f = min(f, mu * P / (s - mu * c))
    return P * c / s + f / s >= W


def make_terrain(seed):
    rng = random.Random(seed)
    segs = []
    for _ in range(N_SEG):
        mu = max(0.45, rng.gammavariate(1 / CV ** 2, MU0 * CV ** 2))
        u = rng.random()
        if u < 0.5:
            kind, size = "flat", 0.0
        elif u < 0.75:
            kind, size = "up", rng.uniform(0.01, 0.04)
        elif u < 0.9:
            kind, size = "down", rng.uniform(0.01, 0.04)
        else:
            kind, size = "gap", rng.uniform(0.03, 0.08)
        segs.append((kind, size, mu))
    return segs


def run(x, policy, segs):
    """Returns dict: distance_m, falls, recoveries, energy_J, stuck. policy = (v_cruise, v_obs, deploy_frac)."""
    R, L, F, T, B = (x[0] * 1e-3, x[1] * 1e-3, x[2] * 1e-3, x[3], x[4])
    vc, vo, dfrac = policy
    m = mass_kg(x)
    W = m * G / 2.0
    hc = HC_MM * 1e-3
    batt = B * 3600.0
    dist = energy = 0.0
    falls = rec = 0
    for kind, size, mu in segs:
        deploy = F > 0 and size > dfrac * R
        Leff = L + (F if deploy else 0.0)
        e_flat = C_RR * m * G * SEG_M
        ok, tipped = True, False
        h = size
        if kind == "up":
            P = min(T / R, mu * W)
            ok = _climb_ok(R, h, W, P, T, mu) or 0.5 * RETAIN * vo ** 2 >= G * h * 1.0
            if ok and h > 0:
                # tip back: CoM passes behind the rear contact when tan(pitch) > xc/hc
                pitch = math.asin(min(1.0, h / Leff))
                if math.tan(pitch) > (Leff / 2) / hc * (1.0 + (0.5 if deploy else 0)):
                    ok, tipped = False, True
                    falls += 1
            e = e_flat + m * G * h / ETA
        elif kind == "down":
            # tip forward if the front drops with speed vo before the rear follows
            v_fall = math.sqrt(G * Leff * (Leff / 2) / hc) * math.exp(-4.0 * h)
            if vo > v_fall:
                ok, tipped = False, True
                falls += 1
            e = e_flat
        elif kind == "gap":
            bridged = deploy and F >= size
            if bridged:
                e = e_flat
            elif size >= 2 * R:
                ok = False
                e = e_flat
            else:
                d = R - math.sqrt(R * R - (size / 2) ** 2)
                P = min(T / R, mu * W)
                ok = _climb_ok(R, d, W, P, T, mu) or 0.5 * RETAIN * vo ** 2 >= G * d
                e = e_flat + m * G * d / ETA
        else:
            e = e_flat
        v = vc if kind == "flat" else vo
        if not ok:
            # a tip-over with a flipper at least half the wheelbase self-rights and carries on; anything else ends the run
            if tipped and F >= 0.5 * L:
                rec += 1
                falls -= 1
                energy += e + 4.0 * RECOVER_S
                dist += SEG_M
                continue
            return dict(distance_m=dist, falls=falls, recoveries=rec, energy_J=energy, stuck=0 if tipped else 1)
        if energy + e > batt:
            frac = max(0.0, (batt - energy) / e)
            return dict(distance_m=dist + frac * SEG_M, falls=falls, recoveries=rec, energy_J=batt, stuck=0)
        energy += e + 4.0 * SEG_M / v        # 4 W electronics while moving
        dist += SEG_M
    return dict(distance_m=dist, falls=falls, recoveries=rec, energy_J=energy, stuck=0)


def policy_value(x, p, seeds):
    tot = 0.0
    for s in seeds:
        r = run(x, p, make_terrain(s))
        tot += r["distance_m"] - 2.0 * r["falls"] - 0.5 * r["recoveries"]
    return tot / len(seeds)


def train_policy(x, seed, train_seeds=range(100, 106), iters=6, pop=8):
    """Small evolution-strategies search over (v_cruise, v_obs, deploy_frac): 48 policy rollouts-sets per design
    on 6 training terrains. Not PPO; README says so."""
    rng = random.Random(seed)
    lo, hi = (0.1, 0.05, 0.0), (1.5, 1.5, 1.2)
    mean = [0.6, 0.4, 0.4]
    sig = [0.3, 0.3, 0.3]
    best = (policy_value(x, tuple(mean), train_seeds), tuple(mean))
    for _ in range(iters):
        cand = []
        for _ in range(pop):
            p = tuple(min(hi[i], max(lo[i], mean[i] + sig[i] * rng.gauss(0, 1))) for i in range(3))
            cand.append((policy_value(x, p, train_seeds), p))
        cand.sort(reverse=True)
        top = cand[: pop // 2]
        mean = [sum(c[1][i] for c in top) / len(top) for i in range(3)]
        sig = [s * 0.8 for s in sig]
        if cand[0][0] > best[0]:
            best = cand[0]
    return best[1]


TEST_SEEDS = tuple(range(1000, 1012))


def evaluate(x, seed=0):
    x = [float(v) for v in x]
    x = [min(max(v, lo), hi) for v, lo, hi in zip(x, LB, UB)]
    cost = cost_usd(x)
    base = dict(x=x, cost=cost, mass=mass_kg(x))
    if cost > COST_CAP:
        return dict(base, J=-1.0, feasible=False, distance_m=0.0, falls=0.0, stuck=0.0, energy_per_m=None, policy=None)
    pol = train_policy(x, seed)
    rs = [run(x, pol, make_terrain(s)) for s in TEST_SEEDS]
    dist = sum(r["distance_m"] for r in rs) / len(rs)
    falls = sum(r["falls"] for r in rs) / len(rs)
    rec = sum(r["recoveries"] for r in rs) / len(rs)
    en = sum(r["energy_J"] for r in rs) / len(rs)
    epm = en / dist if dist > 0 else None
    J = dist / (N_SEG * SEG_M) - 0.05 * falls - 0.02 * rec - (0.002 * epm if epm else 0.1)
    return dict(base, J=J, feasible=True, distance_m=dist, falls=falls, recoveries=rec, stuck=sum(r["stuck"] for r in rs) / len(rs),
                energy_per_m=epm, policy=list(pol))
