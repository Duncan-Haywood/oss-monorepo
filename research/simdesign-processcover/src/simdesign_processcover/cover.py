"""Geometric coverage of a part family by shop processes.

The rule values are those of ``research/simdesign-dfm`` (``dfm.py``), which are ASSUMED round numbers.
No finite elements are used. A part is a feature triple (w arm width, r inner fillet, b depth; mm) and,
optionally, a tip load F (N) on an 80 mm arm. A process "covers" it when every geometric rule holds
and, if a load is given, a cantilever-beam check passes: bending stress 6 F L / (b w^2) at most the
material's working stress, and tip deflection F L^3 / (3 E I) at most 4 mm. The beam check ignores
the fillet stress concentration that ``simdesign-bracket`` and ``simdesign-dfm`` found to matter.
Stock thickness is read as: the depth must be within ``STOCK_TOL`` above a listed stock thickness,
or equal to it (assumed tolerance; the dfm project instead searches over the stock list).
"""
from dataclasses import dataclass
import numpy as np

MIN_WALL_ANY = 1.2
MAX_SLENDER = 8.0
STOCK_TOL = 0.10          # relative: |b - nearest stock| / b <= 10 % (ASSUMED)
ARM_L = 80.0              # mm, from simdesign-bracket / simdesign-dfm
TIP_LIMIT = 4.0           # mm, from simdesign-dfm
F_RANGE = (1.0, 1000.0)   # N, log-uniform load requirement (ASSUMED family)
BOUNDS = {"w": (2.0, 25.0), "r": (0.0, 15.0), "b": (1.0, 30.0)}   # from simdesign-dfm


@dataclass(frozen=True)
class Process:
    name: str
    b_stock: tuple = ()
    r_min: float = 0.0
    w_min: float = MIN_WALL_ANY
    b_max: float = 30.0
    web_ratio: float = 0.0      # laser: w >= web_ratio * b
    draft_deg: float = 0.0
    wall_ratio_max: float = 0.0
    E: float = 3000.0           # MPa, material values as in simdesign-dfm (ASSUMED there)
    sigma: float = 20.0         # MPa working stress


PROCESSES = {
    "fdm": Process("FDM", E=3000.0, sigma=20.0),
    "cnc": Process("CNC routing", b_stock=(3, 4, 5, 6, 8, 10, 12, 16, 20, 25), r_min=3.175, w_min=6.35, b_max=19.05, E=69000.0, sigma=100.0),
    "laser": Process("laser cutting", b_stock=(1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12), r_min=0.2, w_min=3.0, b_max=12.0, web_ratio=1.0, E=200000.0, sigma=100.0),
    "cast": Process("casting", r_min=3.0, w_min=3.0, draft_deg=1.5, wall_ratio_max=3.0, E=72000.0, sigma=50.0),
}


def sample_parts(n, seed=0, kind="log", load=False):
    """Feature triples (n, 3) columns w, r, b. kind: 'log' log-uniform w, b and uniform r over BOUNDS;
    'small' / 'large' shift the log-uniform ranges to the lower / upper half (a sensitivity check)."""
    rng = np.random.default_rng(seed)
    lw, hw = np.log(BOUNDS["w"][0]), np.log(BOUNDS["w"][1])
    lb, hb = np.log(BOUNDS["b"][0]), np.log(BOUNDS["b"][1])
    if kind == "small":
        hw, hb = (lw + hw) / 2, (lb + hb) / 2
    elif kind == "large":
        lw, lb = (lw + hw) / 2, (lb + hb) / 2
    elif kind != "log":
        raise ValueError(kind)
    w = np.exp(rng.uniform(lw, hw, n))
    b = np.exp(rng.uniform(lb, hb, n))
    r = rng.uniform(*BOUNDS["r"], n)
    cols = [w, r, b]
    if load:
        cols.append(np.exp(rng.uniform(np.log(F_RANGE[0]), np.log(F_RANGE[1]), n)))
    return np.column_stack(cols)


def feasible(proc, parts):
    """Boolean mask: parts (n,3) that satisfy every geometric rule of ``proc``."""
    w, r, b = parts[:, 0], parts[:, 1], parts[:, 2]
    d = 0.5 * b * np.tan(np.radians(proc.draft_deg))     # casting: narrowest section at the faces
    wa, ra = w - 2 * d, r + d
    ok = (wa >= max(proc.w_min, MIN_WALL_ANY)) & (b >= MIN_WALL_ANY) & (wa / b <= MAX_SLENDER)
    ok &= (b <= proc.b_max)
    if proc.r_min > 0:
        ok &= r >= proc.r_min
    if proc.b_stock:
        s = np.array(proc.b_stock, float)
        ok &= np.min(np.abs(b[:, None] - s[None, :]), axis=1) / b <= STOCK_TOL
    if proc.web_ratio:
        ok &= w >= proc.web_ratio * b
    if proc.wall_ratio_max:
        ok &= np.maximum(w, b) / np.minimum(w, b) <= proc.wall_ratio_max
    if parts.shape[1] > 3:
        F = parts[:, 3]
        I = b * wa ** 3 / 12.0                       # second moment of the arm section, narrowest section
        ok &= 6.0 * F * ARM_L / (b * np.maximum(wa, 1e-9) ** 2) <= proc.sigma
        ok &= F * ARM_L ** 3 / (3.0 * proc.E * np.maximum(I, 1e-9)) <= TIP_LIMIT
    return ok


def coverage(procs, parts):
    """Share of parts makeable by at least one process in ``procs`` (names)."""
    m = np.zeros(len(parts), bool)
    for p in procs:
        m |= feasible(PROCESSES[p], parts)
    return float(m.mean())


def shop_value(parts):
    """Value function for selfrep_nextmachine.select: process set -> coverage."""
    cache = {}

    def value(ps):
        key = frozenset(ps)
        if key not in cache:
            cache[key] = coverage(key, parts)
        return cache[key]
    return value
