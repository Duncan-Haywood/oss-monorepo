"""Zero-speed heave and pitch of a Wigley hull by a 3D panel code, to check the strip theory (milestone 7zl).

The panel code is Capytaine (Ancellin and Dias 2019, J. Open Source Software 4(36) 1341,
doi:10.21105/joss.01341; GPL-3, installed from PyPI, not vendored): constant-strength source panels on the
wetted hull with the deep-water free-surface Green function, plus a waterplane lid that removes the
irregular frequencies. It is imported lazily, so the rest of the package stays stdlib only.

Conventions. Capytaine's complex amplitudes go with e^{-i omega t}, the incident wave of direction beta has
elevation e^{i k (x cos beta + y sin beta)} at the free surface, and its Pitch is a rotation about +y
(bow down for a bow at +x). `strip.py` uses e^{+i omega t}, head waves e^{i (omega t + k x)} and bow-up pitch. So
head waves are beta = pi here, and a panel amplitude converts to the strip convention as
heave_strip = conj(heave), pitch_strip = -conj(pitch) (`to_strip`).
"""
import math

G = 9.81


def wigley_halfbreadth(length, beam, draft, modified=False):
    """y(x, z) >= 0 of the Wigley form (x forward from midship, z up, -T <= z <= 0)."""
    def y(x, z):
        xi, c = 2.0 * x / length, z / draft
        if modified:     # Kashiwagi (2022) eq. 42, as `strip.modified_wigley_section`
            v = (1 - c * c) * (1 - xi * xi) * (1 + 0.2 * xi * xi) + c * c * (1 - c ** 8) * (1 - xi * xi) ** 4
        else:
            v = (1 - xi * xi) * (1 - c * c)
        return 0.5 * beam * max(v, 0.0)
    return y


