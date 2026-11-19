"""A ball's drop read on a wheel whose ESC runs its own speed loop: a host-side fit, tried and kept off the board
(2026-11-18, firmware/esp32/README.md "An ESC with its own speed loop").

`controller.drop_from_commands` models the wheel as one lag of the board's commands. Behind an ESC that holds an rpm
setpoint with a PI loop, every such fit on the simulator was marked unsure or found nothing to fit. This models the
recovery as that PI loop's error instead. It reads a drop to 0.01% on wheels built from its own model and within 0.3%
on the simulator's when the ESC is not current-limited, but a ball saturates a fast loop at the motor's stall
acceleration and the linear model then misses (tests/speed_loop_survey.py). Not ported to the board.
"""

import math

from feeder_sim import controller     # noqa: E402

_anchor, _solve_small = controller._anchor, controller._solve_small

# The closed loop's natural frequencies (Hz) and damping ratios searched when none are given.
SPEED_LOOP_HZ = (1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0, 24.0, 32.0)
SPEED_LOOP_ZETA = (0.3, 0.45, 0.6, 0.75, 0.9)


def _pi_X(t, sig, wd):
    """The integral from 0 to t of a PI speed loop's error after a unit step, x(t) = e^-sig t (cos wd t - sig / wd
    sin wd t): X(t) = e^-sig t sin(wd t) / wd (0 for t <= 0)."""
    if t <= 0:
        return 0.0
    return math.exp(-sig * t) * math.sin(wd * t) / wd


