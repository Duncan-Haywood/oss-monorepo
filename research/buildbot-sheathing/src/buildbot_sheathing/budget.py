"""Joint-nail budget for a robot sheathing a stud wall, with the panel gap and the sheet's own pose.

Milestone 1 of the `buildbot-sheathing` programme. `buildbot-fasten` and `buildbot-studfind`
put each sheet edge exactly on its joint stud's centre line and gave the 34 joint nails a
+-3.93 mm window. Here the sheet has a pose and a size:

* the recommended 1/8 in gap between panels (APA) is centred on the joint stud, so each sheet
  edge sits 1/16 in past the centre line and the edge-distance rule moves with it;
* the hung sheet is off by a translation x and a rotation theta (out of plumb);
* the sheet's width differs from the 48 in stud module by its cutback ("sized for spacing")
  and its manufacturing error, so along a row of sheets placed against each other the edges
  drift off the stud centres.

Geometry along the wall (x, metres). Stud j's true centre is at j*SPACING + l_j. A joint nail
at height z on the sheet's left edge lands inside its window when

    x_nail >= e_L(z) + EDGE            (3/8 in from the sheet edge)
    x_nail <= l_0 + FACE/2 - R         (shank inside the stud face)

and on the right edge, mirrored, with e_R(z) = e_L(z) + width. Field nails need only the stud
face (|x_nail - stud| <= FACE/2 - R) and plate nails see only the robot's own scatter, as in
`buildbot-studfind`.

Aiming policies (where the robot points each joint nail):
* "nominal": the centre of the design window, measured from its estimate of the stud: it
  assumes the sheet is where the design put it;
* "edge": the centre of the window between the measured sheet edge (+ EDGE) and the estimated
  far stud face; it sees the sheet but not the stud any better.

Units are metres and radians throughout.
"""
from math import erf, sqrt

import numpy as np

IN = 0.0254
FACE = 1.5 * IN            # dressed 2x stud face
R = 0.131 * IN / 2         # 8d common nail shank radius
EDGE = 0.375 * IN          # minimum fastener distance from a panel edge
SPACING = 16 * IN          # stud centres
MODULE = 48 * IN           # three stud bays: the width a sheet is meant to fill
HEIGHT = 96 * IN
GAP = 0.125 * IN           # APA's recommended gap at panel edges and ends

# nail heights along the sheet (z from the bottom edge): joints every 6 in, field every 12 in
Z_JOINT = np.linspace(EDGE, HEIGHT - EDGE, 17)
Z_FIELD = np.arange(1, 8) * 12 * IN
N_PLATE = 14
N_NAILS = 2 * len(Z_JOINT) + 2 * len(Z_FIELD) + N_PLATE           # 62


def plate_halves():
    """Plate-nail half-windows of buildbot-studfind: 7 on a single, 7 on a double plate."""
    lo = EDGE
    return [((FACE - R) - lo) / 2] * 7 + [((2 * FACE - R) - lo) / 2] * 7


def joint_half(gap=0.0):
    """Half-width of a joint nail's window for a perfectly placed sheet whose edge sits gap/2
    past the stud centre (gap 0 reproduces buildbot-fasten's +-3.93 mm)."""
    return ((FACE / 2 - R) - (gap / 2 + EDGE)) / 2


def gap_free_half():
    return joint_half(0.0)


def _p_in(half, s):
    return 1.0 if s <= 0 else erf(half / (s * sqrt(2)))


