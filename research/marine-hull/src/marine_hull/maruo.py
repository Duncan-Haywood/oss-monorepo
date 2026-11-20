"""Zero-speed added resistance by Maruo's far-field formula from a 3D panel code (milestone 7zm).

The panel code is Capytaine (Ancellin and Dias 2019, J. Open Source Software 4(36) 1341,
doi:10.21105/joss.01341; installed from PyPI, not vendored). Its `compute_kochin` gives the Kochin
function H(theta) of a solved diffraction or radiation problem from the source strengths, and its
`far_field_mean_drift_force` gives the mean horizontal drift force from the total Kochin function
(diffraction plus the motion-weighted radiation), Maruo's (1960) far-field momentum formula at zero speed.
Both are used as shipped; this module only builds the full mesh, the motions and the dataset they read.
It imports Capytaine, numpy and xarray lazily, so the rest of the package stays stdlib only.

Conventions are Capytaine's (e^{-i omega t}; head waves beta = pi travel towards -x). The added
resistance of a hull heading +x is R_aw = -F_x. Motions are in Capytaine's convention (`panel.rao`).
"""
import math

from marine_hull import panel as pn

G = pn.G
DOFS = ("Heave", "Pitch")


def full_mesh(half):
    """Mirror a y >= 0 half mesh into a full Capytaine mesh (no symmetry object, so every panel has a source)."""
    import numpy as np
    import capytaine as cpt
    v = np.array(half.vertices, dtype=float)
    v2 = v.copy()
    v2[:, 1] *= -1.0
    f = np.array(half.faces)
    return cpt.Mesh(vertices=np.vstack([v, v2]), faces=np.vstack([f, f[:, ::-1] + len(v)]))


class MaruoHull:
    """Wigley hull at zero speed: panel coefficients, motions and far-field mean drift in head waves."""

    def __init__(self, length, beam, draft, rho=1025.0, nx=40, nz=8, modified=False, n_theta=721):
        import numpy as np
        import capytaine as cpt
        self.l, self.bm, self.t, self.rho = length, beam, draft, rho
        half, lid = pn.hull_mesh(length, beam, draft, nx, nz, modified, lid=True)
        dofs = cpt.rigid_body_dofs(only=list(DOFS), rotation_center=(0.0, 0.0, 0.0))
        self.body = cpt.FloatingBody(mesh=full_mesh(half), lid_mesh=full_mesh(lid), dofs=dofs,
                                     center_of_mass=(0.0, 0.0, 0.0))
        self.n_panels = 2 * half.nb_faces
        self.solver = cpt.BEMSolver(method="indirect")
        self.theta = np.linspace(0.0, 2.0 * math.pi, n_theta)

    def solve(self, omega):
        """dict with the coefficients (A33, B33, A55, B55, F3, F5) and the Kochin functions Hd, Hr[dof]."""
        import capytaine as cpt
        from capytaine.bem.airy_waves import froude_krylov_force
        from capytaine.post_pro.kochin import compute_kochin
        pd = cpt.DiffractionProblem(body=self.body, wave_direction=math.pi, omega=omega, rho=self.rho, g=G)
        rd = self.solver.solve(pd, keep_details=True)
        fk = froude_krylov_force(pd)
        out = {"omega": omega, "k": omega * omega / G, "Hd": compute_kochin(rd, self.theta), "Hr": {},
               "F3": complex(rd.forces["Heave"] + fk["Heave"]), "F5": complex(rd.forces["Pitch"] + fk["Pitch"])}
        for dof in DOFS:
            r = self.solver.solve(cpt.RadiationProblem(body=self.body, radiating_dof=dof, omega=omega,
                                                       rho=self.rho, g=G), keep_details=True)
            out["Hr"][dof] = compute_kochin(r, self.theta)
            j = "3" if dof == "Heave" else "5"
            out["A" + j + j] = r.added_masses[dof]
            out["B" + j + j] = r.radiation_dampings[dof]
        return out

    def _dataset(self, sol):
        import numpy as np
        import xarray as xr
        w = sol["omega"]
        ds = xr.Dataset(coords={"omega": [w], "wave_direction": [math.pi], "theta": self.theta,
                                "radiating_dof": list(DOFS)})
        ds["wavenumber"] = sol["k"]
        ds["water_depth"] = np.inf
        ds["rho"] = self.rho
        ds["g"] = G
        ds["kochin_diffraction"] = (("omega", "wave_direction", "theta"), sol["Hd"][None, None, :])
        ds["kochin_radiation"] = (("omega", "radiating_dof", "theta"),
                                  np.array([sol["Hr"][d] for d in DOFS])[None])
        return ds

    def added_resistance(self, sol, heave=0j, pitch=0j):
        """R_aw per zeta^2 (N/m^2) from Capytaine's far-field formula with the given motions (0 = restrained)."""
        import numpy as np
        import xarray as xr
        from capytaine.post_pro.mean_drift_force import far_field_mean_drift_force
        w = sol["omega"]
        x = xr.DataArray(np.array([heave, pitch], dtype=complex).reshape(1, 2, 1),
                         dims=("omega", "radiating_dof", "wave_direction"),
                         coords={"omega": [w], "radiating_dof": list(DOFS), "wave_direction": [math.pi]})
        fx = far_field_mean_drift_force(x, self._dataset(sol))["drift_force_surge"].values.ravel()[0]
        return -float(fx.real)

    def energy_identity(self, sol, heave=0j, pitch=0j):
        """int |H|^2 dtheta / Im H(beta) divided by its lossless value -omega / k^2 (1 when energy is conserved),
        with H = i (Hd + sum Hr X), the total Kochin function as `far_field_mean_drift_force` forms it."""
        import numpy as np
        h = 1j * (sol["Hd"] + sol["Hr"]["Heave"] * heave + sol["Hr"]["Pitch"] * pitch)
        i0 = int(np.argmin(abs(self.theta - math.pi)))
        e = float(np.trapezoid(abs(h) ** 2, self.theta))
        return e / h[i0].imag / (-sol["omega"] / sol["k"] ** 2)


