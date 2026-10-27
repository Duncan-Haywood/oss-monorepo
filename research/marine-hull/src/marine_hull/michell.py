"""Michell thin-ship wave resistance of a Wigley hull, and Havelock's catamaran interference.

Michell (1898): R_w = (4 rho g^2 / (pi U^2)) * int_0^{pi/2} (I^2 + J^2) sec^3(theta) dtheta, with
I + iJ = double integral over the centreplane of (dy/dx) exp(k0 sec^2(theta) z + i k0 sec(theta) x),
k0 = g/U^2, y the half-breadth. For the Wigley hull y = (B/2)(1-(2x/L)^2)(1-(z/T)^2) the integral
separates into an x part and a z part, so each is a 1-D Simpson sum. Stdlib only.
Two hulls a distance s apart multiply the single-hull integrand by 2(1 + cos(k0 sec^2(theta) sin(theta) s)).
Inviscid, thin-ship: it is a wave-making estimate, not a total resistance.
"""
import math

G = 9.80665


def _simpson(f, a, b, n):
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += f(a + i * h) * (4 if i % 2 else 2)
    return s * h / 3.0


def _j_wigley(theta, u, length, beam, draft):
    """J(theta) in closed form (the x and z integrals are elementary); I vanishes by symmetry."""
    k0 = G / (u * u)
    sec = 1.0 / math.cos(theta)
    kx, a = k0 * sec, k0 * sec * sec
    h = kx * length / 2.0
    # int_{-L/2}^{L/2} x sin(kx x) dx
    ix = 2.0 * (math.sin(h) / kx ** 2 - (length / 2.0) * math.cos(h) / kx)
    jx = -8.0 / length ** 2 * ix
    e = math.exp(-a * draft)
    jz = (1.0 - e) / a - (2.0 / a ** 3 - e * (draft ** 2 / a + 2.0 * draft / a ** 2 + 2.0 / a ** 3)) / draft ** 2
    return 0.5 * beam * jx * jz


def _j_numeric(theta, u, length, beam, draft, nx=2000, nz=400):
    """Same J by Simpson sums; used only to test the closed form."""
    k0 = G / (u * u)
    sec = 1.0 / math.cos(theta)
    kx, kz = k0 * sec, k0 * sec * sec
    jx = _simpson(lambda x: (-8.0 * x / length ** 2) * math.sin(kx * x), -length / 2, length / 2, nx)
    jz = _simpson(lambda z: (1.0 - (z / draft) ** 2) * math.exp(kz * z), -draft, 0.0, nz)
    return 0.5 * beam * jx * jz


def wave_resistance_wigley(u, length, beam, draft, rho=1025.0, n_hulls=1, sep=0.0, nth=800):
    """Michell wave resistance (N) of n_hulls Wigley hulls (n_hulls 1 or 2), centre distance sep (m)."""
    k0 = G / (u * u)
    # theta -> pi/2 integrand is killed by exp(-k0 sec^2 T); cap where it is below ~1e-12 of its start
    top = math.pi / 2 * (1 - 1e-9)
    def f(th):
        j = _j_wigley(th, u, length, beam, draft)
        w = j * j / math.cos(th) ** 3
        if n_hulls == 2:
            w *= 2.0 * (1.0 + math.cos(k0 * math.sin(th) / math.cos(th) ** 2 * sep))
        return w
    th_max = math.acos(min(1.0, math.sqrt(k0 * draft / 30.0))) if k0 * draft > 30.0 else top
    th_max = min(th_max, top)
    return 4.0 * rho * G * G / (math.pi * u * u) * _simpson(f, 0.0, th_max, nth)


def wigley_wetted(length, beam, draft, n=200):
    """Wetted area (m2) of the Wigley hull from the exact surface integral, both sides."""
    def col(x):
        a = 1 - (2 * x / length) ** 2
        yx = 0.5 * beam * (-8 * x / length ** 2)
        def g(z):
            q = 1 - (z / draft) ** 2
            yz = 0.5 * beam * a * (-2 * z / draft ** 2)
            return math.sqrt(1 + (yx * q) ** 2 + yz ** 2)
        return _simpson(g, -draft, 0.0, n)
    return 2.0 * _simpson(col, -length / 2, length / 2, n)


def wigley_volume(length, beam, draft):
    return 4.0 / 9.0 * length * beam * draft


def c_wave(u, length, beam, draft, rho=1025.0, **kw):
    """Wave-resistance coefficient R_w / (0.5 rho U^2 S) per hull set, S the wetted area of one hull."""
    return wave_resistance_wigley(u, length, beam, draft, rho, **kw) / (
        0.5 * rho * u * u * wigley_wetted(length, beam, draft))
