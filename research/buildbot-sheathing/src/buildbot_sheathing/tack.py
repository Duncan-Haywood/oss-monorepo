"""Milestone 4: tack, then measure. How coarsely may a robot hang the sheet?

Milestone 1 (`budget.py`) found that a sheet must hang to about 0.4 mm and 0.03 deg (1 sigma) on
single-2x joints, and milestone 2 (`asbuilt.py`) found that the joint framing sets the window
once studs bow. This module puts the sheet's pose on milestone 2's as-built studs and adds what a
robot can do about a coarse hang:

* **hold**: the robot holds the sheet while it nails. The edge is measured once after hanging;
  each nail then sees the hung pose plus an independent sway (`s_sway`, a translation along the
  wall) that the robot does not see;
* **tack**: two tack nails in the field studs freeze the pose (`s_sway` = 0; any shift while
  tacking folds into the hang); the edge is measured after;
* **reject** (either of the above, `accept_half` set): after measuring, the robot predicts each
  joint nail's window from its measured edge and its stud estimate, and re-hangs the sheet if the
  narrowest predicted half-window is below `accept_half`, up to `max_hangs` hangs (the last is
  nailed whatever it predicts). A held sheet is nudged, a tacked one has its tacks pulled; the
  model treats both as a fresh, independent hang.

Geometry, studs and sensing are milestone 2's. On each joint stud the robot means to centre the
1/8 in gap on the middle of its estimate of the stud's range; panels are cut to fit. The sheet is
then off by a translation x and a rotation theta about its centre (both Gaussian):

    e_L(z) = r_L + GAP/2 + x + theta (z - H/2),   e_R(z) = r_R - GAP/2 + x + theta (z - H/2)

Aim policies: "edge" aims each joint nail at the middle of the window between the measured edge
line (+EDGE; the measured line has the true slope and an offset error s_edge per edge) and the
estimated far side of the stud; "nominal" aims as if the sheet hung where intended.

Units are metres and radians.
"""
import numpy as np

from .asbuilt import (BOW_LIMIT, READ_U, TWIST_LIMIT, U_FIELD, U_JOINT, Band, _fit,
                      draw_magnitude, to_wall_bow, to_wall_twist_angle)
from .budget import EDGE, GAP, HEIGHT, N_NAILS, R, Z_JOINT, plate_halves

ZC = Z_JOINT - HEIGHT / 2           # joint-nail heights about the sheet centre
TOP = HEIGHT / 2 - EDGE             # lever arm of the top and bottom joint nails


