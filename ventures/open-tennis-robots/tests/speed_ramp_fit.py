"""A ball's drop on a speed-mode ESC read as a current-limited ramp, then the PI loop's tail (2026-11-18,
firmware/esp32/README.md "A ramp-then-PI drop fit for a speed-mode ESC"). Host-side, not on the board.

`speed_loop_fit.drop_from_speed_loop` models the recovery as a linear PI loop's error. A ball takes 6-10% of the
speed, the loop's proportional term then asks for more acceleration than the motor's current limit gives, and while it
is clamped the wheel recovers on a ramp the linear kernel lacks: up to 95% off on 10 and 20 Hz loops
(eval/speed-loop-survey-2026-11-18.txt). This adds the ramp. The ESC modelled is the simulator's
(tests/loop_residual_sweep.py): a PI loop with natural frequency wn and damping z on the wheel's speed, its output an
acceleration clamped at the current limit a, the integrator frozen while clamped, and the wheel's own drag w / tau.

Two numbers per build come from a spin-up rather than a ball: `spinup_fit` reads a and tau from the tach while the
wheel spins up from rest at the current limit (VESC current mode, or a speed setpoint above what the wheel can reach),
where dw/dt = a - w / tau. With them, after a ball of share D (fractions of the speed w0 before it, s = w0):

  ramp   e(t) = 1 - W - (1 - D - W) e^-t/tau, W = a tau / w0, while the proportional term 2 z wn e plus the held
         integrator w0 / tau exceeds a, so until e falls to e* = (a - w0 / tau) / (2 z wn w0);
  tail   e(t) = e* x'(t - t1), x' the linear loop's error kernel with the drag folded in (damping z + 1 / (2 tau wn)),
         from the exit time t1 = tau ln((1 - D - W) / (1 - e* - W)), the integrator still at its pre-ball value.

A ball under e* never clamps and the model is the linear one (with the drag). Each revolution's mean of e is closed-form
in both pieces, so the fit is linear in the offset, a transient from before the window and the board's setpoint steps,
and searched in D (golden section on the residual after the linear part), with t0 searched as
`speed_loop_fit.drop_from_speed_loop` does.
"""

import math

from feeder_sim import controller     # noqa: E402

_anchor, _solve_small = controller._anchor, controller._solve_small
SEEN_MIN = 0.05         # below it a drop is marked unsure: the revolutions barely show the ball (README)
SE_T0 = True            # the se counts the ball's time as a fitted parameter
CLAMP_STEPS = True      # the board's setpoint steps during the clamp (BallResponse.plan)
TRANSIENT2 = False      # a second transient column for the loop's integrator state before the window


class Kernel:
    """The linear loop's error after a unit step with no integrator offset: x(0) = 1, x'(0) = -2 z wn, for any damping
    (rates per microsecond). `X(t)` is its integral from 0 to t (0 for t <= 0), `x(t)` the error itself."""

    def __init__(self, wn, z):
        if abs(z - 1.0) < 1e-6:
            z = 1.0 + 1e-6
        self.wn2 = wn * wn
        self.under = z < 1.0
        if self.under:
            self.sig, self.wd = z * wn, wn * math.sqrt(1.0 - z * z)
        else:
            q = wn * math.sqrt(z * z - 1.0)
            self.r1, self.r2 = -z * wn + q, -z * wn - q

    def X(self, t):
        if t <= 0:
            return 0.0
        if self.under:
            return math.exp(-self.sig * t) * math.sin(self.wd * t) / self.wd
        return (math.exp(self.r1 * t) - math.exp(self.r2 * t)) / (self.r1 - self.r2)

    def XX(self, t):
        """The integral of X from 0 to t."""
        if t <= 0:
            return 0.0
        if self.under:
            s, w = self.sig, self.wd
            return (w - math.exp(-s * t) * (s * math.sin(w * t) + w * math.cos(w * t))) / (s * s + w * w) / w
        r1, r2 = self.r1, self.r2
        return ((math.exp(r1 * t) - 1.0) / r1 - (math.exp(r2 * t) - 1.0) / r2) / (r1 - r2)

    def x(self, t):
        if t <= 0:
            return 1.0
        if self.under:
            s, w = self.sig, self.wd
            return math.exp(-s * t) * (math.cos(w * t) - s / w * math.sin(w * t))
        r1, r2 = self.r1, self.r2
        return (r1 * math.exp(r1 * t) - r2 * math.exp(r2 * t)) / (r1 - r2)


