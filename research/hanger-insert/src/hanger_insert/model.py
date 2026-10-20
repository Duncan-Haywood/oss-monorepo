"""Getting the hanger in: a swept-section model of a hanger passing through a garment opening.

The hanger is a set of capsules in its own plane (cm): two arms from the apex, each a segment
of radius r (the arm half-thickness, as in `hanger_fit`), and a thin hook stub rising from the
apex. The garment's neck (or hem) is a closed loop of cloth. A loop that encloses a rigid body
needs at least the perimeter of the convex hull of the body's cross-section there, so the
loop is a plane that cuts the hanger along a line, and the cross-section is that chord of
length l (in the hanger's plane) by the bar thickness T = 2 r (out of it):

    P_req = 2 max(l, T) + (pi - 2) T       (a stadium; 0 if the plane misses the hanger)

The robot moves the hanger relative to the loop: the plane's offset s along a direction n,
and the tilt alpha of n in the hanger's plane (alpha = 0: along the arm axis, "end on";
alpha = 90: along the hook, the final state with the loop on the stub). A planner searches
the (s, alpha) grid for the path that starts clear of the hanger and ends with the loop on
the stub, either the one with the smallest peak P_req (the stretch the neck must give) or the
fastest one whose peak stays under what the neck allows.

Everything here is geometry and assumed constants, not a cloth simulation: the loop is free
to take whatever shape its perimeter allows, so P_req is a lower bound. `experiments/run.py`
shows which results depend on which constant.
"""
from dataclasses import dataclass, replace
from functools import lru_cache
import heapq
import math

import numpy as np

STUB_H = 5.0         # cm, hook stub height above the apex (assumed)
STUB_R = 0.4         # cm, hook wire radius (assumed)
S_START = -30.0      # cm, where the loop starts along n: clear of every hanger here
GRID_S = 0.5         # cm
GRID_A = 2.0         # degrees
STEP_T = 0.25        # cm, sampling along a cutting line
V_TRANS = 15.0       # cm/s, translation speed of the hanger relative to the garment (assumed)
V_ROT = 60.0         # deg/s, rotation speed (assumed)


@dataclass(frozen=True)
class Hanger:
    w: float          # cm, half width to the outer end of the arm
    slope: float      # degrees, arm below horizontal
    r: float          # cm, arm half-thickness = end radius
    w_collapsed: float = None   # cm, half width while inserting (telescoping hanger), None = rigid
    fold: float = 0.0           # degrees the arms hinge down while inserting (collapsible), 0 = rigid
    t_mech: float = 0.0         # s to open it again once the loop is on the hook (assumed)

    def inserting(self):
        """The shape that goes through the opening."""
        w = self.w if self.w_collapsed is None else self.w_collapsed
        return replace(self, w=w, slope=self.slope + self.fold)


def capsules(h):
    """Arms and hook stub as (p0, p1, r) in cm, apex at the origin, hook up."""
    L = max(h.w - h.r, 0.0)
    t = math.radians(h.slope)
    tip = np.array([L * math.cos(t), -L * math.sin(t)])
    z = np.zeros(2)
    return [(z, tip, h.r), (z, tip * [-1.0, 1.0], h.r), (z, np.array([0.0, STUB_H]), STUB_R)]


def _dist_seg(P, a, b):
    ab = b - a
    n = float(ab @ ab)
    u = np.zeros(P.shape[:-1]) if n == 0 else np.clip(((P - a) @ ab) / n, 0.0, 1.0)
    return np.linalg.norm(P - (a + u[..., None] * ab), axis=-1)


def stadium(l, T):
    """Perimeter of the smallest loop round a chord l by bar thickness T (0 when nothing is cut)."""
    if l <= 0.0:
        return 0.0
    return 2.0 * max(l, T) + (math.pi - 2.0) * T


