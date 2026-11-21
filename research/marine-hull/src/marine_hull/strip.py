"""Strip-theory heave/pitch and Gerritsma-Beukelman added resistance in head waves (milestone 7z).

Three layers, stdlib only:

1. Two-dimensional heave added mass a33 and damping b33 of a symmetric section in deep water by the
   Frank (1967) close-fit source method: constant-strength source panels on the wetted contour (and their
   mirror images in the centreplane), each carrying the deep-water pulsating-source Green function
   (Frank 1967, NSRDC Report 2375, DTIC AD0668338), written here in complex form

       G = ln|Z - zeta| - ln|Z - conj(zeta)| - 2 PV int_0^inf e^{k (z + c)} cos k (y - b) / (k - nu) dk
           + 2 pi i e^{nu (z + c)} cos nu (y - b),
       PV integral = Re[e^w E1(w)] - pi e^{nu (z + c)} sin(nu |y - b|),  w = nu (z + c + i |y - b|),

   with time dependence e^{i omega t}, nu = omega^2 / g, Z = y + i z (z up, fluid below z = 0), source
   zeta = b + i c. `tests/test_strip.py` checks the free-surface condition, the outgoing-wave form far away,
   and that the damping from the pressure on the hull equals the energy carried away by the radiated waves.

2. Heave and pitch of a slender hull in regular head waves by ordinary strip theory in the relative-motion
   form used by Gerritsma and Beukelman (1972, Int. Shipbuilding Progress 19(217), doi:10.3233/ISP-1972-1921701):
   the sectional force is D/Dt(a33 Ds/Dt) + b33 Ds/Dt + rho g b_w s, s the vertical motion of the
   Smith-corrected wave relative to the section, D/Dt = d/dt - U d/dx.

3. Mean added resistance by the Gerritsma-Beukelman (1972) radiated-energy method,
   R_aw = k / (2 omega_e) int (b33 - U da33/dx) |V_z|^2 dx, V_z = Ds/Dt.

The hull is the Wigley form y = (B/2)(1 - (2x/L)^2)(1 - (z/T)^2) used throughout the programme.
"""
import cmath
import math

G = 9.81
RHO = 1025.0
EULER = 0.5772156649015329

# --------------------------------------------------------------------------- exponential integral


def e1(z):
    """Complex exponential integral E1(z), principal branch (cut on the negative real axis)."""
    z = complex(z)
    az = abs(z)
    if az == 0.0:
        raise ValueError("E1(0)")
    if az < 2.0 or az + z.real < 18.0:
        # power series: E1 = -gamma - ln z - sum_{n>=1} (-z)^n / (n n!)
        s, term, n = 0j, 1 + 0j, 1
        while True:
            term *= -z / n
            add = term / n
            s += add
            if abs(add) < 1e-17 * max(1.0, abs(s)) and n > az:
                break
            n += 1
            if n > 400:
                break
        return -EULER - cmath.log(z) - s
    # continued fraction (modified Lentz), valid away from the negative real axis
    tiny = 1e-300
    b = z + 1.0
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 500):
        an = -i * i
        b += 2.0
        d = 1.0 / (an * d + b)
        c = b + an / c
        de = c * d
        h *= de
        if abs(de - 1.0) < 1e-16:
            break
    return h * cmath.exp(-z)


# --------------------------------------------------------------------------- Green function


def wave_part(y, z, b, c, nu):
    """Free-surface part of the source potential at (y, z) for a source at (b, c), complex.

    The whole of G minus the two logs. Far from the source it tends to 2 pi i e^{nu (z + c)} e^{-i nu |y - b|},
    an outgoing wave for time dependence e^{i omega t}.
    """
    dy = abs(y - b)
    zz = z + c                      # < 0
    w = nu * complex(zz, dy)        # Re w < 0
    # PV int_0^inf e^{k zz} cos(k dy) / (k - nu) dk = Re[e^w E1(w)] - pi e^{nu zz} sin(nu dy)
    # (checked against direct quadrature in tests/test_strip.py)
    f = cmath.exp(w) * e1(w)
    ez = math.exp(nu * zz)
    pv = f.real - math.pi * ez * math.sin(nu * dy)
    return -2.0 * pv + 2j * math.pi * ez * math.cos(nu * (y - b))


