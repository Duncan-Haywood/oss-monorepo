"""Milestone 40: the nailer's recoil lifts the nose, and the re-press from zero sets the loose joints.

Milestones 30-39 score a joint whose torque stays below the holding threshold ``tau_f`` over the press window
as *loose*: uniformly anywhere in its gap at every nail. Between nails the nose leaves the wall (the recoil,
the sequential-trip release, the move to the next nail), and the press rises again from a release force
``F_r``. A joint below ``tau_f`` over the whole window whose torque reaches ``tau_f`` somewhere on that rise is
pushed to that side and stays there (friction holds it once the torque falls back below ``tau_f``): a
repeatable bias of ``-sign(tau) gap / 2``, the same convention as ``pose_range.held_bias``.

The recoil itself is bracketed from published measurements (``recoil_bracket``); it is used only to say
whether the nose lifts off, not simulated.
Units: newtons, newton metres, radians, kilograms, metres per second.
"""
import math

import numpy as np

IN = 0.0254
STEEL = 7850.0                                    # kg/m^3, carbon steel
NAIL_8D = (0.131 * IN, 2.5 * IN)                  # 8d common: shank diameter and length (buildbot-fasten)
V_CHRONO = (97.7 * 0.3048, 121.1 * 0.3048)        # m/s, Buchalter et al. 2002 (ballistic chronograph)
V_PD1975 = (20.0, 30.0)                           # m/s, Peterson and Dixon 1975 (2 m from the muzzle)
LOWE2014 = (42.2, 32.2, 0.87)                     # N weight + hose, N cumulative load with recoil, s transfer


def nail_mass(d=NAIL_8D[0], length=NAIL_8D[1], rho=STEEL):
    """Shank mass (kg) of a round nail, head ignored."""
    return rho * math.pi * (d / 2) ** 2 * length


def recoil_bracket():
    """(low, high, parts): the nail-momentum floor over both velocity sources and Lowe et al.'s force-plate
    unloading per transfer phase, in N s."""
    m = nail_mass()
    parts = {"nail_chrono": tuple(m * v for v in V_CHRONO), "nail_pd1975": tuple(m * v for v in V_PD1975),
             "lowe2014": (LOWE2014[0] - LOWE2014[1]) * LOWE2014[2]}
    lo = min(parts["nail_chrono"][0], parts["nail_pd1975"][0])
    return lo, parts["lowe2014"], parts


def below(t_lo, t_hi, tau_f):
    """Joints whose |tau| is below tau_f at both window ends, hence (torque linear in F) over the whole window."""
    return (np.abs(np.asarray(t_lo)) < tau_f) & (np.abs(np.asarray(t_hi)) < tau_f)


def set_sign(path, t_lo, t_hi, tau_f):
    """Side each joint is left on by the rise ``path`` (torque arrays at increasing press forces below the
    window): sign of the last sample with |tau| >= tau_f, for joints below tau_f over the window; 0 where the
    rise never reaches tau_f (still loose) or the joint is not below tau_f in the window."""
    t_lo = np.asarray(t_lo, float)
    out = np.zeros_like(t_lo)
    done = np.zeros(t_lo.shape, bool)
    for t in reversed([np.asarray(p, float) for p in path]):
        hit = (~done) & (np.abs(t) >= tau_f)
        out[hit] = np.sign(t[hit])
        done |= hit
    return np.where(below(t_lo, t_hi, tau_f), out, 0.0)


def lift_bias(path, t_lo, t_hi, tau_f, gap):
    """Per-joint bias (rad) the re-press leaves: -sign gap / 2 on set joints, 0 elsewhere."""
    return -set_sign(path, t_lo, t_hi, tau_f) * np.asarray(gap, float) / 2.0


def still_loose(path, t_lo, t_hi, tau_f, held):
    """Joints that are neither held over the window nor set by the rise."""
    s = set_sign(path, t_lo, t_hi, tau_f)
    return (~np.asarray(held, bool)) & (s == 0)


def entry_set(t_lo, t_hi, tau_f):
    """Post hoc (not registered): a joint loose in the window only because its |tau| falls below tau_f inside
    it, with one sign throughout and |tau| >= tau_f at the window's low end, is pushed to that side as the
    rising press enters the window and stays there (friction holds it once |tau| drops). Returns its sign,
    0 for every other joint."""
    lo, hi = np.asarray(t_lo, float), np.asarray(t_hi, float)
    one = np.sign(lo) == np.sign(hi)
    held = one & (np.abs(lo) >= tau_f) & (np.abs(hi) >= tau_f)
    return np.where(one & ~held & (np.abs(lo) >= tau_f), np.sign(lo), 0.0)
