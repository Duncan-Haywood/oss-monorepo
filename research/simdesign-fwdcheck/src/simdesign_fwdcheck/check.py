"""Forward-load checks of the reversed-load buckling-limited L-bracket designs (mm, N, MPa).

Reuses the 3D hexahedral model of `simdesign-lbuckle` (its `build` returns the stiffness, the
geometric stiffness and the displacement for the load F) and the plate mass of `simdesign-revwidth`.
Forward load (sign = +1): downward force F on the end face of the horizontal arm, vertical arm in
tension. Stress is von Mises at element centroids (mean over the quadrature points of an element),
excluding the clamp zone (the top w mm of the vertical arm). The inner corner is a sharp re-entrant
corner whose peak stress rises with refinement (`simdesign-meshmargin`), so peaks are reported on two
meshes next to a beam-theory nominal stress.
"""
import os, sys
import numpy as np
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", "simdesign-lbuckle", "src"))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", "simdesign-revwidth", "src"))
from simdesign_lbuckle import lbracket as lb  # noqa: E402
from simdesign_revwidth import sweep as sw  # noqa: E402

F_N = 100.0
STRESS_LIMIT = 100.0   # MPa, the working stress of simdesign-minwall / -loadbind
TIP_LIMIT = 4.0        # mm, the tip limit of the same projects
MIN_WALL = 1.2         # mm, simdesign-dfm
H = 80.0
# reversed-load roots on the coarse mesh with one layer (simdesign-revgauge)
ROOTS = {1.5: 22.5, 2.0: 11.84, 2.5: 6.81, 3.0: 4.31}
mass_g = sw.mass_g


def von_mises(sig):
    s = sig
    return np.sqrt(0.5 * ((s[0, 0] - s[1, 1]) ** 2 + (s[1, 1] - s[2, 2]) ** 2 + (s[2, 2] - s[0, 0]) ** 2)
                   + 3 * (s[0, 1] ** 2 + s[1, 2] ** 2 + s[0, 2] ** 2))


def static(w, b, F=F_N, sign=1, mesh=(2, 18, 14, 1), E=lb.E_STEEL, nu=lb.NU_STEEL):
    """Linear static solve. Returns (peak von Mises outside the clamp zone, max von Mises anywhere,
    downward deflection of the end face's mean), in MPa and mm."""
    nw, nh, nl, nz = mesh
    K, Kg, free, basis, u = lb.build(w, b, F=F, sign=sign, nw=nw, nh=nh, nl=nl, nz=nz, E=E, nu=nu)
    g = basis.interpolate(u).grad
    eps = 0.5 * (g + np.swapaxes(g, 0, 1))
    tr = eps[0, 0] + eps[1, 1] + eps[2, 2]
    lam = E * nu / ((1 + nu) * (1 - 2 * nu)); mu = E / (2 * (1 + nu))
    sig = 2 * mu * eps
    for i in range(3):
        sig[i, i] = sig[i, i] + lam * tr
    vm = von_mises(sig).mean(axis=-1)
    cy = basis.mesh.p[1][basis.mesh.t].mean(axis=0)
    out = vm[cy < H - w]
    L = basis.mesh.p[0].max()
    dofs = basis.get_dofs(lambda x: np.isclose(x[0], L)).nodal["u^2"]
    return float(out.max()), float(vm.max()), float(-sign * u[dofs].mean())


def forward_factor(w, b, mesh=(2, 18, 14, 1)):
    return sw.factor(w, b=b, sign=1, mesh=mesh)


def nominal_stress(w, b, F=F_N, L=80.0):
    """Beam-theory stress at the outer fibre of the vertical arm: axial F/(w b) plus bending
    F (L - w/2) (w/2) / (b w^3 / 12). The sharp corner's concentration is not in it."""
    return F / (w * b) + F * (L - w / 2) * (w / 2) / (b * w ** 3 / 12)
