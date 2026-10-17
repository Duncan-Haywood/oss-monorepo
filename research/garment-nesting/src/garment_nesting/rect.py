"""Rectangle strip packing: a marker is a strip of fabric of fixed width W and free length L.

Pieces are axis-aligned boxes (bounding boxes of pattern pieces), placed without rotation
because woven cloth has a grain line. Length L is the marker length to minimise."""
import math
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds


def area_bound(pieces, W):
    return sum(w * h for w, h in pieces) / W


def valid_layout(pieces, pos, W, tol=1e-6):
    """pos[i] = (x, y). True if every piece lies inside the strip and no two overlap."""
    n = len(pieces)
    for i in range(n):
        x, y = pos[i]
        w, h = pieces[i]
        if x < -tol or y < -tol or x + w > W + tol:
            return False
        for j in range(i + 1, n):
            xj, yj = pos[j]
            wj, hj = pieces[j]
            if x < xj + wj - tol and xj < x + w - tol and y < yj + hj - tol and yj < y + h - tol:
                return False
    return True


def length(pieces, pos):
    return max(y + h for (_, y), (_, h) in zip(pos, pieces))


def nfdh(pieces, W):
    """Next-fit decreasing height shelves (Coffman et al. 1980)."""
    order = sorted(range(len(pieces)), key=lambda i: -pieces[i][1])
    pos = [None] * len(pieces)
    x = y = shelf_h = 0.0
    for i in order:
        w, h = pieces[i]
        if x + w > W + 1e-9 and x > 0:
            y += shelf_h
            x, shelf_h = 0.0, 0.0
        pos[i] = (x, y)
        x += w
        shelf_h = max(shelf_h, h)
    return pos


def ffdh(pieces, W):
    """First-fit decreasing height shelves."""
    order = sorted(range(len(pieces)), key=lambda i: -pieces[i][1])
    shelves = []  # [y, height, used width]
    pos = [None] * len(pieces)
    for i in order:
        w, h = pieces[i]
        for s in shelves:
            if s[2] + w <= W + 1e-9:
                pos[i] = (s[2], s[0])
                s[2] += w
                break
        else:
            y = sum(s[1] for s in shelves)
            shelves.append([y, h, w])
            pos[i] = (0.0, y)
    return pos


def bottom_left(pieces, W, order=None):
    """Place pieces one by one at the feasible corner point with the lowest y, then lowest x."""
    n = len(pieces)
    order = list(range(n)) if order is None else order
    pos = [None] * n
    px = np.zeros(0); py = np.zeros(0); pw = np.zeros(0); ph = np.zeros(0)
    for i in order:
        w, h = pieces[i]
        xs = np.unique(np.concatenate(([0.0], px + pw)))
        xs = xs[xs + w <= W + 1e-9]
        ys = np.unique(np.concatenate(([0.0], py + ph)))
        if len(px):
            X = xs[:, None, None]; Y = ys[None, :, None]
            hit = (X < px + pw - 1e-9) & (px < X + w - 1e-9) & (Y < py + ph - 1e-9) & (py < Y + h - 1e-9)
            free = ~hit.any(axis=2)
        else:
            free = np.ones((len(xs), len(ys)), bool)
        # lowest y, then lowest x
        for jy in range(len(ys)):
            col = np.nonzero(free[:, jy])[0]
            if len(col):
                x, y = xs[col[0]], ys[jy]
                break
        pos[i] = (float(x), float(y))
        px = np.append(px, x); py = np.append(py, y); pw = np.append(pw, w); ph = np.append(ph, h)
    return pos


def anneal_rect(pieces, W, evals=500, seed=0, t0=None):
    """Simulated annealing over the placement order, decoded by bottom_left. `evals` decodes."""
    rng = np.random.default_rng(seed)
    n = len(pieces)
    order = sorted(range(n), key=lambda i: -pieces[i][0] * pieces[i][1])
    best = cur = length(pieces, bottom_left(pieces, W, order))
    best_order = list(order)
    t0 = t0 if t0 is not None else 0.05 * cur
    for k in range(1, evals):
        t = t0 * (1 - k / evals) + 1e-9
        cand = list(order)
        a, b = rng.integers(0, n, 2)
        if rng.random() < 0.5:
            cand[a], cand[b] = cand[b], cand[a]
        else:
            cand.insert(b, cand.pop(a))
        val = length(pieces, bottom_left(pieces, W, cand))
        if val <= cur or rng.random() < math.exp((cur - val) / t):
            order, cur = cand, val
            if cur < best - 1e-9:
                best, best_order = cur, list(order)
    return bottom_left(pieces, W, best_order), best


def exact_rect(pieces, W, time_limit=60.0, upper=None):
    """Mixed-integer program (disjunctive big-M non-overlap), solved by HiGHS via scipy.
    Returns (pos, length, proved_optimal)."""
    n = len(pieces)
    w = np.array([p[0] for p in pieces], float)
    h = np.array([p[1] for p in pieces], float)
    M = float(upper if upper is not None else h.sum())
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
    nv = 2 * n + 1 + 4 * len(pairs)  # x, y, L, then 4 binaries per pair (i left, j left, i below, j below)
    iL = 2 * n
    rows, lo, hi = [], [], []

    def add(coefs, lb, ub):
        r = np.zeros(nv)
        for k, v in coefs:
            r[k] += v
        rows.append(r); lo.append(lb); hi.append(ub)

    for i in range(n):
        add([(iL, 1), (n + i, -1)], h[i], np.inf)  # L >= y_i + h_i
    for p, (i, j) in enumerate(pairs):
        b = 2 * n + 1 + 4 * p
        add([(i, 1), (j, -1), (b, W)], -np.inf, W - w[i])         # x_i + w_i <= x_j + W(1-b)
        add([(j, 1), (i, -1), (b + 1, W)], -np.inf, W - w[j])
        add([(n + i, 1), (n + j, -1), (b + 2, M)], -np.inf, M - h[i])
        add([(n + j, 1), (n + i, -1), (b + 3, M)], -np.inf, M - h[j])
        add([(b, 1), (b + 1, 1), (b + 2, 1), (b + 3, 1)], 1, np.inf)
    c = np.zeros(nv); c[iL] = 1
    lb = np.zeros(nv); ub = np.ones(nv)
    ub[:n] = W - w; ub[n:2 * n] = M; ub[iL] = M
    integrality = np.zeros(nv); integrality[2 * n + 1:] = 1
    res = milp(c, constraints=LinearConstraint(np.array(rows), lo, hi), bounds=Bounds(lb, ub),
               integrality=integrality, options={"time_limit": time_limit, "disp": False})
    if res.x is None:
        return None, math.inf, False
    x = res.x
    pos = [(float(x[i]), float(x[n + i])) for i in range(n)]
    return pos, float(x[iL]), res.status == 0
