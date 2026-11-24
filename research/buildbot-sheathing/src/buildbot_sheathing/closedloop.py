"""Closed-loop re-zero schedules from one noisy bias reading a sheet (milestone 76).

Milestones 73 to 75 scheduled re-zeros open loop: the schedule is fixed before the wall starts, and
milestone 75 found the fewest re-zeros of any such schedule (OPT). Here the robot also reads the
force bias once a sheet, in free air during the sheet's sense stage (after placing it, before its
first nail), with Gaussian noise of standard deviation s on each axis. Two ways to use it:

* READ: keep the sensor's offset, and tare (a full re-zero, cost c) only when the reading says the
  coming sheet is too risky;
* TRACK: subtract the filtered estimate from the offset at every reading (free, software only), and
  tare only when the estimate's own uncertainty makes the coming sheet too risky.

Model. Pure random walk, the bias b(t) = b0 + sigma W(t) in 3-D (milestone 73's RW). The residual
e = b - offset is what a press sees; a press is certified while ||e|| <= a at its end. A tare sets
e = 0 exactly (as in milestones 72 to 75). Between readings e random-walks; a reading is
y = e + beta + s Z, beta an optional fixed systematic error unknown to the filter. The filter is a
Kalman filter with isotropic variance P: predict P += sigma^2 h, update with gain P / (P + s^2).
After a reading, e ~ N(m, P I) given the readings (beta = 0), and P does not depend on the readings,
only on the times since the last tare.

Per-sheet chance constraint. At the sheet start the policy knows (m, P). The sheet is run with a
fixed in-sheet plan Z: the fewest in-sheet re-zeros that keep the sheet's failure from a fresh tare
at or below eps (one sheet, `riskdp.optimal`). Skipping the sheet-start tare ("carry") leaves the
first segment, up to Z's first in-sheet re-zero, starting from e ~ N(m, P I). Its survival is the
radial chain of milestone 75 started from the law of ||e|| at the first press, which is the
noncentral chi law ||N(m, (P + sigma^2 tau) I)|| (the norm of x + sigma W is a 3-D Bessel process for
any start x, so a mixture over x is the Bessel process with the mixed start law). q(r, P) is the
carried sheet's failure for ||m|| = r. READ tares when q(||m||, P) > eps; TRACK sets m = 0 by moving
the offset and tares when q(0, P) > eps. eps is calibrated per row so the wall's Monte Carlo failure
is at most alpha (`simulate`).
"""
import numpy as np
from scipy import stats

from . import riskdp as Q

N_DIM = 3


def start_masses(edges, r, sd):
    """Cell masses of ||x + sd Z|| for ||x|| = r (array) and Z standard 3-D normal: one column per r."""
    r = np.atleast_1d(np.asarray(r, float))
    out = np.empty((len(edges) - 1, len(r)))
    for c, rv in enumerate(r):
        if rv <= 1e-9 * sd:
            cdf = stats.chi2.cdf(edges ** 2 / sd ** 2, N_DIM)
        else:
            cdf = Q.radial_cdf(edges, rv, sd)
        out[:, c] = np.clip(np.diff(cdf), 0.0, None)
    return out


class SheetRisk:
    """Survival of a carried first segment on one sheet, cached by the start variance P.

    The sheet is `allow` (one allowance a press) with every press lasting tau and no gaps inside the
    sheet. `surv(P)` returns S[l, k]: probability that presses 0..l all stay inside their
    allowances when e at the reading is N(m, P I) with ||m|| = r_grid[k]."""

    def __init__(self, allow, tau, sigma, r_max=None, n_r=81, dr_frac=1 / 3):
        self.allow = np.asarray(allow, float)
        self.tau, self.sigma = float(tau), float(sigma)
        dr = dr_frac * sigma * np.sqrt(tau)
        self.edges = Q.grid(self.allow, dr)
        self.K = Q.kernel(self.edges, sigma, tau)
        self.r = np.linspace(0.0, self.allow.max() if r_max is None else r_max, n_r)
        self._cache = {}

    def surv(self, P):
        key = round(float(P) / (self.sigma ** 2 * self.tau), 6)
        if key not in self._cache:
            upper = self.edges[1:]
            X = start_masses(self.edges, self.r, np.sqrt(P + self.sigma ** 2 * self.tau))
            out = np.empty((len(self.allow), len(self.r)))
            for l, a in enumerate(self.allow):
                if l:
                    X = self.K.T @ X
                X[upper > a + 1e-15] = 0.0
                out[l] = X.sum(axis=0)
            self._cache[key] = out
        return self._cache[key]


def in_sheet_plan(LS_sheet, n, eps):
    """Fewest in-sheet re-zeros (positions > 0) with the sheet's failure from a tare <= eps, and the
    log survival of the segments after the first one. None if no plan reaches eps."""
    res = Q.optimal(LS_sheet, n, n, eps, kmax=n)
    if res is None:
        return None
    _, starts, _ = res
    cut = [0] + list(starts) + [n]
    rest = 0.0
    for a, b in zip(cut[1:-1], cut[2:]):
        rest += LS_sheet[a][b - a - 1]
    return list(starts), rest


