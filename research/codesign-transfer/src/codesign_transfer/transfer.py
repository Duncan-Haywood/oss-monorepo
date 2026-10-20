"""Transfer of soft-fruit gripper designs across shifted worlds. Reuses the contact model of research/codesign-agri
(`evaluate(x, pop)`) and widens what it holds fixed: fruit size, placement error, wetness, bruise threshold and stem
pull are drawn per world, and the *built* gripper differs from the design (pad modulus, grip force and pad width
tolerance). Every range is ASSUMED, written for this study. Sim-to-sim only: no real fruit or print was measured."""
import os, sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "codesign-agri", "src"))
from codesign_agri import agri as A  # noqa: E402

LB, UB = np.array(A.LB), np.array(A.UB)


def phys(u):
    """Unit cube -> design [w, l, E, Fg, n]; E on a log scale, n rounded."""
    u = np.clip(np.asarray(u, float), 0, 1)
    x = LB + u * (UB - LB)
    x[2] = LB[2] * (UB[2] / LB[2]) ** u[2]
    x[4] = round(x[4])
    return x


def draw_world(seed, width=1.0):
    """World parameters; width 0 is the nominal world of codesign-agri, 1 the full assumed spread."""
    r = np.random.default_rng(seed)
    lerp = lambda nominal, lo, hi: nominal + width * (r.uniform(lo, hi) - nominal)
    return dict(seed=int(seed),
                d_mean=lerp(28.0, 24.0, 32.0), e_sd=lerp(4.0, 3.0, 8.0), wet=lerp(0.3, 0.1, 0.6),
                p_scale=lerp(1.0, 0.7, 1.2), f_scale=lerp(1.0, 0.8, 1.4),
                tol_E=0.3 * width, tol_F=0.15 * width, tol_w=0.4 * width)


def population(world, n=A.N_FRUIT):
    """Same generator as codesign_agri._population, with the world's shifts."""
    r = np.random.default_rng(world["seed"] + 1000)
    d = np.clip(r.normal(world["d_mean"], 5.0, n), 15.0, 45.0)
    ripe = r.random(n)
    pb = (110e3 - 70e3 * ripe) * world["p_scale"]
    fd = np.clip(r.lognormal(np.log(3.5), 0.3, n) * (1.2 - 0.5 * ripe) * world["f_scale"], 0.5, None)
    e = np.abs(r.normal(0.0, world["e_sd"], n))
    wet = r.random(n) < world["wet"]
    mu0 = np.where(wet, 0.35, 0.8) * r.uniform(0.85, 1.15, n)
    return dict(d=d, ripe=ripe, pb=pb, fd=fd, e=e, mu0=mu0, clutter=r.random(n))


def build(x, world, k=0):
    """The gripper that is actually printed from design x: tolerances on modulus, force and pad width."""
    r = np.random.default_rng(world["seed"] * 7919 + 13 + k)
    x = np.array(x, float).copy()
    x[2] *= float(np.exp(r.normal(0, world["tol_E"])))
    x[3] *= float(1 + r.normal(0, world["tol_F"]))
    x[0] = max(1.0, x[0] + float(r.normal(0, world["tol_w"])))
    return x


def _j(r):
    """J of a printed copy from its outcome shares, so a copy that lands a few cents over the cap is not scored -1."""
    return r["good"] + A.VALUE_BRUISED * r["bruised"] - A.COST_WEIGHT * r["cost"]


def score(x, world, pop=None, builds=3):
    """Mean J over `builds` printed copies of design x in one world. The 60 USD cap is judged on the design."""
    if A.cost_usd(x) > A.COST_CAP:
        return -1.0
    pop = pop if pop is not None else population(world)
    return float(np.mean([_j(A.evaluate(build(x, world, k), pop)) for k in range(builds)]))
