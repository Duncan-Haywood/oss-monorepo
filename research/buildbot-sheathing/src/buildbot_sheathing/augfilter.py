"""Learning the free-air reading's systematic error with an augmented filter (milestone 78).

Milestones 76 and 77 read the force bias once a sheet in free air, y = e + beta + s Z, and found that a
fixed reading error beta of 0.02 N along one axis, unknown to the filter, takes the tracked policies
from a 1% wall failure to 10 to 12% wherever the margin is thin. beta stands for the gravity-model
error at the reading pose: the same pose every sheet, so the same vector every sheet.

The filter here carries beta in its state. Per axis (axes independent and identical) the state is
(e, beta) with prior beta ~ N(0, sb^2) and e = 0 after the wall's first tare; between readings e
random-walks (variance sigma^2 per second), beta stays. A reading observes e + beta with noise s^2. A tare
(exact, as in milestones 72 to 77) sets e = 0 and zeroes e's variance and its covariance with beta,
but keeps what the filter knows about beta: so every reading taken soon after a tare is a nearly
direct reading of beta, and beta is learnt over the wall. TRACK moves the offset by the posterior
mean of e at every reading, so the residual a press sees is N(0, Pee I), and the carried sheet's
failure is milestone 76's q(0, Pee). Only the variance sequence changes, and, as before, it does not
depend on the readings, so a schedule can be planned before the wall starts.

AUG plans tares like milestone 77's BALANCE (the fewest tares T whose T + 1 balanced runs cost at
most the wall budget B = eps x sheets under the union bound), with the cost now computed by running
the augmented covariance forward over the whole wall, because Pee on a sheet depends on every tare
before it (each one sharpens beta). AUG+R also takes one free-air reading right after every
sheet-start tare, including the wall's first: with e = 0 exactly it reads beta + s Z.

NAIVE is AUG with sb = 0 in the filter: milestone 77's BALANCE, reproduced draw for draw (`simulate`
uses separate random streams for beta and for the post-tare readings so the main stream matches
closedloop.simulate).
"""
import numpy as np

from . import closedloop as C

N_DIM = 3
_Q0_CACHE = {}


class Q0:
    """q(0, P): the carried sheet's failure at a centred residual of variance P, interpolated in
    log q on a grid of sqrt(P) (the chain is evaluated at r = 0 only)."""

    def __init__(self, risk, starts, rest, p_max, n=121):
        self.sd = np.linspace(0.0, np.sqrt(max(p_max, 1e-30)) * 1.0001, n)
        z1 = starts[0] if starts else len(risk.allow)
        upper = risk.edges[1:]
        lq = []
        for sd in self.sd:
            X = C.start_masses(risk.edges, [0.0], np.sqrt(sd ** 2 + risk.sigma ** 2 * risk.tau))
            for l in range(z1):
                if l:
                    X = risk.K.T @ X
                X[upper > risk.allow[l] + 1e-15] = 0.0
            S = float(X.sum()) * np.exp(rest)
            lq.append(np.log(min(max(1.0 - S, 1e-300), 1.0)))
        self.lq = np.array(lq)

    def __call__(self, P):
        return float(np.exp(np.interp(np.sqrt(max(P, 0.0)), self.sd, self.lq)))


def read(P, s):
    """Kalman update of one axis's 2x2 covariance P = [[ee, eb], [eb, bb]] with y = e + beta + s Z."""
    ee, eb, bb = P
    S = ee + 2 * eb + bb + s ** 2
    if S <= 0:
        return P, (0.0, 0.0)
    ke, kb = (ee + eb) / S, (eb + bb) / S
    return (ee - ke * (ee + eb), eb - ke * (eb + bb), bb - kb * (eb + bb)), (ke, kb)


def pee_sequence(n, starts, tau, pre, sigma, s, sheets, tare_at, sb, post_read):
    """Pee at the reading of each sheet k = 1 .. sheets - 1 (the value the tare decision and the carried
    sheet see when sheet k is not tared), for the fixed tare set `tare_at`; entry 0 is 0 (wall start)."""
    last = max(starts) if len(starts) else None
    P = (0.0, 0.0, sb ** 2)
    if post_read:
        P, _ = read(P, s)
    out = [0.0]
    for k in range(1, sheets):
        ee, eb, bb = P
        if last is None:
            ee += sigma ** 2 * tau * n
        else:                               # an in-sheet re-zero clears e; the presses after it remain
            ee, eb = sigma ** 2 * tau * (n - last), 0.0
        ee += sigma ** 2 * pre
        P, _ = read((ee, eb, bb), s)
        out.append(P[0])
        if k in tare_at:
            P = (0.0, 0.0, P[2])
            if post_read:
                P, _ = read(P, s)
    return out


def wall_cost(q0, f0, Pee, tare_at):
    """Union-bound wall failure: f0 on a tared sheet (and sheet 0), q0(Pee_k) on a carried one."""
    return f0 + sum(f0 if k in tare_at else q0(Pee[k]) for k in range(1, len(Pee)))


def schedule(q0, f0, n, starts, tau, pre, sigma, s, sheets, sb, post_read, budget):
    """Fewest tares T, at balanced run starts, whose augmented wall cost is <= budget.
    Returns (tare sheet indices, cost); every sheet tared if none fits."""
    for T in range(sheets):
        runs = C.balanced_runs(sheets, T)
        tare_at = set(int(x) for x in np.cumsum([0] + runs[:-1])[1:])
        Pee = pee_sequence(n, starts, tau, pre, sigma, s, sheets, tare_at, sb, post_read)
        cost = wall_cost(q0, f0, Pee, tare_at)
        if cost <= budget:
            break
    return sorted(tare_at), cost


