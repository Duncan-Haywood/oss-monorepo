"""2D plane-stress model of a strip in tension with a circular hole (units mm, N, MPa, g).

The strip has width W (y), a hole of diameter d centred in it, thickness t, and carries a
uniform end traction T / (W t). The left end is held in x, with one node held in y. The
quoted peak stress is the largest sigma_xx at the quadrature points of a P2 mesh refined
around the hole. The model is stylised: linear elastic, no bolt contact or bearing load.
"""
from dataclasses import dataclass
import numpy as np
import scipy.sparse.linalg as spla
from scipy.spatial import Delaunay
from skfem import MeshTri, Basis, FacetBasis, ElementTriP2, ElementVector, asm, LinearForm, Functional
from skfem.models.elasticity import linear_elasticity, lame_parameters


@dataclass(frozen=True)
class Material:
    """ASSUMED round numbers (same as research/simdesign-dfm): E MPa, nu, g/mm^3, working stress MPa."""
    E: float
    nu: float
    density: float
    sigma_allow: float


MATERIALS = {
    "plastic": Material(3000.0, 0.36, 1.24e-3, 20.0),
    "aluminium plate": Material(69000.0, 0.33, 2.70e-3, 100.0),
    "steel sheet": Material(200000.0, 0.30, 7.85e-3, 100.0),
    "cast aluminium": Material(72000.0, 0.33, 2.68e-3, 50.0),
}


@dataclass(frozen=True)
class Plate:
    W: float = 30.0      # width (mm)
    d: float = 6.0       # hole diameter (mm); 0 = no hole
    t: float = 3.0       # thickness (mm)
    T: float = 2000.0    # tensile load (N)
    n_hole: int = 192    # points around the hole
    h_far: float = 0.0   # far-field mesh size; 0 = W / 10


def make_mesh(pl: Plate) -> MeshTri:
    W, d = pl.W, pl.d
    L = 4.0 * W                      # modelled length; long enough that the end effects die out
    hf = pl.h_far or W / 10.0
    r = d / 2.0
    cx, cy = L / 2.0, W / 2.0
    pts = []
    # rectangle boundary
    for a, b in [((0, 0), (L, 0)), ((L, 0), (L, W)), ((L, W), (0, W)), ((0, W), (0, 0))]:
        a, b = np.array(a, float), np.array(b, float)
        n = max(1, int(np.ceil(np.hypot(*(b - a)) / hf)))
        pts += [a + (b - a) * k / n for k in range(n)]
    ring_r_max = 0.0
    if d > 0:
        hh = np.pi * d / pl.n_hole
        R, step, k = r, hh, 0
        while True:
            n = max(8, int(round(2 * np.pi * R / step)))
            off = 0.5 * (k % 2) * 2 * np.pi / n
            ang = off + 2 * np.pi * np.arange(n) / n
            pts += [(cx + R * np.cos(a), cy + R * np.sin(a)) for a in ang]
            ring_r_max = R
            if step >= hf * 0.9 or R > 0.5 * W - 0.6 * hf:
                break
            R += step
            step *= 1.3
            k += 1
    pts = np.array(pts)
    xs = np.arange(hf / 2, L, hf)
    ys = np.arange(hf / 2, W, hf)
    gx, gy = np.meshgrid(xs, ys)
    grid = np.c_[gx.ravel(), gy.ravel()]
    keep = (grid[:, 1] > 0.6 * hf) & (grid[:, 1] < W - 0.6 * hf)
    if d > 0:
        keep &= np.hypot(grid[:, 0] - cx, grid[:, 1] - cy) > ring_r_max + 0.8 * hf
    pts = np.vstack([pts, grid[keep]])
    tri = Delaunay(pts)
    t = tri.simplices
    cen = pts[t].mean(axis=1)
    if d > 0:
        t = t[np.hypot(cen[:, 0] - cx, cen[:, 1] - cy) > r]
    a = pts[t]
    area = 0.5 * np.abs((a[:, 1, 0] - a[:, 0, 0]) * (a[:, 2, 1] - a[:, 0, 1]) - (a[:, 2, 0] - a[:, 0, 0]) * (a[:, 1, 1] - a[:, 0, 1]))
    t = t[area > 1e-9]
    used = np.unique(t)
    remap = -np.ones(len(pts), int)
    remap[used] = np.arange(len(used))
    return MeshTri(pts[used].T.copy(), remap[t].T.copy())


def solve_plate(pl: Plate, mat: Material) -> dict:
    """Return peak sigma_xx, the gross nominal stress T/(W t), their ratio, and the net-section nominal stress."""
    mesh = make_mesh(pl)
    L = 4.0 * pl.W
    basis = Basis(mesh, ElementVector(ElementTriP2()))
    lam, mu = lame_parameters(mat.E, mat.nu)
    lam = 2 * lam * mu / (lam + 2 * mu)   # plane stress
    K = asm(linear_elasticity(lam, mu), basis)
    sig_gross = pl.T / (pl.W * pl.t)
    facets = mesh.facets_satisfying(lambda x: np.isclose(x[0], L, atol=1e-6))
    fb = FacetBasis(mesh, basis.elem, facets=facets)

    @LinearForm
    def load(v, w_):
        return sig_gross * v.value[0]

    f = asm(load, fb)
    D = basis.get_dofs(lambda x: np.isclose(x[0], 0.0, atol=1e-6)).nodal["u^1"]
    mid = basis.get_dofs(lambda x: np.isclose(x[0], 0.0, atol=1e-6) & np.isclose(x[1], pl.W / 2, atol=pl.W / 40)).nodal["u^2"][:1]
    fixed = np.concatenate([D, mid])
    u = np.zeros(K.shape[0])
    I = np.setdiff1d(np.arange(K.shape[0]), fixed)
    u[I] = spla.spsolve(K[I][:, I].tocsc(), f[I])
    qb = Basis(mesh, basis.elem, quadrature=(np.array([[1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]]), np.full(3, 1 / 6)))
    g = qb.interpolate(u).grad
    exx, eyy = g[0, 0], g[1, 1]
    c = mat.E / (1 - mat.nu ** 2)
    sxx = c * (exx + mat.nu * eyy)
    xq = qb.global_coordinates().value[0]
    zone = np.abs(xq - L / 2) < 1.0 * pl.W   # away from the clamped end, where the constraint adds its own peak
    peak = float(sxx[zone].max())
    net = pl.T / ((pl.W - pl.d) * pl.t)
    return {"peak_sxx_mpa": peak, "sigma_gross_mpa": sig_gross, "sigma_net_mpa": net,
            "kt_gross": peak / sig_gross, "kt_net": peak / net, "n_elements": int(mesh.t.shape[1])}
