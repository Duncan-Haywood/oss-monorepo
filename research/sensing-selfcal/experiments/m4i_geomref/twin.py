"""Milestone 4i: a linearised twin of one camera's own bundle adjustment.

The unit's 13-view target-free solve (milestone 4f's solver, 5x5 corners) is the twin: its
intrinsics, poses and free 3-D points. For any view subset S, the first-order (Gauss-Newton)
change in the subset's own solve of f when the corner pixels move by eps is g_S . eps, where
g_S = J_S (J_S^T J_S)^-1 e_f is the subset's influence vector on f (the same vector
`selfcal.robust_sf` uses for the sandwich), J_S the subset problem's Jacobian at the twin, with
the subset's own gauge (its first view's pose and corner 0's depth fixed). f is
gauge-invariant, so the gauge choice does not change g_S . eps.

The gains depend only on the views' geometry, so a robot can compute them from the solves it
already ran. With them, every set's f, its delete-one f's and so its robust jackknife variance
R can be drawn for any number of noise draws by one matrix product, and each split gets its own
reference distribution for z_R^2.
"""
import itertools, os, sys
import numpy as np
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
import selfcal as sc  # noqa: E402

NK = 1
NI = 3 + NK
NPT = 54


def fit_all(obs, size, f0, refs=(0, 6)):
    """The 13-view solve as in selfcal_fixed_best, but keeping the parameters.
    Returns dict(intr, poses (nv, 6), X (npt, 3), cost, rms, resid (nv, npt, 2))."""
    best = None
    nv = len(obs)
    for ref in refs:
        X, poses = sc.init_fronto(obs, size, f0, ref)
        intr = np.array([f0, size[0] / 2, size[1] / 2] + [0.0] * NK)
        fixed = poses[ref].copy()
        p0 = np.concatenate([intr, np.delete(poses, ref, axis=0).ravel(), np.delete(X.ravel(), 2)])
        args = (obs, NK, fixed, ref)
        sol = least_squares(lambda p: sc._fun_jac_fixed(p, *args, False), p0,
                            jac=lambda p: sc._fun_jac_fixed(p, *args, True).toarray(), method="lm",
                            max_nfev=2000, xtol=1e-12, ftol=1e-12, gtol=1e-10)
        if best is not None and sol.cost >= best["cost"]:
            continue
        p = sol.x
        free = p[NI:NI + 6 * (nv - 1)].reshape(nv - 1, 6)
        best = dict(intr=p[:NI].copy(), poses=np.insert(free, ref, fixed, axis=0),
                    X=np.insert(p[NI + 6 * (nv - 1):], 2, 1.0).reshape(NPT, 3), cost=float(sol.cost),
                    rms=float(np.sqrt(np.mean(sol.fun ** 2))), resid=sol.fun.reshape(nv, NPT, 2), status=int(sol.status))
    return best


def subset_params(tw, views):
    """Parameter vector of the subset problem at the twin (gauge: first view's pose, corner 0's depth)."""
    poses = tw["poses"][list(views)]
    X = tw["X"]
    # the subset solver fixes corner 0's depth at 1.0; the twin already has it there
    return np.concatenate([tw["intr"], poses[1:].ravel(), np.delete(X.ravel(), 2)]), poses[0]


def project(tw, views):
    """Noise-free corners of the given views, (n, npt, 2)."""
    p, fixed = subset_params(tw, views)
    zero = np.zeros((len(views), NPT, 2))
    return sc._fun_jac_fixed(p, zero, NK, fixed, 0, False).reshape(len(views), NPT, 2)


def gain(tw, views):
    """g_S (n * npt * 2,): first-order change of the subset's f per unit pixel move (obs += eps)."""
    p, fixed = subset_params(tw, views)
    zero = np.zeros((len(views), NPT, 2))
    J = sc._fun_jac_fixed(p, zero, NK, fixed, 0, True).toarray()
    s = np.linalg.norm(J, axis=0)
    s[s == 0] = 1.0
    Js = J / s
    e = np.zeros(J.shape[1]); e[0] = 1.0
    b = np.linalg.solve(Js.T @ Js, e / s) / s
    # residual = uv - obs, so obs += eps moves the GN step by +(J^T J)^-1 J^T eps
    return J @ b


def mask(views):
    m = 0
    for v in views:
        m |= 1 << v
    return m


def gain_matrix(tw, nv=13, sizes=range(3, 8)):
    """Rows: every subset of the given sizes; columns: the nv * npt * 2 pixel coordinates.
    Returns (G, index: mask -> row)."""
    sets = [v for n in sizes for v in itertools.combinations(range(nv), n)]
    G = np.zeros((len(sets), nv * NPT * 2))
    index = {}
    w = NPT * 2
    for i, v in enumerate(sets):
        g = gain(tw, v).reshape(len(v), w)
        for j, view in enumerate(v):
            G[i, view * w:(view + 1) * w] = g[j]
        index[mask(v)] = i
    return G, index


def noise(rng, model, m, tw=None, nv=13):
    """(nv * npt * 2, m) pixel perturbations, unit scale (the statistic is scale-free).
    iid: independent N(0, 1) per coordinate.
    resid: each view gets the 13-view fit's residual pattern of a view drawn at random (with
    replacement) from the unit's own 13, with a random sign: the unit's within-view correlation
    (milestone 6's column structure, the bent board) carried to every view."""
    w = NPT * 2
    if model == "iid":
        return rng.standard_normal((nv * w, m))
    if model == "resid":
        pat = tw["resid"].reshape(nv, w)
        pat = pat / np.sqrt(np.mean(pat ** 2))
        src = rng.integers(0, nv, size=(nv, m))
        sgn = rng.choice((-1.0, 1.0), size=(nv, m))
        out = pat[src] * sgn[:, :, None]          # (nv, m, w)
        return out.transpose(0, 2, 1).reshape(nv * w, m)
    raise ValueError(model)
