"""Near-field added resistance by direct pressure integration on the strip sections (milestone 7zs).

The formula is Boese's (1970) direct pressure integration in the form written out for PDSTRIP, the public-domain
strip code of Soeding, Bertram and Thiart (TU Hamburg; theory manual `doc/pdstrip_documentation.ps`, chapter 17
"Drift force", eqs. 161 to 175; MIT-licensed mirror github.com/eriove/pdstrip, read 2026-11-21). PDSTRIP's code is
not used or copied; only the three documented terms of the mean longitudinal force are implemented here:

    (166) rotation:   f = -1/2 Re[(sum_P p a0) x alpha*]       first-order pressure force times hull rotation
    (170) velocity:   f = -rho/4 sum_P |v|^2 a0                  squared first-order fluid velocity on the hull
    (175) waterline:  f = 1/(4 rho g) sum_W |p|^2 n              pressure on the band between mean and actual waterline

a0 is a hull panel's mean area vector pointing into the hull, n a waterline segment's horizontal normal into the hull
(length = segment length), p and v the complex first-order pressure and fluid velocity at ship-fixed points, alpha the
hull rotation. R_aw = -f_x. PDSTRIP sums p a0 for the force in (166); Boese replaced it by mass times acceleration,
offered here as the `rot_boese` term.

The first-order flow is the one this programme's strip theory already assumes (`strip.WigleyStrip.response`,
unchanged, gives the motions): on each section the disturbance potential is the Frank close-fit heave potential
for unit vertical velocity times minus the Smith-corrected relative vertical velocity V_z (the Salvesen-Tuck-Faltinsen
relative-velocity approximation for diffraction plus radiation), and the pressure at a ship-fixed point is

    p = rho g e^{kz} e^{ikx} - rho g (z3 + x theta) - rho (i omega_e - U d/dx) phi_d,

incident (exact Froude-Krylov, no Smith factor), hydrostatic change of the displaced point, and the disturbance with
the uniform-stream convection. Head waves, heave and pitch only; the hull is symmetric, so the starboard half is
summed and doubled. Conventions as in `strip`: e^{i omega_e t}, x forward, z up, pitch theta bow up.
"""
import cmath
import math

from marine_hull import strip as st

G = st.G


def section_nodes(r, n_panels):
    """The right-half contour (draft 1) for a `SectionTable` ratio key, or None for a vanishing section."""
    if isinstance(r, tuple):
        nodes = st.modified_wigley_section(r[1], r[2], 1.0, n_panels, r[3] if len(r) > 3 else 1.0)
        return None if max(p[0] for p in nodes) <= 1e-9 else nodes
    if r <= 0.0:
        return None
    return st.wigley_section(r, 1.0, n_panels)


def field_row(args):
    """Per nu T: the per-panel heave potential (unit velocity, draft 1) and the near/far damping check; picklable."""
    r, n_panels, nu_t, tol = args
    nodes = section_nodes(r, n_panels)
    if nodes is None:
        return None
    geo, phis, ok, a_int = None, [], [], []
    for nt in nu_t:
        keep = []
        big, amp = st.section_heave(nodes, nt, keep)
        pan, phi = keep
        if geo is None:
            geo = [(mid[0], mid[1], ny, nz, ds, (p1[0] - p0[0]) / ds, (p1[1] - p0[1]) / ds, abs(p1[1] - p0[1]))
                   for p0, p1, ds, ny, nz, mid in pan]
        far = abs(amp) ** 2
        ok.append(abs(big.imag - far) <= max(tol * far, 0.002))
        phis.append(list(phi))
    return geo, phis, ok


