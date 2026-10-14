"""Scalar loop-closure filter.  Between closures the robot's position error gains drift variance R (real) but the twin
it was tuned in says T.  At each closure it sees nu = e + v (v ~ N(0, m^2)), and with probability pi the closure is
aliased (matched to the wrong place) and nu also carries an offset Delta ~ N(0, D^2).  The robot tracks its own
covariance P (predict +T, update with gain K = P^-/(P^- + m^2), skip on rejection) and accepts iff
nu^2 <= g (P^- + m^2), g the chi-square(1) quantile chosen at design.  The real error is simulated with the real R."""
import math, random

__all__ = ["chi2_1_quantile", "twin_riccati", "twin_claim", "ungated_real_var", "accept_prob_gaussian",
           "run_chains", "fit_drift", "best_gate"]


def _phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def chi2_1_quantile(p):
    """P(chi2_1 <= g) = p, i.e. g = z^2 with 2 Phi(z) - 1 = p (bisection)."""
    lo, hi = 0.0, 40.0
    for _ in range(200):
        z = (lo + hi) / 2
        lo, hi = (z, hi) if 2 * _phi(z) - 1 < p else (lo, z)
    return ((lo + hi) / 2) ** 2


def twin_riccati(T, m):
    """Stationary prior variance x = P^- of the all-accepted filter: x^2 - T x - T m^2 = 0."""
    return (T + math.sqrt(T * T + 4 * T * m * m)) / 2


def twin_claim(T, m):
    """Posterior variance the twin claims at steady state, and its gain."""
    x = twin_riccati(T, m)
    K = x / (x + m * m)
    return (1 - K) * x, K


def ungated_real_var(T, R, m):
    """Exact stationary real posterior variance when every closure is accepted with the twin's stationary gain:
    V = ((1-K)^2 R + K^2 m^2) / (1 - (1-K)^2)."""
    _, K = twin_claim(T, m)
    return ((1 - K) ** 2 * R + K * K * m * m) / (1 - (1 - K) ** 2)


def accept_prob_gaussian(T, R, m, g):
    """Probability that a genuine closure passes the gate at steady state when every earlier closure was accepted:
    the innovation has real variance V + R + m^2 but the gate scale is x + m^2, so P = 2 Phi(sqrt(g (x+m^2)/(V+R+m^2))) - 1."""
    x = twin_riccati(T, m)
    V = ungated_real_var(T, R, m)
    s = math.sqrt(g * (x + m * m) / (V + R + m * m))
    return 2 * _phi(s) - 1


def run_chains(T, R, m, g, pi=0.0, D=0.0, cycles=300, burn=60, chains=1000, seed=0, T_filter=None, lost_at=5.0):
    """Simulate the gated filter.  T_filter is the drift variance the robot believes (default T).  Returns a dict of
    time-averaged real posterior mean square error, genuine-closure acceptance, aliased-closure acceptance, and the
    mean claimed posterior variance, and the fraction of time the real error exceeds `lost_at` (in units of m)."""
    rng = random.Random(seed)
    Tf = T if T_filter is None else T_filter
    sR, sm = math.sqrt(R), m
    se = ac = ag = al = aa = 0
    ng = na = 0
    claim = 0.0
    lost = 0
    cnt = 0
    for _ in range(chains):
        e, P = 0.0, 0.0
        for k in range(cycles):
            e += rng.gauss(0, sR)
            Pm = P + Tf
            S = Pm + m * m
            alias = pi > 0 and rng.random() < pi
            nu = e + rng.gauss(0, sm) + (rng.gauss(0, D) if alias else 0.0)
            ok = nu * nu <= g * S
            if ok:
                K = Pm / S
                e = e - K * nu
                P = (1 - K) * Pm
            else:
                P = Pm
            if k >= burn:
                cnt += 1
                se += e * e
                lost += abs(e) > lost_at * m
                claim += P
                if alias:
                    na += 1
                    aa += ok
                else:
                    ng += 1
                    ag += ok
    return {"mse": se / cnt, "acc_genuine": ag / max(ng, 1), "acc_alias": aa / max(na, 1) if na else float("nan"),
            "claim": claim / cnt, "lost": lost / cnt}


def fit_drift(samples):
    """Estimate the real per-cycle drift variance from n measured ground-truth drifts (zero-mean, so mean of squares)."""
    return sum(x * x for x in samples) / len(samples)


def best_gate(T, R, m, pi, D, gates, **kw):
    """Grid search of the gate g minimising real MSE (filter tuned with the real drift R)."""
    res = [(run_chains(R, R, m, g, pi, D, **kw)["mse"], g) for g in gates]
    return min(res)
