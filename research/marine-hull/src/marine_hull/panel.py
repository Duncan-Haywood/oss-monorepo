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


def wigley_halfbreadth(length, beam, draft, modified=False, alpha=1.0):
    """y(x, z) >= 0 of the Wigley form (x forward from midship, z up, -T <= z <= 0); with `modified`, Kashiwagi's
    form with the bilge term scaled by alpha (1: Kashiwagi and Journee's Wigley I; 0: Journee's Wigley III)."""
    def y(x, z):
        xi, c = 2.0 * x / length, z / draft
        if modified:     # Kashiwagi (2022) eq. 42, as `strip.modified_wigley_section`
            v = (1 - c * c) * (1 - xi * xi) * (1 + 0.2 * xi * xi) + alpha * c * c * (1 - c ** 8) * (1 - xi * xi) ** 4
        else:
            v = (1 - xi * xi) * (1 - c * c)
        return 0.5 * beam * max(v, 0.0)
    return y


def hull_mesh(length, beam, draft, nx=40, nz=8, modified=False, lid=True, alpha=1.0):
    """(half mesh y >= 0, lid half mesh or None) as Capytaine meshes; nx panels along, nz down (cosine in z)."""
    import numpy as np
    import capytaine as cpt
    y = wigley_halfbreadth(length, beam, draft, modified, alpha)
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

    def __init__(self, length, beam, draft, rho=1025.0, nx=40, nz=8, modified=False, lid=True, alpha=1.0):
        import capytaine as cpt
        self.l, self.bm, self.t, self.rho = length, beam, draft, rho
        half, lid_half = hull_mesh(length, beam, draft, nx, nz, modified, lid, alpha)
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


def strip_coupling_restoring(hull):
    """Heave-pitch restoring cross term of the strip waterline, sum rho g 2 b(x) x dx (bow-up pitch; ~0 for a
    fore-aft symmetric hull). In Capytaine's bow-down pitch the restoring matrix carries minus this off-diagonal."""
    return sum(hull.rho * G * 2.0 * h * x * hull.dx for h, x in zip(hull.hb, hull.x))


class PanelHullSpeed(PanelHull):
    """Heave and pitch of a Wigley hull in head waves at forward speed U by Capytaine's forward-speed option
    (milestone 7zn), labelled an approximation: the zero-speed free-surface Green function at the encounter
    frequency, the uniform-stream m-terms -U d(dof)/dx . n in the radiation boundary condition, and the linearised
    pressure rho (i omega_e phi + U dphi/dx); no steady wave field, no forward-speed free-surface condition."""

    def at_speed(self, omega, u):
        """dict at absolute wave frequency omega, head waves (beta = pi), speed u: we (encounter), the 2x2 added mass
        A[i][j] and damping B[i][j] (i influenced, j radiating; 0 heave, 1 pitch bow-down) and F3, F5, all in
        Capytaine's e^{-i omega_e t} convention."""
        import capytaine as cpt
        from capytaine.bem.airy_waves import froude_krylov_force
        dofs = ("Heave", "Pitch")
        a = [[0.0, 0.0], [0.0, 0.0]]
        b = [[0.0, 0.0], [0.0, 0.0]]
        we = None
        for j, dof in enumerate(dofs):
            pb = cpt.RadiationProblem(body=self.body, radiating_dof=dof, omega=omega, wave_direction=math.pi,
                                      forward_speed=u, rho=self.rho, g=G)
            r = self.solver.solve(pb, keep_details=False)
            we = float(r.encounter_omega) if u else omega
            for i, d in enumerate(dofs):
                a[i][j] = r.added_mass[d]
                b[i][j] = r.radiation_damping[d]
        pd = cpt.DiffractionProblem(body=self.body, wave_direction=math.pi, omega=omega, forward_speed=u,
                                    rho=self.rho, g=G)
        rd = self.solver.solve(pd, keep_details=False)
        fk = froude_krylov_force(pd)
        return {"we": we, "A": a, "B": b, "F3": complex(rd.forces["Heave"] + fk["Heave"]),
                "F5": complex(rd.forces["Pitch"] + fk["Pitch"])}


def motions_speed(q, mass, iyy, c33, c55, c35_up=0.0, bv33=0.0, bv55=0.0):
    """Coupled heave and bow-down pitch from `PanelHullSpeed.at_speed` with the given mass, inertia, restoring and
    linear viscous damping, Capytaine convention: [-we^2 (M + A) - i we (B + Bv) + C] x = F."""
    we, a, b = q["we"], q["A"], q["B"]
    m = (mass, iyy)
    bv = (bv33, bv55)
    c = [[c33, -c35_up], [-c35_up, c55]]
    k = [[-we * we * ((m[i] if i == j else 0.0) + a[i][j]) - 1j * we * (b[i][j] + (bv[i] if i == j else 0.0)) + c[i][j]
          for j in range(2)] for i in range(2)]
    f = (q["F3"], q["F5"])
    det = k[0][0] * k[1][1] - k[0][1] * k[1][0]
    return (f[0] * k[1][1] - k[0][1] * f[1]) / det, (k[0][0] * f[1] - k[1][0] * f[0]) / det


def gb_added_resistance_speed(hull, omega, u, z, th):
    """Gerritsma-Beukelman added resistance per zeta^2 at speed u with given motions (strip convention, bow-up
    pitch), on the strip sections of `hull`: the same sum as `strip.WigleyStrip.response`,
    k / (2 omega_e) sum (b33 - U da33/dx) |Ds/Dt|^2 dx."""
    import cmath
    k = omega * omega / G
    we = omega + k * u
    a, b = hull.sections(we)
    n = len(hull.x)
    ap = []
    for i in range(n):
        lo, hi = max(i - 1, 0), min(i + 1, n - 1)
        ap.append((a[hi] - a[lo]) / (hull.x[hi] - hull.x[lo]))
    smith = math.exp(-k * hull.dm)
    raw = 0.0
    for i, x in enumerate(hull.x):
        zs = smith * cmath.exp(1j * k * x)
        vz = 1j * omega * zs - (1j * we * z + 1j * we * x * th - u * th)
        raw += (b[i] - u * ap[i]) * abs(vz) ** 2 * hull.dx
    return raw * k / (2.0 * we)
