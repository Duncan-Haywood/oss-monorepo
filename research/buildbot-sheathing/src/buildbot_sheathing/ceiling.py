"""Milestone 10: what the straight-stud ceiling of single-2x joints is made of.

Milestone 9 found that pushing bowed joint studs straight leaves single-2x joints at the clean-sheet
rate they reach on perfectly straight studs (0.74 three-foot rock, 0.81 smooth rock). This module
switches each remaining error source on and off in milestone 5's ledger pipeline
(``tack.simulate``) so the ceiling can be split by Shapley shares, and adds two placement remedies
applied after the sheet is seated and before it is tacked:

* **slide**: the robot reads both sheet edges against its stud estimates and slides the sheet along
  the ledger to centre the gap. The translation left is the mean of two edge reads' errors
  (s_edge / sqrt 2) plus the slide's own residual ``s_slide``.
* **shim**: the robot also reads the left edge near its bottom and top (the end joint-nail heights,
  2.39 m apart) and lifts the low bottom corner on a shim until the edge is plumb. The tilt left is
  the slope error of the two reads plus the shim's height residual ``s_shim`` over the sheet width.

Sources (names used as switches): ``tool`` (per-nail scatter), ``stud`` (stud reads), ``edge``
(edge reads used to aim), ``slide`` (the sheet's translation along the wall), ``ledger`` (laser
slope and corner heights), ``panel`` (PS 2 squareness and the bottom-edge rock).

Units: metres and radians.
"""
import itertools
import math

import numpy as np

from . import bowed_edge as B
from . import cycle as C
from . import ledger as L
from . import tack as K
from .asbuilt import Band
from .budget import EDGE, GAP, R, Z_JOINT, Z_FIELD, plate_halves

MM = 1e-3
SOURCES = ("tool", "stud", "edge", "slide", "ledger", "panel")
POSE = ("slide", "ledger", "panel")
S_EDGE = 0.5 * MM
S_READ = 0.5 * MM
S_X = 1.0 * MM
EDGE_SPAN = float(Z_JOINT[-1] - Z_JOINT[0])      # two edge reads for the shim, 2.39 m apart


def theta_draw(ledger=True, panel=True, rock_draw=None, shim=None, s_edge=S_EDGE):
    """Tilt draw (rng, n) -> rad. ``shim`` (a corner-height residual, m) replaces ledger and
    panel tilt by what a plumbing shim leaves: two edge reads' slope error plus s_shim / W."""
    def f(rng, n):
        if shim is not None:
            t = rng.normal(0, math.sqrt(2) * s_edge / EDGE_SPAN, n) if s_edge > 0 else np.zeros(n)
            return t + (rng.normal(0, shim / L.W, n) if shim > 0 else 0.0)
        t = np.zeros(n)                       # panel first, then ledger: milestone 5's draw order
        if panel:
            t = t + (L.panel_tilt(rng, n) if rock_draw is None else B.panel_tilt(rng, n, rock_draw))
        if ledger:
            t = t + L.ledger_tilt(rng, n)
        return t
    return f


def slide_sx(s_slide, s_edge=S_EDGE):
    """Translation left after the slide: two edge reads averaged plus the slide residual."""
    return math.hypot(s_edge / math.sqrt(2), s_slide)


def clean(on=SOURCES, *, framing="2x", warp="straight", policy="three", rock_draw=None,
          slide=None, shim=None, s_robot=C.S_ROBOT, straighten=None, trials=20000, seed=7,
          profiles=None):
    """Clean sheets and missed nails with only the sources in ``on`` switched on.
    ``slide``/``shim`` (residuals, m) apply the remedies; they replace the slide translation and
    the ledger/panel tilt respectively, and keep the edge reads they rely on. ``profiles``
    (milestone 11's measured studs, ``tack.simulate``) replaces the warp draw."""
    on = set(on)
    s_edge = S_EDGE if "edge" in on else 0.0
    if slide is not None:
        s_x = slide_sx(slide, S_EDGE)
    else:
        s_x = S_X if "slide" in on else 0.0
    td = theta_draw("ledger" in on, "panel" in on, rock_draw, shim, S_EDGE)
    kw = dict(trials=trials, seed=seed, policy=policy, band=C.band(), joint_band=C.band(C.FRAMING[framing]),
              s_robot=s_robot if "tool" in on else 0.0, s_read=S_READ if "stud" in on else 0.0,
              s_edge=s_edge, s_x=s_x, aim="edge", theta_draw=td, straighten=straighten, profiles=profiles,
              **({} if profiles is not None else C.WARP[warp]))
    r = K.simulate(**kw)
    return {"clean": r["clean"], "missed": r["missed"]}


def shapley(value, players):
    """Exact Shapley values of a set function value(frozenset) over ``players``."""
    players = tuple(players)
    n = len(players)
    cache = {}

    def v(s):
        if s not in cache:
            cache[s] = value(s)
        return cache[s]

    phi = {}
    for p in players:
        others = [q for q in players if q != p]
        tot = 0.0
        for k in range(n):
            w = math.factorial(k) * math.factorial(n - k - 1) / math.factorial(n)
            for s in itertools.combinations(others, k):
                s = frozenset(s)
                tot += w * (v(s | {p}) - v(s))
        phi[p] = tot
    return phi, cache


def _ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def tool_only_closed_form(s_robot=C.S_ROBOT, band=None):
    """P(all 62 nails in) with only tool scatter, a perfectly placed sheet and exact studs
    (milestone 1's windows, with milestone 2's nailable band): the product over nails of
    P(aim + N(0, s) inside the window)."""
    band = Band() if band is None else band
    blo, bhi = (float(v) for v in band(0.0))
    hj = Band().face / 2 - R
    # left joint: window [GAP/2 + EDGE, bhi], aim midway between the measured edge + EDGE and hj
    lo, hi = GAP / 2 + EDGE, bhi
    aim = (lo + hj) / 2
    p_joint = _ncdf((hi - aim) / s_robot) - _ncdf((lo - aim) / s_robot)
    p_field = _ncdf(bhi / s_robot) - _ncdf(blo / s_robot)
    p = p_joint ** (2 * len(Z_JOINT)) * p_field ** (2 * len(Z_FIELD))
    for h in plate_halves():
        p *= 2 * _ncdf(h / s_robot) - 1
    return p