class BallResponse:
    """The deficit after a ball, as a share of w0, for one build (a, tau) and loop (wn, z) at speed w0 (rpm).
    `G(t, D)` is its integral from the ball to t; `e(t, D)` the deficit itself."""

    def __init__(self, a_rpm_s, tau_s, f_hz, z, w0_rpm):
        self.tau = tau_s * 1e6                                    # us
        self.W = a_rpm_s * tau_s / w0_rpm
        wn_s = 2.0 * math.pi * f_hz
        self.es = (a_rpm_s - w0_rpm / tau_s) / (2.0 * z * wn_s * w0_rpm)
        self.k = Kernel(wn_s * 1e-6, z + 1.0 / (2.0 * tau_s * wn_s))
        self.ok = self.es > 0 and self.W > 1.0

    def exit_time(self, D):
        if D <= self.es:
            return 0.0
        num, den = 1.0 - D - self.W, 1.0 - self.es - self.W
        return self.tau * math.log(num / den)

    def G(self, t, D, t1=None):
        if t <= 0:
            return 0.0
        if D <= self.es:
            return D * self.k.X(t)
        t1 = self.exit_time(D) if t1 is None else t1
        tr = min(t, t1)
        g = (1.0 - self.W) * tr - (1.0 - D - self.W) * self.tau * (1.0 - math.exp(-tr / self.tau))
        if t > t1:
            g += self.es * self.k.X(t - t1)
        return g

    def plan(self, D, steps):
        """The ball's part of the deficit when the board steps the setpoint while the ESC is clamped: `steps` are
        (time after the ball in us, step as a share of w0). Clamped, the wheel ignores a setpoint step but it moves
        the exit (the error must fall to e* below the new setpoint) and, after the exit, the state the linear tail
        starts from: the integrator is still at its pre-ball value, w0 / tau, so it sits du / tau below the new
        setpoint's resting value. The fit's linear step column adds every step as if the wheel had answered it, so
        this term is the truth minus that: during the clamp the ramp plus the steps' linear answer taken back out,
        after it the linear loop from the difference between the true state and the steps' linear state.
        Returns (t1, the steps inside the clamp, de, dJ), for `Gp`."""
        if D <= self.es:
            return (0.0, (), 0.0, 0.0)
        tau, W = self.tau, self.W
        cum, t1 = 0.0, None
        bounds = [t for t, _ in steps if t > 0] + [math.inf]
        k, seg_lo = 0, 0.0
        inside = []
        for t_s, du in steps:
            if t_s <= 0:
                continue
            # exit inside [seg_lo, t_s)? e_ramp(t) + cum = es
            target = self.es - cum
            if target < D:
                num, den = 1.0 - D - W, 1.0 - target - W
                te = tau * math.log(num / den) if den < 0 else math.inf
                if te < t_s:
                    t1 = max(te, seg_lo)
                    break
            else:
                t1 = seg_lo
                break
            cum += du
            inside.append((t_s, du))
            seg_lo = t_s
        if t1 is None:
            target = self.es - cum
            if target >= D:
                t1 = seg_lo
            else:
                num, den = 1.0 - D - W, 1.0 - target - W
                t1 = max(tau * math.log(num / den), seg_lo) if den < 0 else math.inf
        K = self.k
        es_true = self.es
        J_true = -cum / tau
        eS, JS = 0.0, 0.0
        for t_s, du in inside:
            q = t1 - t_s
            eS += du * (K.x(q) + K.X(q) / tau)
            JS += du * (-1.0 / tau + K.wn2 * (K.X(q) + K.XX(q) / tau))
        return (t1, tuple(inside), es_true - eS, J_true - JS)

    def Gp(self, t, D, pl):
        """The integral from the ball to t of the ball's part, for a `plan`."""
        if t <= 0:
            return 0.0
        t1, inside, de, dJ = pl
        if D <= self.es:
            return D * self.k.X(t)
        K, tau = self.k, self.tau
        tr = min(t, t1)
        g = (1.0 - self.W) * tr - (1.0 - D - self.W) * tau * (1.0 - math.exp(-tr / tau))
        for t_s, du in inside:
            if t_s < tr:
                q = tr - t_s
                g += du * (q - K.X(q) - K.XX(q) / tau)
        if t > t1:
            q = t - t1
            # the steps' linear answers keep running after the exit: from t1 on they are in the fit's own column, so
            # only the difference state is added here; but the column also counted them between t_s and t1, which
            # the ramp term above has already taken back out
            g += de * K.X(q) - dJ * K.XX(q)
        return g

    def e(self, t, D):
        if t < 0:
            return 0.0
        if D <= self.es:
            return D * self.k.x(t)
        t1 = self.exit_time(D)
        if t <= t1:
            return 1.0 - self.W - (1.0 - D - self.W) * math.exp(-t / self.tau)
        return self.es * self.k.x(t - t1)


