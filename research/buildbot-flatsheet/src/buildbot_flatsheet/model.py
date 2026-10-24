"""How many stances does a standing G1 need to nail a 4x8 sheet lying flat on a table?

`experiments/reach.py` (MuJoCo whole-body statics, `buildbot_payload` and `buildbot_fasten`) finds which hand
points (reach x in front of the feet, sideways dy, height z) the G1 can hold while pushing a nailer straight down.
A sheet on a table of height H is nailed with the hands about `off` m above it, so z = H + off. This module
lays the 62 nails of `buildbot_custom.schedule` on the table top (length u = the wall's z, width v = its y), puts
the robot on one of the four sides at a standoff `s` from the edge, and asks which nails one stance covers, how
few stances cover the sheet, and what the stance changes add to the time per sheet.

Pure NumPy and stdlib: the reach grid is read from `experiments/reach.json`.
"""
import json

import numpy as np

from buildbot_custom import model as C

W, L = C.SHEET            # table-top width (m, the wall's y) and length (m, the wall's z)


def load(path):
    return json.loads(open(path).read())


def reachable(data, z, need, mu):
    """Set of (x, dy) grid points the G1 can hold at hand height `z` while pushing down `need` N with friction `mu`.

    Only dy >= 0 is stored; the sideways reach is mirrored (`mirror_agreement` checks that)."""
    ok = set()
    for c in data["cells"]:
        if abs(c["z"] - z) > 1e-9 or c["need"] != need or not c["ok"]:
            continue
        s = c["slip_mu_min"]
        if need > 0 and (s is None or s > mu):
            continue
        ok.add((round(c["x"], 6), round(c["dy"], 6)))
    return ok


def mirror_agreement(data, need=50.0, mu=0.6):
    """(cells where left and right agree, cells compared) between dy and -dy at the stored mirror cells."""
    agree = total = 0
    for z in data["zs"]:
        left = reachable(data, z, need, mu)
        for c in data["mirror"]:
            if abs(c["z"] - z) > 1e-9:
                continue
            s = c.get("slip_mu_min")
            r = c["ok"] and (need == 0 or (s is not None and s <= mu))
            total += 1
            agree += int(r == ((round(c["x"], 6), round(-c["dy"], 6)) in left))
    return agree, total


def covers(ok, xs, dys, x, dy, rule="all"):
    """True when the hand point (x, dy) is inside the reachable set. Reach is known only at grid points: rule
    "all" needs the four surrounding points reachable (conservative), "nearest" only the closest (generous)."""
    dy = abs(dy)
    if dy > dys[-1] + 1e-9 or x < xs[0] - 1e-9 or x > xs[-1] + 1e-9:
        return False
    if rule == "nearest":
        a = min(range(len(xs)), key=lambda k: abs(xs[k] - x))
        b = min(range(len(dys)), key=lambda k: abs(dys[k] - dy))
        return (round(xs[a], 6), round(dys[b], 6)) in ok
    i = min(int((x - xs[0]) / (xs[1] - xs[0]) + 1e-9), len(xs) - 2)
    j = min(int(dy / (dys[1] - dys[0]) + 1e-9), len(dys) - 2)
    return all((round(xs[a], 6), round(dys[b], 6)) in ok for a in (i, i + 1) for b in (j, j + 1))


def nails():
    """The 62 nails as (u, v) on the table top: u along the 2.44 m length, v across the 1.22 m width."""
    return [(n[1], n[0]) for n in C.schedule()]


SIDES = ("A", "B", "C", "D")      # A: edge v=0, B: edge v=W, C: end u=0, D: end u=L


def to_reach(side, pos, s, u, v):
    """(reach x, sideways dy) of table point (u, v) for a robot on `side` standing at `pos` along that side, its
    feet centre `s` m outside the table edge."""
    if side == "A":
        return s + v, u - pos
    if side == "B":
        return s + (W - v), u - pos
    if side == "C":
        return s + u, v - pos
    return s + (L - u), v - pos


def stance_cover(ok, xs, dys, pts, side, pos, s, rule="all"):
    return {k for k, (u, v) in enumerate(pts) if covers(ok, xs, dys, *to_reach(side, pos, s, u, v), rule)}


def positions(side, step=0.05):
    span = L if side in "AB" else W
    return [round(float(p), 4) for p in np.arange(-0.4, span + 0.4 + 1e-9, step)]


def plan(ok, xs, dys, pts, s, sides=SIDES, step=0.05, rule="all"):
    """Greedy set cover of the nails by stances (side, pos). Returns (stances, covered, uncovered) where
    stances is a list of (side, pos, set of nail indices newly covered), in the order picked."""
    options = {(sd, p): stance_cover(ok, xs, dys, pts, sd, p, s, rule) for sd in sides for p in positions(sd, step)}
    left = set(range(len(pts)))
    stances = []
    while left:
        best = max(options, key=lambda o: (len(options[o] & left), -abs(o[1] - (L if o[0] in "AB" else W) / 2)))
        gain = options[best] & left
        if not gain:
            break
        stances.append((best[0], best[1], gain))
        left -= gain
    return stances, len(pts) - len(left), sorted(left)


def sheet_time(pts, stances, v, a, t_fire, t_stance):
    """Seconds per sheet: within each stance the tip visits that stance's nails in the serpentine order of
    `buildbot_custom.order` (stop and fire at each, `t_fire` s), and each change of stance (not the first)
    costs `t_stance` s."""
    total = 0.0
    for k, (_, _, idx) in enumerate(stances):
        if k:
            total += t_stance
        sub = [(pts[i][0], pts[i][1], 0.0, "y", "joint") for i in sorted(idx)]
        t, _, _ = C.sheet_cycle(sub, v, a, t_fire, home=(sub[0][0], sub[0][1]) if sub else (0, 0))
        total += t
    return total
