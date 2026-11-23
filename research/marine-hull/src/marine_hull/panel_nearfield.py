"""Zero-speed near-field mean drift by direct pressure integration on a 3D panel solution (milestone 7zx).

The first-order flow is Capytaine's (Ancellin and Dias 2019, J. Open Source Software 4(36) 1341,
doi:10.21105/joss.01341; PyPI, imported lazily): the hull of `maruo.MaruoHull` (full mesh, waterplane lid) solved
for diffraction and for heave and pitch radiation (per unit motion amplitude). The mean longitudinal force is
Pinkster's (1980) near-field sum over the mean hull, with n the face normal out of the hull into the fluid:

    WL    -(rho g / 4) sum_W |zeta_r|^2 n_x dl         zeta_r = i omega phi / g - X_z on the mean waterline
    VEL   +(rho / 4)   sum_S |v|^2 n_x dS              second-order Bernoulli pressure of the first-order velocity
    GRAD  -1/2 Re sum_S (X . conj(grad p)) n_x dS     first-order pressure at the displaced point, grad p = i omega rho v
    ROT   +1/2 Re(theta conj(F_z))                    rotation of the first-order force, F_z = -omega^2 m X3

phi and v are the total first-order potential and velocity (incident + diffraction + X3 phi_3 + X5 phi_5), p =
i omega rho phi, X = (theta z, 0, X3 - theta x) the displacement of a hull point under heave X3 and bow-down pitch
theta about the origin (the centre of mass, as in `maruo`). The second-order hydrostatic terms give no mean x-force
under heave and pitch (LOG.md, 7zu). Capytaine's conventions throughout (e^{-i omega t}; head waves beta = pi travel
towards -x); the added resistance of a hull heading +x is R_aw = -F_x. The waterline elevation is extrapolated
linearly in z to z = 0 from the centres of the two top panel rows.
"""
import math

from marine_hull import maruo as mr
from marine_hull import panel as pn

G = pn.G


def _terms(solver, body, results, motions, wl, rho, omega, mass=0.0):
    """dict of the four terms of F_x (N per zeta^2) and the boundary-condition residual of each radiation result.

    results: {"D": diffraction, dof: radiation}; motions: {dof: amplitude}; wl: list of (top face, second face,
    n_x dl) on the full mesh's hull faces. Pitch is the dof named "Pitch" (bow-down, about the origin)."""
    import numpy as np
    from capytaine.bem.airy_waves import airy_waves_potential, airy_waves_velocity
    mesh = body.mesh
    c = mesh.faces_centers
    nx = mesh.faces_normals[:, 0]
    da = mesh.faces_areas
    pb = results["D"].problem
    phi = airy_waves_potential(c, pb) + solver.compute_potential(mesh, results["D"])
    vel = airy_waves_velocity(c, pb) + solver.compute_velocity(mesh, results["D"])
    resid = {}
    for dof, x in motions.items():
        r = results[dof]
        vr = solver.compute_velocity(mesh, r)
        bc = np.asarray(r.problem.boundary_condition)[body.hull_mask]
        vn = np.sum(vr * mesh.faces_normals, axis=1)
        resid[dof] = float(np.sqrt(np.mean(abs(vn - bc) ** 2) / np.mean(abs(bc) ** 2)))
        if x != 0:
            phi = phi + x * solver.compute_potential(mesh, r)
            vel = vel + x * vr
    x3 = motions.get("Heave", 0j)
    th = motions.get("Pitch", 0j)
    xz = x3 - th * c[:, 0]
    xx = th * c[:, 2]
    v2 = np.sum(abs(vel) ** 2, axis=1)
    f_vel = 0.25 * rho * float(np.sum(v2 * nx * da))
    gp = 1j * omega * rho * vel
    xg = (xx * np.conj(gp[:, 0]) + xz * np.conj(gp[:, 2])).real
    f_grad = -0.5 * float(np.sum(xg * nx * da))
    f_wl = 0.0
    for i1, i2, ndl in wl:
        z1, z2 = c[i1, 2], c[i2, 2]
        p0 = phi[i1] + (0.0 - z1) * (phi[i2] - phi[i1]) / (z2 - z1)
        xw = 0.5 * (c[i1, 0] + c[i2, 0])
        zr = 1j * omega * p0 / G - (x3 - th * xw)
        f_wl -= 0.25 * rho * G * abs(zr) ** 2 * ndl
    fz = -omega * omega * mass * x3
    f_rot = 0.5 * float((th * np.conj(fz)).real)
    return {"wl": f_wl, "vel": f_vel, "grad": f_grad, "rot": f_rot}, resid


