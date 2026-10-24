"""A 62-nail sheet fired in sequence: when may the next nail go, and what does waiting cost?

`buildbot_recoil` follows one shot until the tip settles. `buildbot_custom` orders the 62 nails
of a 4x8 sheet and times the moves. `buildbot_studfind` says how stud-reading error is shared
by the nails on a stud. This joins them: after each shot the arm's transient (a trace from the
recoil model) decays while the arm moves to the next nail; the next nail fires once the tip is
inside `eps` of where it should be and the nosepiece is back on the wall. Whatever error is
left at that moment shifts the nail, on top of the robot's scatter and the stud's shared error.

Pure NumPy: the traces come from `experiments/run.py` (MuJoCo), the rest runs without it.
"""
import numpy as np
from math import erf

from buildbot_custom import model as C

SQRT2 = 2 ** 0.5


def sequence(mode="rows"):
    """The 62 nails in firing order as dicts: y, z, half-window, axis, kind, stud (0..3 or None)."""
    nails = {(round(n[0], 9), round(n[1], 9)): n for n in C.schedule()}
    out = []
    studs = {}
    for p in C.order(C.schedule(), mode):
        y, z, hw, ax, kind = nails[(round(p[0], 9), round(p[1], 9))]
        stud = None
        if kind == "joint":
            stud = 0 if y < C.SHEET[0] / 2 else 3
        elif kind == "field":
            stud = studs.setdefault(round(y, 6), 1 + len(studs))
        out.append({"y": y, "z": z, "half": hw, "axis": ax, "kind": kind, "stud": stud})
    return out


def legs(seq, v, a, home=(0.0, 0.0)):
    """Rest-to-rest travel time (s) into each nail of `seq`."""
    cur, out = home, []
    for n in seq:
        p = (n["y"], n["z"])
        out.append(C.leg_time(cur, p, v, a))
        cur = p
    return out


def fire_time(trace, leg, eps, t_hold=0.0, need_wall=True):
    """Earliest time (s since the previous shot) the next nail may fire.

    `trace` = dict(t, dy, dz, wall): the tip's offset from where it would be without the shot (m)
    and the wall force (N). The nail fires no sooner than `leg` (the move), once the tip has been
    within `eps` for good, once the wall force is back (> 0; skipped if `need_wall` is False),
    plus `t_hold` (a dwell after that).
    Returns (time, dy, dz) at that moment; the time is capped at the end of the trace."""
    t = np.asarray(trace["t"])
    off = np.hypot(trace["dy"], trace["dz"])
    lost = (np.asarray(trace["wall"]) <= 1e-9) if need_wall else False
    bad = np.flatnonzero((off > eps) | lost)
    t_ok = t[bad[-1]] + (t[1] - t[0]) if len(bad) else 0.0
    t_fire = min(max(leg, t_ok) + t_hold, t[-1])
    i = int(np.searchsorted(t, t_fire))
    i = min(i, len(t) - 1)
    return float(max(leg, t_ok) + t_hold), float(trace["dy"][i]), float(trace["dz"][i])


def sheet_time(seq, v, a, trace, eps, t_fire=0.1, t_hold=0.0, t_scan=0.0, need_wall=True):
    """Seconds for the whole sheet and the per-nail residual (dy, dz) at the moment of firing.

    Each nail costs `t_fire` (trigger and seat; my choice) after the later of its move and the
    arm's settling from the shot before. The first nail has no shot before it."""
    ls = legs(seq, v, a)
    total, res = t_scan, []
    for i, l in enumerate(ls):
        if i == 0:
            tw, dy, dz = l, 0.0, 0.0
        else:
            tw, dy, dz = fire_time(trace, l, eps, t_hold, need_wall)
        total += tw + t_fire
        res.append((dy, dz))
    return total, np.array(res)


def p_clean(seq, s_stud, s_robot, residual, trials=20000, seed=1):
    """P(all 62 nails in their windows) and mean nails missed, by Monte Carlo.

    Each stud has one N(0, s_stud) error shared by its nails (plates have none), each nail adds
    N(0, s_robot) and the deterministic residual of the recoil transient along the nail's axis
    (`residual[i] = (dy, dz)`). Lengths in metres."""
    rng = np.random.default_rng(seed)
    n = len(seq)
    half = np.array([x["half"] for x in seq])
    shift = np.array([r[0] if x["axis"] == "y" else r[1] for x, r in zip(seq, residual)])
    stud = np.array([-1 if x["stud"] is None else x["stud"] for x in seq])
    es = rng.normal(0.0, s_stud, size=(trials, 4)) if s_stud > 0 else np.zeros((trials, 4))
    shared = np.where(stud >= 0, es[:, np.clip(stud, 0, 3)], 0.0)
    e = shared + rng.normal(0.0, s_robot, size=(trials, n)) + shift
    miss = np.abs(e) > half
    return float((~miss.any(axis=1)).mean()), float(miss.sum(axis=1).mean())


def p_clean_analytic_no_shift(seq, s_stud, s_robot, n_grid=801, span=6.0):
    """Closed-form-by-quadrature check for zero residual (agrees with `buildbot_studfind`)."""
    def pin(h, s):
        return erf(h / (s * SQRT2)) if s > 0 else 1.0
    p = 1.0
    for x in seq:
        if x["stud"] is None:
            p *= pin(x["half"], s_robot)
    e = np.linspace(-span * s_stud, span * s_stud, n_grid) if s_stud > 0 else np.zeros(1)
    w = np.exp(-0.5 * (e / s_stud) ** 2) if s_stud > 0 else np.ones(1)
    w /= w.sum()
    for k in range(4):
        cond = np.ones_like(e)
        for x in seq:
            if x["stud"] == k:
                h = x["half"]
                if s_robot > 0:
                    cond *= 0.5 * (np.vectorize(erf)((h - e) / (s_robot * SQRT2)) + np.vectorize(erf)((h + e) / (s_robot * SQRT2)))
                else:
                    cond *= (np.abs(e) <= h)
        p *= float((w * cond).sum())
    return p