def green(y, z, b, c, nu):
    return (math.log(math.hypot(y - b, z - c)) - math.log(math.hypot(y - b, z + c))
            + wave_part(y, z, b, c, nu))


def grad_green(y, z, b, c, nu, skip_log=False):
    """(dG/dy, dG/dz) at the field point (y, z), complex."""
    dyv, dzv = y - b, z - c
    r2 = dyv * dyv + dzv * dzv
    gy = gz = 0j
    if not skip_log:
        gy += dyv / r2
        gz += dzv / r2
    zz = z + c
    r12 = dyv * dyv + zz * zz
    gy -= dyv / r12
    gz -= zz / r12
    s = (dyv > 0) - (dyv < 0)
    dy = abs(dyv)
    w = nu * complex(zz, dy)
    f = cmath.exp(w) * e1(w)
    fp = f - 1.0 / w                                  # d/dw [e^w E1(w)]
    ez = math.exp(nu * zz)
    pv_z = (nu * fp).real - math.pi * nu * ez * math.sin(nu * dy)
    pv_y = (1j * nu * s * fp).real - math.pi * nu * ez * math.cos(nu * dy) * s
    gz += -2.0 * pv_z + 2j * math.pi * nu * ez * math.cos(nu * dyv)
    gy += -2.0 * pv_y - 2j * math.pi * nu * ez * math.sin(nu * dyv)
    return gy, gz


# Gauss-Legendre 8 points on [-1, 1]
_GX = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
       0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363]
_GW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
       0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763]


def wigley_section(half_beam, draft=1.0, n=16):
    """Nodes (y, z) of the right half of the section y = half_beam (1 - (z/T)^2), keel to waterline,
    cosine-spaced in z so both the keel and the waterline are resolved."""
    pts = []
    for k in range(n + 1):
        u = 0.5 * (1.0 - math.cos(math.pi * k / n))
        z = -draft * (1.0 - u)
        pts.append((half_beam * (1.0 - (z / draft) ** 2), z))
    return pts


def modified_wigley_section(xi, half_beam, draft=1.0, n=16, alpha=1.0):
    """Nodes (y, z) of the right half of a section of Kashiwagi's modified Wigley form at xi = 2x/L,
    y = (B/2) [(1 - zeta^2)(1 - xi^2)(1 + 0.2 xi^2) + zeta^2 (1 - zeta^8)(1 - xi^2)^4], zeta = z/d
    (Kashiwagi 2022, J. Ship Research 66(1), eq. 42, doi:10.5957/JOSR.04200028); keel to waterline, cosine-spaced.
    `alpha` scales the second term: 1 is Kashiwagi's form and Journee's (1992) Wigley I and II, 0 Journee's III and IV."""
    pts = []
    for k in range(n + 1):
        u = 0.5 * (1.0 - math.cos(math.pi * k / n))
        z = -draft * (1.0 - u)
        c = z / draft
        y = half_beam * ((1 - c * c) * (1 - xi * xi) * (1 + 0.2 * xi * xi)
                         + alpha * c * c * (1 - c ** 8) * (1 - xi * xi) ** 4)
        pts.append((y, z))
    return pts


def _quad_points(p0, p1, nsub):
    out = []
    for m in range(nsub):
        a = (p0[0] + (p1[0] - p0[0]) * m / nsub, p0[1] + (p1[1] - p0[1]) * m / nsub)
        bb = (p0[0] + (p1[0] - p0[0]) * (m + 1) / nsub, p0[1] + (p1[1] - p0[1]) * (m + 1) / nsub)
        h = 0.5 * math.hypot(bb[0] - a[0], bb[1] - a[1])
        for gx, gw in zip(_GX, _GW):
            t = 0.5 * (1.0 + gx)
            out.append((a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, gw * h))
    return out


