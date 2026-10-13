"""RF shielding of a conductive woven fabric (stylised plane-wave model).

A square weave of conductive yarn (diameter d, pitch p, both directions, ideal contact at crossings) is
treated as a thin sheet of resistance Rs = R' * p, with R' the yarn resistance per metre. Shielding
effectiveness (SE) is the textbook thin-sheet reflection loss 20 log10(1 + Z0 / (2 Rs)); a separate
aperture bound 20 log10(lambda / (2 g)) with gap g = p - d caps it at high frequency. Both formulas are
standard EMC results (e.g. C. R. Paul, Introduction to Electromagnetic Compatibility); they are
recalled, not re-derived or checked against a measurement here.
"""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

Z0 = 376.730313668  # free-space impedance, ohm
C0 = 299792458.0

# Bulk conductivities (S/m) and densities (kg/m3): handbook values recalled from memory, not sourced here.
MATERIALS = {
    "copper": (5.96e7, 8960.0),
    "silver": (6.30e7, 10490.0),
    "stainless316": (1.35e6, 8000.0),
}


def yarn_resistance_per_m(sigma, d, coating=None):
    """Ohm/m of a solid round wire (coating=None) or of a thin conductive coating of thickness `coating`
    on a non-conductive core of diameter d."""
    area = np.pi * d * coating if coating is not None else np.pi * d * d / 4
    return 1.0 / (sigma * area)


def sheet_resistance(r_per_m, pitch):
    """Square weave, ideal crossings: Rs = R' * p (parallel wires p apart, one square of side L)."""
    return r_per_m * pitch


def se_sheet(rs):
    return 20 * np.log10(1 + Z0 / (2 * np.asarray(rs, dtype=float)))


def se_aperture(freq, gap):
    lam = C0 / np.asarray(freq, dtype=float)
    return np.maximum(20 * np.log10(lam / (2 * gap)), 0.0)


def se_fabric(freq, r_per_m, pitch, d):
    """Conservative combination: the smaller of the sheet and aperture figures."""
    return np.minimum(se_sheet(sheet_resistance(r_per_m, pitch)), se_aperture(freq, pitch - d))


def rs_for_se(se_db):
    """Sheet resistance that gives `se_db` of thin-sheet shielding."""
    return Z0 / (2 * (10 ** (se_db / 20) - 1))


def metal_areal_mass(density, d, pitch, coating=None):
    """kg/m2 of conductive metal in a square weave (two yarn sets; ignores crimp and crossings)."""
    area = np.pi * d * coating if coating is not None else np.pi * d * d / 4
    return 2 * density * area / pitch


def effective_sheet_resistance(n, break_frac, rng, r_seg=1.0):
    """Monte Carlo: n x n square grid of unit resistors (nodes = crossings), each segment broken
    independently with probability break_frac. Left and right edges are bus bars at 1 V and 0 V; returns the
    effective sheet resistance (ohm per square, in units of r_seg) or inf if no path connects the bars."""
    idx = lambda i, j: i * n + j
    rows, cols, vals = [], [], []
    g = 1.0 / r_seg
    diag = np.zeros(n * n)
    for i in range(n):
        for j in range(n):
            for di, dj in ((0, 1), (1, 0)):
                a, b = i + di, j + dj
                if a >= n or b >= n or rng.random() < break_frac:
                    continue
                p, q = idx(i, j), idx(a, b)
                rows += [p, q]; cols += [q, p]; vals += [-g, -g]
                diag[p] += g; diag[q] += g
    # Dirichlet: column 0 at 1 V, column n-1 at 0 V
    fixed = {idx(i, 0): 1.0 for i in range(n)}
    fixed.update({idx(i, n - 1): 0.0 for i in range(n)})
    free = [k for k in range(n * n) if k not in fixed]
    pos = {k: m for m, k in enumerate(free)}
    L = coo_matrix((vals + list(diag), (rows + list(range(n * n)), cols + list(range(n * n)))),
                   shape=(n * n, n * n)).tocsr()
    # isolated free nodes (diag 0) -> pin to 0 to keep system non-singular; they carry no current
    Lf = L[free][:, free].tolil()
    for m, k in enumerate(free):
        if diag[k] == 0:
            Lf[m, m] = 1.0
    bvec = np.zeros(len(free))
    for k, v in fixed.items():
        if v:
            col = L[free][:, [k]].toarray().ravel()
            bvec -= col * v
    # dangling clusters not tied to a bar are floating (singular) -> add tiny leak to ground
    Lf = Lf.tocsr() + 1e-12 * coo_matrix((np.ones(len(free)), (range(len(free)), range(len(free)))),
                                          shape=(len(free), len(free))).tocsr()
    v = spsolve(Lf.tocsc(), bvec)
    full = np.zeros(n * n)
    for k, val in fixed.items():
        full[k] = val
    full[free] = v
    # current into the grid from the left bar
    cur = 0.0
    for i in range(n):
        for (di, dj) in ((0, 1), (1, 0), (-1, 0)):
            a, b = i + di, 0 + dj
            if not (0 <= a < n and 0 <= b < n):
                continue
            # recompute existence by checking conductance entry
            gij = -L[idx(i, 0), idx(a, b)]
            if gij:
                cur += gij * (full[idx(i, 0)] - full[idx(a, b)])
    if cur < 1e-9:
        return np.inf
    # n rows in parallel, (n-1) segments in series: R_total = 1/cur; per square = R_total * n / (n-1)
    return (1.0 / cur) * n / (n - 1)