def simulate_sheet(trials=20000, seed=1, *, s_stud=0.0, s_robot=0.0, s_x=0.0, s_theta=0.0,
                   s_width=0.0, design_gap=GAP, offset=0.0, width=None, policy="nominal",
                   s_edge=0.0, rng=None):
    """Monte Carlo of one sheet's 62 nails.

    s_stud   error of the robot's estimate of each of the sheet's four studs (shared by every
             nail on that stud; true layout scatter folded in, as studfind's "single" policy)
    s_robot  independent tool-tip scatter per nail
    s_x      sheet translation along the wall; s_theta rotation about the sheet centre
    s_width  sheet width error about `width` (default MODULE - design_gap: sized for spacing)
    offset   a known systematic shift of the left edge from its design spot (row drift)
    design_gap  the gap the design centres on each joint stud (the nominal policy aims for it)
    policy   "nominal" or "edge"; s_edge is the error of the measured edge line (shared per edge)

    Returns (P(all 62 nails in their windows), mean share of nails missed, P(both joint
    windows non-empty at every nail height)).
    """
    rng = np.random.default_rng(seed) if rng is None else rng
    width = MODULE - design_gap if width is None else width
    w = width + (rng.normal(0, s_width, (trials, 1)) if s_width > 0 else np.zeros((trials, 1)))
    off = np.full((trials, 1), float(offset))
    return _sheet_with(off, w, design_gap, rng, policy, s_edge, s_stud=s_stud, s_robot=s_robot,
                       s_x=s_x, s_theta=s_theta)


def success(**kw):
    return simulate_sheet(**kw)[0]


def largest(param, target=0.95, hi=0.02, iters=20, **kw):
    """Largest value of the sigma `param` with sheet success >= target (bisection, fixed seed)."""
    lo = 0.0
    if success(**{**kw, param: 1e-9}) < target:
        return 0.0
    if success(**{**kw, param: hi}) >= target:
        return hi
    for _ in range(iters):
        mid = (lo + hi) / 2
        if success(**{**kw, param: mid}) >= target:
            lo = mid
        else:
            hi = mid
    return lo


def analytic_translation(s_x, gap=GAP):
    """Nominal policy, translation only, every other error zero: all joint nails pass iff
    |x| <= joint_half(gap) (the left joint needs x <= h, the right x >= -h)."""
    return _p_in(joint_half(gap), s_x)


def analytic_rotation(s_theta, gap=GAP):
    """Nominal policy, rotation only: the top and bottom joint nails (|z - H/2| = H/2 - EDGE)
    bind, so all pass iff |theta| <= joint_half(gap) / (H/2 - EDGE)."""
    return _p_in(joint_half(gap) / (HEIGHT / 2 - EDGE), s_theta)


def row_offsets(n_sheets, width, gap, rng, s_gap=0.0, s_width=0.0, trials=1):
    """Left-edge offset of each sheet from its design spot (gap/2 past its joint stud centre)
    when each sheet is butted against the previous one with a gap: sheet-referenced placement.
    Returns (trials, n_sheets) offsets and the realised widths."""
    w = width + (rng.normal(0, s_width, (trials, n_sheets)) if s_width > 0 else np.zeros((trials, n_sheets)))
    g = gap + (rng.normal(0, s_gap, (trials, n_sheets)) if s_gap > 0 else np.zeros((trials, n_sheets)))
    pitch = w + g                                     # left edge of k+1 = left edge of k + w_k + g_k
    left = np.concatenate([np.zeros((trials, 1)), np.cumsum(pitch[:, :-1], axis=1)], axis=1)
    design = np.arange(n_sheets) * MODULE
    return left - design, w


