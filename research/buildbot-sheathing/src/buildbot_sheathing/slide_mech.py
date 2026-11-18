"""Milestone 27: the slide as a mechanism. How close can a pushing hand stop a seated sheet?

Milestones 10, 12 and 13 slide the seated sheet along the ledger to centre its gap and credit the
slide with a residual of 0.5 mm. A sheet resting on the ledger and pressed into the wall starts on
static friction and moves on kinetic friction, so a hand that pushes it can only push until it
breaks away, and then the sheet runs until the hand lets go and kinetic friction stops it. This
module models that, along the wall only (one axis):

* friction: breakaway F_s = mu_s (m g + F_n), sliding F_k = (mu_k / mu_s) F_s, with the ledger and
  the wall taken at the same coefficients (milestone 3b's P = mu_l m g + mu_w F_n);
* hand: a spring k with damping c from a set-point that the robot moves so the push force ramps at
  ``fdot`` N/s while the sheet sticks (``k = None`` is a pure force source). Push only: the hand
  presses the sheet's edge (milestone 3b: palm friction cannot drag it);
* control: the robot sees the sheet move once it has travelled ``d_det``, and ``tau`` seconds later
  the hand has let go (force 0). Kinetic friction then stops the sheet.

``tap`` integrates one push for many sheets at once; ``tap_closed`` is the force-source closed form
it is checked against; ``loop`` repeats taps from either edge until the sheet sits within the larger
of ``tol`` and half the last tap's travel, and returns what is left. Units: SI (m, s, N).
"""
import math

import numpy as np

from . import ledger as L

G = L.G
MASS = L.MASS
F_N = 50.0                  # the press milestone 3b's stiffness and press tables use
KD_OVER_KP = 1.5 / 60.0     # Unitree's G1 arm example gains (kp 60, kd 1.5; humanoid.GAINS), s


def friction(mu_s, ratio, f_n=F_N, m=MASS):
    """(F_s, F_k) in N for static coefficient mu_s and mu_k / mu_s = ratio."""
    fs = mu_s * (m * G + f_n)
    return fs, ratio * fs


def tap_closed(fs, fk, tau, d_det, fdot=0.0, m=MASS):
    """Travel (m) of one tap with a force-source hand, in closed form.

    After breakaway the force is F_s + fdot t, so the sheet accelerates at (dF + fdot t) / m with
    dF = F_s - F_k: x(t) = (dF t^2 / 2 + fdot t^3 / 6) / m. It is seen at x = d_det (t_det, by
    bisection), released at T = t_det + tau, and then stops in v(T)^2 m / (2 F_k)."""
    df = fs - fk

    def x(t):
        return (df * t * t / 2 + fdot * t ** 3 / 6) / m

    lo, hi = 0.0, 1.0
    while x(hi) < d_det:
        hi *= 2
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if x(mid) < d_det else (lo, mid)
    t = (lo + hi) / 2 + tau
    v = (df * t + fdot * t * t / 2) / m
    return x(t) + v * v * m / (2 * fk)


def tap(fs, fk, tau, d_det, k=None, c=None, fdot=200.0, vel_ref=True, m=MASS, dt=2e-5, t_max=5.0):
    """One push on each of n sheets at once. fs, fk: arrays (N). Returns (travel m, seconds).

    The hand starts at 99% of each sheet's breakaway force (the ramp below that moves nothing; its
    seconds are added to the time returned) and ramps at fdot. With a spring k, the set-point
    moves at fdot / k, so the force also relaxes by k x as the sheet runs; damping c defaults to
    Unitree's arm kd / kp times k and acts on (set-point rate - v) with ``vel_ref`` (the command
    carries the set-point's velocity) or on -v without it (a zero velocity command, as many
    examples send). Semi-implicit Euler; a sheet sticks again when its velocity
    reaches 0 with the push below breakaway."""
    fs = np.asarray(fs, float)
    fk = np.asarray(fk, float)
    n = fs.size
    if k is not None and c is None:
        c = KD_OVER_KP * k
    f0 = 0.99 * fs
    ur = 0.0 if k is None else fdot / k                # set-point rate
    cr = 0.0 if k is None else (c * ur if vel_ref else 0.0)
    x = np.zeros(n)
    v = np.zeros(n)
    slip = np.zeros(n, bool)
    seen = np.zeros(n, bool)
    t_rel = np.full(n, np.inf)
    done = np.zeros(n, bool)
    t_done = np.full(n, t_max)
    t = 0.0
    steps = int(t_max / dt)
    for _ in range(steps):
        released = t >= t_rel
        if k is None:
            f = f0 + fdot * t
        else:
            u = (f0 - cr) / k + ur * t         # set-point; total push starts at f0 whatever the damping
            f = np.maximum(0.0, k * (u - x) + cr - c * v)
        f = np.where(released, 0.0, f)
        start = ~slip & ~done & (f > fs)
        slip |= start
        a = np.where(slip, (f - fk) / m, 0.0)
        v = np.where(slip, v + a * dt, 0.0)
        stop = slip & (v <= 0.0)
        v = np.where(stop, 0.0, v)
        slip &= ~stop
        x = x + v * dt
        t += dt
        new = ~seen & (x >= d_det)
        t_rel = np.where(new, t + tau, t_rel)
        seen |= new
        fin = ~done & released & ~slip
        t_done = np.where(fin, t, t_done)
        done |= fin
        if done.all():
            break
    return x, t_done + 0.99 * fs / fdot


def loop(e0, fs_sheet, fk_sheet, tau, d_det, k=None, fdot=200.0, cv_s=0.1, tol=0.1e-3, max_taps=20,
         seed=1, vel_ref=True, m=MASS):
    """Fine positioning from either edge. e0: start errors (m, + means past the target).

    Each tap pushes toward the target from the edge that moves the sheet that way; its breakaway
    force varies tap to tap by a factor 1 + N(0, cv_s) (sliding force fixed per sheet; breakaway
    kept above it). The robot stops once |e| is within max(tol, half the last tap's travel), which
    always terminates because a tap longer than twice the error flips its sign with less error left.
    Returns dict(e = errors left, taps, seconds)."""
    rng = np.random.default_rng(seed)
    e = np.asarray(e0, float).copy()
    n = e.size
    lim = np.full(n, tol)
    taps = np.zeros(n, int)
    secs = np.zeros(n)
    for _ in range(max_taps):
        act = np.abs(e) > lim
        if not act.any():
            break
        idx = np.flatnonzero(act)
        fs = fs_sheet[idx] * (1 + cv_s * rng.standard_normal(idx.size))
        fs = np.maximum(fs, 1.01 * fk_sheet[idx])
        d, s = tap(fs, fk_sheet[idx], tau, d_det, k=k, fdot=fdot, vel_ref=vel_ref, m=m)
        e[idx] -= np.sign(e[idx]) * d
        lim[idx] = np.maximum(tol, d / 2)
        taps[idx] += 1
        secs[idx] += s
    return {"e": e, "taps": taps, "seconds": secs}


def rms(a):
    a = np.asarray(a, float)
    return float(np.sqrt(np.mean(a * a)))
