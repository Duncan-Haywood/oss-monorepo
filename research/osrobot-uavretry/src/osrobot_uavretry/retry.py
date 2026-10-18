"""Retry a scrubbed launch later in the day, on top of osrobot-uavnogo (imported from ../osrobot-uavnogo/src and its siblings).

Wind magnitude follows a Markov chain over the bins of the osrobot-uavgust folded-normal pmf. The chain is a Gaussian
copula: a latent AR(1) z with correlation rho between slots, mapped to the bin whose quantile interval holds Phi(z).
Every row of the transition matrix sums to 1 and the marginal stays close to the pmf (the latent value is taken at the
bin's mid-quantile, so the stationary law is approximate; `stationary_error` reports by how much).
A day has K slots. At each slot the crew gets a fresh forecast |w| + e (e ~ Normal(0, sf), independent between slots)
and launches if it is at most the limit L; the first launch ends the day as completed or failed. Exact, no sampling.
All inputs are scenario assumptions, not site data.
"""
from statistics import NormalDist
from osrobot_uavnogo.nogo import p_launch, TOL
from osrobot_uavgust.gust import stay

N = NormalDist()


def _inv(p):
    return N.inv_cdf(min(max(p, 1e-12), 1 - 1e-12))


def transition(pmf, rho):
    """Row-stochastic matrix T[i][j] = P(bin j next slot | bin i)."""
    cum, c = [0.0], 0.0
    for _, p in pmf:
        c += p
        cum.append(c)
    edges = [_inv(x) if 0 < x < 1 else (-9.0 if x <= 0 else 9.0) for x in cum]
    s = (1 - rho * rho) ** 0.5
    T = []
    for i in range(len(pmf)):
        z = _inv((cum[i] + cum[i + 1]) / 2)
        row = []
        for j in range(len(pmf)):
            if s == 0:
                row.append(1.0 if edges[j] <= z < edges[j + 1] else 0.0)
            else:
                row.append(N.cdf((edges[j + 1] - rho * z) / s) - N.cdf((edges[j] - rho * z) / s))
        t = sum(row)
        T.append([r / t for r in row])
    return T


def stationary_error(pmf, T):
    """Max |(pmf T)_j - pmf_j|."""
    p = [q for _, q in pmf]
    return max(abs(sum(p[i] * T[i][j] for i in range(len(p))) - p[j]) for j in range(len(p)))


def day(kind, design, ms, pmf, T, limit, sf, slots):
    """(P(completed), P(failed), P(no launch all day), expected attempts used) for a day of `slots` slots."""
    n = len(pmf)
    ok = []
    for w, _ in pmf:
        s = stay(kind, design, ms, w, False)
        ok.append(s is not None and s >= ms.loiter - TOL)
    pl = [p_launch(w, limit, sf) for w, _ in pmf]
    wait = [p for _, p in pmf]
    done = fail = used = 0.0
    for k in range(slots):
        used += sum(wait)
        nxt = [0.0] * n
        for i in range(n):
            m = wait[i]
            if m == 0:
                continue
            if ok[i]:
                done += m * pl[i]
            else:
                fail += m * pl[i]
            stay_m = m * (1 - pl[i])
            if k < slots - 1 and stay_m:
                for j in range(n):
                    nxt[j] += stay_m * T[i][j]
        wait = nxt
    return done, fail, 1 - done - fail, used