def simulate_row(n_sheets=10, trials=4000, seed=2, *, placement="butt", width=MODULE - GAP,
                 gap=GAP, s_gap=0.0, s_width=0.0, policy="nominal", s_edge=0.0, **sheet_kw):
    """A row of sheets along a wall. placement "butt": each sheet set against the previous one
    with the gap (offsets accumulate); "stud": each sheet set from its own stud (no
    accumulation; its gap absorbs the width error). Returns per-sheet P(clean) and P(feasible)
    and, for "stud", the realised gap statistics."""
    rng = np.random.default_rng(seed)
    if placement == "butt":
        off, w = row_offsets(n_sheets, width, gap, rng, s_gap, s_width, trials)
    elif placement == "stud":
        off = np.zeros((trials, n_sheets))
        w = width + (rng.normal(0, s_width, (trials, n_sheets)) if s_width > 0 else np.zeros((trials, n_sheets)))
    else:
        raise ValueError(placement)
    clean, feas = [], []
    for k in range(n_sheets):
        # one call per sheet with its own offset and width per trial: vectorised over trials
        p, _, f = _sheet_with(off[:, k:k + 1], w[:, k:k + 1], gap, rng, policy, s_edge, **sheet_kw)
        clean.append(p)
        feas.append(f)
    out = {"clean": clean, "feasible": feas}
    if placement == "stud":
        # gap between sheet k's right edge and sheet k+1's left edge
        gaps = (MODULE + gap / 2) - (gap / 2 + w[:, :-1]) if n_sheets > 1 else np.zeros((trials, 0))
        out["gap_min"] = float(gaps.min()) if gaps.size else None
        out["gap_p_below_zero"] = float((gaps < 0).mean()) if gaps.size else None
    return out


def _sheet_with(offset, w, gap, rng, policy, s_edge, s_stud=0.0, s_robot=0.0, s_x=0.0, s_theta=0.0):
    """One sheet's 62 nails with a per-trial left-edge offset and width (arrays (trials, 1)).
    Sheet pose errors are relative to the true stud line; the robot's stud estimate error is
    separate (s_stud) and shared by every nail on that stud."""
    t = offset.shape[0]
    stud_est_err = rng.normal(0, s_stud, (t, 4)) if s_stud > 0 else np.zeros((t, 4))
    x = rng.normal(0, s_x, (t, 1)) if s_x > 0 else np.zeros((t, 1))
    th = rng.normal(0, s_theta, (t, 1)) if s_theta > 0 else np.zeros((t, 1))
    z = Z_JOINT[None, :] - HEIGHT / 2
    eL = gap / 2 + offset + x + th * z
    eR = eL + w
    lo_L, hi_L = eL + EDGE, FACE / 2 - R
    lo_R, hi_R = MODULE - FACE / 2 + R, eR - EDGE
    if policy == "nominal":
        cL = stud_est_err[:, :1] + (gap / 2 + EDGE + FACE / 2 - R) / 2 + 0 * eL
        cR = MODULE + stud_est_err[:, 3:4] - (gap / 2 + EDGE + FACE / 2 - R) / 2 + 0 * eL
    else:
        dL = rng.normal(0, s_edge, (t, 1)) if s_edge > 0 else 0.0
        dR = rng.normal(0, s_edge, (t, 1)) if s_edge > 0 else 0.0
        cL = ((eL + dL + EDGE) + (stud_est_err[:, :1] + FACE / 2 - R)) / 2
        cR = ((MODULE + stud_est_err[:, 3:4] - FACE / 2 + R) + (eR + dR - EDGE)) / 2
    nL = cL + (rng.normal(0, s_robot, eL.shape) if s_robot > 0 else 0.0)
    nR = cR + (rng.normal(0, s_robot, eL.shape) if s_robot > 0 else 0.0)
    hitL = (nL >= lo_L) & (nL <= hi_L)
    hitR = (nR >= lo_R) & (nR <= hi_R)
    feasible = np.all(lo_L <= hi_L, axis=1) & np.all(lo_R <= hi_R, axis=1)
    hf = FACE / 2 - R
    hits = [hitL, hitR]
    for k in (1, 2):
        n = stud_est_err[:, k:k + 1] + (rng.normal(0, s_robot, (t, len(Z_FIELD))) if s_robot > 0 else 0.0)
        hits.append(np.abs(n + 0 * Z_FIELD[None, :]) <= hf)
    for h in plate_halves():
        n = rng.normal(0, s_robot, (t, 1)) if s_robot > 0 else np.zeros((t, 1))
        hits.append(np.abs(n) <= h)
    allhit = np.concatenate(hits, axis=1)
    return float(allhit.all(axis=1).mean()), float(1 - allhit.mean()), float(feasible.mean())