class FieldTable:
    """Per-panel Frank heave potential of each section, against nu T, irregular frequencies patched as in SectionTable.

    geo[r]: [(y, z, n_y, n_z, ds, t_y, t_z, |dz|)] per panel, draft 1, outward normal; phi[r][k][j]: potential of
    panel j at nu_t[k] for unit heave velocity, draft 1 (dimensional: T times this at nu T)."""

    def __init__(self, ratios, n_panels=16, tol=0.03, nu_t=st.NU_T, processes=None):
        self.ratios, self.nu_t, self.n_panels = list(ratios), list(nu_t), n_panels
        jobs = [(r, n_panels, self.nu_t, tol) for r in self.ratios]
        if processes == 1:
            rows = [field_row(j) for j in jobs]
        else:
            import multiprocessing
            with multiprocessing.Pool(processes) as pool:
                rows = pool.map(field_row, jobs)
        self.geo, self.phi, self.n_irregular = {}, {}, 0
        for r, row in zip(self.ratios, rows):
            if row is None:
                self.geo[r] = None
                continue
            geo, phis, ok = row
            for j in range(len(geo)):
                col = [p[j] for p in phis]
                st._patch(col, ok, self.nu_t)
                for k in range(len(phis)):
                    phis[k][j] = col[k]
            self.n_irregular += ok.count(False)
            self.geo[r], self.phi[r] = geo, phis

    def a_star(self, r, k):
        """a33 / (rho T^2) at the tabulated nu_t[k] from the panel potential: -Re(2 sum phi n_z ds) (check N0a)."""
        return -(2.0 * sum(p * g[3] * g[4] for p, g in zip(self.phi[r][k], self.geo[r]))).real

    def at(self, r, nu_t):
        """Per-panel potential at nu T (draft 1), interpolated linearly in log nu T as SectionTable.coeffs."""
        ph, g = self.phi[r], self.nu_t
        if nu_t <= g[0]:
            return ph[0]
        if nu_t >= g[-1]:
            return ph[-1]
        x = math.log(nu_t / g[0]) / math.log(g[-1] / g[0]) * (len(g) - 1)
        i = min(int(x), len(g) - 2)
        f = x - i
        return [a + f * (b - a) for a, b in zip(ph[i], ph[i + 1])]


def d_dx(vals, xs, half_length):
    """d/dx along the stations, with zero ghost values at the hull ends x = -L/2 and +L/2 (both Wigley ends close)."""
    xx = [-half_length] + list(xs) + [half_length]
    vv = [0.0 * vals[0]] + list(vals) + [0.0 * vals[0]]
    out = []
    for i in range(1, len(xx) - 1):
        hm, hp = xx[i] - xx[i - 1], xx[i + 1] - xx[i]
        out.append(((vv[i + 1] - vv[i]) / hp * hm + (vv[i] - vv[i - 1]) / hm * hp) / (hm + hp))
    return out


def d_ds(vals, geo):
    """d/ds along the contour from the panel midpoints (one-sided at the keel and the waterline)."""
    n = len(vals)
    out = []
    for j in range(n):
        lo, hi = max(j - 1, 0), min(j + 1, n - 1)
        dist = math.hypot(geo[hi][0] - geo[lo][0], geo[hi][1] - geo[lo][1])
        out.append((vals[hi] - vals[lo]) / dist)
    return out