def sections(h, s, alpha):
    """P_req for the loop plane at offset s (cm) and tilt alpha (deg): arrays broadcast together.

    The plane is {p : n.p = s}, n = (cos a, sin a) in the hanger's (lateral, up) coordinates;
    the cut is sampled every STEP_T cm along the line, and a miss is P_req = 0.
    """
    caps = capsules(h)
    s, alpha = np.broadcast_arrays(np.asarray(s, float), np.asarray(alpha, float))
    a = np.radians(alpha)
    n = np.stack([np.cos(a), np.sin(a)], -1)
    u = np.stack([-np.sin(a), np.cos(a)], -1)
    R = h.w + h.r + STUB_H + 4.0
    t = np.arange(-R, R + STEP_T / 2, STEP_T)
    P = s[..., None, None] * n[..., None, :] + t[:, None] * u[..., None, :]
    lo = np.full(s.shape, np.inf)
    hi = np.full(s.shape, -np.inf)
    thick = np.zeros(s.shape)
    for p0, p1, r in caps:
        inside = _dist_seg(P, p0, p1) <= r
        hit = inside.any(-1)
        lo = np.where(hit, np.minimum(lo, t[inside.argmax(-1)]), lo)
        hi = np.where(hit, np.maximum(hi, t[inside.shape[-1] - 1 - inside[..., ::-1].argmax(-1)]), hi)
        thick = np.where(hit, np.maximum(thick, 2.0 * r), thick)
    chord = np.where(np.isfinite(lo), hi - lo + STEP_T, 0.0)
    out = np.where(chord > 0, 2.0 * np.maximum(chord, thick) + (math.pi - 2.0) * thick, 0.0)
    return out


class Grid:
    """The (s, alpha) configuration grid of one inserting hanger shape."""

    def __init__(self, h):
        self.h = h
        self._peak = None
        self.s = np.arange(S_START, h.w + h.r + STUB_H + 4.0 + 1e-9, GRID_S)
        self.al = np.arange(0.0, 90.0 + 1e-9, GRID_A)
        self.P = sections(h.inserting(), self.s[:, None], self.al[None, :])
        self.goal = (int(np.argmin(np.abs(self.s - STUB_H / 2))), len(self.al) - 1)
        # The garment body hangs on the far side of the loop: a path may not carry the loop clear
        # past the whole hanger and back, so cells where the plane is beyond the hanger are blocked.
        n = np.stack([np.cos(np.radians(self.al)), np.sin(np.radians(self.al))], -1)
        far = np.max([n @ p + r for c in capsules(h.inserting())
                      for p, r in ((c[0], c[2]), (c[1], c[2]))], axis=0)
        self.P = np.where(self.s[:, None] <= far[None, :] + 1e-9, self.P, np.inf)
        # Conservative: each cell takes the largest P_req among itself and its 8 neighbours, so a
        # path cannot squeeze through a gap narrower than a grid cell (such gaps appeared and
        # vanished with the third decimal of r). It overstates the peak by at most one cell.
        pad = np.pad(self.P, 1, mode="edge")
        self.P = np.max([pad[1 + di:1 + di + self.P.shape[0], 1 + dj:1 + dj + self.P.shape[1]]
                         for di in (-1, 0, 1) for dj in (-1, 0, 1)], axis=0)

    def _nbrs(self, i, j):
        # four neighbours only: an eight-neighbour path can cut the corner between two blocked
        # cells and slip through a thin barrier. One axis moves at a time, so time is summed.
        for di, dj in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            if 0 <= i + di < len(self.s) and 0 <= j + dj < len(self.al):
                yield i + di, j + dj, abs(di) * GRID_S / V_TRANS + abs(dj) * GRID_A / V_ROT

    def min_peak(self):
        """Smallest possible peak P_req (cm) over paths from the start row to the stub, and that path."""
        if self._peak is None:
            self._peak = self._min_peak()
        return self._peak

    def _min_peak(self):
        best = {(0, j): self.P[0, j] for j in range(len(self.al))}
        prev, pq = {}, [(v, k) for k, v in best.items()]
        heapq.heapify(pq)
        while pq:
            v, (i, j) = heapq.heappop(pq)
            if v > best.get((i, j), math.inf):
                continue
            if (i, j) == self.goal:
                break
            for a, b, _ in self._nbrs(i, j):
                nv = max(v, self.P[a, b])
                if nv < best.get((a, b), math.inf):
                    best[(a, b)], prev[(a, b)] = nv, (i, j)
                    heapq.heappush(pq, (nv, (a, b)))
        return best[self.goal], self._path(prev, self.goal)

    def fastest(self, cap):
        """Shortest time (s) of a path whose P_req never exceeds cap, with that path; (None, None) if none."""
        best = {(0, j): 0.0 for j in range(len(self.al)) if self.P[0, j] <= cap}
        prev, pq = {}, [(0.0, k) for k in best]
        heapq.heapify(pq)
        while pq:
            d, (i, j) = heapq.heappop(pq)
            if d > best.get((i, j), math.inf):
                continue
            if (i, j) == self.goal:
                return d, self._path(prev, self.goal)
            for a, b, c in self._nbrs(i, j):
                if self.P[a, b] <= cap and d + c < best.get((a, b), math.inf):
                    best[(a, b)], prev[(a, b)] = d + c, (i, j)
                    heapq.heappush(pq, (d + c, (a, b)))
        return None, None

    def _path(self, prev, node):
        out = [node]
        while node in prev:
            node = prev[node]
            out.append(node)
        return [(float(self.s[i]), float(self.al[j])) for i, j in reversed(out)]