def spinup_fit(periods, start_us=0.0, taus=None, upto=None):
    """The current limit a (rpm/s) and drag time constant tau (s) from a spin-up from rest at the limit, where
    dw/dt = a - w / tau, so the revolutions turned by time t are a/60 (tau t - tau^2 (1 - e^-t/tau)).

    `periods` are the tach's periods from the first edge after the command, `start_us` the time from the command to
    that first edge. For each tau the edge count n + phi is linear in a (phi the unknown phase of the first edge), and
    tau is searched by golden section (between 0.02 and 5 s unless `taus` = (lo, hi)). `upto` keeps only the edges
    before that time (us). Returns (a, tau, rms of the edge count) or None."""
    ts = [start_us]
    for p in periods:
        ts.append(ts[-1] + p)
    if upto is not None:
        ts = [t for t in ts if t <= upto]
    if len(ts) < 6:
        return None
    ns = list(range(len(ts)))

    def solve(tau):
        tu = tau * 1e6
        h = [(tu * t - tu * tu * (1.0 - math.exp(-t / tu))) / 60e6 * 1e-6 for t in ts]     # revolutions per rpm/s
        # n = a h - phi: least squares in (a, phi)
        m = [[sum(v * v for v in h), -sum(h)], [-sum(h), float(len(h))]]
        v = [sum(h[i] * ns[i] for i in range(len(h))), -float(sum(ns))]
        x = _solve_small(m, v)
        if x is None:
            return None
        sse = sum((ns[i] - x[0] * h[i] + x[1]) ** 2 for i in range(len(h)))
        return sse, x[0]

    lo, hi = taus or (0.02, 5.0)
    lo, hi = math.log(lo), math.log(hi)
    g = (math.sqrt(5) - 1) / 2
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    fc, fd = solve(math.exp(c)), solve(math.exp(d))
    for _ in range(60):
        if fc is None or fd is None:
            return None
        if fc[0] < fd[0]:
            hi, d, fd = d, c, fc
            c = hi - g * (hi - lo)
            fc = solve(math.exp(c))
        else:
            lo, c, fc = c, d, fd
            d = lo + g * (hi - lo)
            fd = solve(math.exp(d))
    tau = math.exp((lo + hi) / 2)
    r = solve(tau)
    if r is None:
        return None
    return r[1], tau, math.sqrt(r[0] / len(ts))