def _velocity_split(solver, body, results, motions, rho):
    """7zy: the velocity term of R = -F_x split into II, ID (2 Re v_I . conj v_P) and PP per component x, y, z,
    v_I the incident velocity and v_P diffraction plus the motion-weighted radiation velocities; sums to -vel."""
    import numpy as np
    from capytaine.bem.airy_waves import airy_waves_velocity
    mesh = body.mesh
    c = mesh.faces_centers
    w = mesh.faces_normals[:, 0] * mesh.faces_areas
    vi = airy_waves_velocity(c, results["D"].problem)
    vp = solver.compute_velocity(mesh, results["D"])
    for dof, x in motions.items():
        if x != 0:
            vp = vp + x * solver.compute_velocity(mesh, results[dof])
    out = {}
    for j, comp in enumerate("xyz"):
        a, b = vi[:, j], vp[:, j]
        out["II_" + comp] = -0.25 * rho * float(np.sum(abs(a) ** 2 * w))
        out["ID_" + comp] = -0.25 * rho * float(np.sum(2.0 * (a * np.conj(b)).real * w))
        out["PP_" + comp] = -0.25 * rho * float(np.sum(abs(b) ** 2 * w))
    return out


class PanelNearField(mr.MaruoHull):
    """`maruo.MaruoHull` plus the near-field mean drift on the same panel solution."""

    def __init__(self, length, beam, draft, rho=1025.0, nx=40, nz=8, modified=False, n_theta=721):
        super().__init__(length, beam, draft, rho=rho, nx=nx, nz=nz, modified=modified, n_theta=n_theta)
        half, _ = pn.hull_mesh(length, beam, draft, nx, nz, modified, lid=True)
        nh = half.nb_faces
        y = pn.wigley_halfbreadth(length, beam, draft, modified)
        xs = [-0.5 * length * math.cos(math.pi * i / nx) for i in range(nx + 1)]
        top, sec = nz - 1, nz - 2      # faces run keel -> waterline in k, inner loop
        self.wl = []
        for i in range(nx):
            dy = y(xs[i + 1], 0.0) - y(xs[i], 0.0)
            ndl = -dy                  # outward normal (-dy, dx) on the y >= 0 side; the mirror half has the same n_x
            for off in (0, nh):
                self.wl.append((off + i * nz + top, off + i * nz + sec, ndl))
        self.check_rows(half)

    def check_rows(self, half):
        """The top-row bookkeeping: every listed top face lies above its second-row face."""
        c = self.body.mesh.faces_centers
        assert all(c[a, 2] > c[b, 2] for a, b, _ in self.wl)

    def solve_nf(self, omega):
        """(sol, results) with `maruo` coefficients and Kochin functions plus the kept Capytaine results."""
        import capytaine as cpt
        from capytaine.bem.airy_waves import froude_krylov_force
        from capytaine.post_pro.kochin import compute_kochin
        pd = cpt.DiffractionProblem(body=self.body, wave_direction=math.pi, omega=omega, rho=self.rho, g=G)
        rd = self.solver.solve(pd, keep_details=True)
        fk = froude_krylov_force(pd)
        sol = {"omega": omega, "k": omega * omega / G, "Hd": compute_kochin(rd, self.theta), "Hr": {},
               "F3": complex(rd.forces["Heave"] + fk["Heave"]), "F5": complex(rd.forces["Pitch"] + fk["Pitch"])}
        res = {"D": rd}
        for dof in mr.DOFS:
            r = self.solver.solve(cpt.RadiationProblem(body=self.body, radiating_dof=dof, omega=omega,
                                                       rho=self.rho, g=G), keep_details=True)
            res[dof] = r
            sol["Hr"][dof] = compute_kochin(r, self.theta)
            j = "3" if dof == "Heave" else "5"
            sol["A" + j + j] = r.added_masses[dof]
            sol["B" + j + j] = r.radiation_dampings[dof]
        return sol, res

    def near_field(self, res, omega, heave=0j, pitch=0j, mass=0.0):
        """(terms of R_aw = -F_x per zeta^2, N/m2, with 'nf' their sum; BC residuals per dof)."""
        f, resid = _terms(self.solver, self.body, res, {"Heave": heave, "Pitch": pitch}, self.wl, self.rho,
                          omega, mass)
        r = {k: -v for k, v in f.items()}
        r["nf"] = sum(r.values())
        return r, resid

    def velocity_split(self, res, heave=0j, pitch=0j):
        """7zy: the velocity term of R_aw (N/m2 per zeta^2) split by pair and component; sums to near_field's vel."""
        return _velocity_split(self.solver, self.body, res, {"Heave": heave, "Pitch": pitch}, self.rho)