def _solve(a, rhs):
    """Gaussian elimination with partial pivoting, complex."""
    n = len(rhs)
    m = [row[:] + [rhs[i]] for i, row in enumerate(a)]
    for k in range(n):
        p = max(range(k, n), key=lambda i: abs(m[i][k]))
        m[k], m[p] = m[p], m[k]
        for i in range(k + 1, n):
            f = m[i][k] / m[k][k]
            if f:
                for j in range(k, n + 1):
                    m[i][j] -= f * m[k][j]
    x = [0j] * n
    for i in range(n - 1, -1, -1):
        x[i] = (m[i][n] - sum(m[i][j] * x[j] for j in range(i + 1, n))) / m[i][i]
    return x


def section_heave(nodes, nu):
    """Frank close-fit heave radiation of a symmetric section for unit heave velocity.

    nodes: right-half contour (y, z), keel (y = 0) to waterline (z = 0), z up.
    Returns (Phi, A): Phi = int phi n_z ds over the whole wetted contour (complex), and the amplitude A of
    the far-field wave phi ~ A e^{nu z} e^{-i nu |y|}. With time dependence e^{i omega t}:
    added mass a33 = -rho Re(Phi), damping b33 = rho omega Im(Phi), and energy balance b33 = rho omega |A|^2.
    """
    pan = []
    for p0, p1 in zip(nodes[:-1], nodes[1:]):
        ds = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ny, nz = (p1[1] - p0[1]) / ds, -(p1[0] - p0[0]) / ds      # outward (into the fluid)
        mid = (0.5 * (p0[0] + p1[0]), 0.5 * (p0[1] + p1[1]))
        pan.append((p0, p1, ds, ny, nz, mid))
    n = len(pan)
    quad = []
    for p0, p1, ds, *_ in pan:
        quad.append((_quad_points(p0, p1, 1), _quad_points(p0, p1, 4)))
    amat = [[0j] * n for _ in range(n)]
    pmat = [[0j] * n for _ in range(n)]
    for i, (_, _, dsi, nyi, nzi, (yi, zi)) in enumerate(pan):
        for j, (p0, p1, dsj, *_r) in enumerate(pan):
            near = math.hypot(yi - 0.5 * (p0[0] + p1[0]), zi - 0.5 * (p0[1] + p1[1])) < 2.0 * max(dsi, dsj)
            qp = quad[j][1] if near else quad[j][0]
            dn = 0j
            ph = 0j
            for (qy, qz, qw) in qp:
                for sy in (qy, -qy):                     # the panel and its mirror image
                    self_ = (i == j and sy == qy)
                    gy, gz = grad_green(yi, zi, sy, qz, nu, skip_log=self_)
                    dn += qw * (gy * nyi + gz * nzi)
                    if self_:
                        ph += qw * (wave_part(yi, zi, sy, qz, nu) - math.log(math.hypot(yi - sy, zi + qz)))
                    else:
                        ph += qw * green(yi, zi, sy, qz, nu)
            if i == j:
                dn += math.pi
                h = 0.5 * dsj
                ph += 2.0 * h * (math.log(h) - 1.0)      # int ln|s| over the panel, analytic
            amat[i][j] = dn
            pmat[i][j] = ph
    sig = _solve(amat, [complex(p[4]) for p in pan])
    phi = [sum(pmat[i][j] * sig[j] for j in range(n)) for i in range(n)]
    big_phi = 2.0 * sum(phi[i] * pan[i][4] * pan[i][2] for i in range(n))
    amp = 0j
    for j in range(n):
        for (qy, qz, qw) in quad[j][0]:
            amp += sig[j] * qw * 4j * math.pi * math.exp(nu * qz) * math.cos(nu * qy)
    return big_phi, amp


# --------------------------------------------------------------------------- sectional table

NU_T = [0.005 * (30.0 / 0.005) ** (i / 89.0) for i in range(90)]   # nu T, 0.005 to 30, log-spaced


def section_row(args):
    """(a*, b* near field, b* far field) along nu_t for one half-beam ratio; a picklable worker."""
    r, n_panels, nu_t = args
    if isinstance(r, tuple):                 # ("mw", xi, B / (2 d)[, alpha]): a modified-Wigley section, draft 1
        nodes = modified_wigley_section(r[1], r[2], 1.0, n_panels, r[3] if len(r) > 3 else 1.0)
        if max(p[0] for p in nodes) <= 1e-9:
            return [0.0] * len(nu_t), [0.0] * len(nu_t), [0.0] * len(nu_t)
    elif r <= 0.0:
        return [0.0] * len(nu_t), [0.0] * len(nu_t), [0.0] * len(nu_t)
    else:
        nodes = wigley_section(r, 1.0, n_panels)
    av, bn, bf = [], [], []
    for nt in nu_t:
        phi, amp = section_heave(nodes, nt)
        av.append(-phi.real)
        bn.append(phi.imag)
        bf.append(abs(amp) ** 2)
    return av, bn, bf