def drop_from_speed_ramp(periods, ticks, a_rpm_s, tau_s, min_fall=0.003, pre=4, after=8, hz=(5.0,), zetas=(0.7,),
                         levels=3, d_max=0.5, rpm_full=9000.0):
    """A ball's drop on a speed-mode ESC with current limit `a_rpm_s` and drag `tau_s` (from `spinup_fit`), its loop
    searched on `hz` x `zetas`. Same window, anchor and t0 search as `speed_loop_fit.drop_from_speed_loop`, the same
    return: (drop, rpm, revolutions, natural frequency in Hz, rms, se, damping) or None.

        y(t) = c + A x(t - ts) - W sum_i du_i (1 - x(t - t_i)) + e_ball(t - t0; D)

    with x the drag-folded kernel and e_ball the ramp-then-tail response above; D by golden section on (0, d_max)."""
    n = len(periods)
    if n < pre + 4:
        return None
    k = _anchor(periods)
    if k < pre + 1:
        return None
    w0 = 3.0 / (periods[k - 4] + periods[k - 3] + periods[k - 2])
    w0_rpm = w0 * 60e6
    J = k - 1 if 1.0 / periods[k - 1] < w0 * (1.0 - min_fall) else k
    j0, j1 = k - 1 - pre, min(n, J + after)
    if j1 - k < 3:
        return None
    T = [0.0]
    for p in periods:
        T.append(T[-1] + p)
    ts, tend = T[j0], T[j1]
    u0, last, steps = None, None, []
    for c, since, u in ticks:
        if 0 <= c < len(T):
            t = T[c] + since
            if t <= ts:
                u0 = last = u
            elif t < tend:
                if last is None:
                    u0 = last = u
                elif u != last:
                    steps.append((t, u - last))
                last = u
    if u0 is None:
        return None
    nr = j1 - j0
    ys = [1.0 - 1.0 / (periods[j] * w0) for j in range(j0, j1)]
    t_lo, t_hi = T[k - 1], T[k + 1]
    edges = [(T[j0 + i], T[j0 + i + 1]) for i in range(nr)]

    best = None
    for f in hz:
        for z in zetas:
            br = BallResponse(a_rpm_s, tau_s, f, z, w0_rpm)
            if not br.ok:
                continue
            K = br.k

            def xbar(a, b, s):
                return (K.X(b - s) - K.X(a - s)) / (b - a)

            def Xbar(a, b, s):
                return (K.XX(b - s) - K.XX(a - s)) / (b - a)

            def ones(a, b, s):
                return (max(b - s, 0.0) - max(a - s, 0.0)) / (b - a)

            # a setpoint step moves the integrator's resting value by du / tau as well, so its error is
            # du (x + X / tau), not du x as on a drag-free wheel
            tu = br.tau
            F = []
            for a, b in edges:
                h = sum(du * (ones(a, b, t) - xbar(a, b, t) - Xbar(a, b, t) / tu) for t, du in steps)
                row = [1.0, xbar(a, b, ts)]
                if TRANSIENT2:
                    row.append(Xbar(a, b, ts))
                if steps:
                    row.append(-h)
                F.append(tuple(row))
            nf = len(F[0])
            mf = [[sum(F[i][r] * F[i][q] for i in range(nr)) for q in range(nf)] for r in range(nf)]
            # the linear part's projector: residual SSE of r after the least-squares fit of F
            inv = []
            for r in range(nf):
                col = _solve_small(mf, [1.0 if q == r else 0.0 for q in range(nf)])
                if col is None:
                    inv = None
                    break
                inv.append(col)
            if inv is None:
                continue

            def sse_of(gs):
                r = [ys[i] - gs[i] for i in range(nr)]
                v = [sum(F[i][q] * r[i] for i in range(nr)) for q in range(nf)]
                x = [sum(inv[q][p] * v[p] for p in range(nf)) for q in range(nf)]
                return sum(rr * rr for rr in r) - sum(x[q] * v[q] for q in range(nf)), x

            def gbar(t0, D):
                if CLAMP_STEPS and steps:
                    pl = br.plan(D, [(t - t0, du * rpm_full / w0_rpm) for t, du in steps])
                    return [(br.Gp(b - t0, D, pl) - br.Gp(a - t0, D, pl)) / (b - a) for a, b in edges]
                t1 = br.exit_time(D)
                return [(br.G(b - t0, D, t1) - br.G(a - t0, D, t1)) / (b - a) for a, b in edges]

            def at(t0):
                # golden section on D for this t0
                lo, hi = 1e-4, d_max
                g = (math.sqrt(5) - 1) / 2
                c, d = hi - g * (hi - lo), lo + g * (hi - lo)
                fc, fd = sse_of(gbar(t0, c))[0], sse_of(gbar(t0, d))[0]
                for _ in range(32):
                    if fc < fd:
                        hi, d, fd = d, c, fc
                        c = hi - g * (hi - lo)
                        fc = sse_of(gbar(t0, c))[0]
                    else:
                        lo, c, fc = c, d, fd
                        d = lo + g * (hi - lo)
                        fd = sse_of(gbar(t0, d))[0]
                D = (lo + hi) / 2
                s, x = sse_of(gbar(t0, D))
                return (s, t0, D, x, f, z, br)

            lo, hi = t_lo, t_hi
            here = None
            for _ in range(levels):
                st = (hi - lo) / 8
                for gi in range(9):
                    r = at(lo + st * gi)
                    if here is None or r[0] < here[0]:
                        here = r
                lo, hi = max(t_lo, here[1] - st), min(t_hi, here[1] + st)
            if best is None or here[0] < best[0]:
                best = here + (F, inv, gbar)
    if best is None:
        return None
    sse, t0, D, xs, f, z, br, F, inv, gbar = best
    K = br.k
    c1, A = xs[0], xs[1]
    A2 = xs[2] if TRANSIENT2 else 0.0
    Wn = xs[-1] if steps else 0.0
    h_t0 = sum(du * (1.0 - K.x(t0 - t) - K.X(t0 - t) / br.tau) for t, du in steps if t < t0)
    before = 1.0 - (c1 + A * K.x(t0 - ts) + A2 * K.X(t0 - ts) - Wn * h_t0)
    drop = D / before if before > 0 else 0.0
    if not 0.0 < drop < 1.0 or D >= d_max * 0.999:
        return None
    dof = nr - len(F[0]) - 1 - 3
    s2 = max(sse, 0.0) / dof if dof > 0 else 0.0
    rms = math.sqrt(s2) / before
    # se of D from the linearised model: F's columns plus dG/dD (numerical), the last diagonal of the inverse
    eps = max(D * 1e-4, 1e-7)
    dg = [(p - m) / (2 * eps) for p, m in zip(gbar(t0, D + eps), gbar(t0, max(D - eps, 1e-9)))]
    nf = len(F[0])
    cols = [[F[i][q] for i in range(nr)] for q in range(nf)]
    if SE_T0:
        # the ball's time is fitted too: a ball whose recovery ends inside a revolution or two leaves D and t0
        # trading against each other, which only this column shows
        h = 20.0
        cols.append([(p - m) / (2 * h) for p, m in zip(gbar(t0 + h, D), gbar(t0 - h, D))])
        nf += 1
    cols.append(dg)
    m = [[sum(cols[r][i] * cols[q][i] for i in range(nr)) for q in range(nf + 1)] for r in range(nf + 1)]
    iv = _solve_small(m, [0.0] * nf + [1.0])
    se = math.sqrt(s2 * iv[-1]) / before / drop if iv is not None and iv[-1] > 0 else 1.0
    # how much of the ball the revolutions show: the rms over the window of the part of dG/dD no other column
    # (offset, transient, steps, the ball's time) can stand in for, per unit drop (1 when every revolution carries the
    # whole drop, near 0 when the recovery ends inside the ball's own revolution)
    seen = 1.0 / math.sqrt(iv[-1] * nr) if iv is not None and iv[-1] > 0 else 0.0
    return (drop, w0 * before * 60e6, j1 - k + 1, f, rms, se, z, seen)



