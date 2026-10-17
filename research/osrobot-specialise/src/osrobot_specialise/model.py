"""Stylised comparison of a Cartesian gantry and a general planar two-link arm
doing the same pick-and-place job over a square work area. Standard library only.

Every number marked ASSUMED is a modelling choice, not a measured or quoted value.
Lengths in metres, times in seconds, energy in joules, cost in arbitrary units.
"""
import math
import random

# ---- ASSUMED parameters -------------------------------------------------
G = dict(
    vmax=0.5, amax=3.0,          # per-axis speed (m/s) and acceleration (m/s^2)
    mass_xy=(0.8, 0.4),          # moving mass seen by the X and Y axes (kg)
    z_stroke=0.04, z_v=0.2, z_a=3.0, mass_z=0.15,
    sigma=0.00015,               # 1-sigma position error per axis (m)
    hold_w=2.0,                  # holding power per axis while stopped or moving (W)
    cost_fixed=60.0, cost_per_m=250.0,  # cost = fixed + per_m * (Lx + Ly)
)
A = dict(
    wmax=3.0, alpha=12.0,        # joint speed (rad/s) and acceleration cap (rad/s^2)
    tau=1.5,                     # joint torque available for acceleration (N m); alpha = min(alpha, tau / inertia)
    link_mass_per_m=2.0,         # link mass per metre of length (kg/m)
    z_stroke=0.04, z_v=0.2, z_a=3.0, mass_z=0.15,
    sigma_angle=0.0012,          # 1-sigma joint-angle error (rad); position error = R * this
    hold_w=4.0,                  # holding power per joint (W)
    cost_fixed=120.0, cost_per_m2=700.0,  # cost = fixed + per_m2 * R^2 (torque grows with reach)
    r_max=1.0,                   # largest arm considered buildable from hobby-grade parts (m)
)
PAYLOAD = 0.05                   # kg carried in both designs (ASSUMED)


def trap_time(d, vmax, amax):
    """Time of a rest-to-rest trapezoidal move of length d."""
    d = abs(d)
    if d == 0:
        return 0.0
    if d >= vmax * vmax / amax:
        return d / vmax + vmax / amax
    return 2.0 * math.sqrt(d / amax)


def peak_speed(d, vmax, amax):
    d = abs(d)
    return min(vmax, math.sqrt(d * amax))


def p_inside(tol, sigma):
    """P(2-D Gaussian error with per-axis sigma lies within radius tol)."""
    return 1.0 - math.exp(-tol * tol / (2.0 * sigma * sigma))


# ---- gantry -------------------------------------------------------------
def gantry_cost(L):
    return G["cost_fixed"] + G["cost_per_m"] * 2.0 * L


def gantry_move(p, q):
    """(time, kinetic energy) of an XY move; axes run independently."""
    t, e = 0.0, 0.0
    for d, m in zip((q[0] - p[0], q[1] - p[1]), G["mass_xy"]):
        t = max(t, trap_time(d, G["vmax"], G["amax"]))
        v = peak_speed(d, G["vmax"], G["amax"])
        e += m * v * v   # accelerate then stop: 2 x 1/2 m v^2, none recovered
    return t, e


def z_cycle():
    """Down and up on the Z axis, shared by both designs."""
    t = 2 * trap_time(G["z_stroke"], G["z_v"], G["z_a"])
    v = peak_speed(G["z_stroke"], G["z_v"], G["z_a"])
    return t, 2 * G["mass_z"] * v * v


# ---- arm ----------------------------------------------------------------
def arm_cost(R):
    return A["cost_fixed"] + A["cost_per_m2"] * R * R


def ik(R, x, y):
    """Joint angles of an equal-link (R/2 each) arm at the origin, elbow-down, or None."""
    l = R / 2.0
    r2 = x * x + y * y
    c2 = (r2 - 2 * l * l) / (2 * l * l)
    if c2 < -1.0 or c2 > 1.0:
        return None
    q2 = math.acos(c2)
    q1 = math.atan2(y, x) - math.atan2(l * math.sin(q2), l + l * math.cos(q2))
    return q1, q2


def arm_move(R, p, q):
    a, b = ik(R, *p), ik(R, *q)
    if a is None or b is None:
        return None
    l = R / 2.0
    m = A["link_mass_per_m"] * l
    # rotational inertia about each joint, arm fully stretched (worst case, held fixed)
    i2 = m * l * l / 3.0 + PAYLOAD * l * l
    i1 = m * l * l / 3.0 + m * l * l / 12.0 + m * (1.5 * l) ** 2 + PAYLOAD * (2 * l) ** 2
    t, e = 0.0, 0.0
    for da, inertia in zip((b[0] - a[0], b[1] - a[1]), (i1, i2)):
        alpha = min(A["alpha"], A["tau"] / inertia)
        t = max(t, trap_time(da, A["wmax"], alpha))
        w = peak_speed(da, A["wmax"], alpha)
        e += inertia * w * w
    return t, e


def min_arm_reach(L, margin=1.0):
    """Smallest arm that reaches the whole L x L area when its base is at the centre.
    Equal links reach every point at distance 0 to R, so R is the half-diagonal."""
    return margin * L * math.sqrt(2) / 2.0


# ---- evaluation ---------------------------------------------------------
def sample_job(L, n, seed):
    """n pick/place pairs, uniform over the L x L area centred on the origin."""
    rng = random.Random(seed)
    pt = lambda: (rng.uniform(-L / 2, L / 2), rng.uniform(-L / 2, L / 2))
    return [(pt(), pt()) for _ in range(n)]


def evaluate(design, L, tol, n=2000, seed=1):
    """Mean cycle time, energy per pick, success rate and cost for one design.
    A cycle: home -> pick, Z cycle, pick -> place, Z cycle, place -> next pick (approximated by
    a pick-to-place-sized move, i.e. the mean cycle is 2 XY moves plus 2 Z cycles)."""
    job = sample_job(L, n, seed)
    zt, ze = z_cycle()
    if design == "gantry":
        sigma, hold, axes, cost = G["sigma"], G["hold_w"], 3, gantry_cost(L)
        mv = gantry_move
    else:
        R = min_arm_reach(L)
        if R > A["r_max"]:
            return None
        sigma, hold, axes, cost = A["sigma_angle"] * R, A["hold_w"], 3, arm_cost(R)
        mv = lambda p, q: arm_move(R, p, q)
    tt = ee = 0.0
    for pick, place in job:
        r1, r2 = mv(pick, place), mv(place, pick)   # carry, and return as a stand-in for the empty move
        if r1 is None or r2 is None:
            return None
        tt += r1[0] + r2[0] + 2 * zt
        ee += r1[1] + r2[1] + 2 * ze
    t = tt / n
    e = ee / n + hold * axes * t
    ok = p_inside(tol, sigma) ** 2          # pick and place each within tolerance
    return dict(design=design, L=L, tol=tol, cycle_s=t, energy_j=e, success=ok,
                cost=cost, picks_per_h=3600.0 / t * ok,
                cost_per_throughput=cost / (3600.0 / t * ok) if ok > 0 else float("inf"))


def arm_wins(tol, lengths):
    """Side lengths in `lengths` at which the arm has the lower cost per good pick/h.
    An unbuildable arm never wins."""
    out = []
    for L in lengths:
        g, a = evaluate("gantry", L, tol), evaluate("arm", L, tol)
        if a is not None and a["cost_per_throughput"] < g["cost_per_throughput"]:
            out.append(L)
    return out
