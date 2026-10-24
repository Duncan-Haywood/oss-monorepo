"""Stylised suction gripper for a mixed tote (boxes, polybags, bottles): cup fit on the item's flat patch, vacuum
lost through leaks, holding force against weight plus transport acceleration, and pick time. Every constant marked
ASSUMED is a round number chosen for this study, not a measurement of any cup, pump or parcel.

Design x = [d, n, P, Q, h]
  d  cup diameter, mm            (10 .. 50)
  n  cups in a row               (1 .. 4, rounded to an integer)
  P  pump vacuum level, kPa      (20 .. 80)
  Q  pump free flow, L/min       (5 .. 60)
  h  cup compliance (bellows)    (0 .. 1)
A fixed population of N_ITEM items (common random numbers) scores every design, so evaluation is noise-free.
"""
import numpy as np

LB = [10.0, 1.0, 20.0, 5.0, 0.0]
UB = [50.0, 4.0, 80.0, 60.0, 1.0]
N_ITEM = 600
COST_WEIGHT = 0.002      # ASSUMED: J loses 0.002 per USD of gripper cost
COST_CAP = 80.0          # ASSUMED USD cap for the whole gripper
G = 9.81
ACCEL = 9.81             # ASSUMED: transport acceleration of 1 g on top of gravity
SAFETY = 1.5             # ASSUMED: hold force must be 1.5 x the dynamic load


def _population(seed=2468, n=N_ITEM):
    r = np.random.default_rng(seed)
    kind = r.choice(3, size=n, p=[0.5, 0.25, 0.25])            # 0 box, 1 polybag, 2 bottle   ASSUMED mix
    m = np.clip(r.lognormal(np.log(0.6), 0.8, n), 0.05, 5.0)   # mass, kg   ASSUMED
    patch = np.where(kind == 0, r.uniform(60, 300, n),          # flat patch width, mm   ASSUMED
                     np.where(kind == 1, r.uniform(25, 120, n), r.uniform(15, 60, n)))
    length = np.where(kind == 0, patch * r.uniform(1.0, 1.6, n), patch * r.uniform(1.0, 2.5, n))   # longest side, mm
    uneven = np.where(kind == 0, r.uniform(0, 1.5, n),          # surface unevenness a cup must follow, mm   ASSUMED
                      np.where(kind == 1, r.uniform(1, 6, n), r.uniform(2, 5, n)))
    leak0 = np.where(kind == 0, 1.5, np.where(kind == 1, 6.0, 0.5)) * r.uniform(0.7, 1.3, n)   # leak per cup, L/min   ASSUMED
    return dict(kind=kind, m=m, patch=patch, length=length, uneven=uneven, leak0=leak0)


POP = _population()


def cost_usd(x):
    d, n, P, Q, h = x
    n = int(round(n))
    pump = 6.0 + 0.5 * Q + 0.15 * P                              # ASSUMED: bigger pumps cost more
    cups = n * (1.5 + 0.04 * d + 1.5 * h)                        # ASSUMED: bigger, softer cups cost more
    return float(pump + cups + 15.0)                             # 15 USD fixed: mount, valve, tubing, controller share


def evaluate(x, pop=POP):
    x = np.asarray(x, dtype=float)
    d, nf, P, Q, h = x
    n = int(round(nf))
    cost = cost_usd(x)
    p = pop
    # Fit: n cups of diameter d with 20% spacing must sit on the flat patch; cups that do not fit stay off the item.
    k = np.minimum(n, np.floor(p["patch"] / (1.2 * d)))
    fits = k >= 1
    # Leak: a cup that cannot follow the surface leaks more; the pump's flow Q fights the total leak.
    leak = p["leak0"] * (1.0 + np.maximum(0.0, p["uneven"] - 6.0 * h) / 2.0) * (d / 20.0)
    kk = np.maximum(k, 1)
    p_eff = P / (1.0 + kk * leak / Q)                            # kPa actually reached under the cups
    force = p_eff * 1e3 * kk * np.pi * (d / 2e3) ** 2            # N
    tilt = (k == 1) & (p["length"] > 200.0)
    force = np.where(tilt, 0.5 * force, force)                   # one cup under a long item lets it swing
    need = SAFETY * p["m"] * (G + ACCEL)
    held = fits & (force >= need)
    # Pick time: pumping down n cups' volume at flow Q, on top of 0.3 s of arm motion.
    t = 0.3 + 0.8 * n * (d / 20.0) ** 2 / (Q / 20.0)
    wgt = 1.0 / (1.0 + (t / 1.2) ** 4)                           # value of a pick falls past about 1.2 s
    good = held & (wgt >= 0.5)
    slow = held & (wgt < 0.5)
    value = np.where(held, wgt, 0.0)
    J = float(value.mean() - COST_WEIGHT * cost)
    feasible = cost <= COST_CAP
    return dict(x=[float(d), float(n), float(P), float(Q), float(h)],
                J=J if feasible else -1.0, cost=cost, feasible=bool(feasible),
                good=float(good.mean()), slow=float(slow.mean()), weak=float((fits & ~held).mean()),
                nofit=float((~fits).mean()), pick_time_s=float(t), median_vacuum_kpa=float(np.median(p_eff)))
