"""Two-layer resistor network of a woven conductive fabric with correlated damage.

Same network as `research/garment-contactres` (copied, not imported, so this project stays
self-contained): a weft node W(i, j) and a warp node V(i, j) per crossing joined by a contact resistor;
yarn segments have resistance 1 (the unit). Bus bars hold weft ends in column 0 at 1 V and column n-1 at
0 V; warp ends are open. Result: effective sheet resistance R_total * n / (n - 1), in segment units.

What is new here is the damage model, with two kinds of correlation:
- Fold band: breaks are not uniform. A band of `band_frac` of the fabric (columns for a fold across the
  current direction, rows for a fold along it) breaks with probability min(1, conc * f); outside it the
  probability is lowered so the mean break fraction stays f. conc = 1 is the independent model.
- Worn contacts: a crossing with a broken yarn segment touching it has contact resistance rc * k
  (k = 1 is the independent model). This stands in for coating wear that goes with the yarn damage.
"""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve

Z0 = 376.730313668  # free-space impedance, ohm


def se_sheet(rs):
    """Thin-sheet shielding effectiveness, dB (textbook formula, as in garment-optics)."""
    return 20 * np.log10(1 + Z0 / (2 * np.asarray(rs, dtype=float)))


def break_probs(n, f, conc=1.0, band_frac=0.2, orient="across"):
    """Per-cell break probability grid (n x n) with mean f; cell (i, j) is row i, column j."""
    nb = max(1, int(round(band_frac * n)))
    p_in = min(1.0, conc * f)
    frac_in = nb / n
    p_out = (f - frac_in * p_in) / (1 - frac_in) if frac_in < 1 else f
    p_out = max(p_out, 0.0)
    P = np.full((n, n), p_out)
    lo = (n - nb) // 2
    if orient == "across":      # band of columns: a fold across the current direction
        P[:, lo:lo + nb] = p_in
    else:                       # band of rows: a fold along the current direction
        P[lo:lo + nb, :] = p_in
    return P


def draw_breaks(n, P, rng):
    """Boolean arrays (weft_broken[i, j] for W(i,j)-W(i,j+1); warp_broken[i, j] for V(i,j)-V(i+1,j))."""
    wb = rng.random((n, n)) < P
    vb = rng.random((n, n)) < P
    wb[:, n - 1] = False
    vb[n - 1, :] = False
    return wb, vb


def effective_sheet_resistance(n, wb, vb, rc, k=1.0):
    """Effective sheet resistance (segment units) for given breaks; inf if no path."""
    nn = n * n
    W = lambda i, j: i * n + j
    V = lambda i, j: nn + i * n + j
    a, b, g = [], [], []
    for i in range(n):
        for j in range(n):
            if j + 1 < n and not wb[i, j]:
                a.append(W(i, j)); b.append(W(i, j + 1)); g.append(1.0)
            if i + 1 < n and not vb[i, j]:
                a.append(V(i, j)); b.append(V(i + 1, j)); g.append(1.0)
            touched = (wb[i, j] and j + 1 < n) or (j > 0 and wb[i, j - 1]) \
                or (vb[i, j] and i + 1 < n) or (i > 0 and vb[i - 1, j])
            r = rc * (k if touched else 1.0)
            a.append(W(i, j)); b.append(V(i, j)); g.append(1.0 / r if r > 0 else 1e9)
    a, b, g = np.array(a), np.array(b), np.array(g)
    N = 2 * nn
    adj = coo_matrix((np.ones(len(a)), (a, b)), shape=(N, N))
    ncomp, lab = connected_components(adj, directed=False)
    left = np.array([W(i, 0) for i in range(n)])
    right = np.array([W(i, n - 1) for i in range(n)])
    good = set(lab[left]) & set(lab[right])
    if not good:
        return np.inf
    keep = np.isin(lab, list(good))
    fixed_v = np.full(N, np.nan)
    fixed_v[left] = 1.0
    fixed_v[right] = 0.0
    free = np.where(keep & np.isnan(fixed_v))[0]
    m = keep[a] & keep[b]
    a, b, g = a[m], b[m], g[m]
    L = coo_matrix((np.concatenate([g, g, -g, -g]),
                    (np.concatenate([a, b, a, b]), np.concatenate([a, b, b, a]))), shape=(N, N)).tocsr()
    v = np.where(np.isnan(fixed_v), 0.0, fixed_v)
    fixed_idx = np.where(~np.isnan(fixed_v) & keep)[0]
    Lff = L[free][:, free]
    rhs = -L[free][:, fixed_idx] @ v[fixed_idx]
    v[free] = spsolve(Lff.tocsc(), rhs) if len(free) else v[free]
    cur = float((L[left] @ v).sum())
    if cur < 1e-12:
        return np.inf
    return (1.0 / cur) * n / (n - 1)


def sample(n, f, rc, draws, seed, k=1.0, conc=1.0, band_frac=0.2, orient="across"):
    """Effective sheet resistance of `draws` random fabrics."""
    rng = np.random.default_rng(seed)
    P = break_probs(n, f, conc, band_frac, orient)
    out = []
    for _ in range(draws):
        wb, vb = draw_breaks(n, P, rng)
        out.append(effective_sheet_resistance(n, wb, vb, rc, k))
    return np.array(out)


def median_ci(x, rng, boot=1000):
    """Median of finite entries with a 95% bootstrap interval; also the number of open draws."""
    x = np.asarray(x)
    fin = x[np.isfinite(x)]
    if len(fin) == 0:
        return float("nan"), float("nan"), float("nan"), len(x)
    meds = np.median(rng.choice(fin, (boot, len(fin))), axis=1)
    return float(np.median(fin)), float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5)), int((~np.isfinite(x)).sum())