def simulate(trials=20000, seed=4, *, policy="three", bow_mean=0.0, twist_mean=0.0,
             shape="halfnormal", s_layout=0.0, s_read=0.5e-3, s_robot=0.9e-3, s_edge=0.5e-3,
             band=None, joint_band=None, s_x=0.0, s_theta=0.0, s_sway=0.0, aim="edge",
             accept_half=None, max_hangs=5, rng=None):
    """Monte Carlo of one sheet's 62 nails on four as-built studs, hung with a pose error.

    s_x, s_theta   the hang: translation along the wall and rotation about the sheet centre
    s_sway         per-nail translation of a held sheet after the edge was measured (0: tacked)
    aim            "edge" or "nominal"
    accept_half    re-hang while the narrowest predicted joint half-window is below this (None:
                   never re-hang); max_hangs caps the hangs a sheet
    Other arguments are milestone 2's (`asbuilt.simulate`).

    Returns a dict: clean (P all 62 nails in), missed (mean nails missed a sheet), feasible
    (P both joint windows non-empty at every height, final hang), hangs (mean hangs a sheet).
    """
    rng = np.random.default_rng(seed) if rng is None else rng
    band = Band() if band is None else band
    jband = band if joint_band is None else joint_band
    t = trials
    b = to_wall_bow(draw_magnitude(rng, (t, 4), bow_mean, BOW_LIMIT, shape))
    T = to_wall_twist_angle(draw_magnitude(rng, (t, 4), twist_mean, TWIST_LIMIT, shape))
    a0 = rng.normal(0, s_layout, (t, 4)) if s_layout > 0 else np.zeros((t, 4))
    a1 = rng.normal(0, s_layout, (t, 4)) if s_layout > 0 else np.zeros((t, 4))

    def line(u):
        u = np.asarray(u)[None, None, :]
        return a0[..., None] + (a1 - a0)[..., None] * u + 4 * b[..., None] * u * (1 - u)

    ur = READ_U[policy]
    reads = line(ur) + (rng.normal(0, s_read, (t, 4, len(ur))) if s_read > 0 else 0.0)
    est_j = _fit(policy, ur, reads, U_JOINT)
    est_f = _fit(policy, ur, reads, U_FIELD)
    true_j, true_f = line(U_JOINT), line(U_FIELD)
    blo_j, bhi_j = jband(T[..., None] * (U_JOINT[None, None, :] - 0.5))
    blo_f, bhi_f = band(T[..., None] * (U_FIELD[None, None, :] - 0.5))
    hj = jband.face / 2 - R
    ref = (est_j.max(axis=-1) + est_j.min(axis=-1)) / 2
    loL_true_hi = true_j[:, 0] + bhi_j[:, 0]          # far side of the left joint stud's band
    loR_true_lo = true_j[:, 3] + blo_j[:, 3]
    estL_hi = est_j[:, 0] + hj
    estR_lo = est_j[:, 3] - hj

    # hangs: draw every candidate pose up front, keep the first one the robot accepts
    m = max(1, int(max_hangs)) if accept_half is not None else 1
    x = rng.normal(0, s_x, (t, m)) if s_x > 0 else np.zeros((t, m))
    th = rng.normal(0, s_theta, (t, m)) if s_theta > 0 else np.zeros((t, m))
    dL = rng.normal(0, s_edge, (t, m)) if s_edge > 0 else np.zeros((t, m))
    dR = rng.normal(0, s_edge, (t, m)) if s_edge > 0 else np.zeros((t, m))
    if accept_half is None:
        pick = np.zeros(t, dtype=int)
    else:
        shift = x[..., None] + th[..., None] * ZC[None, None, :]          # (t, m, 17)
        mL = ref[:, 0:1, None] + GAP / 2 + shift + dL[..., None]          # measured edges
        mR = ref[:, 3:4, None] - GAP / 2 + shift + dR[..., None]
        halfL = (estL_hi[:, None, :] - (mL + EDGE)) / 2
        halfR = ((mR - EDGE) - estR_lo[:, None, :]) / 2
        worst = np.minimum(halfL.min(axis=-1), halfR.min(axis=-1))        # (t, m)
        ok = worst >= accept_half
        ok[:, -1] = True                                                  # the last hang is nailed
        pick = ok.argmax(axis=1)
    rows = np.arange(t)
    x, th, dL, dR = x[rows, pick][:, None], th[rows, pick][:, None], dL[rows, pick][:, None], dR[rows, pick][:, None]
    shift = x + th * ZC[None, :]
    eL = ref[:, 0:1] + GAP / 2 + shift
    eR = ref[:, 3:4] - GAP / 2 + shift
    if aim == "edge":
        aimL = ((eL + dL + EDGE) + estL_hi) / 2
        aimR = (estR_lo + (eR + dR - EDGE)) / 2
    elif aim == "nominal":
        aimL = ((ref[:, 0:1] + GAP / 2 + EDGE) + estL_hi) / 2
        aimR = (estR_lo + (ref[:, 3:4] - GAP / 2 - EDGE)) / 2
    else:
        raise ValueError(aim)

    def noise(shape_):
        return rng.normal(0, s_robot, shape_) if s_robot > 0 else 0.0

    # sway moves the sheet (edge) under the nail; the stud does not move
    sw = lambda: rng.normal(0, s_sway, eL.shape) if s_sway > 0 else 0.0  # noqa: E731
    swL, swR = sw(), sw()
    nL = aimL + noise(aimL.shape)
    nR = aimR + noise(aimR.shape)
    hits = [(nL >= eL + swL + EDGE) & (nL <= loL_true_hi),
            (nR >= loR_true_lo) & (nR <= eR + swR - EDGE)]
    for k in (1, 2):
        n = est_f[:, k] + noise(est_f[:, k].shape)
        hits.append((n >= true_f[:, k] + blo_f[:, k]) & (n <= true_f[:, k] + bhi_f[:, k]))
    for h in plate_halves():
        n = noise((t, 1)) if s_robot > 0 else np.zeros((t, 1))
        hits.append(np.abs(n) <= h)
    allhit = np.concatenate(hits, axis=1)
    feasible = np.all(eL + EDGE <= loL_true_hi, axis=1) & np.all(loR_true_lo <= eR - EDGE, axis=1)
    return {"clean": float(allhit.all(axis=1).mean()),
            "missed": float((1 - allhit.mean()) * N_NAILS),
            "feasible": float(feasible.mean()),
            "hangs": float((pick + 1).mean())}


def success(**kw):
    return simulate(**kw)["clean"]


def largest(param, target=0.95, hi=0.05, iters=16, **kw):
    """Largest value of the sigma `param` with clean >= target (bisection, fixed seed); 0 if
    even a zero value misses the target, `hi` if `hi` still meets it."""
    if success(**{**kw, param: 0.0}) < target:
        return 0.0
    if success(**{**kw, param: hi}) >= target:
        return hi
    lo = 0.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        if success(**{**kw, param: mid}) >= target:
            lo = mid
        else:
            hi = mid
    return lo


def geometric_hangs(p_accept, max_hangs):
    """Mean hangs a sheet when each hang is accepted with probability p, capped at max_hangs."""
    q = 1 - p_accept
    return sum(q ** k for k in range(max_hangs))
