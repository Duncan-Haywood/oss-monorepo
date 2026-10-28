"""SWATH drag (milestone 5, SWATH rung): two submerged lobes on surface-piercing struts.

Wave resistance is Michell thin-ship theory (as michell.py) applied to
  * each lobe, with half-breadth y = (B/2)(1-(2x/L)^2) sqrt(1-(2(z+h)/D)^2), axis depth h, B = D
    (volume pi B D L / 6, the spheroid volume), the z integral of J done by Simpson in phi, z+h = (D/2) sin phi;
  * each strut, as a Wigley wall of chord c, thickness t, draft h - D/2 (waterline to lobe top).
The two contributions are added (lobe-strut interference is not modelled); twin hulls use Havelock's
2(1 + cos(...)) factor at centre distance sep. Thin-ship theory is poor for a lobe of B = D, so the lobe
number is an estimate to be swept (wscale), not a prediction. Viscous: ITTC 1957 line x (1 + k) on the
prolate-spheroid area (exact) and on 2 * (2/3) * c * hs per strut. Strut displacement is neglected.
"""
import math
from marine_hull.hull import cf_ittc57, RHO_SEA, NU_SEA
from marine_hull.michell import G, _simpson, wave_resistance_wigley


def lobe_diameter(volume, length):
    return math.sqrt(6.0 * volume / (math.pi * length))


def spheroid_area(length, diameter):
    """Surface area of a prolate spheroid, semi-axes a = L/2, b = D/2 (sphere limit 4 pi b^2)."""
    a, b = length / 2.0, diameter / 2.0
    if a <= b * (1 + 1e-12):
        return 4.0 * math.pi * b * b
    e = math.sqrt(1.0 - (b / a) ** 2)
    return 2.0 * math.pi * b * b * (1.0 + a / (b * e) * math.asin(e))


def _j_lobe(theta, u, length, diam, depth, nphi=40):
    k0 = G / (u * u)
    sec = 1.0 / math.cos(theta)
    kx, a = k0 * sec, k0 * sec * sec
    hh = kx * length / 2.0
    ix = 2.0 * (math.sin(hh) / kx ** 2 - (length / 2.0) * math.cos(hh) / kx)
    jx = -8.0 / length ** 2 * ix
    c = a * diam / 2.0
    # int sqrt(1-s^2) exp(c s) ds over s=sin(phi), times (D/2) exp(-a h): the exponent stays negative since h > D/2
    f = lambda p: math.cos(p) ** 2 * math.exp(c * math.sin(p) - a * depth)
    jz = diam / 2.0 * _simpson(f, -math.pi / 2, math.pi / 2, nphi)
    return 0.5 * diam * jx * jz


def wave_resistance_lobes(u, length, diam, depth, sep, rho=RHO_SEA, nth=300):
    """Michell wave resistance (N) of two lobes, centres sep apart, axes depth m below the waterline."""
    k0 = G / (u * u)
    sec2_max = 27.6 / (k0 * (depth - diam / 2.0))   # exp(-a (h - D/2)) below ~1e-12
    top = math.pi / 2 * (1 - 1e-9)
    th_max = min(top, math.acos(1.0 / math.sqrt(sec2_max))) if sec2_max > 1.0 else 0.0
    if th_max <= 0.0:
        return 0.0
    def f(th):
        j = _j_lobe(th, u, length, diam, depth)
        return j * j / math.cos(th) ** 3 * 2.0 * (1.0 + math.cos(k0 * math.sin(th) / math.cos(th) ** 2 * sep))
    return 4.0 * rho * G * G / (math.pi * u * u) * _simpson(f, 0.0, th_max, nth)


def swath_parts(u, volume, length, hd, strut_t, chord_ratio, sep_ratio, k, rho=RHO_SEA, nu=NU_SEA,
                with_wave=True):
    """(viscous N, Michell wave N) of a twin-lobe SWATH of displaced volume `volume` (both lobes), lobe length
    `length`, axis depth hd * D, strut thickness strut_t, chord = chord_ratio * length, centre distance
    sep_ratio * length. with_wave=False skips the (slow) wave integrals and returns 0 for them."""
    d = lobe_diameter(volume / 2.0, length)
    depth = hd * d
    hs = depth - d / 2.0
    chord = chord_ratio * length
    sep = sep_ratio * length
    rw = 0.0
    if with_wave:
        rw = wave_resistance_lobes(u, length, d, depth, sep, rho)
        rw += wave_resistance_wigley(u, chord, strut_t, hs, rho=rho, n_hulls=2, sep=sep, nth=300)
    s_lobe = spheroid_area(length, d)
    s_strut = 2.0 * (2.0 / 3.0) * chord * hs
    rv = 2.0 * 0.5 * rho * u * u * (1 + k) * (s_lobe * cf_ittc57(u * length / nu)
                                              + s_strut * cf_ittc57(u * chord / nu))
    return rv, rw


def swath_resistance(u, volume, length, hd, strut_t, chord_ratio, sep_ratio, k, wscale=1.0, **kw):
    """Total resistance (N) and wave share; the wave part is multiplied by wscale."""
    rv, rw = swath_parts(u, volume, length, hd, strut_t, chord_ratio, sep_ratio, k, with_wave=wscale != 0.0, **kw)
    return rv + wscale * rw, wscale * rw / (rv + wscale * rw)
