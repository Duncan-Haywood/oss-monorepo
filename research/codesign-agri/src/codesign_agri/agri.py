"""Stylised soft-fruit (strawberry-like) picking gripper: pad contact pressure against a bruise threshold, friction
hold against stem pull, capture window against placement error. Every constant marked ASSUMED is a round number
chosen for this study, not a measurement of any fruit, pad material or servo.

Design x = [w, l, E, Fg, n]
  w   pad width, mm           (4 .. 25)
  l   pad (finger) length, mm (10 .. 40)
  E   pad modulus, MPa        (0.1 .. 10, searched on a log scale)
  Fg  total grip force, N     (0.5 .. 8)
  n   fingers                 (2 .. 4, rounded to an integer)
A fixed population of N_FRUIT fruit (common random numbers) scores every design, so evaluation is noise-free.
"""
import numpy as np

LB = [4.0, 10.0, 0.1, 0.5, 2.0]
UB = [25.0, 40.0, 10.0, 8.0, 4.0]
N_FRUIT = 600
VALUE_BRUISED = 0.2      # ASSUMED: a bruised but held fruit is worth 0.2 of a clean one (juice grade)
COST_WEIGHT = 0.002      # ASSUMED: J loses 0.002 per USD of gripper cost
COST_CAP = 60.0          # ASSUMED USD cap for the whole gripper


def _population(seed=12345, n=N_FRUIT):
    r = np.random.default_rng(seed)
    d = np.clip(r.normal(28.0, 5.0, n), 15.0, 45.0)            # diameter, mm   ASSUMED
    ripe = r.random(n)                                          # 0 firm .. 1 very ripe
    p_bruise = 110e3 - 70e3 * ripe                              # bruise pressure, Pa   ASSUMED 40..110 kPa
    f_detach = np.clip(r.lognormal(np.log(3.5), 0.3, n) * (1.2 - 0.5 * ripe), 0.5, None)   # stem pull-off, N   ASSUMED
    e = np.abs(r.normal(0.0, 4.0, n))                           # placement error, mm   ASSUMED
    wet = r.random(n) < 0.3                                     # wet fruit has lower friction   ASSUMED
    mu0 = np.where(wet, 0.35, 0.8) * r.uniform(0.85, 1.15, n)
    clutter = r.random(n)                                       # uniform draw against collision probability
    return dict(d=d, ripe=ripe, pb=p_bruise, fd=f_detach, e=e, mu0=mu0, clutter=clutter)


POP = _population()


def cost_usd(x):
    w, l, E, Fg, n = x
    n = int(round(n))
    servo = 4.0 + 4.0 * Fg                                     # ASSUMED: stronger servo costs more
    plastic = n * w * l * 0.004 * (1.0 + 0.3 * np.log10(E / 0.1))   # ASSUMED: stiffer pad material costs more
    return float(servo + plastic + 8.0)                        # 8 USD fixed: mount, wiring, controller share


def evaluate(x, pop=POP):
    x = np.asarray(x, dtype=float)
    w, l, E, Fg, nf = x
    n = int(round(nf))
    cost = cost_usd(x)
    p = pop
    R = p["d"] / 2e3                                            # fruit radius, m
    Ff = Fg / n                                                 # grip force per finger, N
    Es = E * 1e6 / 0.75                                         # plane-strain modulus, Pa (pad v = 0.5, fruit rigid)
    wm, lm = w / 1e3, l / 1e3
    # Capture: opening grows with finger length; clutter (leaves, neighbours) grows with fingers x length.
    opening = 15.0 + 1.4 * l
    captured = (p["d"] + 2 * p["e"]) <= opening
    collide = p["clutter"] < 1.0 - np.exp(-n * l / 400.0)
    # Contact: line contact half-length a, capped by pad length (bottoming raises edge pressure 1.5x).
    a = np.sqrt(4 * Ff * R / (np.pi * Es * wm))
    bottom = a >= lm / 2
    a = np.minimum(a, lm / 2)
    # First finger to touch takes extra load unless pad deflection a^2/R absorbs the placement error.
    deflect = a ** 2 / R * 1e3                                  # mm
    kload = 1.0 + np.maximum(0.0, p["e"] - deflect) / (p["d"] / 2.0)
    pressure = kload * Ff / (2 * a * wm) * np.where(bottom, 1.5, 1.0)
    bruised = pressure > p["pb"]
    # Hold: friction (tackier when soft), a caging bonus for long fingers on 3+ fingers, loss when the pad shears.
    mu = p["mu0"] * (1.0 + 0.5 * (1.0 - E / (E + 1.0)))
    cage = 1.0 + 0.6 * np.minimum(1.0, l / p["d"]) * (n - 2) / 2.0
    gamma = p["fd"] / ((E * 1e6 / 3.0) * wm * lm)               # pad shear strain under the pull
    hold = mu * Fg * cage / (1.0 + (gamma / 0.6) ** 2)
    slipped = hold < 1.1 * p["fd"]
    missed = (~captured) | collide
    held = (~missed) & (~slipped)
    good = held & (~bruised)
    soft = held & bruised
    value = np.where(good, 1.0, np.where(soft, VALUE_BRUISED, 0.0))
    J = float(value.mean() - COST_WEIGHT * cost)
    feasible = cost <= COST_CAP
    return dict(x=[float(v) for v in x[:4]] + [n], J=J if feasible else -1.0, cost=cost, feasible=bool(feasible),
                good=float(good.mean()), bruised=float(soft.mean()), slipped=float((~missed & slipped).mean()),
                missed=float(missed.mean()), collided=float(collide.mean()), median_pressure_kpa=float(np.median(pressure) / 1e3))
