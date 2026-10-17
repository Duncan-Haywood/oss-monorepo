"""L-bracket geometry and 2D plane-stress finite-element analysis.

Units: mm, N, MPa, g. The part is a profile (x, y) extruded by depth ``b`` along z.
Vertical arm of width ``w`` is clamped at its top (y = H); a downward force F acts on the
free end of the horizontal arm (x = L). The inner corner has fillet radius ``r``.
"""
from dataclasses import dataclass
import numpy as np
import scipy.sparse.linalg as spla
from scipy.spatial import Delaunay
from matplotlib.path import Path
from skfem import MeshTri, Basis, ElementTriP2, ElementVector, asm, LinearForm
from skfem.models.elasticity import linear_elasticity, lame_parameters


@dataclass(frozen=True)
class Material:
    """ASSUMED typical values for an unfilled FDM thermoplastic; not measured, not sourced."""
    E: float = 3000.0          # MPa
    nu: float = 0.36
    density: float = 1.24e-3   # g/mm^3
    sigma_allow: float = 20.0  # MPa, working stress incl. safety factor (assumed)


@dataclass(frozen=True)
class Params:
    w: float = 12.0   # arm width (mm)
    r: float = 6.0    # inner fillet radius (mm)
    b: float = 15.0   # extrusion depth (mm)
    H: float = 80.0   # vertical arm length (fixed)
    L: float = 80.0   # horizontal arm length (fixed)
    F: float = 100.0  # tip load (N), downward


def build_polygon(p: Params, n_arc: int = 24) -> np.ndarray:
    """Counter-clockwise outline of the L profile with the inner corner filleted."""
    w, r = p.w, min(p.r, p.H - p.w - 1e-9, p.L - p.w - 1e-9)
    pts = [(0, 0), (p.L, 0), (p.L, w), (w + r, w)]
    if r > 1e-9:
        c = np.array([w + r, w + r])
        for t in np.linspace(-np.pi / 2, -np.pi, n_arc + 1)[0:]:
            pts.append(tuple(c + r * np.array([np.cos(t), np.sin(t)])))
    else:
        pts.append((w, w))
    pts += [(w, p.H), (0, p.H)]
    out = [pts[0]]
    for q in pts[1:]:
        if np.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > 1e-9:
            out.append(q)
    return np.array(out)


def _densify(poly: np.ndarray, h: float) -> np.ndarray:
    pts = []
    for a, b_ in zip(poly, np.roll(poly, -1, axis=0)):
        n = max(1, int(np.ceil(np.hypot(*(b_ - a)) / h)))
        for k in range(n):
            pts.append(a + (b_ - a) * k / n)
    return np.array(pts)


def make_mesh(p: Params, h: float = 1.5) -> MeshTri:
    poly = build_polygon(p)
    bnd = _densify(poly, h)
    xs = np.arange(h / 2, p.L, h)
    ys = np.arange(h / 2, p.H, h)
    gx, gy = np.meshgrid(xs, ys)
    grid = np.c_[gx.ravel(), gy.ravel()]
    path = Path(poly)
    # keep interior grid points at least 0.6 h from the boundary
    d = np.min(np.linalg.norm(grid[:, None, :] - bnd[None, ::1, :], axis=2), axis=1) if len(grid) * len(bnd) < 4e7 else None
    inside = path.contains_points(grid)
    keep = inside & (d > 0.6 * h)
    pts = np.vstack([bnd, grid[keep]])
    tri = Delaunay(pts)
    cen = pts[tri.simplices].mean(axis=1)
    ok = path.contains_points(cen)
    t = tri.simplices[ok]
    # drop slivers
    a = pts[t]
    area = 0.5 * np.abs((a[:, 1, 0] - a[:, 0, 0]) * (a[:, 2, 1] - a[:, 0, 1]) - (a[:, 2, 0] - a[:, 0, 0]) * (a[:, 1, 1] - a[:, 0, 1]))
    t = t[area > 1e-6]
    used = np.unique(t)
    remap = -np.ones(len(pts), int)
    remap[used] = np.arange(len(used))
    return MeshTri(pts[used].T.copy(), remap[t].T.copy())


def mass_g(p: Params, mat: Material = Material()) -> float:
    """Exact profile area (shoelace) times depth times density."""
    q = build_polygon(p, n_arc=400)
    x, y = q[:, 0], q[:, 1]
    area = 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
    return float(area * p.b * mat.density)


def solve(p: Params, mat: Material = Material(), h: float = 1.5) -> dict:
    """Plane-stress solve. Returns tip deflection, peak von Mises stress and mass."""
    mesh = make_mesh(p, h)
    basis = Basis(mesh, ElementVector(ElementTriP2()))
    lam, mu = lame_parameters(mat.E, mat.nu)
    lam = 2 * lam * mu / (lam + 2 * mu)  # plane-stress effective lambda
    K = asm(linear_elasticity(lam, mu), basis) * p.b
    # traction on the end face x = L, total force F downward (per unit depth: F / (w*b))
    fb = basis.boundary(lambda x: np.isclose(x[0], p.L) & (x[1] < p.w + 1e-9)) if False else None
    facets = mesh.facets_satisfying(lambda x: np.isclose(x[0], p.L, atol=1e-6))
    fb = basis.boundary(facets=facets) if hasattr(basis, "boundary") else None
    from skfem import FacetBasis
    fbasis = FacetBasis(mesh, basis.elem, facets=facets)

    @LinearForm
    def load(v, w_):
        return -(p.F / (p.w * p.b)) * v.value[1] * p.b

    f = asm(load, fbasis)
    D = basis.get_dofs(lambda x: np.isclose(x[1], p.H, atol=1e-6)).all()
    u = np.zeros(K.shape[0])
    I = np.setdiff1d(np.arange(K.shape[0]), D)
    u[I] = spla.spsolve(K[I][:, I].tocsc(), f[I])
    # von Mises at element centroids (plane stress), from the P2 displacement gradient
    cb = Basis(mesh, basis.elem, quadrature=(np.array([[1 / 3], [1 / 3]]), np.array([0.5])))
    grad = cb.interpolate(u).grad  # shape (2,2,nel,1)
    exx, eyy = grad[0, 0, :, 0], grad[1, 1, :, 0]
    gxy = grad[0, 1, :, 0] + grad[1, 0, :, 0]
    c = mat.E / (1 - mat.nu ** 2)
    sxx = c * (exx + mat.nu * eyy)
    syy = c * (eyy + mat.nu * exx)
    sxy = c * (1 - mat.nu) / 2 * gxy
    vm = np.sqrt(sxx ** 2 - sxx * syy + syy ** 2 + 3 * sxy ** 2)
    cen = mesh.p[:, mesh.t].mean(axis=1)
    free = cen[1] < p.H - p.w  # exclude the clamp-affected zone (one arm width)
    tipdofs = basis.get_dofs(lambda x: np.isclose(x[0], p.L, atol=1e-6)).nodal["u^2"]
    return {"tip_deflection_mm": float(-u[tipdofs].mean()), "max_vm_mpa": float(vm[free].max()),
            "mass_g": mass_g(p, mat), "n_elements": int(mesh.t.shape[1])}