def cylinder_near_field(radius, draft, ka, rho=1000.0, n_theta=96, n_z=32, n_r=6):
    """(near field, Capytaine far field) of the fixed vertical cylinder in waves along -x, / (rho g zeta^2 a),
    positive along the waves (WL + VEL only: restrained)."""
    import numpy as np
    import xarray as xr
    import capytaine as cpt
    from capytaine.post_pro.kochin import compute_kochin
    from capytaine.post_pro.mean_drift_force import far_field_mean_drift_force
    mesh = mr.cylinder_mesh(radius, draft, n_theta=n_theta, n_z=n_z, n_r=n_r)
    body = cpt.FloatingBody(mesh=mesh, lid_mesh=mesh.generate_lid(z=-0.01 * radius),
                            dofs=cpt.rigid_body_dofs(only=["Heave"]), center_of_mass=(0.0, 0.0, 0.0))
    k = ka / radius
    w = math.sqrt(G * k)
    solver = cpt.BEMSolver(method="indirect")
    rd = solver.solve(cpt.DiffractionProblem(body=body, wave_direction=math.pi, omega=w, rho=rho, g=G),
                      keep_details=True)
    t = np.linspace(0.0, 2.0 * math.pi, n_theta + 1)
    wl = []
    for i in range(n_theta):       # side faces: theta outer, z inner from the waterline down (k = 0 is the top row)
        dy = radius * (math.sin(t[i + 1]) - math.sin(t[i]))
        wl.append((i * n_z, i * n_z + 1, dy))          # counter-clockwise: outward normal (dy, -dx)
    f, _ = _terms(solver, body, {"D": rd}, {}, wl, rho, w)
    nf = -sum(f.values()) / (rho * G * radius)
    th = np.linspace(0.0, 2.0 * math.pi, 721)
    ds = xr.Dataset(coords={"omega": [w], "wave_direction": [math.pi], "theta": th, "radiating_dof": ["Heave"]})
    ds["wavenumber"] = k
    ds["water_depth"] = np.inf
    ds["rho"] = rho
    ds["g"] = G
    ds["kochin_diffraction"] = (("omega", "wave_direction", "theta"), compute_kochin(rd, th)[None, None, :])
    ds["kochin_radiation"] = (("omega", "radiating_dof", "theta"), np.zeros((1, 1, len(th))))
    x = xr.DataArray(np.zeros((1, 1, 1)), dims=("omega", "radiating_dof", "wave_direction"),
                     coords={"omega": [w], "radiating_dof": ["Heave"], "wave_direction": [math.pi]})
    ff = -float(far_field_mean_drift_force(x, ds)["drift_force_surge"].values.ravel()[0].real) / (rho * G * radius)
    return nf, ff
