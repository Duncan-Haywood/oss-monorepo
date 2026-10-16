"""Linear (eigenvalue) buckling of the whole L-bracket as one 3D body (scikit-fem; mm, N, MPa).

Geometry follows `simdesign-bucklebound`: a flat L cut from sheet of thickness b (z). The vertical
arm (x in [0, w], y in [0, H]) is clamped on its top face y = H. The horizontal arm
(x in [0, L], y in [0, w]) carries a downward force F on its end face x = L, so the vertical arm
sees an axial force F plus the moment F (L - w/2) and the horizontal arm sees in-plane shear F.
Mesh: a tensor hexahedral grid with the empty block (x > w, y > w) removed, quadratic serendipity
hexahedra, sharp inner corner (a fillet does not fit a tensor grid). The buckling procedure is the
one of `simdesign-buckle15`: solve K u = f for a unit load, build the geometric stiffness from the
stress, solve K phi = lambda (-Kg) phi. `sign = +1` is the downward (tensile in the vertical arm)
load, `sign = -1` the reverse.
"""
import numpy as np
from scipy.sparse.linalg import LinearOperator, eigs, splu
from skfem import (Basis, BilinearForm, ElementHex2, ElementVector, FacetBasis, LinearForm,
                   MeshHex, condense, solve)
from skfem.helpers import ddot, sym_grad, trace

E_STEEL, NU_STEEL = 200000.0, 0.30


def _axis(a, b, n):
    return np.linspace(a, b, n + 1)


def mesh_l(w, b, L=80.0, H=80.0, nw=4, nh=36, nl=28, nz=1):
    """Tensor grid with element edges at x = w and y = w; nw cells across a width, nl along the
    horizontal arm beyond the corner, nh along the vertical arm beyond the corner."""
    x = np.concatenate([_axis(0, w, nw), _axis(w, L, nl)[1:]])
    y = np.concatenate([_axis(0, w, nw), _axis(w, H, nh)[1:]])
    z = _axis(-b / 2, b / 2, nz)
    m = MeshHex.init_tensor(x, y, z)
    c = m.p[:, m.t].mean(axis=1)
    return m.remove_elements(np.nonzero((c[0] > w) & (c[1] > w))[0])


def build(w, b, F=1.0, sign=1, E=E_STEEL, nu=NU_STEEL, L=80.0, H=80.0, **mesh_kw):
    mesh = mesh_l(w, b, L, H, **mesh_kw)
    basis = Basis(mesh, ElementVector(ElementHex2()))
    lam = E * nu / ((1 + nu) * (1 - 2 * nu))
    mu = E / (2 * (1 + nu))

    @BilinearForm
    def stiff(u, v, _):
        return lam * trace(sym_grad(u)) * trace(sym_grad(v)) + 2 * mu * ddot(sym_grad(u), sym_grad(v))

    K = stiff.assemble(basis)
    end = FacetBasis(mesh, basis.elem, facets=mesh.facets_satisfying(lambda x: np.isclose(x[0], L)))

    @LinearForm
    def traction(v, p):
        return -sign * F / (w * b) * v.value[1] + 0 * p.x[0]

    fixed = basis.get_dofs(lambda x: np.isclose(x[1], H)).all()
    u = solve(*condense(K, traction.assemble(end), D=fixed))
    g = basis.interpolate(u).grad
    eps = 0.5 * (g + np.swapaxes(g, 0, 1))
    tr = eps[0, 0] + eps[1, 1] + eps[2, 2]
    sig = 2 * mu * eps
    for i in range(3):
        sig[i, i] = sig[i, i] + lam * tr

    @BilinearForm
    def geom(u, v, p):
        return np.einsum("ij...,jk...,ik...->...", v.grad, p["sig"], u.grad)

    Kg = geom.assemble(basis, sig=sig)
    return K, Kg, basis.complement_dofs(fixed), basis, u


def critical_factors(w, b, k=3, **kw):
    """Smallest k positive load factors lambda (multiples of the 100 N-style reference load F = 1 N),
    i.e. buckling occurs at load lambda * 1 N."""
    K, Kg, free, _, _ = build(w, b, **kw)
    A = K[free][:, free].tocsc()
    B = (-Kg[free][:, free]).tocsr()
    lu = splu(A)
    op = LinearOperator(A.shape, matvec=lambda x: lu.solve(B @ x), dtype=float)
    mu_ = eigs(op, k=k, which="LR", return_eigenvectors=False, tol=1e-8)
    mu_ = mu_.real
    return np.sort(1.0 / mu_[mu_ > 0])
