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
        elite_cap=None, welfare=0.0, n0=0.5, e0f=0.05, seed=0, noise=0.0, lag=0.0, plag=0.0,
        collapse_thr=None, collapse_elite=0.5, collapse_pop=0.2, refractory=50, psi_reset=1.0,
        a=A, collapse_fiscal=0.1):
    """Returns arrays t, N, E, S, psi sampled each year. Levers: elite_cap (max elite
    number, a ceiling on recruitment), welfare (share of rent paid to peasants as a transfer).
    collapse_thr: if set, a state collapse fires when instability psi reaches it (and at least
    `refractory` years since the last): elites lose the fraction collapse_elite, peasants
    collapse_pop, fiscal strength resets to a tenth, and stress memory (plag > 0) resets to
    psi_reset (1.0, the default, is where psi = 0.5; None keeps the memory). a is the labour
    share of output (subsistence s0 = a keeps N* = 1); collapse_fiscal is the factor fiscal
    strength is cut to at a collapse (0.1; 1.0 keeps S). Returns the same
    five arrays; collapse years are in run.collapses (list) of the last call."""
    run.collapses = []
    last = -10 ** 9
    rng = np.random.default_rng(seed)
    R_star = (1 - a)                       # rent at N = 1
    Estar = e0f                            # elite number at equilibrium by definition of e0
    e0 = (1 - tau) * R_star / Estar        # aspiration: income per elite at N = 1, E = E*
    N, E = n0, Estar
    ei_s = e0                              # lagged elite income (lag > 0)
    PSI_s = 1.0                            # lagged stress (plag > 0)
    S = tau * R_star / (g * Estar)
    steps = int(years / dt)
    out = np.empty((steps, 4))
    for i in range(steps):
        w = a * N ** (a - 1) + welfare * (1 - a) * N ** a / N
        R = (1 - a) * N ** a * (1 - welfare)
        PSI = (E / Estar) * (a / w) / S
        if plag > 0:
            PSI_s += dt * (PSI - PSI_s) / plag
            PSI = PSI_s
        psi = 1 / (1 + np.exp(-k * (PSI - 1)))
        ei = (1 - tau) * R / E
        if lag > 0:
            ei_s += dt * (ei - ei_s) / lag
            ei = ei_s
        dN = r * N * (w / a - 1) - m * psi * N
        dE = rho * E * (ei / e0 - 1) - me * psi * E
        if elite_cap is not None and E >= elite_cap and dE > 0:
            dE = 0.0
        dS = 0.1 * (tau * R / (g * max(E, 1e-6)) - S)
        if collapse_thr is not None and psi >= collapse_thr and i * dt - last >= refractory:
            last = i * dt
            run.collapses.append(last)
            E *= 1 - collapse_elite
            N *= 1 - collapse_pop
            S *= collapse_fiscal
            if psi_reset is not None:
                PSI_s = psi_reset
            ei_s = e0
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


def stress_terms(N, E, S, tau=0.3, g=1.0, e0f=0.05, a=A, welfare=0.0):
    """Exact split of log PSI (sixth run, LOG.md 2026-11-13). With S_ss = tau R / (g E) the
    target fiscal strength, log PSI = 2 log(E/E*) + (1 - 2a) log N + log(S_ss/S) + offset,
    offset = log(g E* / (tau (1 - a))) + log(a / ((a + welfare (1 - a)) (1 - welfare))).
    Returns an array (..., 4): elite, population, fiscal lag, offset."""
    N, E, S = (np.asarray(x, float) for x in (N, E, S))
    R = (1 - a) * N ** a * (1 - welfare)
    s_ss = tau * R / (g * E)
    off = np.log(g * e0f / (tau * (1 - a))) + np.log(a / ((a + welfare * (1 - a)) * (1 - welfare)))
    return np.stack([2 * np.log(E / e0f), (1 - 2 * a) * np.log(N), np.log(s_ss / S),
                     np.full(N.shape, off)], axis=-1)


def log_psi(N, E, S, e0f=0.05, a=A, welfare=0.0):
    """log PSI computed directly from its definition (E/E*)(s0/w)/S, s0 = a."""
    N, E, S = (np.asarray(x, float) for x in (N, E, S))
    w = a * N ** (a - 1) + welfare * (1 - a) * N ** a / N
    return np.log((E / e0f) * (a / w) / S)
