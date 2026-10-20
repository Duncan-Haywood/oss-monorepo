"""Locally graded mesh around one point (the fillet tangent point (w, w + r)) and a solve on it.

Element size grows from ``hmin`` at the point to ``h0`` far away with the geometric-ish rule
size(d) = min(h0, hmin + grade * d). Boundary points follow the same rule; interior points are rings
around the point plus a background grid outside the graded disc. Everything else (P2 elements, load,
element-centroid von Mises, clamp-zone exclusion) is the code of ``model.solve``.
"""
import numpy as np
import scipy.sparse.linalg as spla
from scipy.spatial import Delaunay
from matplotlib.path import Path
from skfem import MeshTri, Basis, ElementTriP2, ElementVector, FacetBasis, asm, LinearForm
from skfem.models.elasticity import linear_elasticity, lame_parameters
from .model import Params, Material, build_polygon, _tri_area


def _size(d, hmin, h0, grade):
    return np.minimum(h0, hmin + grade * d)


def _graded_boundary(poly, c, hmin, h0, grade):
    pts = []
    for a, b in zip(poly, np.roll(poly, -1, axis=0)):
        L = float(np.hypot(*(b - a)))
        s = 0.0
        while s < L - 1e-12:
            q = a + (b - a) * (s / L)
            pts.append(q)
            s += float(_size(np.hypot(*(q - c)), hmin, h0, grade))
    return np.array(pts)


def make_graded_mesh(p: Params, c, hmin: float, h0: float = 1.5, grade: float = 0.3, n_arc: int = 24) -> MeshTri:
    poly = build_polygon(p, n_arc=n_arc)
    c = np.asarray(c, float)
    bnd = _graded_boundary(poly, c, hmin, h0, grade)
    R = (h0 - hmin) / grade                       # beyond R the size is h0
    path = Path(poly)
    # background grid (size h0) outside the graded disc
    xs, ys = np.arange(h0 / 2, p.L, h0), np.arange(h0 / 2, p.H, h0)
    gx, gy = np.meshgrid(xs, ys)
    grid = np.c_[gx.ravel(), gy.ravel()]
    grid = grid[(np.hypot(*(grid - c).T) > R) & path.contains_points(grid)]
    # rings inside the disc: radius r_k, spacing = local size
    rings = []
    d = hmin
    while d < R:
        s = float(_size(d, hmin, h0, grade))
        n = max(6, int(np.ceil(2 * np.pi * d / s)))
        t = np.linspace(0, 2 * np.pi, n, endpoint=False) + 0.5 * d
        rings.append(c + d * np.c_[np.cos(t), np.sin(t)])
        d += s
    pts = np.vstack([bnd, grid, *rings, c[None, :]])
    pts = pts[path.contains_points(pts, radius=-1e-9) | (np.min(np.linalg.norm(pts[:, None, :] - bnd[None, :, :], axis=2), axis=1) < 1e-9)] if len(pts) * len(bnd) < 6e7 else pts
    # drop interior points that crowd the boundary (closer than 0.6 local size)
    from scipy.spatial import cKDTree
    kb = cKDTree(bnd)
    nb = len(bnd)
    dist, _ = kb.query(pts)
    local = _size(np.hypot(*(pts - c).T), hmin, h0, grade)
    keep = np.ones(len(pts), bool)
    keep[nb:] = dist[nb:] > 0.6 * local[nb:]
    keep[:nb] = True
    pts = pts[keep]
    tri = Delaunay(pts)
    cen = pts[tri.simplices].mean(axis=1)
    t = tri.simplices[path.contains_points(cen)]
    a = pts[t]
    area = 0.5 * np.abs((a[:, 1, 0] - a[:, 0, 0]) * (a[:, 2, 1] - a[:, 0, 1]) - (a[:, 2, 0] - a[:, 0, 0]) * (a[:, 1, 1] - a[:, 0, 1]))
    t = t[area > 1e-9]
    used = np.unique(t)
    remap = -np.ones(len(pts), int)
    remap[used] = np.arange(len(used))
    return MeshTri(pts[used].T.copy(), remap[t].T.copy())


def solve_graded(p: Params, mat: Material, hmin: float, h0: float = 1.5, grade: float = 0.3, c=None, n_arc: int = 24) -> dict:
    """Plane-stress solve on the graded mesh. Returns the centroid von Mises field and where its peak is."""
    c = (p.w, p.w + p.r) if c is None else c
    mesh = make_graded_mesh(p, c, hmin, h0, grade, n_arc)
    basis = Basis(mesh, ElementVector(ElementTriP2()))
    lam, mu = lame_parameters(mat.E, mat.nu)
    lam = 2 * lam * mu / (lam + 2 * mu)
    K = asm(linear_elasticity(lam, mu), basis) * p.b
    facets = mesh.facets_satisfying(lambda x: np.isclose(x[0], p.L, atol=1e-6))
    fbasis = FacetBasis(mesh, basis.elem, facets=facets)

    @LinearForm
    def load(v, w_):
        return -(p.F / (p.w * p.b)) * v.value[1] * p.b

    f = asm(load, fbasis)
    D = basis.get_dofs(lambda x: np.isclose(x[1], p.H, atol=1e-6)).all()
    u = np.zeros(K.shape[0])
    I = np.setdiff1d(np.arange(K.shape[0]), D)
    u[I] = spla.spsolve(K[I][:, I].tocsc(), f[I])
    cb = Basis(mesh, basis.elem, quadrature=(np.array([[1 / 3], [1 / 3]]), np.array([0.5])))
    grad = cb.interpolate(u).grad
    exx, eyy = grad[0, 0, :, 0], grad[1, 1, :, 0]
    gxy = grad[0, 1, :, 0] + grad[1, 0, :, 0]
    cc = mat.E / (1 - mat.nu ** 2)
    sxx, syy, sxy = cc * (exx + mat.nu * eyy), cc * (eyy + mat.nu * exx), cc * (1 - mat.nu) / 2 * gxy
    vm = np.sqrt(sxx ** 2 - sxx * syy + syy ** 2 + 3 * sxy ** 2)
    cen = mesh.p[:, mesh.t].mean(axis=1)
    free = cen[1] < p.H - p.w
    i = int(np.argmax(np.where(free, vm, -1)))
    tipdofs = basis.get_dofs(lambda x: np.isclose(x[0], p.L, atol=1e-6)).nodal["u^2"]
    return {"vm": vm, "cen": cen.T, "area": _tri_area(mesh), "free": free, "peak_mpa": float(vm[i]),
            "peak_xy": [float(cen[0, i]), float(cen[1, i])], "tip_deflection_mm": float(-u[tipdofs].mean()),
            "n_elements": int(mesh.t.shape[1]), "min_edge": float(np.min(np.hypot(*(mesh.p[:, mesh.facets[0]] - mesh.p[:, mesh.facets[1]]))))}
