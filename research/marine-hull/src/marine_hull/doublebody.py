"""Double-body steady flow and its m-terms on a structured panel mesh, for the forward-speed panel model (milestone 7zo).

Capytaine's forward-speed option (7zn, `panel.PanelHullSpeed`) linearises about a uniform stream W = (-U, 0, 0): its
radiation condition carries the uniform-stream m-terms and its pressure is rho (i omega_e phi + U dphi/dx). The
classical next step (Ogilvie and Tuck 1969; Timman and Newman 1962; Newman 1978) linearises about the double-body flow
W = grad(-U x + phi_d), the steady flow past the hull mirrored in the still waterplane, with dphi_d/dn = U n_x. Then

    radiation condition  dphi_j/dn = -i omega_e n_j + m_j      (Capytaine's e^{-i omega t}, n out of the hull)
    m_heave = -(n . grad) W_z
    m_pitch = -(n . grad) (z W_x - x W_z)                       (pitch about +y, bow down for a bow at +x)
    pressure p_j = rho (i omega_e phi_j - W . grad phi_j)

which reduce to Capytaine's terms for W = (-U, 0, 0) (heave m 0, pitch m U n_z).

The m-terms need the normal derivative of W on the hull. Finite differences off the hull fail with constant panels
(the velocity within a panel size of the surface is wrong by tens of percent; 7zo's sphere check). So they are taken
from tangential derivatives of the on-surface W only. With W . n = 0 on the hull and grad W symmetric and trace free
(W is a potential flow), let G = P grad W be the surface gradient of W (G_ij = (grad_s)_i W_j, P the tangential
projector); then

    (n . grad) W = G n - n trace(G),

because the tangential part of (n . grad) W equals the tangential part of grad(W . n) - ... = (P grad W) n by symmetry,
and its normal part n . (n . grad) W = -(tangential divergence) = -trace(G) by continuity. G is computed on the
structured (along x, down z) half mesh by central differences of W and of the panel centres in the two grid indices,
with the surface metric, so only on-surface velocities are used. It is checked on a hemisphere (sphere in the double
body) against the exact flow.

The free-surface Green function stays Capytaine's zero-speed one at the encounter frequency (no steady wave field,
no forward-speed free-surface condition): this is the "double-body m-term" variant of the encounter-frequency
approximation, still not a forward-speed panel method.
"""
import math

from marine_hull import panel as _panel

G = 9.81
_SPEED = _panel.PanelHullSpeed      # bound at import, so a caller may swap panel.PanelHullSpeed for this class