def carry_fail(risk, P, starts, rest_logsurv):
    """q(r_grid, P): the carried sheet's failure for each ||m|| on the grid."""
    S = risk.surv(P)
    z1 = starts[0] if starts else len(risk.allow)
    return 1.0 - S[z1 - 1] * np.exp(rest_logsurv)


def threshold(q, r, eps):
    """Largest ||m|| with carried failure <= eps (linear interpolation on the grid; q increasing
    in r); -1 when even r = 0 is over eps."""
    if q[0] > eps:
        return -1.0
    bad = np.flatnonzero(q > eps)
    if bad.size == 0:
        return float(r[-1])
    k = bad[0]
    return float(r[k - 1] + (eps - q[k - 1]) / (q[k] - q[k - 1]) * (r[k] - r[k - 1]))


def simulate(policy, allow, tau, pre, sheets, sigma, s, eps, risk, LS_sheet, trials, seed,
             beta=0.0, chunk=1000):
    """Monte Carlo of a closed-loop wall: (wall failure, mean re-zeros, 95th percentile re-zeros).

    policy 'READ' or 'TRACK'; s the reading noise sd a axis (N); beta a systematic reading error
    along x (N); eps the per-sheet risk level. A re-zero count excludes the implied first tare."""
    allow = np.asarray(allow, float)
    n = len(allow)
    plan = in_sheet_plan(LS_sheet, n, eps)
    if plan is None:
        return None
    starts, rest = plan
    zmask = np.zeros(n, bool)
    zmask[list(starts)] = True
    q_tab = {}

    def qtab(P):
        k = round(float(P) / (sigma ** 2 * tau), 6)
        if k not in q_tab:
            q = carry_fail(risk, P, starts, rest)
            q_tab[k] = (q, threshold(q, risk.r, eps))
        return q_tab[k]

    rng = np.random.default_rng(seed)
    fails, counts = [], []
    done = 0
    sq_tau, sq_pre = sigma * np.sqrt(tau), sigma * np.sqrt(pre)
    while done < trials:
        N = min(chunk, trials - done)
        e = np.zeros((N, N_DIM))             # residual seen by a press
        m = np.zeros((N, N_DIM))
        P = np.zeros(N)
        failed = np.zeros(N, bool)
        cnt = np.zeros(N, int)
        for k in range(sheets):
            if k:
                e += rng.standard_normal((N, N_DIM)) * sq_pre
                P = P + sigma ** 2 * pre
                if s > 0 or beta:
                    y = e + rng.standard_normal((N, N_DIM)) * s
                    y[:, 0] += beta
                    K = P / (P + s ** 2) if s > 0 else np.ones(N)
                    m = m + K[:, None] * (y - m)
                    P = P * (1.0 - K)
                else:
                    m, P = e.copy(), np.zeros(N)
                if policy == "TRACK":
                    e = e - m
                    m[:] = 0.0
                tare = np.zeros(N, bool)
                for pv in np.unique(np.round(P, 15)):
                    sel = np.abs(P - pv) <= 1e-15
                    q, th = qtab(pv)
                    if policy == "READ":
                        tare[sel] = np.linalg.norm(m[sel], axis=1) > th
                    else:
                        tare[sel] = q[0] > eps
                e[tare] = 0.0
                m[tare] = 0.0
                P[tare] = 0.0
                cnt += tare
            for l in range(n):
                if zmask[l]:
                    e[:] = 0.0
                    m[:] = 0.0
                    P[:] = 0.0
                e += rng.standard_normal((N, N_DIM)) * sq_tau
                P = P + sigma ** 2 * tau
                failed |= np.einsum("ij,ij->i", e, e) > allow[l] ** 2
            cnt += len(starts)
        fails.append(failed)
        counts.append(cnt)
        done += N
    f = np.concatenate(fails)
    c = np.concatenate(counts)
    return float(f.mean()), float(c.mean()), float(np.percentile(c, 95))


def calibrate(policy, allow, tau, pre, sheets, sigma, s, alpha, risk, LS_sheet, trials, seed,
              beta=0.0, iters=14):
    """Largest per-sheet eps (log bisection) whose Monte Carlo wall failure is <= alpha.
    Returns (eps, (failure, mean, p95)) or None when the smallest eps fails."""
    lo, hi = np.log(alpha / sheets / 10), np.log(0.5)
    r_lo = simulate(policy, allow, tau, pre, sheets, sigma, s, np.exp(lo), risk, LS_sheet, trials, seed, beta)
    if r_lo is None or r_lo[0] > alpha:
        return None
    best = (float(np.exp(lo)), r_lo)
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        r = simulate(policy, allow, tau, pre, sheets, sigma, s, np.exp(mid), risk, LS_sheet, trials, seed, beta)
        if r is not None and r[0] <= alpha:
            lo, best = mid, (float(np.exp(mid)), r)
        else:
            hi = mid
    return best
