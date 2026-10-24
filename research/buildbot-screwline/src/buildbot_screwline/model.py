"""Stud-finding error budget for screwing a 4x8 drywall sheet to framing, wall or ceiling.

Same structure as buildbot-studfind (each screw on a framing member shares that member's position
error; the robot adds its own scatter to every screw), with a drywall schedule instead of nails:
screw pitch 16 in on walls and 12 in on ceilings (USG FAQ 1595, non-fire-rated), a #6 screw, and a
sheet that may be allowed to miss a few screws.
"""
import numpy as np

IN = 0.0254
FACE = 1.5 * IN            # nominal 2x framing face
SCREW_D = 0.138 * IN       # #6 drywall screw, nominal major diameter (ASME B18.6.4 size 6)
EDGE_MIN = 0.375 * IN      # fastener distance from a board edge (USG Fiberock guide; gypsum board not confirmed)
SHEET_LEN = 96 * IN
MEMBERS = 4                # a 48 in sheet over 16 in o.c. framing touches 4 members


def band(kind):
    """Half-width of the band a screw centre may land in on a 1.5 in face.
    'edge': the member under a sheet edge (screw must clear the board edge by EDGE_MIN and the face)
    'field': an intermediate member (only the face limits)."""
    r = SCREW_D / 2
    lo = EDGE_MIN if kind == "edge" else r
    hi = (FACE / 2 if kind == "edge" else FACE) - r
    return (hi - lo) / 2


def screws_per_member(pitch_in):
    return int(round(96 / pitch_in)) + 1


def schedule(pitch_in):
    """Half-widths of the screw windows per member (index 0..3; 0 and 3 are the sheet edges)."""
    n = screws_per_member(pitch_in)
    return {0: [band("edge")] * n, 1: [band("field")] * n, 2: [band("field")] * n, 3: [band("edge")] * n}


def simulate(pitch_in, s_meas, s_robot, n_read=1, policy="single", max_miss=0, trials=20000, seed=1):
    """P(a sheet has at most max_miss screws outside their windows) and mean share missed.
    policy 'single': one shared error per member (mean of n_read readings); 'servo': a fresh
    reading error per screw."""
    rng = np.random.default_rng(seed)
    sched = schedule(pitch_in)
    miss = np.zeros(trials)
    total = 0
    for k, hs in sched.items():
        shared = rng.normal(0, s_meas / np.sqrt(n_read), trials)
        for h in hs:
            e = rng.normal(0, s_meas / np.sqrt(n_read), trials) if policy == "servo" else shared
            miss += np.abs(e + rng.normal(0, s_robot, trials)) > h
            total += 1
    return float((miss <= max_miss).mean()), float(miss.mean() / total)


def required_meas(pitch_in, s_robot, target=0.95, max_miss=0, n_read=1, policy="single", trials=20000):
    """Largest reading scatter with success >= target (bisection, fixed seed)."""
    lo, hi = 1e-5, 0.03
    if simulate(pitch_in, lo, s_robot, n_read, policy, max_miss, trials)[0] < target:
        return 0.0
    for _ in range(22):
        mid = (lo + hi) / 2
        if simulate(pitch_in, mid, s_robot, n_read, policy, max_miss, trials)[0] >= target:
            lo = mid
        else:
            hi = mid
    return lo
