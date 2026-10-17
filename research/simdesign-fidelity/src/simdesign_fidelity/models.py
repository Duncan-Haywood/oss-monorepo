"""Four models of a rectangular cantilever (length L, depth h, width b), tip shear force F.

Units: mm, N, MPa. Clamped at x = 0; F is spread uniformly over the free end face x = L,
acting in -y. Every model returns (tip deflection, top-fibre normal stress at x = h).
The stress is read at one depth h from the clamp (outside the clamp's singular zone) so that
all models report the same quantity; the beam value is F (L - h) (h/2) / I.
"""
from dataclasses import dataclass
import numpy as np
import scipy.sparse.linalg as spla
from skfem import (MeshQuad, MeshTri, MeshHex, Basis, FacetBasis, ElementVector, ElementQuad2,
                   ElementHex2, asm, LinearForm)
from skfem.models.elasticity import linear_elasticity, lame_parameters


@dataclass(frozen=True)
class Material:
    """ASSUMED typical values for an unfilled FDM thermoplastic (as in simdesign-bracket)."""
    E: float = 3000.0
    nu: float = 0.36
    density: float = 1.24e-3  # g/mm^3
    sigma_allow: float = 20.0  # MPa


@dataclass(frozen=True)
class Case:
    L: float = 100.0
    F: float = 100.0
    b: float = 20.0


def beam_eb(L, h, b, F, mat=Material()):
    I = b * h ** 3 / 12
    return F * L ** 3 / (3 * mat.E * I), F * (L - h) * (h / 2) / I


def beam_timoshenko(L, h, b, F, mat=Material(), kappa=5 / 6):
    d, s = beam_eb(L, h, b, F, mat)
    G = mat.E / (2 * (1 + mat.nu))
    return d + F * L / (kappa * G * b * h), s


def _solve(mesh, elem, L, h, b, F, mat, plane_stress, dim, ny_pts):
    basis = Basis(mesh, ElementVector(elem), intorder=4 if dim == 3 else None)
    lam, mu = lame_parameters(mat.E, mat.nu)
    if plane_stress:
        lam = 2 * lam * mu / (lam + 2 * mu)
    K = asm(linear_elasticity(lam, mu), basis)
    facets = mesh.facets_satisfying(lambda x: np.isclose(x[0], L, atol=1e-9))
    fb = FacetBasis(mesh, basis.elem, facets=facets)
    area = h * (b if dim == 3 else 1.0)  # 2D: unit thickness, force per unit depth

    @LinearForm
    def load(v, _):
        return -(F / (b if dim == 2 else 1.0) / area) * v.value[1]

    f = asm(load, fb)
    D = basis.get_dofs(lambda x: np.isclose(x[0], 0.0, atol=1e-9)).all()
    I = np.setdiff1d(np.arange(K.shape[0]), D)
    u = np.zeros(K.shape[0])
    u[I] = spla.spsolve(K[I][:, I].tocsc(), f[I])
    # tip deflection: mean u_y over end-face nodal dofs
    end = basis.get_dofs(lambda x: np.isclose(x[0], L, atol=1e-9)).nodal["u^2"]
    tip = -float(np.mean(u[end]))
    # stress: sigma_xx at quadrature points in the slab x in [h, 1.5h], top 15% of the depth
    gu = basis.interpolate(u).grad
    X = basis.global_coordinates().value
    if plane_stress:
        sxx = mat.E / (1 - mat.nu ** 2) * (gu[0, 0] + mat.nu * gu[1, 1])
    else:
        l3, m3 = lame_parameters(mat.E, mat.nu)
        sxx = (l3 + 2 * m3) * gu[0, 0] + l3 * (gu[1, 1] + gu[2, 2])
    # fit sigma_xx(y) linearly over the quadrature points of the slab x in [h, 1.6h] (each scaled
    # to x = h with the beam moment ratio) and read the fit at y = h/2: the width-averaged
    # top-fibre stress, robust to the quadrature points not sitting on the surface.
    sel = (X[0] >= h) & (X[0] <= 1.6 * h)
    sc = (L - h) / (L - X[0])
    yy, ss = X[1][sel], (sxx * sc)[sel]
    slope, icpt = np.polyfit(yy, ss, 1)
    sig = float(slope * h / 2 + icpt)
    return tip, sig


def fe2d(L, h, b, F, mat=Material(), n=None):
    """Plane-stress P2 quad finite elements, element size ~ h/n over the depth (n=4 default)."""
    n = n or 4
    nx = max(4, int(np.ceil(n * L / h)))
    x = np.linspace(0, L, nx + 1)
    y = np.linspace(-h / 2, h / 2, n + 1)
    mesh = MeshQuad.init_tensor(x, y)
    return _solve(mesh, ElementQuad2(), L, h, b, F, mat, True, 2, n)


def fe3d(L, h, b, F, mat=Material(), n=None):
    """3D triquadratic hex finite elements, nx x ny x nz with ny = n over depth."""
    n = n or 3
    nx = max(4, int(np.ceil(n * L / h)))
    nz = min(6, max(2, int(np.ceil(n * b / h))))
    x = np.linspace(0, L, nx + 1)
    y = np.linspace(-h / 2, h / 2, n + 1)
    z = np.linspace(-b / 2, b / 2, nz + 1)
    mesh = MeshHex.init_tensor(x, y, z)
    return _solve(mesh, ElementHex2(), L, h, b, F, mat, False, 3, n)


MODELS = {
    "euler": lambda L, h, b, F, m=Material(), n=None: beam_eb(L, h, b, F, m),
    "timoshenko": lambda L, h, b, F, m=Material(), n=None: beam_timoshenko(L, h, b, F, m),
    "fe2d": fe2d,
    "fe3d": fe3d,
}