class SectionTable:
    """a33 / (rho T^2) and b33 / (rho omega T^2) of Wigley sections of draft T, per half-beam ratio and nu T.

    Points where the near-field damping and the far-field energy flux disagree by more than `tol` (relative,
    or 0.002 absolute when the damping itself is tiny) lie on or near an irregular frequency of the source
    method (John 1950, doi:10.1002/cpa.3160030106; Frank 1967); they are replaced by linear interpolation in log(nu T) between the nearest
    clean neighbours, and counted in `n_irregular`.
    """

    def __init__(self, ratios, n_panels=16, tol=0.03, nu_t=NU_T, processes=None):
        self.ratios, self.nu_t = list(ratios), list(nu_t)
        self.a, self.b, self.n_irregular, self.n_points, self.max_mismatch = {}, {}, 0, 0, 0.0
        jobs = [(r, n_panels, self.nu_t) for r in self.ratios]
        if processes == 1:
            rows = [section_row(j) for j in jobs]
        else:
            import multiprocessing
            with multiprocessing.Pool(processes) as pool:
                rows = pool.map(section_row, jobs)
        for r, (av, bn, bf) in zip(self.ratios, rows):
            ok = []
            for near, far in zip(bn, bf):
                mis = abs(near - far)
                good = mis <= max(tol * far, 0.002)
                if good and tol * far > 0.002:          # largest relative mismatch kept
                    self.max_mismatch = max(self.max_mismatch, mis / far)
                ok.append(good)
            for v in (av, bn):
                _patch(v, ok, self.nu_t)
            self.n_irregular += ok.count(False)
            self.n_points += len(ok)
            self.a[r], self.b[r] = av, bn

    def coeffs(self, r, nu_t):
        """(a*, b*) at half-beam ratio r (must be a tabulated ratio) and nu T, interpolated in log nu T."""
        av, bv, g = self.a[r], self.b[r], self.nu_t
        if nu_t <= g[0]:
            return av[0], bv[0]
        if nu_t >= g[-1]:
            return av[-1], 0.0
        x = math.log(nu_t / g[0]) / math.log(g[-1] / g[0]) * (len(g) - 1)
        i = min(int(x), len(g) - 2)
        f = x - i
        return av[i] + f * (av[i + 1] - av[i]), bv[i] + f * (bv[i + 1] - bv[i])


def _patch(v, ok, xs):
    good = [i for i, o in enumerate(ok) if o]
    for i, o in enumerate(ok):
        if o:
            continue
        lo = max([g for g in good if g < i], default=None)
        hi = min([g for g in good if g > i], default=None)
        if lo is None or hi is None:
            v[i] = v[hi if lo is None else lo]
            continue
        f = math.log(xs[i] / xs[lo]) / math.log(xs[hi] / xs[lo])
        v[i] = v[lo] + f * (v[hi] - v[lo])


# --------------------------------------------------------------------------- strip theory


