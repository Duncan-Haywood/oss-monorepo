"""Tack control on a wind time series: three controllers and a bound, for a boat beating to a mark dead to windward.

Wind is spatially uniform, speed s(t) and direction-from d(t) on a 1-minute grid. The mark lies on the bearing `phi` (the
window's circular-mean wind direction), so the boat must work upwind. On tack sigma (+1 or -1) the heading is d + sigma*beta(s),
so the angle to the line is eps + sigma*beta with eps = d - phi, progress rate v(s) cos(eps + sigma beta) and cross-line rate
v(s) sin(eps + sigma beta). A corridor |y| <= C about the line is enforced (a survey boat holds its line); y is clamped at the
edge. A tack costs `tau` seconds of no progress. Controllers: corridor-edge tacking, header-following (tack when the other tack
makes more progress by a margin, after a minimum dwell, plus forced edge tacks), and a clairvoyant dynamic programme. The
bound is the sum over time of the better tack's progress with no corridor and no tack cost.
"""
import math
import numpy as np


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def circ_mean(deg):
    r = np.radians(deg)
    return math.degrees(math.atan2(np.mean(np.sin(r)), np.mean(np.cos(r)))) % 360.0


def rates(s, eps, vfun, bfun, vmin=1.5):
    """Per-step progress and cross rates (m/s) on each tack: arrays shape (2, n) for sigma = +1, -1."""
    v = np.where(s >= vmin, vfun(s), 0.0)
    b = bfun(s)
    out_p, out_c = [], []
    for sg in (1.0, -1.0):
        ang = np.radians(eps + sg * b)
        # a tack that loses ground is not sailed (the boat would bear away or use the other tack): progress is floored at zero
        out_p.append(np.maximum(v * np.cos(ang), 0.0)); out_c.append(v * np.sin(ang))
    return np.array(out_p), np.array(out_c)


def bound(p, dt):
    return float(np.sum(np.maximum(p[0], p[1])) * dt)


def sim_corridor(p, c, dt, corr, tau):
    x, y, sg, n_t = 0.0, 0.0, 0, 0
    pen = 0.0
    for k in range(p.shape[1]):
        f = 1.0 - pen
        pen = 0.0
        x += p[sg, k] * dt * f
        y += c[sg, k] * dt * f
        if y >= corr and c[sg, k] > 0 or y <= -corr and c[sg, k] < 0:
            y = max(-corr, min(corr, y))
            sg ^= 1; n_t += 1; pen = min(1.0, tau / dt)
    return x, n_t


def sim_header(p, c, dt, corr, tau, margin, dwell_steps):
    x, y, sg, n_t, since = 0.0, 0.0, 0, 0, 10 ** 9
    pen = 0.0
    for k in range(p.shape[1]):
        f = 1.0 - pen
        pen = 0.0
        x += p[sg, k] * dt * f
        y += c[sg, k] * dt * f
        since += 1
        edge = (y >= corr and c[sg, k] > 0) or (y <= -corr and c[sg, k] < 0)
        headed = since >= dwell_steps and p[1 - sg, k] - p[sg, k] > margin * max(p[0, k], p[1, k], 1e-9)
        # do not tack onto a tack that heads straight out of the corridor
        out = (y >= corr and c[1 - sg, k] > 0) or (y <= -corr and c[1 - sg, k] < 0)
        if edge or (headed and not out):
            y = max(-corr, min(corr, y))
            sg ^= 1; n_t += 1; pen = min(1.0, tau / dt); since = 0
    return x, n_t