@lru_cache(maxsize=None)
def grid_for(h):
    return Grid(h)


# --- garments, grippers, alignment ---------------------------------------------------------

# Stretch the neck may take before it is permanently lengthened (assumed): knit necks are
# ribbed, a buttoned woven collar hardly gives. Neck and hem perimeters scale with half shoulder.
GARMENTS = {
    #           eps_max  neck perimeter / half shoulder  hem perimeter / half shoulder
    "tee":     dict(eps_max=0.35, neck=2.4, hem=4.5),
    "shirt":   dict(eps_max=0.03, neck=1.8, hem=4.8),
    "sweater": dict(eps_max=0.25, neck=2.3, hem=4.6),
}
GRIP_LEN = 3.0          # cm of loop each gripper holds, unavailable to the hanger (assumed)
OPEN_FRAC = {1: 0.4, 2: 0.9}   # opening width as a share of the flat width P/2: one gripper lets it hang
SIGMA = 1.5             # cm, 1-sigma lateral error of the hanger tip against the opening, with vision (assumed)
SIGMA_BLIND = 2.0       # cm, error threading the hook out of the neck from inside the garment (assumed)
ATTEMPTS = 3
T_FIXED = 2.0           # s, grasp the garment and the hanger (assumed)
T_ATTEMPT = 1.5         # s per approach attempt
T_THREAD = 4.0          # s per hook-threading attempt


def p_enter(width, tip, sigma):
    """P(the tip lands inside an opening `width` wide): |error| <= (width - tip) / 2, error ~ N(0, sigma)."""
    margin = (width - tip) / 2.0
    return math.erf(margin / (sigma * math.sqrt(2.0))) if margin > 0 else 0.0


def expected_attempts(p, n=ATTEMPTS):
    return sum((1.0 - p) ** k for k in range(n))


def attempt(h, hs, fabric, route="neck", grippers=2, sigma=SIGMA, grid=None, **kw):
    """Insert hanger h into a garment of half shoulder hs (cm): success probability and expected time.

    route "neck": the hanger goes through the neck loop, `grippers` hold it open.
    route "hem": through the hem, then the hook is threaded out of the neck, blind.
    kw overrides the module constants (grip_len, open_frac, sigma_blind, eps_max) for sweeps.
    """
    g = GARMENTS[fabric]
    eps = kw.get("eps_max", g["eps_max"])
    grip = kw.get("grip_len", GRIP_LEN)
    frac = kw.get("open_frac", OPEN_FRAC)
    grid = grid or grid_for(h)
    P0 = g["neck"] * hs if route == "neck" else g["hem"] * hs
    cap = P0 * (1.0 + (eps if route == "neck" else 0.3)) - grippers * grip
    peak, _ = grid.min_peak()
    out = dict(route=route, hanger_peak=peak, neck_strain=max(0.0, (peak + grippers * grip) / P0 - 1.0),
               p_success=0.0, time=None)
    t_path, _ = grid.fastest(cap)
    if t_path is None:
        return out
    tip = 2.0 * h.r
    p_in = p_enter(frac[grippers] * P0 / 2.0, tip, sigma)
    t = T_FIXED + t_path + expected_attempts(p_in) * T_ATTEMPT + h.t_mech
    p = 1.0 - (1.0 - p_in) ** ATTEMPTS
    if route == "hem":
        Pn = g["neck"] * hs
        p_th = p_enter(frac[1] * Pn / 2.0, 2.0 * STUB_R, kw.get("sigma_blind", SIGMA_BLIND))
        t += expected_attempts(p_th) * T_THREAD
        p *= 1.0 - (1.0 - p_th) ** ATTEMPTS
    out.update(p_success=p, time=t)
    return out


def best_route(h, hs, fabric, **kw):
    """The better of the neck and hem routes by success probability (ties: faster)."""
    grid = grid_for(h)
    rs = [attempt(h, hs, fabric, route=r, grid=grid, **kw) for r in ("neck", "hem")]
    return max(rs, key=lambda x: (round(x["p_success"], 6), -(x["time"] or 1e9)))