class WigleyStrip:
    """Heave/pitch and Gerritsma-Beukelman added resistance of a Wigley hull in regular head waves."""

    def __init__(self, length, beam, draft, n_stations=30, kyy=0.25, rho=RHO, table=None, n_panels=16, zeta_v=0.0,
                 no_added_mass_coupling=False):
        self.l, self.bm, self.t, self.rho, self.kyy = length, beam, draft, rho, kyy
        self.zeta_v = zeta_v          # equivalent linear viscous damping in heave and pitch, fraction of critical
        # milestone 7zf: drop the heave-pitch cross-coupling added mass (A35 = A53 = 0, bow-down convention) in the
        # motion equations, keeping the cross-coupling damping and restoring; 7ze's rule from the Kashiwagi tank data
        self.no_added_mass_coupling = no_added_mass_coupling
        dx = length / n_stations
        self.dx = dx
        self.x = [-length / 2 + dx * (i + 0.5) for i in range(n_stations)]
        self.hb = [0.5 * beam * (1.0 - (2.0 * x / length) ** 2) for x in self.x]     # waterline half-beam
        self.ratio = [round(h / draft, 12) for h in self.hb]
        self.table = table or SectionTable(sorted(set(self.ratio)), n_panels=n_panels)
        self.vol = 4.0 / 9.0 * length * beam * draft
        self.mass = rho * self.vol
        self.iyy = self.mass * (kyy * length) ** 2
        self.dm = 2.0 * draft / 3.0          # mean section depth: area / waterline beam (area coefficient 2/3)
        self.bv33 = self.bv55 = 0.0
        if zeta_v:
            self.set_viscous(zeta_v)

    def restoring(self):
        """(C33, C55): heave and pitch hydrostatic stiffness from the waterline, rho g int 2 h dx and rho g int 2 h x^2 dx."""
        c33 = sum(self.rho * G * 2.0 * h * self.dx for h in self.hb)
        c55 = sum(self.rho * G * 2.0 * h * x * x * self.dx for h, x in zip(self.hb, self.x))
        return c33, c55

    def natural(self, iters=40):
        """Zero-speed uncoupled heave and pitch natural frequencies with the strip added mass at that frequency.

        Returns ((w3, A33, B33_rad), (w5, A55, B55_rad)); the radiation damping is the strip sum of b33 (x^2 b33).
        """
        c33, c55 = self.restoring()
        out = []
        for c, inertia, wt in ((c33, self.mass, lambda x: 1.0), (c55, self.iyy, lambda x: x * x)):
            w = math.sqrt(c / inertia)
            for _ in range(iters):
                a, b = self.sections(w)
                am = sum(ai * wt(x) * self.dx for ai, x in zip(a, self.x))
                w = math.sqrt(c / (inertia + am))
            a, b = self.sections(w)
            am = sum(ai * wt(x) * self.dx for ai, x in zip(a, self.x))
            bm = sum(bi * wt(x) * self.dx for bi, x in zip(b, self.x))
            out.append((w, am, bm))
        return tuple(out)

    def set_viscous(self, zeta_v, zeta5=None):
        """B_v = 2 zeta sqrt(C (M + A)) per mode, A at the zero-speed natural frequency.

        zeta_v is the heave fraction; zeta5 the pitch fraction (None: the same as heave, as before 7zg)."""
        self.zeta_v = zeta_v
        z5 = zeta_v if zeta5 is None else zeta5
        self.zeta5 = z5
        c33, c55 = self.restoring()
        (_, a33, _), (_, a55, _) = self.natural()
        self.bv33 = 2.0 * zeta_v * math.sqrt(c33 * (self.mass + a33))
        self.bv55 = 2.0 * z5 * math.sqrt(c55 * (self.iyy + a55))

    def sections(self, omega_e):
        nu_t = omega_e * omega_e / G * self.t
        a, b = [], []
        for r in self.ratio:
            ac, bc = self.table.coeffs(r, nu_t)
            a.append(self.rho * self.t ** 2 * ac)
            b.append(self.rho * omega_e * self.t ** 2 * bc)
        return a, b

    def response(self, omega, u, coupling=None, gb=None):
        """Heave and pitch (bow up) per unit wave amplitude and the added resistance per unit amplitude^2, N/m2.

        Head waves zeta = e^{i (omega_e t + k x)}, x forward; returns (z, theta, R_aw / zeta_A^2, omega_e).
        `coupling` (milestone 7ze), if given, is a function omega_e -> (A35, B35, A53, B53), dimensional, in the
        bow-down pitch convention of Salvesen-Tuck-Faltinsen and Kashiwagi; it replaces the strip sums' heave-pitch
        cross-coupling added mass and damping in the motion equations (restoring and everything else unchanged).
        `gb` (milestone 7zr), if given, is a dict of Gerritsma-Beukelman speed-term variants, all defaulting to the
        form above: `motion_sign` and `raw_sign` (-1, 0 or +1) set b' = b33 + sign U da33/dx in the motion equations
        and in the added-resistance integrand separately; `u_theta` False drops the -U theta term from V_z; `prefactor`
        "omega" uses k / (2 omega) in place of k / (2 omega_e).
        """
        gb = gb or {}
        s_m, s_r = gb.get("motion_sign", -1), gb.get("raw_sign", -1)
        k = omega * omega / G
        we = omega + k * u
        a, b = self.sections(we)
        n, dx = len(self.x), self.dx
        # da/dx by central differences (one-sided at the ends; a -> 0 at both Wigley ends)
        ap = []
        for i in range(n):
            lo, hi = max(i - 1, 0), min(i + 1, n - 1)
            ap.append((a[hi] - a[lo]) / (self.x[hi] - self.x[lo]))
        bp = [bb + s_m * u * aa for bb, aa in zip(b, ap)]    # b' = b33 - U da33/dx (s_m = -1, the default)
        bpr = bp if s_r == s_m else [bb + s_r * u * aa for bb, aa in zip(b, ap)]
        ut = u if gb.get("u_theta", True) else 0.0
        c = [self.rho * G * 2.0 * h for h in self.hb]
        smith = math.exp(-k * self.dm)
        h11 = h12 = h21 = h22 = f1 = f2 = 0j
        for i, x in enumerate(self.x):
            zs = smith * cmath.exp(1j * k * x)               # Smith-corrected wave at the section
            fz = a[i] * we * we - 1j * we * bp[i] - c[i]     # sectional force per unit heave
            ft = a[i] * (we * we * x + 2j * u * we) + bp[i] * (u - 1j * we * x) - c[i] * x   # per unit pitch
            f0 = (-a[i] * omega * omega + 1j * omega * bp[i] + c[i]) * zs
            h11 += fz * dx
            h12 += ft * dx
            h21 += x * fz * dx
            h22 += x * ft * dx
            f1 += f0 * dx
            f2 += x * f0 * dx
        if coupling is not None:
            a35, b35, a53, b53 = coupling(we)
            c35 = sum(ci * x * dx for ci, x in zip(c, self.x))
            h12 = -(we * we * a35 - 1j * we * b35) - c35     # bow-down coefficients -> this code's bow-up pitch
            h21 = -(we * we * a53 - 1j * we * b53) - c35
        elif self.no_added_mass_coupling:
            # h12 = we^2 A35 - i we B35 - C35 (any pitch sign): keep the damping and restoring parts, drop A35 and A53
            c35 = sum(ci * x * dx for ci, x in zip(c, self.x))
            h12 = complex(-c35, h12.imag)
            h21 = complex(-c35, h21.imag)
        # -we^2 M z = F,  -we^2 I theta = M_y, with F = f1 + h11 z + h12 theta etc.
        # viscous damping force -B_v dz/dt = -i we B_v z: moves to the left side as + i we B_v
        m11 = -we * we * self.mass - h11 + 1j * we * self.bv33
        m12 = -h12
        m21 = -h21
        m22 = -we * we * self.iyy - h22 + 1j * we * self.bv55
        det = m11 * m22 - m12 * m21
        z = (f1 * m22 - m12 * f2) / det
        th = (m11 * f2 - m21 * f1) / det
        raw = 0.0
        for i, x in enumerate(self.x):
            zs = smith * cmath.exp(1j * k * x)
            vz = 1j * omega * zs - (1j * we * z + 1j * we * x * th - ut * th)    # Ds/Dt
            raw += bpr[i] * abs(vz) ** 2 * dx
        raw *= k / (2.0 * (omega if gb.get("prefactor") == "omega" else we))          # radiated energy only: viscous damping changes R_aw through the motions
        return z, th, raw, we

    def cross_coupling(self, omega_e, u):
        """Strip heave-pitch cross-coupling (A35, B35, A53, B53), dimensional, bow-down pitch convention (7ze).

        From the same sectional sums as `response`: heave force per unit pitch h12 = omega_e^2 A - i omega_e B - C35
        in this code's bow-up convention, and pitch moment per unit heave h21 likewise; the sign of pitch is then
        turned so that the values compare with Salvesen-Tuck-Faltinsen (1970) and Kashiwagi (2022), Fig. 1.
        """
        we = omega_e
        a, b = self.sections(we)
        n, dx = len(self.x), self.dx
        ap = []
        for i in range(n):
            lo, hi = max(i - 1, 0), min(i + 1, n - 1)
            ap.append((a[hi] - a[lo]) / (self.x[hi] - self.x[lo]))
        bp = [bb - u * aa for bb, aa in zip(b, ap)]
        c = [self.rho * G * 2.0 * h for h in self.hb]
        h12 = h21 = 0j
        for i, x in enumerate(self.x):
            fz = a[i] * we * we - 1j * we * bp[i] - c[i]
            ft = a[i] * (we * we * x + 2j * u * we) + bp[i] * (u - 1j * we * x) - c[i] * x
            h12 += ft * dx
            h21 += x * fz * dx
        c35 = sum(ci * x * dx for ci, x in zip(c, self.x))
        a35, b35 = (h12.real + c35) / (we * we), -h12.imag / we
        a53, b53 = (h21.real + c35) / (we * we), -h21.imag / we
        return -a35, -b35, -a53, -b53

    def spectral(self, u, t01, omegas=None, hs=1.0):
        """Mean added resistance (N) in long-crested irregular head seas, ITTC 1978 spectrum, as STAWAVE-2's G-12."""
        from marine_hull import waves as wv
        omegas = omegas or wv.OMEGAS
        ys = [2.0 * self.response(w, u)[2] * wv.ittc_spectrum(w, hs, t01) for w in omegas]
        return wv.trap(ys, omegas)