def loop_from_steps(periods, start_us, steps, tau_s, hz=None, zetas=None, refine=3):
    """The ESC's speed loop (natural frequency in Hz, damping) from small setpoint steps on a free wheel, no ball
    (2026-11-18, README "A ramp-then-PI drop fit for a speed-mode ESC"). The board moves its command by the shares
    `steps` = [(time in us, share of the speed), ...] (say up 2% and back, four times), small enough that the ESC's
    drive stays under its current limit; the wheel follows each as 1 - x - X / tau of it (x the drag-folded kernel).
    `periods` are the tach's periods from an edge at `start_us`, on the steps' clock. Each revolution's mean speed is
    closed-form, so for a given (f, z) the fit is linear in the speed before the steps and their common scale;
    (f, z) is the least squared residual on a log grid of 1-40 Hz x 0.2-0.95, then refined. Returns (f, z, rms) or
    None. `step_clamped` says whether a step at that loop asked the ESC for more than its limit."""
    hz = hz or tuple(math.exp(i * math.log(40.0) / 47) for i in range(48))
    zetas = zetas or tuple(0.2 + 0.025 * i for i in range(31))
    T = [start_us]
    for p in periods:
        T.append(T[-1] + p)
    t_first = min(t for t, _ in steps)
    rows = [(T[i], T[i + 1], 1.0 / periods[i]) for i in range(len(periods)) if T[i + 1] > t_first - 50000]
    if len(rows) < 8:
        return None
    tu = tau_s * 1e6

    def sse(f, z):
        wn = 2 * math.pi * f
        K = Kernel(wn * 1e-6, z + 1.0 / (2.0 * tau_s * wn))
        cols = []
        for a, b, _ in rows:
            c = 0.0
            for t_s, du in steps:
                ra, rb = a - t_s, b - t_s
                if rb <= 0:
                    continue
                c += du * ((max(rb, 0.0) - max(ra, 0.0)) - (K.X(rb) - K.X(ra)) - (K.XX(rb) - K.XX(ra)) / tu) / (b - a)
            cols.append(c)
        n = len(rows)
        sx, sxx = sum(cols), sum(c * c for c in cols)
        sy, sxy = sum(r[2] for r in rows), sum(c * r[2] for c, r in zip(cols, rows))
        det = n * sxx - sx * sx
        if abs(det) < 1e-30:
            return math.inf
        g = (n * sxy - sx * sy) / det
        w0 = (sy - g * sx) / n
        return sum((r[2] - w0 - g * c) ** 2 for c, r in zip(cols, rows)) / (w0 * w0)

    best = min(((sse(f, z), f, z) for f in hz for z in zetas))
    rh, dz = math.log(hz[1] / hz[0]), zetas[1] - zetas[0]
    for _ in range(refine):
        rh, dz = rh / 2, dz / 2
        s0, f0, z0 = best
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                f, z = f0 * math.exp(i * rh), z0 + j * dz
                if z > 0.05:
                    best = min(best, (sse(f, z), f, z))
    return best[1], best[2], math.sqrt(best[0] / len(rows))


def step_clamped(rpm, du, f_hz, z, a_rpm_s, tau_s):
    """Whether a setpoint step of share `du` at `rpm` asks a PI loop (f_hz, z) for more than the limit a: its
    proportional term 2 z wn du rpm on top of the drag rpm / tau."""
    return 2.0 * z * 2.0 * math.pi * f_hz * abs(du) * rpm + rpm * (1 + abs(du)) / tau_s > a_rpm_s
