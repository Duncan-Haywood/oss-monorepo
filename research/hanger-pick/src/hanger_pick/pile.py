"""A tangled dryer load as stacked discs, and three scripted ways to pick garments out of it.

Stylised. Each garment is a disc (its footprint) at a height rank z; its opening (neck or waistband) is a
small disc `OPEN_R` metres across at 0.7 of the garment radius from its centre, in a random direction. With
probability `Params.p_hidden` the opening is hidden by the garment itself (face down, folded in, inside out)
and cannot be seen at all. Otherwise it is *visible* to the extent that it is not under the footprint of a
higher garment. Hidden openings are found only by lifting the garment and regrasping. Real cloth
bunches, folds and knots; none of that is modelled. All times and probabilities in `Params` are assumed
placeholders (nothing here is a measurement of a robot), so results are about how policies rank and how
they depend on the pile, not about seconds.
"""
import math
import random
from dataclasses import dataclass

BIN = 0.60          # side of the square bin the load lies in, metres
SWEEP_DIST = 0.25   # how far a pushed garment moves, metres
OPEN_R = 0.04       # radius of the opening region the gripper must reach
# garment footprint radius in metres by kind (assumed round numbers)
KINDS = {"tee": 0.20, "shirt": 0.22, "trousers": 0.24, "dress": 0.26, "kids": 0.14, "knit": 0.22}


@dataclass
class Garment:
    x: float
    y: float
    r: float
    z: int
    ang: float          # direction of the opening from the centre
    kind: str = "tee"
    hidden: bool = False  # opening hidden by the garment itself

    def opening(self):
        return (self.x + 0.7 * self.r * math.cos(self.ang), self.y + 0.7 * self.r * math.sin(self.ang))


@dataclass
class Params:
    t_see: float = 1.0       # look at the pile and choose, s
    t_grasp: float = 4.0     # reach and close on a point, s
    t_regrasp: float = 6.0   # hang by a low point and regrasp, hunting for the opening, s
    t_sweep: float = 3.0     # push a garment aside, s
    t_drop: float = 3.0      # a second garment came along; return it, s
    q_find: float = 0.35     # chance one regrasp ends with the opening in the gripper
    max_regrasp: int = 6
    p_direct: float = 0.9    # chance a grasp aimed at a visible opening holds it
    theta: float = 0.5       # visible fraction of the opening needed to aim at it
    p_double_each: float = 0.08   # extra chance per garment under the lifted one that one comes along
    p_double_cap: float = 0.5
    max_sweeps: int = 3
    p_hidden: float = 0.4    # chance a garment's opening is hidden by the garment itself


def make_pile(n, rng, p_hidden=0.4, hidden_by_kind=None):
    """`hidden_by_kind` ({kind: chance}) overrides p_hidden for those kinds (used by hanger-kindlink)."""
    kinds = list(KINDS)
    zs = list(range(n))
    rng.shuffle(zs)
    pile = []
    for z in zs:
        k = rng.choice(kinds)
        r = KINDS[k]
        pile.append(Garment(rng.uniform(r * 0.6, BIN - r * 0.6), rng.uniform(r * 0.6, BIN - r * 0.6), r, z,
                            rng.uniform(0, 2 * math.pi), k, rng.random() < (hidden_by_kind or {}).get(k, p_hidden)))
    return pile


def _samples(cx, cy):
    pts = [(cx, cy)]
    for i in range(12):
        a = 2 * math.pi * i / 12
        pts.append((cx + OPEN_R * math.cos(a), cy + OPEN_R * math.sin(a)))
    return pts


def visible(g, pile):
    """Fraction of g's opening region (13 fixed sample points) not under a higher garment's footprint."""
    if g.hidden:
        return 0.0
    above = [h for h in pile if h.z > g.z]
    ox, oy = g.opening()
    pts = _samples(ox, oy)
    free = sum(1 for (px, py) in pts if all(math.hypot(px - h.x, py - h.y) >= h.r for h in above))
    return free / len(pts)