def drop_from_speed_loop(periods, ticks, min_fall=0.003, pre=4, after=8, hz=None, zetas=None, levels=3):
    """A ball's drop on one wheel whose ESC holds its speed with a PI loop of its own (2026-11-18, README "An ESC
    with its own speed loop").

    A PI loop with natural frequency wn and damping z answers a step in its error, whether the setpoint stepped or a
    ball took a share D of the speed, with the error x(t) = e^-sig t (cos wd t - sig / wd sin wd t), sig = z wn,
    wd = wn sqrt(1 - z^2), whose integral has the closed form `_pi_X`. So the wheel's deficit below the speed before
    the window is

        y(t) = c + A x(t - ts) - W sum_i du_i (1 - x(t - t_i)) + D x(t - t0) [t > t0]

    with du_i the setpoint's steps (the commands the board's own loop sent) and t0 the ball. Each revolution's mean is
    closed-form, so for a given (wn, z, t0) the fit is linear in c, A, W and D. (wn, z) are searched on `hz` x `zetas`,
    t0 on nested grids over the two revolutions either side of the slowest one's start, as `drop_from_commands_steps`.

    Same arguments and the same first items as `drop_from_commands`: (drop, rpm, revolutions, natural frequency in
    Hz, rms, se, damping) or None. The x(t) above ignores the wheel's own drag and the ESC's current limit."""
    hz = SPEED_LOOP_HZ if hz is None else hz
    zetas = SPEED_LOOP_ZETA if zetas is None else zetas
    n = len(periods)
    if n < pre + 4:
        return None
    k = _anchor(periods)
    if k < pre + 1:
        return None
    w0 = 3.0 / (periods[k - 4] + periods[k - 3] + periods[k - 2])
    J = k - 1 if 1.0 / periods[k - 1] < w0 * (1.0 - min_fall) else k
    j0, j1 = k - 1 - pre, min(n, J + after)
    if j1 - k < 3:
        return None
    T = [0.0]
    for p in periods:
        T.append(T[-1] + p)
    ts, tend = T[j0], T[j1]
    u0 = None
    steps = []                       # (time, setpoint step) inside the window
    last = None
    for c, since, u in ticks:
        if 0 <= c < len(T):
            t = T[c] + since
            if t <= ts:
                u0 = u
                last = u
            elif t < tend:
                if last is None:
                    u0 = last = u       # no command logged before the window: the first one is taken as held
                elif u != last:
                    steps.append((t, u - last))
                last = u
    if u0 is None:
        return None
    nr = j1 - j0
    ys = [1.0 - 1.0 / (periods[j] * w0) for j in range(j0, j1)]
    t_lo, t_hi = T[k - 1], T[k + 1]

    def xbar(a, b, s, sig, wd):
        return (_pi_X(b - s, sig, wd) - _pi_X(a - s, sig, wd)) / (b - a)

    def ones(a, b, s):
        return (max(b - s, 0.0) - max(a - s, 0.0)) / (b - a)

    best = None
    for f in hz:
        wn = 2.0 * math.pi * f * 1e-6
        for z in zetas:
            sig, wd = z * wn, wn * math.sqrt(1.0 - z * z)
            F = []
            for idx in range(nr):
                a, b = T[j0 + idx], T[j0 + idx + 1]
                h = 0.0
                for t, du in steps:
                    h += du * (ones(a, b, t) - xbar(a, b, t, sig, wd))
                F.append((1.0, xbar(a, b, ts, sig, wd), -h))
            if not steps:
                F = [row[:2] for row in F]      # a setpoint that never moved: no W column (it would be all zero)
            nf = len(F[0])
            mf = [[sum(F[i][r] * F[i][q] for i in range(nr)) for q in range(nf)] for r in range(nf)]
            vf = [sum(F[i][r] * ys[i] for i in range(nr)) for r in range(nf)]

            def at(t0):
                ds = [xbar(T[j0 + i], T[j0 + i + 1], t0, sig, wd) for i in range(nr)]
                cross = [sum(ds[i] * F[i][r] for i in range(nr)) for r in range(nf)]
                mdd = sum(d * d for d in ds)
                vd = sum(ds[i] * ys[i] for i in range(nr))
                m = [mf[r] + [cross[r]] for r in range(nf)] + [cross + [mdd]]
                x = _solve_small(m, vf + [vd])
                if x is None:
                    return None
                sse = 0.0
                for i in range(nr):
                    e = ys[i] - x[nf] * ds[i]
                    for r in range(nf):
                        e -= x[r] * F[i][r]
                    sse += e * e
                if nf == 2:
                    x = x[:2] + [0.0] + x[2:]
                    m = None
                return (sse, t0, x, m, f, z, sig, wd)

            lo, hi = t_lo, t_hi
            here = None
            for _ in range(levels):
                st = (hi - lo) / 8
                for g in range(9):
                    r = at(lo + st * g)
                    if r is not None and (here is None or r[0] < here[0]):
                        here = r
                if here is None:
                    break
                lo, hi = max(t_lo, here[1] - st), min(t_hi, here[1] + st)
            if here is not None and (best is None or here[0] < best[0]):
                best = here
    if best is None:
        return None
    sse, t0, xs, mn, f, z, sig, wd = best
    c1, A, Wn, D = xs
    # the deficit just before the ball: the model's value at t0
    x_ts = math.exp(-sig * (t0 - ts)) * (math.cos(wd * (t0 - ts)) - sig / wd * math.sin(wd * (t0 - ts)))
    h_t0 = 0.0
    for t, du in steps:
        if t < t0:
            q = t0 - t
            h_t0 += du * (1.0 - math.exp(-sig * q) * (math.cos(wd * q) - sig / wd * math.sin(wd * q)))
    before = 1.0 - (c1 + A * x_ts - Wn * h_t0)
    drop = D / before if before > 0 else 0.0
    if not 0.0 < drop < 1.0:
        return None
    dof = nr - 4 - 3
    s2 = sse / dof if dof > 0 else 0.0
    rms = math.sqrt(s2) / before
    inv = _solve_small(mn, [0.0, 0.0, 0.0, 1.0]) if mn is not None else None
    se = math.sqrt(s2 * inv[-1]) / before / drop if inv is not None and inv[-1] > 0 else 1.0
    return (drop, w0 * before * 60e6, j1 - k + 1, f, rms, se, z)
