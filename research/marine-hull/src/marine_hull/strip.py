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
    if r <= 0.0:
        return [0.0] * len(nu_t), [0.0] * len(nu_t), [0.0] * len(nu_t)
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

    def __init__(self, length, beam, draft, n_stations=30, kyy=0.25, rho=RHO, table=None, n_panels=16):
        self.l, self.bm, self.t, self.rho, self.kyy = length, beam, draft, rho, kyy
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

    def sections(self, omega_e):
        nu_t = omega_e * omega_e / G * self.t
        a, b = [], []
        for r in self.ratio:
            ac, bc = self.table.coeffs(r, nu_t)
            a.append(self.rho * self.t ** 2 * ac)
            b.append(self.rho * omega_e * self.t ** 2 * bc)
        return a, b

    def response(self, omega, u):
        """Heave and pitch (bow up) per unit wave amplitude and the added resistance per unit amplitude^2, N/m2.

        Head waves zeta = e^{i (omega_e t + k x)}, x forward; returns (z, theta, R_aw / zeta_A^2, omega_e).
        """
        k = omega * omega / G
        we = omega + k * u
        a, b = self.sections(we)
        n, dx = len(self.x), self.dx
        # da/dx by central differences (one-sided at the ends; a -> 0 at both Wigley ends)
        ap = []
        for i in range(n):
            lo, hi = max(i - 1, 0), min(i + 1, n - 1)
            ap.append((a[hi] - a[lo]) / (self.x[hi] - self.x[lo]))
        bp = [bb - u * aa for bb, aa in zip(b, ap)]          # b' = b33 - U da33/dx
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
        # -we^2 M z = F,  -we^2 I theta = M_y, with F = f1 + h11 z + h12 theta etc.
        m11 = -we * we * self.mass - h11
        m12 = -h12
        m21 = -h21
        m22 = -we * we * self.iyy - h22
        det = m11 * m22 - m12 * m21
        z = (f1 * m22 - m12 * f2) / det
        th = (m11 * f2 - m21 * f1) / det
        raw = 0.0
        for i, x in enumerate(self.x):
            zs = smith * cmath.exp(1j * k * x)
            vz = 1j * omega * zs - (1j * we * z + 1j * we * x * th - u * th)    # Ds/Dt
            raw += bp[i] * abs(vz) ** 2 * dx
        raw *= k / (2.0 * we)
        return z, th, raw, we

    def spectral(self, u, t01, omegas=None, hs=1.0):
        """Mean added resistance (N) in long-crested irregular head seas, ITTC 1978 spectrum, as STAWAVE-2's G-12."""
        from marine_hull import waves as wv
        omegas = omegas or wv.OMEGAS
        ys = [2.0 * self.response(w, u)[2] * wv.ittc_spectrum(w, hs, t01) for w in omegas]
        return wv.trap(ys, omegas)
