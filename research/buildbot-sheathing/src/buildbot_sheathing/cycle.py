"""Milestone 5: the whole cycle, in seconds per sheet and clean sheets.

Milestones 1 to 4 scored one stage each on the clean-sheet rate; `buildbot-mobilebase`,
`buildbot-nailseq` and `buildbot-custom` timed the nailing alone. This module puts the stages in
one steady-state cycle along a row of sheets:

1. **place**: a lift (or a person) stands the sheet on a laser-set ledger; the robot slides it to
   its stud line and presses lightly, so it seats (milestone 3). Two tacks freeze it. The tilt is
   milestone 3's draw (laser rating, ledger height error at each corner, PS 2 panel geometry); a
   translation s_x is left after the slide. The *lift-tack* alternative has no ledger: the lift
   hangs the sheet to a Gaussian (s_theta, s_x) and the robot tacks it (milestone 4).
2. **sense**: the robot reads each new stud (three a sheet in a row: the left joint stud was read
   for the last sheet) with the sensing policy, and both sheet edges.
3. **nail**: 62 nails with edge aim (milestones 1 and 4), moves and re-stancing timed by
   `buildbot-mobilebase`. Recoil either is waited out (`buildbot-nailseq`: 2.4 s a sheet on a fast
   arm at 4 N s, none on a slow one) or the next nail fires at once and the left-over tip error
   (at most 0.37 mm at 4 N s) joins the tool scatter in quadrature.
4. **rework**: every missed nail is found and a new one driven beside it, t_fix each.

Doubled joint framing adds one stud a sheet (the framing time t_frame).

Clean sheets and missed nails come from `tack.simulate`; this module adds the stage seconds.
Units: metres, radians, seconds.
"""
import math

import numpy as np

from . import ledger as L
from . import tack as K
from .asbuilt import READ_U, Band
from .budget import IN

MM = 1e-3
NEW_STUDS = 3                  # studs read per sheet in a row (one joint stud is shared)
EDGE_READS = 2                 # both sheet edges are measured after tacking
S_ROBOT = 0.9 * MM             # tool scatter (buildbot-fasten)
RECOIL_RESIDUAL = 0.37 * MM    # largest tip error left at the next nail, 4 N s, no wait (buildbot-nailseq)
WAIT_FAST = 2.4                # s a sheet added by waiting out a 4 N s recoil on a fast arm (buildbot-nailseq)

FRAMING = {"2x": None, "2x2x": 3.0 * IN}
WARP = {"low": dict(bow_mean=0.11 * IN, twist_mean=0.08 * IN),
        "high": dict(bow_mean=0.21 * IN, twist_mean=0.16 * IN),
        "straight": {}}
_BANDS = {}


def band(face=None):
    """Band lookup tables are slow to build; cache them by face width."""
    key = face
    if key not in _BANDS:
        _BANDS[key] = Band() if face is None else Band(face=face)
    return _BANDS[key]


def reads_per_sheet(policy):
    return NEW_STUDS * len(READ_U[policy]) + EDGE_READS


def tool_scatter(recoil):
    """Per-nail tool scatter: 'none' and 'wait' leave the 0.9 mm; 'nowait' adds the residual."""
    if recoil == "nowait":
        return math.hypot(S_ROBOT, RECOIL_RESIDUAL)
    if recoil in ("none", "wait"):
        return S_ROBOT
    raise ValueError(recoil)


def ledger_draw(s_corner=0.5 * MM, panel_frac=1.0):
    def f(rng, n):
        return L.ledger_tilt(rng, n, s_corner=s_corner) + L.panel_tilt(rng, n, panel_frac, panel_frac)
    return f


def clean_cell(framing="2x2x", policy="single", placement="ledger", warp="low", recoil="none",
               s_x=1 * MM, s_theta=math.radians(0.25), s_corner=0.5 * MM, panel_frac=1.0,
               trials=20000, seed=7, s_read=0.5 * MM, s_edge=0.5 * MM):
    """First-pass clean sheets and missed nails for one pipeline (milestone 4's model)."""
    kw = dict(trials=trials, seed=seed, policy=policy, band=band(), joint_band=band(FRAMING[framing]),
              s_robot=tool_scatter(recoil), s_read=s_read, s_edge=s_edge, s_x=s_x, aim="edge",
              **WARP[warp])
    if placement == "ledger":
        kw["theta_draw"] = ledger_draw(s_corner, panel_frac)
    elif placement == "lift-tack":
        kw["s_theta"] = s_theta
    else:
        raise ValueError(placement)
    r = K.simulate(**kw)
    return {"clean": r["clean"], "missed": r["missed"], "feasible": r["feasible"]}


def seconds(missed, *, policy, framing, placement="ledger", recoil="none", t_nail=54.0,
            fast_arm=True, t_place=30.0, t_ledger=10.0, t_read=2.0, t_fix=30.0, t_frame=0.0):
    """Seconds a sheet by stage. t_nail is buildbot-mobilebase's nailing with moves and settles."""
    out = {
        "place": t_place + (t_ledger if placement == "ledger" else 0.0),
        "sense": reads_per_sheet(policy) * t_read,
        "nail": t_nail + (WAIT_FAST if (recoil == "wait" and fast_arm) else 0.0),
        "rework": missed * t_fix,
        "frame": t_frame if framing == "2x2x" else 0.0,
    }
    out["total"] = sum(out.values())
    return out


def wilson(p, n, z=1.96):
    """95% Wilson interval for a binomial proportion."""
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return float(c - h), float(c + h)
