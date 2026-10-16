"""3D linear (eigenvalue) buckling of a prismatic steel bar with scikit-fem (mm, N, MPa).

Bar: length l along x, in-plane width w along y, sheet thickness b along z, clamped at x = 0
(all displacements zero on that face). Quadratic hexahedra (serendipity, ElementHex2), isotropic
elasticity. Procedure: solve K u = f for a unit load, form the stress at the quadrature points,
assemble the geometric stiffness Kg = int  grad(v)_ij sigma_jk grad(u)_ik dV, and solve
K phi = lambda (-Kg) phi. The critical load is lambda times the unit load.
Closed-form comparison values are in `closed_forms`.
"""
import numpy as np
from scipy.sparse.linalg import LinearOperator, eigs, splu
from skfem import (Basis, BilinearForm, ElementHex2, ElementVector, FacetBasis, LinearForm,
                   MeshHex, condense, solve)
from skfem.helpers import ddot, sym_grad, trace

E_STEEL, NU_STEEL = 200000.0, 0.30


def build(l, w, b, load, nx, ny, nz, E=E_STEEL, nu=NU_STEEL):
    """Return (K, Kg, free_dofs) for a unit `load` on the end face x = l:
    'axial' (unit compressive force), 'shear' (unit force along +y, i.e. in the plane of the
    width, uniform over the end face) or 'moment' (unit moment about z: sigma_xx = M y / Iz)."""
    mesh = MeshHex.init_tensor(np.linspace(0, l, nx + 1), np.linspace(-w / 2, w / 2, ny + 1),
                               np.linspace(-b / 2, b / 2, nz + 1))
    basis = Basis(mesh, ElementVector(ElementHex2()))
    lam = E * nu / ((1 + nu) * (1 - 2 * nu))
    mu = E / (2 * (1 + nu))

    @BilinearForm
    def stiff(u, v, _):
        return lam * trace(sym_grad(u)) * trace(sym_grad(v)) + 2 * mu * ddot(sym_grad(u), sym_grad(v))

    K = stiff.assemble(basis)
    end = FacetBasis(mesh, basis.elem, facets=mesh.facets_satisfying(lambda x: np.isclose(x[0], l)))

    @LinearForm
    def traction(v, p):
        z = 0 * p.x[0]
        if load == "axial":
            t = [-1.0 / (w * b) + z, z, z]
        elif load == "shear":
            t = [z, 1.0 / (w * b) + z, z]
        elif load == "moment":
            t = [p.x[1] / (b * w ** 3 / 12.0) + z, z, z]
        else:
            raise ValueError(load)
        return t[0] * v.value[0] + t[1] * v.value[1] + t[2] * v.value[2]

    fixed = basis.get_dofs(lambda x: np.isclose(x[0], 0)).all()
    u = solve(*condense(K, traction.assemble(end), D=fixed))
    g = basis.interpolate(u).grad                       # g[i][j] = d u_i / d x_j
    eps = 0.5 * (g + np.swapaxes(g, 0, 1))
    tr = eps[0, 0] + eps[1, 1] + eps[2, 2]
    sig = 2 * mu * eps
    for i in range(3):
        sig[i, i] = sig[i, i] + lam * tr

    @BilinearForm
    def geom(u, v, p):
        return np.einsum("ij...,jk...,ik...->...", v.grad, p["sig"], u.grad)

    Kg = geom.assemble(basis, sig=sig)
    return K, Kg, basis.complement_dofs(fixed)


def critical_loads(l, w, b, load, nx, ny, nz, k=3):
    """Smallest k positive critical load factors (in N, or N mm for 'moment')."""
    K, Kg, free = build(l, w, b, load, nx, ny, nz)
    A = K[free][:, free].tocsc()
    B = (-Kg[free][:, free]).tocsr()
    lu = splu(A)
    op = LinearOperator(A.shape, matvec=lambda x: lu.solve(B @ x), dtype=float)
    mu = eigs(op, k=k, which="LR", return_eigenvectors=False, tol=1e-8)
    return np.sort(1.0 / mu.real)


# ---- closed forms (same as simdesign-webbuckle) -------------------------------------------------
def _sqrt_eigj(w, b, E=E_STEEL, nu=NU_STEEL):
    G = E / (2 * (1 + nu))
    Iy = w * b ** 3 / 12.0
    J = w * b ** 3 / 3.0 * (1 - 0.63 * b / w)
    return np.sqrt(E * Iy * G * J)


def closed_forms(l, w, b, load):
    if load == "shear":
        return 4.013 * _sqrt_eigj(w, b) / l ** 2
    if load == "moment":
        return np.pi / (2 * l) * _sqrt_eigj(w, b)
    if load == "axial":
        return np.pi ** 2 * E_STEEL * (w * b ** 3 / 12.0) / (4 * l ** 2)
    raise ValueError(load)