def dp_clairvoyant(p, c, dt, corr, tau, dy=25.0):
    """Best total progress over all tack sequences with the whole wind series known (value iteration over (tack, y))."""
    grid = np.arange(-corr, corr + dy / 2, dy)
    n = p.shape[1]
    V = np.zeros((2, len(grid)))
    for k in range(n - 1, -1, -1):
        new = np.empty_like(V)
        for sg in (0, 1):
            # stay on tack sg
            y2 = np.clip(grid + c[sg, k] * dt, -corr, corr)
            stay = p[sg, k] * dt + np.interp(y2, grid, V[sg])
            # tack at the start of this step onto the other tack: that step is shortened by tau/dt
            o = 1 - sg
            f = 1.0 - min(1.0, tau / dt)
            y3 = np.clip(grid + c[o, k] * dt * f, -corr, corr)
            sw = p[o, k] * dt * f + np.interp(y3, grid, V[o])
            new[sg] = np.maximum(stay, sw)
        V = new
    return float(max(V[0][len(grid) // 2], V[1][len(grid) // 2]))


def sim_mpc(p, c, dt, corr, tau, horizon, fcfun, step=5, dy=50.0, margin=0.0):
    """Receding-horizon tack control on a forecast. Every `step` minutes the controller gets the forecast rates for the next
    `horizon` minutes, fcfun(k) -> (pf, cf) arrays of shape (2, horizon) on the 1-minute grid, plans the best tack sequence on
    `step`-minute blocks by value iteration over (tack, y), and executes only its first decision on the true rates p, c. The
    corridor edge forces a tack as in sim_corridor. A voluntary tack also needs the plan to beat staying by `margin` times
    the block's best forecast progress (hysteresis against chattering on forecast noise). Returns (progress m, number of tacks)."""
    grid = np.arange(-corr, corr + dy / 2, dy)
    nb = max(1, horizon // step)
    f = 1.0 - min(1.0, tau / (step * dt))      # share of a block left after a tack
    x, y, sg, n_t, pen = 0.0, 0.0, 0, 0, 0.0
    n = p.shape[1]
    for k0 in range(0, n, step):
        pf, cf = fcfun(k0)
        m = pf.shape[1] // step
        # forecast block means (progress, cross) per tack, in metres per block
        pb = pf[:, :m * step].reshape(2, m, step).mean(axis=2) * step * dt
        cb = cf[:, :m * step].reshape(2, m, step).mean(axis=2) * step * dt
        V = np.zeros((2, len(grid)))
        for j in range(m - 1, 0, -1):
            new = np.empty_like(V)
            for s_ in (0, 1):
                o = 1 - s_
                stay = pb[s_, j] + np.interp(np.clip(grid + cb[s_, j], -corr, corr), grid, V[s_])
                sw = pb[o, j] * f + np.interp(np.clip(grid + cb[o, j] * f, -corr, corr), grid, V[o])
                new[s_] = np.maximum(stay, sw)
            V = new
        if m >= 1:
            stay = pb[sg, 0] + np.interp(np.clip(y + cb[sg, 0], -corr, corr), grid, V[sg])
            o = 1 - sg
            sw = pb[o, 0] * f + np.interp(np.clip(y + cb[o, 0] * f, -corr, corr), grid, V[o])
            tack_now = sw > stay + margin * max(pb[0, 0], pb[1, 0])
        else:
            tack_now = False
        if tack_now:
            sg ^= 1; n_t += 1; pen = min(1.0, tau / dt)
        for k in range(k0, min(k0 + step, n)):
            fac = 1.0 - pen
            pen = 0.0
            x += p[sg, k] * dt * fac
            y += c[sg, k] * dt * fac
            if (y >= corr and c[sg, k] > 0) or (y <= -corr and c[sg, k] < 0):
                y = max(-corr, min(corr, y))
                sg ^= 1; n_t += 1; pen = min(1.0, tau / dt)
    return x, n_t


def dp_values(p, c, dt, corr, tau, dy=25.0, edge_tack=True):
    """Backward value iteration as in dp_clairvoyant, but keeping V[k] for every step k (shape (n+1, 2, G)) so the result
    can be used as a feedback policy. Returns (grid, V).

    dp_clairvoyant lets the boat sit on the corridor edge and keep its full progress with no tack (y is only clamped), while
    sim_corridor, sim_header and sim_policy force a tack at the edge. With edge_tack=True (default) the DP obeys the same rule:
    a step whose raw cross-line motion leaves the corridor is followed by a tack at the next step (the value of the other
    tack, at the clamped y, with the tack loss). edge_tack=False reproduces dp_clairvoyant exactly."""
    grid = np.arange(-corr, corr + dy / 2, dy)
    n = p.shape[1]
    V = np.zeros((n + 1, 2, len(grid)))
    SW = np.zeros((n + 1, 2, len(grid)))   # value of tacking at the start of step k, by current tack sg
    f = 1.0 - min(1.0, tau / dt)
    for k in range(n - 1, -1, -1):
        for sg in (0, 1):
            o = 1 - sg
            raw = grid + c[sg, k] * dt
            stay = p[sg, k] * dt + np.interp(np.clip(raw, -corr, corr), grid, V[k + 1, sg])
            if edge_tack:
                hit = ((raw >= corr) & (c[sg, k] > 0)) | ((raw <= -corr) & (c[sg, k] < 0))
                forced = p[sg, k] * dt + np.interp(np.clip(raw, -corr, corr), grid, SW[k + 1, sg])
                stay = np.where(hit, forced, stay)
            sw = p[o, k] * dt * f + np.interp(np.clip(grid + c[o, k] * dt * f, -corr, corr), grid, V[k + 1, o])
            SW[k, sg] = sw
            V[k, sg] = np.maximum(stay, sw)
    return grid, V


def sim_policy(p, c, ps, cs, dt, corr, tau, grid, V, margin=0.0):
    """Execute, on the TRUE rates (p, c), the tack policy that is optimal for the model rates (ps, cs) whose value table is V
    (dp_values on ps, cs). Each minute the boat observes its own state (tack, y) and tacks when switching beats staying in the
    model by `margin` times the model's best progress that step. The corridor edge forces a tack as in sim_corridor. With
    (ps, cs) = (p, c) this is the clairvoyant policy; with a smoothed (ps, cs) it is a controller that knows the wind's slow
    behaviour for the whole day exactly and nothing faster. Returns (progress m, number of tacks)."""
    f = 1.0 - min(1.0, tau / dt)
    x, y, sg, n_t, pen = 0.0, 0.0, 0, 0, 0.0
    for k in range(p.shape[1]):
        o = 1 - sg
        stay = ps[sg, k] * dt + np.interp(np.clip(y + cs[sg, k] * dt, -corr, corr), grid, V[k + 1, sg])
        sw = ps[o, k] * dt * f + np.interp(np.clip(y + cs[o, k] * dt * f, -corr, corr), grid, V[k + 1, o])
        if sw > stay + margin * max(ps[0, k], ps[1, k]) * dt:
            sg = o; n_t += 1; pen = min(1.0, tau / dt)
        fac = 1.0 - pen
        pen = 0.0
        x += p[sg, k] * dt * fac
        y += c[sg, k] * dt * fac
        if (y >= corr and c[sg, k] > 0) or (y <= -corr and c[sg, k] < 0):
            y = max(-corr, min(corr, y))
            sg ^= 1; n_t += 1; pen = min(1.0, tau / dt)
    return x, n_t


def smooth(a, width):
    """Centred moving average of each row of a (shape (2, n)) over `width` minutes, edges handled by shrinking the window."""
    if width <= 1:
        return a
    k = np.ones(width)
    num = np.array([np.convolve(r, k, mode="same") for r in a])
    den = np.convolve(np.ones(a.shape[1]), k, mode="same")
    return num / den


def sim_replan(p, c, dt, corr, tau, forecast, every=60, margin=0.0, dwell=0):
    """Receding full-day controller. At step k0 (every `every` steps) call forecast(k0) -> (ps, cs), model rates for steps
    k0..n-1 (shape (2, n-k0)); solve dp_values on them and follow that policy on the TRUE rates until the next replan.
    The boat tacks only when switching beats staying by `margin` times the best model progress of that step (0 = 5d), and only if at least `dwell` steps have passed since the last tack of either kind (0 = 5d). The boat's own tack and y carry over. Returns (progress m, number of tacks)."""
    f = 1.0 - min(1.0, tau / dt)
    n = p.shape[1]
    x, y, sg, n_t, pen = 0.0, 0.0, 0, 0, 0.0
    last = -10**9
    for k0 in range(0, n, every):
        ps, cs = forecast(k0)
        grid, V = dp_values(ps, cs, dt, corr, tau)
        for k in range(k0, min(n, k0 + every)):
            j, o = k - k0, 1 - sg
            stay = ps[sg, j] * dt + np.interp(np.clip(y + cs[sg, j] * dt, -corr, corr), grid, V[j + 1, sg])
            sw = ps[o, j] * dt * f + np.interp(np.clip(y + cs[o, j] * dt * f, -corr, corr), grid, V[j + 1, o])
            if sw > stay + margin * max(ps[0, j], ps[1, j]) * dt and k - last >= dwell:
                sg = o; n_t += 1; pen = min(1.0, tau / dt); last = k
            fac = 1.0 - pen
            pen = 0.0
            x += p[sg, k] * dt * fac
            y += c[sg, k] * dt * fac
            if (y >= corr and c[sg, k] > 0) or (y <= -corr and c[sg, k] < 0):
                y = max(-corr, min(corr, y))
                sg ^= 1; n_t += 1; pen = min(1.0, tau / dt); last = k
    return x, n_t


def lead_forecast(p, c, k0, T, smooth_min=15, trail=60):
    """Model rates for steps k0.. : weight a(L) = exp(-L/T) on the truth smoothed to `smooth_min` minutes plus (1-a) on the
    trailing `trail`-minute mean of that smoothed truth up to k0 (persistence). T=inf is a perfect smoothed forecast, T=0
    persistence. Only data before k0 enter the persistence term."""
    out = []
    for r in (p, c):
        sm = smooth(r, smooth_min)[:, k0:]
        past = smooth(r, smooth_min)[:, max(0, k0 - trail):k0 + 1].mean(axis=1, keepdims=True)
        L = np.arange(sm.shape[1])[None, :]
        a = np.ones_like(L, dtype=float) if np.isinf(T) else (np.exp(-L / T) if T > 0 else (L == 0) * 1.0)
        out.append(a * sm + (1 - a) * past)
    return out[0], out[1]
