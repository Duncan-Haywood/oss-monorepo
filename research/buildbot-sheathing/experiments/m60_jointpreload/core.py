"""Milestone 60 shared core: milestone 59's four-row rule with a per-joint (targeted) or uniform leg preload
escalation for the cases it leaves without a plan. Imported by run.py (and the development probe)."""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m59", os.path.join(HERE, "..", "m59_depth", "run.py"))
E59 = importlib.util.module_from_spec(spec)
sys.modules["m59"] = E59
spec.loader.exec_module(E59)                     # milestone 59's object (and so 58's, ... 38's)
E58, E56, E55, E54, E51 = E59.E58, E59.E56, E59.E55, E59.E54, E59.E51
R, M1, R43 = E59.R, E59.M1, E59.R43
R45 = E58.R45
from buildbot_sheathing import tiered as TI  # noqa: E402

E59.CONFIGS = {"four-row": E59.CONFIGS["four-row"]}   # milestone 59: the depth rows change no plan; keep them
CFG = "four-row"
PLW = M1.PL                                      # milestone 45's tiered preload module
ESC = {}                                         # key -> (joint indices or None for every leg joint, margin N m)


class EscPL:
    """The preload module with ``solve_margin`` raised, at the escalated pose only, to at least M on the listed
    joints' rows (every leg row when the list is None); every other row keeps its milestone 37/44/45 margin."""
    def __getattr__(self, a):
        return getattr(PLW, a)

    def solve_margin(self, c, legs, rows, kap, d, m, reg=1e-6):
        key = R45.CUR[0]
        if key not in ESC:
            return PLW.solve_margin(c, legs, rows, kap, d, m, reg)
        js, M = ESC[key]
        if key in R45.TIER:
            m_H, m_L = R45.TIER[key]
            mvec = np.where(TI.row_mask(rows, M1.light(key[0])), m_H, m_L)
        else:
            mvec = np.full(len(rows), float(m))
        sel = np.ones(len(rows), bool) if js is None else TI.row_mask(rows, js)
        new = np.where(sel, np.maximum(mvec, M), mvec)
        if np.all(new <= mvec):                  # nothing raised: the unescalated solve, exactly
            return PLW.solve_margin(c, legs, rows, kap, d, m, reg)
        return TI.solve_tiered(c, legs, rows, kap, d, new, reg)


M1.PL = EscPL()


def leg_index(n, name):
    names = M1.ROB[n][1]
    return int(list(names).index(name))


def effort(key, fm, joints=None, M=None):
    """The controller's objective at the window's high end on the pose's own hold sides: sum of squared leg-joint
    torques (N^2 m^2), with the escalated preload when M is given. None without a plan."""
    if M is not None:
        ESC[key] = (joints, M)
    try:
        pf = E55.plan_forces(key, fm)
    finally:
        ESC.pop(key, None)
    if pf is None:
        return None
    legs = np.asarray(M1.ROB[key[0]][2], int)
    return float(np.sum(pf[-1][2][legs] ** 2))


def setup(n):
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")


def escalate(key, ref, f, e, er_r, joints, ladder):
    """Smallest margin on the ladder at which milestone 59's rule plans the case with ``joints`` (None = all legs)
    preloaded to it. Returns (M, outcome) or (None, last outcome)."""
    o = None
    for M in ladder:
        ESC[key] = (joints, M)
        try:
            o = E59.rule_all(key, ref, f, e, er_r)[CFG]
        finally:
            ESC.pop(key, None)
        if o.get("y") is not None:
            return M, o
    return None, o
