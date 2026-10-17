"""Two-layer resistor network of a woven conductive fabric with contact resistance at crossings.

Each crossing (i, j) has a weft node W(i, j) and a warp node V(i, j) joined by a contact resistor rc.
Weft segments join W(i, j)-W(i, j+1) and warp segments join V(i, j)-V(i+1, j), each of resistance 1 (the
unit). Each yarn segment is broken independently with probability f; contacts never break. Bus bars hold the
weft ends in column 0 at 1 V and in column n-1 at 0 V; warp ends are open. The result is the effective sheet
resistance in units of one segment, R_total * n / (n - 1) (n rows in parallel, n - 1 segments in series).

This extends the one-layer grid of `research/garment-optics` (each crossing there was a single node, i.e.
rc = 0). Nothing is imported from that project, so this one stays self-contained.
"""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve

Z0 = 376.730313668  # free-space impedance, ohm


def se_sheet(rs):
    """Thin-sheet shielding effectiveness, dB (textbook formula, as in garment-optics)."""
    return 20 * np.log10(1 + Z0 / (2 * np.asarray(rs, dtype=float)))


def effective_sheet_resistance(n, f, rc, rng):
    """Effective sheet resistance (units of one segment) of one random n x n fabric; inf if no path."""
    nn = n * n
    W = lambda i, j: i * n + j
    V = lambda i, j: nn + i * n + j
    a, b, g = [], [], []
    for i in range(n):
        for j in range(n):
            if j + 1 < n and rng.random() >= f:
                a.append(W(i, j)); b.append(W(i, j + 1)); g.append(1.0)
            if i + 1 < n and rng.random() >= f:
                a.append(V(i, j)); b.append(V(i + 1, j)); g.append(1.0)
            a.append(W(i, j)); b.append(V(i, j)); g.append(1.0 / rc if rc > 0 else 1e9)
    a, b, g = np.array(a), np.array(b), np.array(g)
    N = 2 * nn
    adj = coo_matrix((np.ones(len(a)), (a, b)), shape=(N, N))
    ncomp, lab = connected_components(adj, directed=False)
    left = np.array([W(i, 0) for i in range(n)])
    right = np.array([W(i, n - 1) for i in range(n)])
    # keep only components touching both bars; the rest carry no current
    good = set(lab[left]) & set(lab[right])
    if not good:
        return np.inf
    keep = np.isin(lab, list(good))
    fixed_v = np.full(N, np.nan)
    fixed_v[left] = 1.0
    fixed_v[right] = 0.0
    free = np.where(keep & np.isnan(fixed_v))[0]
    pos = -np.ones(N, dtype=int)
    pos[free] = np.arange(len(free))
    m = keep[a] & keep[b]
    a, b, g = a[m], b[m], g[m]
    L = coo_matrix((np.concatenate([g, g, -g, -g]),
                    (np.concatenate([a, b, a, b]), np.concatenate([a, b, b, a]))), shape=(N, N)).tocsr()
    v = np.where(np.isnan(fixed_v), 0.0, fixed_v)
    fixed_idx = np.where(~np.isnan(fixed_v) & keep)[0]
    Lff = L[free][:, free]
    rhs = -L[free][:, fixed_idx] @ v[fixed_idx]
    v[free] = spsolve(Lff.tocsc(), rhs) if len(free) else v[free]
    cur = float((L[left] @ v).sum())  # net current leaving the left bar
    if cur < 1e-12:
        return np.inf
    return (1.0 / cur) * n / (n - 1)


def sample(n, f, rc, draws, seed):
    rng = np.random.default_rng(seed)
    return np.array([effective_sheet_resistance(n, f, rc, rng) for _ in range(draws)])
