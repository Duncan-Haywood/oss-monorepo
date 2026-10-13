"""MuJoCo settle test for partial assemblies of the robofab-sequence gearbox.

Every placed part (except the fixtured base) is a free rigid body made of its box geoms, placed in its
final pose, and left to settle under gravity. A state "holds" if no part moves or tilts more than the
thresholds. Units: the sequence study uses millimetres; MuJoCo gets metres. PLA-like density and a
sliding friction coefficient `mu` are stylised choices, not measured values.
"""
import os
import sys

import mujoco
import numpy as np

_SEQ = os.path.join(os.path.dirname(__file__), "..", "..", "..", "robofab-sequence", "src")
if os.path.isdir(_SEQ) and _SEQ not in sys.path:
    sys.path.insert(0, os.path.abspath(_SEQ))

from robofab_sequence.checker import Checker  # noqa: E402

DENSITY = 1240.0  # kg/m^3, PLA-like (stylised)


def mjcf(ck, state, mu):
    s = 1e-3
    out = ['<mujoco><option timestep="0.0005" gravity="0 0 -9.81"/><worldbody>']
    for p, name in enumerate(ck.names):
        if not state >> p & 1:
            continue
        body = name == "base"
        out.append("<body name='%s'>" % name if not body else "<body name='base'>")
        if not body:
            out.append("<freejoint/>")
        for b in ck.boxes[p]:
            c = [(b[k] + b[k + 3]) / 2 * s for k in range(3)]
            h = [(b[k + 3] - b[k]) / 2 * s for k in range(3)]
            out.append("<geom type='box' pos='%.6f %.6f %.6f' size='%.6f %.6f %.6f' density='%g' "
                       "friction='%g 0.005 0.0001'/>" % (*c, *h, DENSITY, mu))
        out.append("</body>")
    out.append("</worldbody></mujoco>")
    return "".join(out)


def settle(ck, state, mu=0.5, t_end=1.0, disp_mm=2.0, tilt_deg=3.0):
    """Return (holds, max_disp_mm, max_tilt_deg) for the partial assembly `state`."""
    m = mujoco.MjModel.from_xml_string(mjcf(ck, state, mu))
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    free = [i for i in range(1, m.nbody)]
    if not free:
        return True, 0.0, 0.0
    x0 = d.xipos[free].copy()
    q0 = d.xquat[free].copy()
    for _ in range(int(t_end / m.opt.timestep)):
        mujoco.mj_step(m, d)
    disp = np.linalg.norm(d.xipos[free] - x0, axis=1).max() * 1e3
    dots = np.abs(np.sum(d.xquat[free] * q0, axis=1)).clip(0, 1)
    tilt = np.degrees(2 * np.arccos(dots)).max()
    return bool(disp < disp_mm and tilt < tilt_deg), float(disp), float(tilt)


class MuJoCoChecker(Checker):
    """Checker whose stability test is the MuJoCo settle test (cached per state)."""

    def __init__(self, mu=0.5, **kw):
        super().__init__(**kw)
        self.mu = mu
        self._mj = {}

    def stable(self, state):
        if state not in self._mj:
            self._mj[state] = settle(self, state, self.mu)[0]
        return self._mj[state]


def grounded_stable(ck, state):
    """L1 variant with acyclic support: a part counts as supported only by parts already grounded.

    The base is grounded. Repeatedly ground any placed part whose centre of mass lies over the
    bounding rectangle of its support patches from grounded parts. The state is stable if every
    placed part gets grounded. (The original L1 rule lets two parts support each other.)
    """
    placed = [p for p in range(ck.n) if state >> p & 1]
    grounded = {0}
    changed = True
    while changed:
        changed = False
        for p in placed:
            if p in grounded:
                continue
            rects = [ck.patch[p][q] for q in grounded if ck.patch[p][q]]
            if not rects:
                continue
            x0 = min(r[0] for r in rects); y0 = min(r[1] for r in rects)
            x1 = max(r[2] for r in rects); y1 = max(r[3] for r in rects)
            cx, cy, _ = ck.com[p]
            if x0 - 1e-9 <= cx <= x1 + 1e-9 and y0 - 1e-9 <= cy <= y1 + 1e-9:
                grounded.add(p)
                changed = True
    return len(grounded) == len(placed)


class GroundedChecker(Checker):
    """Checker using the acyclic-support variant of the L1 rule."""

    def stable(self, state):
        return grounded_stable(self, state)
