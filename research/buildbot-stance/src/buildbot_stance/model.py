"""How many stances does a standing G1 need to nail one 4x8 sheet, and what do they cost in time?

`experiments/reach.py` (MuJoCo, `buildbot_payload` and `buildbot_fasten` whole-body statics) finds, with the
feet planted, which tool points (sideways `dy` from the middle of the feet, height `z`, reach `x`) the G1
can hold and push into a wall with. This module takes that reachable set, places a 4x8 sheet's 62 nails
(`buildbot_custom.schedule`) in front of a robot at a chosen sideways position and platform height, and
asks which nails one stance covers, how few stances cover the sheet, and what the stance changes add to the
time per sheet.

Pure NumPy and stdlib: the reach grid is read from `experiments/reach.json`.
"""
import json
import math

import numpy as np

from buildbot_custom import model as C


def load(path):
    return json.loads(open(path).read())


def reachable(data, x, need, mu):
    """Set of (dy, z) grid points the G1 can hold at reach `x` while pushing `need` N with friction `mu`.

    Only dy >= 0 is stored; the sideways reach is mirrored (`mirror_agreement` checks that)."""
    ok = set()
    for c in data["cells"]:
        if c["x"] != x or c["need"] != need or not c["ok"]:
            continue
        s = c["slip_mu_min"]
        if need > 0 and (s is None or s > mu):
            continue
        ok.add((round(c["dy"], 6), round(c["z"], 6)))
    return ok


def mirror_agreement(data, x=0.4, need=50.0, mu=0.6):
    """(cells where left and right agree, cells compared) between dy and -dy at the stored mirror cells."""
    left = reachable(data, x, need, mu)
    agree = total = 0
    for c in data["mirror"]:
        s = c.get("slip_mu_min")
        r = c["ok"] and (need == 0 or (s is not None and s <= mu))
        total += 1
        agree += int(r == ((round(-c["dy"], 6), round(c["z"], 6)) in left))
    return agree, total


def covers(ok, dys, zs, dy, z, rule="all"):
    """True when the tool point (dy, z) is inside the reachable set. Reach is only known at the grid
    points: rule "all" needs the four surrounding points reachable (conservative), "nearest" only the
    closest one (generous)."""
    dy = abs(dy)
    if dy > dys[-1] + 1e-9 or z < zs[0] - 1e-9 or z > zs[-1] + 1e-9:
        return False
    if rule == "nearest":
        a = min(range(len(dys)), key=lambda k: abs(dys[k] - dy))
        b = min(range(len(zs)), key=lambda k: abs(zs[k] - z))
        return (round(dys[a], 6), round(zs[b], 6)) in ok
    i = min(int(dy / (dys[1] - dys[0]) + 1e-9), len(dys) - 2)
    j = min(int((z - zs[0]) / (zs[1] - zs[0]) + 1e-9), len(zs) - 2)
    return all((round(dys[a], 6), round(zs[b], 6)) in ok for a in (i, i + 1) for b in (j, j + 1))


def nails(z0=0.0):
    """The 62 nails as (y, z) on the wall, the sheet's lower edge at height `z0` above the floor."""
    return [(n[0], n[1] + z0) for n in C.schedule()]


def stance_cover(ok, dys, zs, pts, y, h, rule="all"):
    """Indices of `pts` one stance covers: robot centre at wall position y, standing h above the floor."""
    return {k for k, (ny, nz) in enumerate(pts) if covers(ok, dys, zs, ny - y, nz - h, rule)}


def plan(ok, dys, zs, pts, heights=(0.0,), y_step=0.05, y_lo=None, y_hi=None, rule="all"):
    """Greedy set cover of the nails by stances (y, h). Returns (stances, covered, uncovered) where
    stances is a list of (y, h, set of nail indices newly covered), in the order picked."""
    y_lo = -0.4 if y_lo is None else y_lo
    y_hi = C.SHEET[0] + 0.4 if y_hi is None else y_hi
    ys = np.arange(y_lo, y_hi + 1e-9, y_step)
    options = {(round(float(y), 4), h): stance_cover(ok, dys, zs, pts, float(y), h, rule) for y in ys for h in heights}
    left = set(range(len(pts)))
    stances = []
    while left:
        best = max(options, key=lambda o: (len(options[o] & left), -abs(o[0] - C.SHEET[0] / 2)))
        gain = options[best] & left
        if not gain:
            break
        stances.append((best[0], best[1], gain))
        left -= gain
    return stances, len(pts) - len(left), sorted(left)


def exact_min(ok, dys, zs, pts, heights=(0.0,), y_step=0.05, cap=8):
    """Smallest number of stances that cover every nail, by search up to `cap` (None when none do).
    Branches on the first nail not yet covered."""
    ys = np.arange(-0.4, C.SHEET[0] + 0.4 + 1e-9, y_step)
    options = [(round(float(y), 4), h, frozenset(stance_cover(ok, dys, zs, pts, float(y), h)))
               for y in ys for h in heights]
    full = frozenset(range(len(pts)))
    if set().union(*[o[2] for o in options]) != full:
        return None
    best = [cap + 1]

    def go(left, used):
        if not left:
            best[0] = min(best[0], used)
            return
        if used + 1 >= best[0]:
            return
        first = min(left)
        for y, h, cov in sorted((o for o in options if first in o[2]), key=lambda o: -len(o[2] & left)):
            go(left - cov, used + 1)

    go(full, 0)
    return best[0] if best[0] <= cap else None


def sheet_time(pts, stances, v, a, t_fire, t_stance, t_scan=0.0):
    """Seconds per sheet: within each stance the tip visits that stance's nails in the serpentine order of
    `buildbot_custom.order` (stop and fire at each, `t_fire` s), and each change of stance (not the first)
    costs `t_stance` s. `stances` is the (y, h, indices) list from `plan`."""
    total = t_scan
    for k, (y, h, idx) in enumerate(stances):
        if k:
            total += t_stance
        sub = [(pts[i][0], pts[i][1], 0.0, "y", "joint") for i in sorted(idx)]
        t, _, _ = C.sheet_cycle(sub, v, a, t_fire, home=(sub[0][0], sub[0][1]) if sub else (0, 0))
        total += t
    return total
