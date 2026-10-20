"""Stake as a screening device for workers with hidden fault rates (stdlib only).
A worker has a hidden per-job fault probability th (heterogeneous hardware). A contract (w, s) pays w for a job whose
result is clean and slashes s on a detected fault; locking s costs the worker rho*s per job; the job costs c.
    worker utility   u(th; w, s) = (1-th) w - th s - rho s - c          (outside option 0)
    designer profit  v(th; w, s) = (1-th)(V-w) + th (s-h)               (value V per clean job, cost h per fault, slash s kept)
Single crossing: the indifference slope dw/ds = (th+rho)/(1-th) rises with th, so a *reliable* worker is the one who
would copy a high-stake contract, not the unreliable one.  Consequences (see paper):
 * two types: with the unreliable type's IR binding, the reliable type's rent is (thH-thL)(c+(1+rho)s_H)/(1-thH),
   minimised at s_H = 0;
 * continuous types: the envelope U'(th) = -(w+s) makes rent linear in th under a flat contract, so a flat contract is
   optimal and a stake never raises profit;
 * a stake that is needed for deterrence (spot-check-slashing etc.) multiplies every reliable worker's rent by
   (c+(1+rho)s)/c and shrinks the pool to more reliable workers."""
import random

__all__ = ["util", "profit", "rent_two_type", "wage_H_two_type", "cutoff", "flat_profit", "best_wage", "best_stake",
           "flat_rent", "pool_fault_rate", "menu_profit", "random_menu_search", "simulate_flat", "serve_both", "pi_threshold"]


def util(th, w, s, c, rho):
    return (1 - th) * w - th * s - rho * s - c


def profit(th, w, s, V, h):
    return (1 - th) * (V - w) + th * (s - h)


def wage_H_two_type(thH, s, c, rho):
    """Wage that makes the unreliable type exactly indifferent (IR binds)."""
    return (c + (rho + thH) * s) / (1 - thH)


def rent_two_type(thL, thH, s_H, c, rho):
    """Rent of the reliable type mimicking the unreliable type's zero-rent contract (w_H, s_H)."""
    return (thH - thL) * (c + (1 + rho) * s_H) / (1 - thH)


def serve_both(thL, thH, piH, V, c, h):
    """With s_H = 0 (rho irrelevant), serve the unreliable type iff pi_H*S_H >= pi_L*rent, S = surplus (1-th)V - th h - c."""
    S_H = (1 - thH) * V - thH * h - c
    return piH * S_H >= (1 - piH) * rent_two_type(thL, thH, 0.0, c, 0.0)


def pi_threshold(thL, thH, V, c, h):
    """Smallest share of unreliable workers for which serving them is worth the reliable type's rent R:
    pi_H >= R/(R+S_H)."""
    S_H = (1 - thH) * V - thH * h - c
    R = rent_two_type(thL, thH, 0.0, c, 0.0)
    return 1.0 if S_H <= 0 else R / (R + S_H)


def cutoff(w, s, c, rho, thmax):
    """Worst reliability that accepts the flat contract: (1-th)w - th s - rho s - c >= 0."""
    return max(0.0, min(thmax, (w - c - rho * s) / (w + s)))


def flat_profit(w, s, V, c, h, rho, thmax):
    """Mean profit per *potential* worker, th ~ U[0, thmax], everyone below the cutoff accepts the flat contract (w, s)."""
    t = cutoff(w, s, c, rho, thmax)
    return ((V - w) * (t - t * t / 2) + (s - h) * t * t / 2) / thmax


def flat_rent(w, s, c, rho, thmax):
    """Mean worker rent under the flat contract (w, s)."""
    t = cutoff(w, s, c, rho, thmax)
    # integral over [0,t] of (1-th)w - th s - rho s - c
    return ((w - c - rho * s) * t - (w + s) * t * t / 2) / thmax


def pool_fault_rate(w, s, c, rho, thmax):
    """Mean fault probability among participants (uniform types below the cutoff): cutoff/2."""
    return cutoff(w, s, c, rho, thmax) / 2


def best_wage(s, V, c, h, rho, thmax, n=4000):
    """Profit-maximising flat wage for a fixed stake (grid + golden-section refinement)."""
    lo, hi = c + rho * s, V
    ws = [lo + (hi - lo) * i / n for i in range(n + 1)]
    i = max(range(n + 1), key=lambda j: flat_profit(ws[j], s, V, c, h, rho, thmax))
    a, b = ws[max(0, i - 1)], ws[min(n, i + 1)]
    g = (5 ** .5 - 1) / 2
    for _ in range(80):
        x1, x2 = b - g * (b - a), a + g * (b - a)
        if flat_profit(x1, s, V, c, h, rho, thmax) > flat_profit(x2, s, V, c, h, rho, thmax):
            b = x2
        else:
            a = x1
    w = (a + b) / 2
    return w, flat_profit(w, s, V, c, h, rho, thmax)


def best_stake(V, c, h, rho, thmax, smax=None, ns=200):
    """Best (w, s) flat contract over s in [0, smax]."""
    smax = V if smax is None else smax
    best = None
    for i in range(ns + 1):
        s = smax * i / ns
        w, p = best_wage(s, V, c, h, rho, thmax, n=600)
        if best is None or p > best[2]:
            best = (s, w, p)
    return best


def menu_profit(menu, V, c, h, rho, thmax, n=2000):
    """Each type th picks the menu item with the highest utility (or nothing if all < 0); mean profit over th ~ U[0, thmax]."""
    tot = 0.0
    for i in range(n):
        th = thmax * (i + .5) / n
        u, k = max(((util(th, w, s, c, rho), j) for j, (w, s) in enumerate(menu)))
        if u >= 0:
            tot += profit(th, menu[k][0], menu[k][1], V, h)
    return tot / n


def random_menu_search(V, c, h, rho, thmax, size, trials, rng, n=400):
    """Best profit found over random menus of `size` contracts (w in [c, V], s in [0, V])."""
    best = -1e9
    for _ in range(trials):
        menu = [(rng.uniform(c, V), rng.uniform(0, V) * rng.random() ** 2) for _ in range(size)]
        best = max(best, menu_profit(menu, V, c, h, rho, thmax, n))
    return best


def simulate_flat(w, s, V, c, h, rho, thmax, N, rng):
    tot, part, faults = 0.0, 0, 0.0
    for _ in range(N):
        th = rng.uniform(0, thmax)
        if util(th, w, s, c, rho) >= 0:
            fault = rng.random() < th
            tot += (V - w) if not fault else (s - h)
            part += 1
            faults += fault
    return tot / N, part / N, (faults / part if part else 0.0)
