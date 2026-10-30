"""A toy structural-demographic civilization (after Turchin 2003; Turchin and Nefedov 2009).

Land is fixed, so output is Cobb-Douglas F = N**a (a = 0.5). Peasants keep their marginal product
w = a N**(a-1); the rent R = (1-a) N**a goes to the state (share tau) and to elites. Population
grows when w exceeds subsistence s0 and falls below it: dN/dt = r N (w/s0 - 1), whose fixed
point N* = 1 is the Malthusian equilibrium (s0 = a). Elites E grow when their income per head
beats their aspiration e0 (elite overproduction). The state's fiscal strength S relaxes to
tau R / (g E) (more elites per rent means thinner pay for officials). Political stress
PSI = (E/E*)(s0/w)/S, with E* the elite number at equilibrium, drives instability
psi = 1/(1 + exp(-k (PSI - 1))), which kills peasants (rate m) and elites (rate me) per year.

Not measured: tau, g, k, m, me, rho, e0. They are swept in experiments/history/run.py. r is capped
by the 1-2% a year of pre-industrial growth; the published check is the 150-400 year period of
secular cycles (Turchin and Nefedov 2009).
"""
import numpy as np

A = 0.5
S0 = A


def run(years=3000, dt=0.5, r=0.015, tau=0.3, g=1.0, k=4.0, m=0.02, me=0.04, rho=0.02,
        elite_cap=None, welfare=0.0, n0=0.5, e0f=0.05, seed=0, noise=0.0):
    """Returns arrays t, N, E, S, psi sampled each year. Levers: elite_cap (max elite
    number, a ceiling on recruitment), welfare (share of rent paid to peasants as a transfer)."""
    rng = np.random.default_rng(seed)
    R_star = (1 - A)                       # rent at N = 1
    Estar = e0f                            # elite number at equilibrium by definition of e0
    e0 = (1 - tau) * R_star / Estar        # aspiration: income per elite at N = 1, E = E*
    N, E = n0, Estar
    S = tau * R_star / (g * Estar)
    steps = int(years / dt)
    out = np.empty((steps, 4))
    for i in range(steps):
        w = A * N ** (A - 1) + welfare * (1 - A) * N ** A / N
        R = (1 - A) * N ** A * (1 - welfare)
        PSI = (E / Estar) * (S0 / w) / S
        psi = 1 / (1 + np.exp(-k * (PSI - 1)))
        ei = (1 - tau) * R / E
        dN = r * N * (w / S0 - 1) - m * psi * N
        dE = rho * E * (ei / e0 - 1) - me * psi * E
        if elite_cap is not None and E >= elite_cap and dE > 0:
            dE = 0.0
        dS = 0.1 * (tau * R / (g * max(E, 1e-6)) - S)
        N = max(N + dt * dN + (noise * N * rng.normal() * dt ** 0.5 if noise else 0), 1e-3)
        E = max(E + dt * dE, 1e-4)
        S = max(S + dt * dS, 1e-3)
        out[i] = (N, E, S, psi)
    idx = np.arange(0, steps, int(round(1 / dt)))
    return np.arange(len(idx)), out[idx, 0], out[idx, 1], out[idx, 2], out[idx, 3]


def summary(t, N, E, S, psi, burn=500):
    """Mean instability, share of years with psi > 0.5, worst population fall, and the period of
    the dominant cycle (autocorrelation peak, years; 0 if no cycle)."""
    p = psi[burn:]
    n = N[burn:]
    x = n - n.mean()
    period = 0
    if x.std() > 1e-3:
        ac = np.correlate(x, x, "full")[len(x) - 1:]
        ac /= ac[0]
        for lag in range(20, len(x) // 2):
            if ac[lag] > ac[lag - 1] and ac[lag] >= ac[lag + 1] and ac[lag] > 0.2:
                period = lag
                break
    return {"psi_mean": float(p.mean()), "unrest_share": float((p > 0.5).mean()),
            "n_min": float(n.min()), "n_cv": float(n.std() / n.mean()), "period": period}
