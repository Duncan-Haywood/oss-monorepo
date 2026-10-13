"""Plate with a circular hole under uniaxial tension: finite elements against Kirsch's exact solution.

Quarter model of an infinite plate, hole radius ``a`` at the origin, remote tension ``sigma`` along x.
The domain is the quarter annulus a <= r <= R. Its outer arc carries the traction of Kirsch's exact
solution, so the finite-element answer should converge to the exact field. Symmetry: u_y = 0 on y = 0,
u_x = 0 on x = 0. Plane stress. Units are arbitrary but consistent (the answers scale with sigma).
"""
import numpy as np
import scipy.sparse.linalg as spla
from skfem import MeshTri, Basis, FacetBasis, ElementTriP2, ElementVector, asm, LinearForm
from skfem.models.elasticity import linear_elasticity, lame_parameters


def kirsch_stress(x, y, a=1.0, sigma=1.0):
    """Cartesian stress (sxx, syy, sxy) of an infinite plate with a traction-free circular hole,
    remote uniaxial tension ``sigma`` along x (Kirsch, 1898; see e.g. Timoshenko and Goodier)."""
    r2 = x ** 2 + y ** 2
    r = np.sqrt(r2)
    th = np.arctan2(y, x)
    k2, k4 = a ** 2 / r2, a ** 4 / r2 ** 2
    c2, s2 = np.cos(2 * th), np.sin(2 * th)
    srr = sigma / 2 * (1 - k2) + sigma / 2 * (1 - 4 * k2 + 3 * k4) * c2
    stt = sigma / 2 * (1 + k2) - sigma / 2 * (1 + 3 * k4) * c2
    srt = -sigma / 2 * (1 + 2 * k2 - 3 * k4) * s2
    c, s = x / r, y / r
    sxx = srr * c ** 2 + stt * s ** 2 - 2 * srt * s * c
    syy = srr * s ** 2 + stt * c ** 2 + 2 * srt * s * c
    sxy = (srr - stt) * s * c + srt * (c ** 2 - s ** 2)
    return sxx, syy, sxy


def make_mesh(n_theta: int, a: float = 1.0, R: float = 10.0) -> MeshTri:
    """Structured polar triangle mesh, radially graded so cells are near-square at the hole."""
    q = 1 + (np.pi / 2) / n_theta
    n_r = int(np.ceil(np.log(R / a) / np.log(q)))
    q = (R / a) ** (1.0 / n_r)
    rr = a * q ** np.arange(n_r + 1)
    tt = np.linspace(0, np.pi / 2, n_theta + 1)
    RR, TT = np.meshgrid(rr, tt, indexing="ij")
    pts = np.c_[(RR * np.cos(TT)).ravel(), (RR * np.sin(TT)).ravel()]
    idx = np.arange((n_r + 1) * (n_theta + 1)).reshape(n_r + 1, n_theta + 1)
    p00, p10, p01, p11 = idx[:-1, :-1], idx[1:, :-1], idx[:-1, 1:], idx[1:, 1:]
    t = np.vstack([np.c_[p00.ravel(), p10.ravel(), p11.ravel()], np.c_[p00.ravel(), p11.ravel(), p01.ravel()]])
    return MeshTri(pts.T.copy(), t.T.copy())


def _vm(sxx, syy, sxy):
    return np.sqrt(sxx ** 2 - sxx * syy + syy ** 2 + 3 * sxy ** 2)