def cylinder_mesh(radius, draft, n_theta=96, n_z=32, n_r=6):
    """Closed vertical circular cylinder (side graded towards the free surface, flat bottom) for the code check."""
    import numpy as np
    import capytaine as cpt
    t = np.linspace(0.0, 2.0 * math.pi, n_theta + 1)
    z = -draft * np.linspace(0.0, 1.0, n_z + 1) ** 2
    verts, faces = [], []

    def side(i, k):
        return (i % n_theta) * (n_z + 1) + k
    for i in range(n_theta):
        for k in range(n_z + 1):
            verts.append((radius * math.cos(t[i]), radius * math.sin(t[i]), z[k]))
    for i in range(n_theta):
        for k in range(n_z):
            faces.append([side(i, k), side(i, k + 1), side(i + 1, k + 1), side(i + 1, k)])
    off = len(verts)
    verts.append((0.0, 0.0, -draft))

    def ring(j, i):
        return off + 1 + j * n_theta + (i % n_theta)
    for j, r in enumerate(np.linspace(0.0, radius, n_r + 1)[1:]):
        for i in range(n_theta):
            verts.append((r * math.cos(t[i]), r * math.sin(t[i]), -draft))
    for i in range(n_theta):
        faces.append([off, off, ring(0, i + 1), ring(0, i)])
        for j in range(n_r - 1):
            faces.append([ring(j, i), ring(j, i + 1), ring(j + 1, i + 1), ring(j + 1, i)])
    return cpt.Mesh(vertices=np.array(verts), faces=np.array(faces))


def cylinder_drift_exact(ka, n_modes=80, n=4000):
    """Exact deep-water mean drift force on a fixed vertical cylinder of infinite draft, / (rho g zeta^2 a).

    MacCamy-Fuchs scattering: on r = a the total potential is (g zeta / omega) e^{kz} psi(theta) with
    psi = sum eps_m i^m 2i / (pi ka H_m'(ka)) cos(m theta) (Wronskian). The near-field mean force, integrated
    over depth with int e^{2kz} dz = 1 / 2k, is rho g zeta^2 a int cos(theta) [-|psi|^2 / 8 + |psi_theta|^2 /
    (8 (ka)^2)] dtheta in the wave direction; its large-ka limit is 2/3 (full reflection on a circle).
    """
    import numpy as np
    from scipy.special import h1vp
    th = np.linspace(0.0, 2.0 * math.pi, n, endpoint=False)
    psi = np.zeros(n, complex)
    dpsi = np.zeros(n, complex)
    for m in range(n_modes):
        c = (1 if m == 0 else 2) * (1j ** m) * 2j / (math.pi * ka * h1vp(m, ka))
        psi += c * np.cos(m * th)
        dpsi += -m * c * np.sin(m * th)
    f = np.cos(th) * (-abs(psi) ** 2 / 8.0 + abs(dpsi) ** 2 / (8.0 * ka * ka))
    return float(f.mean() * 2.0 * math.pi)


def cylinder_drift_panel(radius, draft, ka, rho=1000.0, **mesh_kw):
    """Capytaine far-field drift on the fixed cylinder in waves along -x, / (rho g zeta^2 a), positive along the waves."""
    import numpy as np
    import xarray as xr
    import capytaine as cpt
    from capytaine.post_pro.kochin import compute_kochin
    from capytaine.post_pro.mean_drift_force import far_field_mean_drift_force
    mesh = cylinder_mesh(radius, draft, **mesh_kw)
    body = cpt.FloatingBody(mesh=mesh, lid_mesh=mesh.generate_lid(z=-0.01 * radius),
                            dofs=cpt.rigid_body_dofs(only=["Heave"]), center_of_mass=(0.0, 0.0, 0.0))
    k = ka / radius
    w = math.sqrt(G * k)
    r = cpt.BEMSolver(method="indirect").solve(
        cpt.DiffractionProblem(body=body, wave_direction=math.pi, omega=w, rho=rho, g=G), keep_details=True)
    th = np.linspace(0.0, 2.0 * math.pi, 721)
    ds = xr.Dataset(coords={"omega": [w], "wave_direction": [math.pi], "theta": th, "radiating_dof": ["Heave"]})
    ds["wavenumber"] = k
    ds["water_depth"] = np.inf
    ds["rho"] = rho
    ds["g"] = G
    ds["kochin_diffraction"] = (("omega", "wave_direction", "theta"), compute_kochin(r, th)[None, None, :])
    ds["kochin_radiation"] = (("omega", "radiating_dof", "theta"), np.zeros((1, 1, len(th))))
    x = xr.DataArray(np.zeros((1, 1, 1)), dims=("omega", "radiating_dof", "wave_direction"),
                     coords={"omega": [w], "radiating_dof": ["Heave"], "wave_direction": [math.pi]})
    fx = far_field_mean_drift_force(x, ds)["drift_force_surge"].values.ravel()[0].real
    return -float(fx) / (rho * G * radius)