def below_overlap(g, pile):
    """Number of lower garments whose footprint overlaps g's: what lifting g may drag along."""
    return sum(1 for h in pile if h.z < g.z and math.hypot(h.x - g.x, h.y - g.y) < g.r + h.r)


def sweep_top(pile, k, rng):
    """Push the k-th highest garment `SWEEP_DIST` away in a random direction (clamped to the bin), uncovering
    what lay under it. Blind: it needs no knowledge of where any opening is. Returns False if k is past the
    bottom of the pile."""
    order = sorted(pile, key=lambda h: -h.z)
    if k >= len(order):
        return False
    h = order[k]
    a = rng.uniform(0, 2 * math.pi)
    h.x = min(max(h.x + SWEEP_DIST * math.cos(a), 0.0), BIN)
    h.y = min(max(h.y + SWEEP_DIST * math.sin(a), 0.0), BIN)
    return True


def _lift(g, pile, p, rng):
    """Cost of lifting g once it is held, including a second garment coming along."""
    t = 0.0
    n = below_overlap(g, pile)
    pd = min(p.p_double_cap, p.p_double_each * n)
    doubles = 0
    while rng.random() < pd and doubles < 3:
        t += p.t_drop
        doubles += 1
    return t, doubles


def _pinch_top(pile, p, rng):
    g = max(pile, key=lambda h: h.z)
    t = p.t_see + p.t_grasp
    tries = 0
    found = False
    while tries < p.max_regrasp and not found:
        tries += 1
        t += p.t_regrasp
        found = rng.random() < p.q_find
    dt, dbl = _lift(g, pile, p, rng)
    return g, t + dt, dict(direct=False, regrasps=tries, double=dbl, ok=found)


def pick(pile, policy, p, rng):
    """Remove one garment from `pile` by the policy. Returns (time, info). `ok` False means the garment was
    held but its opening was not found within max_regrasp, so it goes aside unhung (time still spent)."""
    if policy == "pinch":
        g, t, info = _pinch_top(pile, p, rng)
    else:
        sweeps = 0
        while True:
            g = max(pile, key=lambda h: visible(h, pile))
            v = visible(g, pile)
            if v >= p.theta:
                break
            if policy == "sweep" and sweeps < p.max_sweeps and sweep_top(pile, sweeps, rng):
                sweeps += 1
                continue
            g, t, info = _pinch_top(pile, p, rng)
            t += sweeps * p.t_sweep
            info["sweeps"] = sweeps
            info["kind"] = g.kind
            pile.remove(g)
            return t, info
        t = p.t_see + sweeps * p.t_sweep + p.t_grasp
        while rng.random() >= p.p_direct:
            t += p.t_grasp
        dt, dbl = _lift(g, pile, p, rng)
        info = dict(direct=True, regrasps=0, double=dbl, ok=True, sweeps=sweeps)
        t += dt
    info.setdefault("sweeps", 0)
    info["kind"] = g.kind
    pile.remove(g)
    return t, info


def unload(n, policy, p, seed):
    """Empty a fresh pile of n garments; return summary numbers."""
    rng = random.Random(seed)
    pile = make_pile(n, rng, p.p_hidden)
    vis0 = sum(visible(g, pile) for g in pile) / n
    total, direct, doubles, fails, sweeps, regrasps = 0.0, 0, 0, 0, 0, 0
    while pile:
        t, info = pick(pile, policy, p, rng)
        total += t
        direct += info["direct"]
        doubles += info["double"]
        fails += not info["ok"]
        sweeps += info["sweeps"]
        regrasps += info["regrasps"]
    return dict(per_item=total / n, direct=direct / n, doubles=doubles / n, fails=fails / n,
                sweeps=sweeps / n, regrasps=regrasps / n, vis0=vis0)