class NearField:
    """Boese / PDSTRIP near-field added resistance of a `WigleyStrip` (or `ModifiedWigleyStrip`) in head waves."""

    def __init__(self, hull, field=None, n_panels=16, processes=None):
        self.h = hull
        keys = sorted(set(hull.ratio), key=repr)
        self.field = field or FieldTable(keys, n_panels=n_panels, processes=processes)

    def response(self, omega, u, gb=None):
        """dict: motions, GB R_aw and the near-field terms (N/m2 per unit wave amplitude squared).

        nf = wl + vel + rot (PDSTRIP's force sum in 166); nf_boese uses Boese's substitution in 166; nf0 drops the
        U d/dx convection from the pressure and velocity (all three terms)."""
        h = self.h
        z3, th, raw_gb, we = h.response(omega, u, gb=gb)
        k = omega * omega / G
        rho, t, dx, xs = h.rho, h.t, h.dx, h.x
        ut = u if (gb or {}).get("u_theta", True) else 0.0
        smith = math.exp(-k * h.dm)
        nu_t = we * we / G * t
        vz = [1j * omega * smith * cmath.exp(1j * k * x) - (1j * we * z3 + 1j * we * x * th - ut * th) for x in xs]
        geos = [self.field.geo[r] for r in h.ratio]
        npan = len(next(g for g in geos if g is not None))
        phs = []
        for r, v in zip(h.ratio, vz):
            if self.field.geo[r] is None:
                phs.append([0j] * npan)
            else:
                phs.append([-t * p * v for p in self.field.at(r, nu_t)])        # phi_d, dimensional
        ys = [[t * g[j][0] for j in range(npan)] if g is not None else [0.0] * npan for g in geos]
        # x-derivatives per panel index (the panels of every section sit at the same z, the draft being constant)
        phx = [[0j] * npan for _ in xs]
        yx = [[0.0] * npan for _ in xs]
        for j in range(npan):
            dp = d_dx([p[j] for p in phs], xs, 0.5 * h.l)
            dy = d_dx([y[j] for y in ys], xs, 0.5 * h.l)
            for i in range(len(xs)):
                phx[i][j], yx[i][j] = dp[i], dy[i]
        hbx = d_dx(h.hb, xs, 0.5 * h.l)
        out = {"z": z3, "theta": th, "we": we, "gb": raw_gb}
        for conv in (True, False):
            uc = u if conv else 0.0
            f3 = 0j
            r_wl = r_vel = 0.0
            for i, x in enumerate(xs):
                g = geos[i]
                if g is None:
                    continue
                eikx = cmath.exp(1j * k * x)
                disp = z3 + x * th
                dn = [-vz[i] * g[j][3] for j in range(npan)]              # body condition, outward normal derivative
                dsv = d_ds(phs[i], [(t * q[0], t * q[1]) for q in g])
                vyd = [g[j][2] * dn[j] + g[j][5] * dsv[j] for j in range(npan)]   # disturbance d phi / dy
                # d phi / dx at fixed (y, z): the derivative along the hull at fixed z minus phi_y dY/dx
                pxt = [phx[i][j] - vyd[j] * yx[i][j] for j in range(npan)]
                for j in range(npan):
                    zz = t * g[j][1]
                    ds, tz, dz = t * g[j][4], g[j][6], t * g[j][7]
                    p = (rho * G * math.exp(k * zz) * eikx - rho * G * disp
                         - rho * (1j * we * phs[i][j] - uc * pxt[j]))
                    f3 += p * (-g[j][3]) * ds * dx * 2.0                    # inward area vector, both sides
                    ek = math.exp(k * zz) * eikx
                    vx = -omega * ek + pxt[j]
                    vzz = 1j * omega * ek + g[j][3] * dn[j] + tz * dsv[j]
                    v2 = abs(vx) ** 2 + abs(vyd[j]) ** 2 + abs(vzz) ** 2
                    a0x = yx[i][j] * dz * dx                                 # inward x area, one side
                    r_vel -= -0.25 * rho * v2 * a0x * 2.0                    # R = -f_x
                # waterline: the disturbance potential extrapolated to z = 0 from the two top panels
                z1, z2 = g[-1][1], g[-2][1]
                f = -z1 / (z2 - z1) if z2 != z1 else 0.0
                pw = phs[i][-1] + f * (phs[i][-2] - phs[i][-1])
                pwx = pxt[-1] + f * (pxt[-2] - pxt[-1])
                p_wl = rho * G * eikx - rho * G * disp - rho * (1j * we * pw - uc * pwx)
                r_wl -= abs(p_wl) ** 2 / (4.0 * rho * G) * hbx[i] * dx * 2.0
            r_rot = 0.5 * (f3 * th.conjugate()).real                         # R = -f_x = +1/2 Re(F3 theta*)
            fb = -we * we * h.mass * z3 + 1j * we * h.bv33 * z3
            r_rot_b = 0.5 * (fb * th.conjugate()).real
            tag = "" if conv else "0"
            out.update({"wl" + tag: r_wl, "vel" + tag: r_vel, "rot" + tag: r_rot, "rot_boese": r_rot_b,
                        "nf" + tag: r_wl + r_vel + r_rot})
            out["f3" + tag] = f3
            if conv:
                out["nf_boese"] = r_wl + r_vel + r_rot_b
                out["f3_newton"] = fb
        return out