def hull_mesh(length, beam, draft, nx=40, nz=8, modified=False, lid=True):
    """(half mesh y >= 0, lid half mesh or None) as Capytaine meshes; nx panels along, nz down (cosine in z)."""
    import numpy as np
    import capytaine as cpt
    y = wigley_halfbreadth(length, beam, draft, modified)
    # cosine spacing in x too, so the fine ends of the waterline are resolved
    xs = [-0.5 * length * math.cos(math.pi * i / nx) for i in range(nx + 1)]
    zs = [-draft * (1.0 - 0.5 * (1.0 - math.cos(math.pi * k / nz))) for k in range(nz + 1)]   # keel -> waterline
    verts, idx = [], {}
    for i, x in enumerate(xs):
        for k, z in enumerate(zs):
            idx[i, k] = len(verts)
            verts.append((x, y(x, z), z))
    faces = []
    for i in range(nx):
        for k in range(nz):
            # ordered so the normal points out of the hull (+y on this half) for Capytaine
            faces.append([idx[i, k], idx[i + 1, k], idx[i + 1, k + 1], idx[i, k + 1]])
    half = cpt.Mesh(vertices=np.array(verts), faces=np.array(faces), name="wigley_half")
    if half.faces_normals[len(faces) // 2][1] < 0:       # flip if the winding came out inward
        half = cpt.Mesh(vertices=np.array(verts), faces=np.array([f[::-1] for f in faces]), name="wigley_half")
    lid_half = None
    if lid:
        ny = max(2, nz // 2)
        lv, lf, li = [], [], {}
        zl = -1e-3 * draft          # just below the free surface
        for i, x in enumerate(xs):
            h = y(x, zl)
            for j in range(ny + 1):
                li[i, j] = len(lv)
                lv.append((x, h * j / ny, zl))
        for i in range(nx):
            for j in range(ny):
                lf.append([li[i, j], li[i, j + 1], li[i + 1, j + 1], li[i + 1, j]])
        lid_half = cpt.Mesh(vertices=np.array(lv), faces=np.array(lf), name="wigley_lid_half")
    return half, lid_half


class PanelHull:
    """Heave/pitch radiation and head-wave excitation of a Wigley hull at zero speed by Capytaine."""

    def __init__(self, length, beam, draft, rho=1025.0, nx=40, nz=8, modified=False, lid=True):
        import capytaine as cpt
        self.l, self.bm, self.t, self.rho = length, beam, draft, rho
        half, lid_half = hull_mesh(length, beam, draft, nx, nz, modified, lid)
        mesh = cpt.ReflectionSymmetricMesh(half, plane="xOz")
        kw = {}
        if lid_half is not None:
            kw["lid_mesh"] = cpt.ReflectionSymmetricMesh(lid_half, plane="xOz")
        dofs = cpt.rigid_body_dofs(only=["Heave", "Pitch"], rotation_center=(0.0, 0.0, 0.0))
        self.body = cpt.FloatingBody(mesh=mesh, dofs=dofs, center_of_mass=(0.0, 0.0, 0.0), **kw)
        self.n_panels = 2 * half.nb_faces
        self.solver = cpt.BEMSolver()

    def at(self, omega):
        """dict: A33, B33, A55, B55, A35, B35 (dimensional) and F3, F5 (head waves beta = pi, Capytaine convention)."""
        import capytaine as cpt
        from capytaine.bem.airy_waves import froude_krylov_force
        out = {}
        for dof in ("Heave", "Pitch"):
            pb = cpt.RadiationProblem(body=self.body, radiating_dof=dof, omega=omega, rho=self.rho, g=G)
            r = self.solver.solve(pb, keep_details=False)
            j = "3" if dof == "Heave" else "5"
            out["A3" + j] = r.added_masses["Heave"]
            out["B3" + j] = r.radiation_dampings["Heave"]
            out["A5" + j] = r.added_masses["Pitch"]
            out["B5" + j] = r.radiation_dampings["Pitch"]
        pd = cpt.DiffractionProblem(body=self.body, wave_direction=math.pi, omega=omega, rho=self.rho, g=G)
        rd = self.solver.solve(pd, keep_details=False)
        fk = froude_krylov_force(pd)
        out["F3"] = complex(rd.forces["Heave"] + fk["Heave"])
        out["F5"] = complex(rd.forces["Pitch"] + fk["Pitch"])
        out["F3_fk"] = complex(fk["Heave"])
        return out


def rao(c, inertia, restoring, omega, force, added, damping):
    """Single-mode zero-speed response in Capytaine's e^{-i omega t} convention, no viscous damping."""
    return force / (restoring - omega * omega * (inertia + added) - 1j * omega * damping)


def to_strip(heave, pitch):
    """Panel (e^{-i omega t}, bow-down pitch) amplitudes -> strip.py's (e^{+i omega t}, bow-up pitch)."""
    return heave.conjugate(), -pitch.conjugate()


def strip_zero_speed(hull, omega):
    """Strip sums at zero speed from `strip.WigleyStrip`: A33, B33, A55, B55 and the head-wave F3, F5
    (relative-motion form with the Smith correction, strip convention, F5 bow-up)."""
    import cmath
    k = omega * omega / G
    a, b = hull.sections(omega)
    c = [hull.rho * G * 2.0 * h for h in hull.hb]
    smith = math.exp(-k * hull.dm)
    out = {"A33": 0.0, "B33": 0.0, "A55": 0.0, "B55": 0.0, "F3": 0j, "F5": 0j}
    for i, x in enumerate(hull.x):
        out["A33"] += a[i] * hull.dx
        out["B33"] += b[i] * hull.dx
        out["A55"] += a[i] * x * x * hull.dx
        out["B55"] += b[i] * x * x * hull.dx
        f0 = (-a[i] * omega * omega + 1j * omega * b[i] + c[i]) * smith * cmath.exp(1j * k * x)
        out["F3"] += f0 * hull.dx
        out["F5"] += x * f0 * hull.dx
    return out


def gb_added_resistance(hull, omega, z, th):
    """Gerritsma-Beukelman radiated-energy added resistance per zeta^2 at zero speed with given motions
    (strip convention), on the strip sections of `hull`: k / (2 omega) sum b33 |V_z|^2 dx."""
    import cmath
    k = omega * omega / G
    _, b = hull.sections(omega)
    smith = math.exp(-k * hull.dm)
    raw = 0.0
    for i, x in enumerate(hull.x):
        vz = 1j * omega * (smith * cmath.exp(1j * k * x) - z - x * th)
        raw += b[i] * abs(vz) ** 2 * hull.dx
    return raw * k / (2.0 * omega)