def plan(allow, tau, pre, sheets, sigma, s, eps, risk, LS_sheet, sb, post_read):
    """The in-sheet plan and the AUG tare schedule for per-sheet level eps (budget eps x sheets)."""
    n = len(allow)
    ip = C.in_sheet_plan(LS_sheet, n, eps)
    if ip is None:
        return None
    starts, rest = ip
    cut = [0] + list(starts) + [n]
    f0 = 1.0 - np.exp(sum(LS_sheet[a][b - a - 1] for a, b in zip(cut[:-1], cut[1:])))
    none = pee_sequence(n, starts, tau, pre, sigma, s, sheets, set(), sb, post_read)
    key = (id(risk), tuple(starts), round(rest, 12), round(max(none), 15))
    if key not in _Q0_CACHE:
        _Q0_CACHE[key] = Q0(risk, starts, rest, max(none))
    q0 = _Q0_CACHE[key]
    tare_at, cost = schedule(q0, f0, n, starts, tau, pre, sigma, s, sheets, sb, post_read, eps * sheets)
    return starts, tare_at, cost, q0, f0


def simulate(allow, tau, pre, sheets, sigma, s, eps, risk, LS_sheet, trials, seed, sb_filter=0.0,
             beta=None, sb_true=None, post_read=False, chunk=1000):
    """Monte Carlo of an AUG wall: (wall failure, mean re-zeros, 95th percentile re-zeros).

    The filter assumes beta ~ N(0, sb_filter^2 I). The true beta is the fixed vector `beta` (3,) if
    given, else drawn per wall from N(0, sb_true^2 I) (0 if sb_true is None). A re-zero count excludes
    the implied first tare, as in milestones 73 to 77."""
    allow = np.asarray(allow, float)
    n = len(allow)
    pl = plan(allow, tau, pre, sheets, sigma, s, eps, risk, LS_sheet, sb_filter, post_read)
    if pl is None:
        return None
    starts, tare_at, _, _, _ = pl
    tare_at = set(tare_at)
    zmask = np.zeros(n, bool)
    zmask[list(starts)] = True
    rng = np.random.default_rng(seed)
    rng_b = np.random.default_rng([seed, 1])
    rng_r = np.random.default_rng([seed, 2])
    sq_tau, sq_pre = sigma * np.sqrt(tau), sigma * np.sqrt(pre)
    fails, counts = [], []
    done = 0
    while done < trials:
        N = min(chunk, trials - done)
        if beta is not None:
            b = np.broadcast_to(np.asarray(beta, float), (N, N_DIM)).copy()
        elif sb_true:
            b = rng_b.standard_normal((N, N_DIM)) * sb_true
        else:
            b = np.zeros((N, N_DIM))
        e = np.zeros((N, N_DIM))
        me = np.zeros((N, N_DIM))           # posterior means of e and beta
        mb = np.zeros((N, N_DIM))
        P = (0.0, 0.0, sb_filter ** 2)

        def post(P, me, mb):
            y = e + b + rng_r.standard_normal((N, N_DIM)) * s
            P, (ke, kb) = read(P, s)
            r = y - me - mb
            return P, me + ke * r, mb + kb * r

        if post_read:
            P, me, mb = post(P, me, mb)
        failed = np.zeros(N, bool)
        cnt = np.zeros(N, int)
        for k in range(sheets):
            if k:
                e += rng.standard_normal((N, N_DIM)) * sq_pre
                ee, eb, bb = P
                P = (ee + sigma ** 2 * pre, eb, bb)
                y = e + rng.standard_normal((N, N_DIM)) * s + b
                P, (ke, kb) = read(P, s)
                r = y - me - mb
                me, mb = me + ke * r, mb + kb * r
                e = e - me                  # TRACK: move the offset by the estimate of e
                me = np.zeros((N, N_DIM))
                if k in tare_at:
                    e[:] = 0.0
                    P = (0.0, 0.0, P[2])
                    cnt += 1
                    if post_read:
                        P, me, mb = post(P, me, mb)
            for l in range(n):
                if zmask[l]:
                    e[:] = 0.0
                    me[:] = 0.0
                    P = (0.0, 0.0, P[2])
                e += rng.standard_normal((N, N_DIM)) * sq_tau
                ee, eb, bb = P
                P = (ee + sigma ** 2 * tau, eb, bb)
                failed |= np.einsum("ij,ij->i", e, e) > allow[l] ** 2
            cnt += len(starts)
        fails.append(failed)
        counts.append(cnt)
        done += N
    f = np.concatenate(fails)
    c = np.concatenate(counts)
    return float(f.mean()), float(c.mean()), float(np.percentile(c, 95))


def calibrate(allow, tau, pre, sheets, sigma, s, alpha, risk, LS_sheet, trials, seed, sb_filter, sb_true,
              post_read, iters=14):
    """Largest eps (log bisection) whose Monte Carlo wall failure, beta drawn from N(0, sb_true^2 I),
    is <= alpha. Returns (eps, (failure, mean, p95)) or None."""
    sim = lambda x: simulate(allow, tau, pre, sheets, sigma, s, x, risk, LS_sheet, trials, seed, sb_filter,
                             sb_true=sb_true, post_read=post_read)
    lo, hi = np.log(alpha / sheets / 10), np.log(0.5)
    r_lo = sim(np.exp(lo))
    if r_lo is None or r_lo[0] > alpha:
        return None
    best = (float(np.exp(lo)), r_lo)
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        r = sim(np.exp(mid))
        if r is not None and r[0] <= alpha:
            lo, best = mid, (float(np.exp(mid)), r)
        else:
            hi = mid
    return best