def solve(n_theta: int, a: float = 1.0, R: float = 10.0, sigma: float = 1.0, E: float = 1000.0, nu: float = 0.3) -> dict:
    """Solve and return stress measures at the hole edge. ``exact`` is the exact peak, 3 * sigma."""
    mesh = make_mesh(n_theta, a, R)
    basis = Basis(mesh, ElementVector(ElementTriP2()))
    lam, mu = lame_parameters(E, nu)
    lam = 2 * lam * mu / (lam + 2 * mu)
    K = asm(linear_elasticity(lam, mu), basis)
    facets = mesh.facets_satisfying(lambda x: (np.hypot(x[0], x[1]) > (a + R) / 2) & (x[0] > 1e-9) & (x[1] > 1e-9), boundaries_only=True)  # outer arc (chord midpoints)
    fb = FacetBasis(mesh, basis.elem, facets=facets)

    @LinearForm
    def load(v, w):
        x, y = w.x
        sxx, syy, sxy = kirsch_stress(x, y, a, sigma)
        nx, ny = x / R, y / R
        return (sxx * nx + sxy * ny) * v.value[0] + (sxy * nx + syy * ny) * v.value[1]

    f = asm(load, fb)
    D = np.concatenate([basis.get_dofs(lambda x: np.isclose(x[1], 0, atol=1e-12)).nodal["u^2"],
                        basis.get_dofs(lambda x: np.isclose(x[0], 0, atol=1e-12)).nodal["u^1"],
                        basis.get_dofs(lambda x: np.isclose(x[1], 0, atol=1e-12)).facet["u^2"],
                        basis.get_dofs(lambda x: np.isclose(x[0], 0, atol=1e-12)).facet["u^1"]])
    u = np.zeros(K.shape[0])
    I = np.setdiff1d(np.arange(K.shape[0]), D)
    u[I] = spla.spsolve(K[I][:, I].tocsc(), f[I])

    c = E / (1 - nu ** 2)

    def stress_at(points):  # points: (2, npts) reference coordinates, evaluated in every element
        pb = Basis(mesh, basis.elem, quadrature=(points, np.full(points.shape[1], 1.0 / points.shape[1])))
        g = pb.interpolate(u).grad
        exx, eyy, gxy = g[0, 0], g[1, 1], g[0, 1] + g[1, 0]
        return c * (exx + nu * eyy), c * (eyy + nu * exx), c * (1 - nu) / 2 * gxy

    r_hole = np.hypot(*mesh.p)
    on_hole = np.isclose(r_hole, a, atol=1e-9)
    # (1) element centroids: the usual "peak element stress"
    sxx, syy, sxy = stress_at(np.array([[1 / 3], [1 / 3]]))
    cen = mesh.p[:, mesh.t].mean(axis=1)
    vm_c = _vm(sxx[:, 0], syy[:, 0], sxy[:, 0])
    peak_centroid = float(vm_c.max())
    # (2) element vertices lying on the hole edge, each element's own gradient there
    sxx, syy, sxy = stress_at(np.array([[0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]))
    vm_v = _vm(sxx, syy, sxy)
    mask = on_hole[mesh.t].T  # (nel, 3): vertex k of element e lies on the hole
    vm_vertex = vm_v[mask]
    peak_vertex = float(vm_vertex.max())
    # error of the whole field against the exact solution at centroids (relative L2 of von Mises, area weighted)
    ex = _vm(*kirsch_stress(cen[0], cen[1], a, sigma))
    A = mesh.p[:, mesh.t]
    area = 0.5 * np.abs((A[0, 1] - A[0, 0]) * (A[1, 2] - A[1, 0]) - (A[0, 2] - A[0, 0]) * (A[1, 1] - A[1, 0]))
    l2 = float(np.sqrt(np.sum(area * (vm_c - ex) ** 2) / np.sum(area * ex ** 2)))
    # exact von Mises at the centroid that holds the peak, to separate sampling bias from solver error
    i = int(np.argmax(vm_c))
    return {"n_theta": n_theta, "elements": int(mesh.t.shape[1]), "h_hole": float(a * np.pi / 2 / n_theta),
            "exact": 3.0 * sigma, "peak_centroid": peak_centroid, "peak_vertex": peak_vertex,
            "exact_at_peak_centroid": float(ex[i]), "rel_l2_vm": l2}
