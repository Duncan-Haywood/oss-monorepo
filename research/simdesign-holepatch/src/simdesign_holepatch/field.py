"""Stress field of a holed tension strip and patch-averaged stress measures (mm, N, MPa).

Reuses the mesh and loading of ``research/simdesign-holes`` (imported by relative path, not
copied) but returns sigma_xx at every quadrature point, with the point's area weight, so that
a stress averaged over a small disc can be taken. The reference is Kirsch's solution for a
circular hole in an infinite plate under uniaxial tension (stress concentration 3).
"""
import os, sys
import numpy as np
import scipy.sparse.linalg as spla
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-holes", "src"))
from simdesign_holes.fem import Plate, MATERIALS, make_mesh
from skfem import Basis, FacetBasis, ElementTriP2, ElementVector, asm, LinearForm
from skfem.models.elasticity import linear_elasticity, lame_parameters
from scipy.spatial import cKDTree

STEEL = MATERIALS["steel sheet"]
QP = (np.array([[1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]]), np.full(3, 1 / 6))


def plate_field(pl: Plate, mat=STEEL) -> dict:
    """sigma_xx at the 3 quadrature points of every element, with area weights, away from the clamp."""
    mesh = make_mesh(pl)
    L = 4.0 * pl.W
    basis = Basis(mesh, ElementVector(ElementTriP2()))
    lam, mu = lame_parameters(mat.E, mat.nu)
    lam = 2 * lam * mu / (lam + 2 * mu)
    K = asm(linear_elasticity(lam, mu), basis)
    sg = pl.T / (pl.W * pl.t)
    fb = FacetBasis(mesh, basis.elem, facets=mesh.facets_satisfying(lambda x: np.isclose(x[0], L, atol=1e-6)))
    f = asm(LinearForm(lambda v, w_: sg * v.value[0]), fb)
    D = basis.get_dofs(lambda x: np.isclose(x[0], 0.0, atol=1e-6)).nodal["u^1"]
    mid = basis.get_dofs(lambda x: np.isclose(x[0], 0.0, atol=1e-6) & np.isclose(x[1], pl.W / 2, atol=pl.W / 40)).nodal["u^2"][:1]
    fixed = np.concatenate([D, mid])
    u = np.zeros(K.shape[0])
    I = np.setdiff1d(np.arange(K.shape[0]), fixed)
    u[I] = spla.spsolve(K[I][:, I].tocsc(), f[I])
    qb = Basis(mesh, basis.elem, quadrature=QP)
    g = qb.interpolate(u).grad
    c = mat.E / (1 - mat.nu ** 2)
    sxx = c * (g[0, 0] + mat.nu * g[1, 1])
    xy = qb.global_coordinates().value
    w = np.broadcast_to(qb.dx, sxx.shape)
    zone = np.abs(xy[0] - L / 2) < pl.W
    net = pl.T / ((pl.W - pl.d) * pl.t)
    return {"s": sxx[zone], "x": xy[0][zone] - L / 2, "y": xy[1][zone] - pl.W / 2, "w": w[zone],
            "net": net, "gross": sg, "n_elements": int(mesh.t.shape[1])}


def patch_peak(fd: dict, rho: float, n_try: int = 150) -> float:
    """Largest area-weighted mean of sigma_xx over a disc of radius rho (rho = 0: pointwise peak).

    Discs are centred on the n_try highest quadrature points; weights are quadrature areas.
    """
    s, w = fd["s"], fd["w"]
    if rho <= 0:
        return float(s.max())
    xy = np.c_[fd["x"], fd["y"]]
    tree = cKDTree(xy)
    best = -np.inf
    for i in np.argsort(s)[-n_try:]:
        nb = tree.query_ball_point(xy[i], rho)
        best = max(best, float(np.dot(s[nb], w[nb]) / w[nb].sum()))
    return best


def kirsch_sxx(x, y, a: float, sigma: float = 1.0):
    """sigma_xx of Kirsch's solution (hole radius a at the origin, uniaxial tension sigma along x).

    In polar form sigma_xx = sigma_rr cos^2 - 2 tau sin cos + sigma_tt sin^2 (angle t from the x axis).
    """
    r = np.hypot(x, y)
    t = np.arctan2(y, x)
    q, q2 = (a / r) ** 2, (a / r) ** 4
    srr = sigma / 2 * (1 - q) + sigma / 2 * (1 - 4 * q + 3 * q2) * np.cos(2 * t)
    stt = sigma / 2 * (1 + q) - sigma / 2 * (1 + 3 * q2) * np.cos(2 * t)
    trt = -sigma / 2 * (1 + 2 * q - 3 * q2) * np.sin(2 * t)
    return srr * np.cos(t) ** 2 - 2 * trt * np.sin(t) * np.cos(t) + stt * np.sin(t) ** 2


def kirsch_patch(a: float, rho: float, n: int = 400) -> float:
    """Mean of the Kirsch sigma_xx (sigma = 1) over the disc of radius rho centred on the hole's
    stress maximum (0, a), restricted to r > a. Midpoint rule on an n x n grid."""
    g = (np.arange(n) + 0.5) / n * 2 * rho - rho
    X, Y = np.meshgrid(g, g)
    m = (X ** 2 + Y ** 2 <= rho ** 2) & (X ** 2 + (Y + a) ** 2 > a ** 2)
    return float(kirsch_sxx(X[m], Y[m] + a, a).mean())