class ModifiedWigleyStrip(WigleyStrip):
    """WigleyStrip on Kashiwagi's modified Wigley form (eq. 42 of Kashiwagi 2022), the hull of the Kyoto/Osaka
    tank tests (Kashiwagi et al. 2000; added resistance in Kashiwagi 2013). Volume, waterplane and section
    shapes come from the form itself; the Smith depth is volume / waterplane area."""

    alpha = 1.0               # class default, so instances built without __init__ keep Kashiwagi's form

    def __init__(self, length, beam, draft, n_stations=30, kyy=0.248, rho=1000.0, table=None, n_panels=16, zeta_v=0.0,
                 no_added_mass_coupling=False, alpha=1.0):
        self.l, self.bm, self.t, self.rho, self.kyy = length, beam, draft, rho, kyy
        self.alpha = alpha        # milestone 7zk: 1 Kashiwagi / Journee Wigley I and II, 0 Journee Wigley III and IV
        self.zeta_v = zeta_v
        self.no_added_mass_coupling = no_added_mass_coupling
        dx = length / n_stations
        self.dx = dx
        self.x = [-length / 2 + dx * (i + 0.5) for i in range(n_stations)]
        xis = [2.0 * x / length for x in self.x]
        self.hb = [0.5 * beam * (1 - q * q) * (1 + 0.2 * q * q) for q in xis]
        self.ratio = [("mw", round(abs(q), 12), round(0.5 * beam / draft, 12)) + (() if alpha == 1.0 else (alpha,))
                      for q in xis]
        self.table = table or SectionTable(sorted(set(self.ratio)), n_panels=n_panels)
        self.area_wp = sum(2.0 * h * dx for h in self.hb)
        self.vol = sum(self.section_area(q) * dx for q in xis)
        self.mass = rho * self.vol
        self.iyy = self.mass * (kyy * length) ** 2
        self.dm = self.vol / self.area_wp
        self.bv33 = self.bv55 = 0.0
        if zeta_v:
            self.set_viscous(zeta_v)

    def section_area(self, xi, n=400):
        """Immersed area of the section at xi (both sides), Simpson's rule in zeta."""
        b2 = 0.5 * self.bm
        f = lambda c: b2 * ((1 - c * c) * (1 - xi * xi) * (1 + 0.2 * xi * xi)
                            + self.alpha * c * c * (1 - c ** 8) * (1 - xi * xi) ** 4)
        h = 1.0 / n
        s = f(0.0) + f(-1.0) + sum((4 if i % 2 else 2) * f(-i * h) for i in range(1, n))
        return 2.0 * self.t * s * h / 3.0