def structured_half_mesh(surface, nu, nv):
    """A Capytaine half mesh (y >= 0) from surface(u, v) -> (x, y, z) on u, v in [0, 1] (u along, v from keel to
    waterline), cosine-spaced in both, faces ordered u-major like `panel.hull_mesh`, normals out of the body."""
    import numpy as np
    import capytaine as cpt
    us = [0.5 * (1.0 - math.cos(math.pi * i / nu)) for i in range(nu + 1)]
    vs = [0.5 * (1.0 - math.cos(math.pi * k / nv)) for k in range(nv + 1)]
    verts, idx = [], {}
    for i, u in enumerate(us):
        for k, v in enumerate(vs):
            idx[i, k] = len(verts)
            verts.append(surface(u, v))
    faces = [[idx[i, k], idx[i + 1, k], idx[i + 1, k + 1], idx[i, k + 1]] for i in range(nu) for k in range(nv)]
    half = cpt.Mesh(vertices=np.array(verts), faces=np.array(faces), name="structured_half")
    if half.faces_normals[len(faces) // 2][1] < 0:
        half = cpt.Mesh(vertices=np.array(verts), faces=np.array([f[::-1] for f in faces]), name="structured_half")
    return half


def hemisphere_surface(radius):
    """Half (y >= 0) of a hemisphere z <= 0, parametrised like a hull: u from x = -a to +a, v from keel to waterline."""
    def f(u, v):
        th = math.pi * (1.0 - u)            # polar angle from +x
        ph = 0.5 * math.pi * (1.0 - v)      # 0 at the waterline (y > 0), pi/2 at the keel
        return (radius * math.cos(th), radius * math.sin(th) * math.cos(ph), -radius * math.sin(th) * math.sin(ph))
    return f


def surface_gradient(c, w, nu, nv):
    """G[f] (3x3, G_ij = (grad_s)_i W_j) at each face of a structured half mesh from face centres c and face values w
    (both (nu*nv, 3), u-major), by central differences in the two grid indices (one-sided at the edges)."""
    import numpy as np
    c = np.asarray(c).reshape(nu, nv, 3)
    w = np.asarray(w).reshape(nu, nv, 3)

    def d(a, axis):
        out = np.empty_like(a)
        if axis == 0:
            out[1:-1] = 0.5 * (a[2:] - a[:-2])
            out[0], out[-1] = a[1] - a[0], a[-1] - a[-2]
        else:
            out[:, 1:-1] = 0.5 * (a[:, 2:] - a[:, :-2])
            out[:, 0], out[:, -1] = a[:, 1] - a[:, 0], a[:, -1] - a[:, -2]
        return out

    ru, rv = d(c, 0), d(c, 1)
    wu, wv = d(w, 0), d(w, 1)
    guu = (ru * ru).sum(-1)
    guv = (ru * rv).sum(-1)
    gvv = (rv * rv).sum(-1)
    det = guu * gvv - guv * guv
    iuu, iuv, ivv = gvv / det, -guv / det, guu / det
    # grad_s = g^{ab} r_a d_b : G_ij = sum_ab g^{ab} r_a,i (d_b W)_j
    ea = iuu[..., None] * ru + iuv[..., None] * rv          # g^{u b} r_b... contracted with d_u
    eb = iuv[..., None] * ru + ivv[..., None] * rv
    gmat = ea[..., :, None] * wu[..., None, :] + eb[..., :, None] * wv[..., None, :]
    return gmat.reshape(nu * nv, 3, 3)


def normal_derivative(c, n, w, nu, nv):
    """(n . grad) W at each face from on-surface W only: G n - n trace(G) (see the module docstring)."""
    import numpy as np
    gm = surface_gradient(c, w, nu, nv)
    n = np.asarray(n)
    return np.einsum("fij,fj->fi", gm, n) - n * np.trace(gm, axis1=1, axis2=2)[:, None]


def m_terms(c, n, w, dnw):
    """(m_heave, m_pitch) per face for steady velocity w and its normal derivative dnw (Newman 1978's
    -(n . grad) W and -(n . grad)(r x W), Capytaine's dofs: heave +z, pitch about +y through the origin)."""
    import numpy as np
    c, n, w, dnw = map(np.asarray, (c, n, w, dnw))
    x, z = c[:, 0], c[:, 2]
    m3 = -dnw[:, 2]
    # (n . grad)(z W_x - x W_z) = n_z W_x + z dn W_x - n_x W_z - x dn W_z
    m5 = -(n[:, 2] * w[:, 0] + z * dnw[:, 0] - n[:, 0] * w[:, 2] - x * dnw[:, 2])
    return m3, m5


def double_body_velocity(half, u, solver=None):
    """Steady double-body velocity W = (-U, 0, 0) + grad phi_d at the faces of the full (mirrored) mesh, ordered as
    `ReflectionSymmetricMesh(half, plane="xOz").faces_centers`, from Capytaine's zero-frequency (rigid free surface)
    Green function with dphi_d/dn = U n_x. Returns (mesh, W) with W real, shape (nb_faces, 3)."""
    import numpy as np
    import capytaine as cpt
    mesh = cpt.ReflectionSymmetricMesh(half, plane="xOz")
    body = cpt.FloatingBody(mesh=mesh, dofs=cpt.rigid_body_dofs(only=["Heave"]))
    pb = cpt.RadiationProblem(body=body, radiating_dof="Heave", omega=0.0)
    pb.boundary_condition = (u * mesh.faces_normals[:, 0]).astype(complex)
    solver = solver or cpt.BEMSolver()
    r = solver.solve(pb, keep_details=True)
    w = np.real(solver._compute_potential_gradient(body.mesh, r))
    w[:, 0] -= u
    return mesh, w


def full_m_terms(half, nu, nv, u, solver=None):
    """m-terms (m_heave, m_pitch) and W on the full mesh, computed on the y >= 0 half and mirrored (heave and pitch
    are symmetric in y). Returns dict with m3, m5 (full mesh order), w (full), and the double-body solve's mesh."""
    import numpy as np
    mesh, w = double_body_velocity(half, u, solver)
    nh = half.nb_faces
    c, n = half.faces_centers, half.faces_normals
    wh = w[:nh]
    dnw = normal_derivative(c, n, wh, nu, nv)
    m3h, m5h = m_terms(c, n, wh, dnw)
    return {"m3": np.concatenate([m3h, m3h]), "m5": np.concatenate([m5h, m5h]), "w": w, "mesh": mesh,
            "dnw_half": dnw}


class PanelHullDoubleBody:
    """Heave and pitch of a Wigley hull in head waves at speed U by the encounter-frequency panel model of
    `panel.PanelHullSpeed`, with the steady flow taken as the double-body flow (mode "double") or, as a check, the
    uniform stream (mode "uniform", which should reproduce Capytaine's own forward-speed option): the m-terms in the
    radiation condition and the steady velocity in the pressure, rho (i omega_e phi - W . grad phi), on the
    radiation and diffraction potentials; the incident-wave pressure gets the same term,
    -rho grad(phi_d) . grad(phi_0), on top of Capytaine's (exact, earth-frame) Froude-Krylov pressure."""

    def __init__(self, length, beam, draft, rho=1025.0, nx=40, nz=8, modified=False, alpha=1.0, mode="double"):
        import capytaine as cpt
        self.speed_twin = _SPEED(length, beam, draft, rho=rho, nx=nx, nz=nz, modified=modified,
                                            alpha=alpha)
        self.l, self.bm, self.t, self.rho = length, beam, draft, rho
        self.nx, self.nz, self.mode = nx, nz, mode
        self.half, _ = _panel.hull_mesh(length, beam, draft, nx, nz, modified, True, alpha)
        self.body = self.speed_twin.body
        self.n_panels = self.speed_twin.n_panels
        self.solver = cpt.BEMSolver()
        self._steady = {}

    def steady(self, u):
        """dict with W (hull faces, full mesh order) and the m-terms m3, m5 at speed u."""
        import numpy as np
        key = round(u, 12)
        if key not in self._steady:
            mesh = self.body.mesh
            n = mesh.faces_normals
            if self.mode == "uniform":
                w = np.zeros((mesh.nb_faces, 3))
                w[:, 0] = -u
                self._steady[key] = {"w": w, "m3": np.zeros(mesh.nb_faces), "m5": u * n[:, 2]}
            else:
                st = full_m_terms(self.half, self.nx, self.nz, u, self.solver)
                assert np.allclose(st["mesh"].faces_centers, mesh.faces_centers)
                self._steady[key] = st
        return self._steady[key]

    def at(self, omega):
        """Zero-speed coefficients (Capytaine's own solve), for the U -> 0 check."""
        return self.speed_twin.at(omega)

    def _solve_bc(self, we, bc_hull):
        """Solve at encounter frequency we (zero-speed Green function) with the given hull boundary condition;
        returns (phi, grad phi) on the hull faces."""
        import numpy as np
        import capytaine as cpt
        pb = cpt.RadiationProblem(body=self.body, radiating_dof="Heave", omega=we, rho=self.rho, g=G)
        bc = np.zeros(self.body.mesh_including_lid.nb_faces, dtype=complex)
        bc[self.body.hull_mask] = bc_hull
        pb.boundary_condition = bc
        r = self.solver.solve(pb, keep_details=True)
        grad = self.solver._compute_potential_gradient(self.body.mesh_including_lid, r)
        return r.potential[self.body.hull_mask], grad[self.body.hull_mask]

    def _force(self, pressure):
        f = self.body.integrate_pressure(pressure)
        return f["Heave"], f["Pitch"]

    def at_speed(self, omega, u):
        """Same dict as `panel.PanelHullSpeed.at_speed` (Capytaine convention, 0 heave, 1 pitch bow-down)."""
        import numpy as np
        import capytaine as cpt
        from capytaine.bem.airy_waves import froude_krylov_force, airy_waves_velocity
        st = self.steady(u)
        w = st["w"]
        mesh = self.body.mesh
        n = mesh.faces_normals
        k = omega * omega / G
        we = omega + k * u          # head waves
        a = [[0.0, 0.0], [0.0, 0.0]]
        b = [[0.0, 0.0], [0.0, 0.0]]
        for j, (nj, mj) in enumerate(((n[:, 2], st["m3"]), (-(mesh.faces_centers[:, 0] * n[:, 2]
                                                              - mesh.faces_centers[:, 2] * n[:, 0]), st["m5"]))):
            # pitch about +y: displacement (z, 0, -x), its normal component z n_x - x n_z
            phi, gphi = self._solve_bc(we, -1j * we * nj + mj)
            p = 1j * we * self.rho * phi - self.rho * (w * gphi).sum(1)
            f = self._force(p)
            for i in range(2):
                a[i][j] = float(np.real(f[i]) / (we * we))
                b[i][j] = float(np.imag(f[i]) / we)
        pd = cpt.DiffractionProblem(body=self.body, wave_direction=math.pi, omega=omega, forward_speed=u,
                                    rho=self.rho, g=G)
        phi7, g7 = self._solve_bc(we, pd.boundary_condition[self.body.hull_mask])
        p7 = 1j * we * self.rho * phi7 - self.rho * (w * g7).sum(1)
        g0 = airy_waves_velocity(mesh.faces_centers, pd)
        wd = w.copy()
        wd[:, 0] += u               # grad phi_d, the steady disturbance
        p0 = -self.rho * (wd * g0).sum(1)
        fk = froude_krylov_force(pd)
        f7 = self._force(p7)
        f0 = self._force(p0)
        return {"we": we, "A": a, "B": b, "F3": complex(f7[0] + fk["Heave"] + f0[0]),
                "F5": complex(f7[1] + fk["Pitch"] + f0[1])}
