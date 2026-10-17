"""Structural colour of a dielectric thin-film stack on a flat substrate (stylised).

Plane-wave characteristic-matrix (transfer-matrix) reflectance at any incidence angle for s and p
polarisation (the standard optical-thin-film method; e.g. Born & Wolf, Principles of Optics; Macleod,
Thin-Film Optical Filters). Colour is computed under an equal-energy illuminant with an analytic fit of the
CIE 1931 colour-matching functions (Wyman, Sloan & Shirley 2013, JCGT 2(2)). Refractive indices are
constants (no dispersion, no absorption), recalled round values, not sourced data. A fibre is not flat:
curvature, scattering and yarn structure are ignored.
"""
import numpy as np

WL = np.arange(380.0, 781.0, 2.0)  # nm


def _g(x, mu, s1, s2):
    s = np.where(x < mu, s1, s2)
    return np.exp(-0.5 * ((x - mu) / s) ** 2)


def cmf(wl):
    """CIE 1931 2-degree colour-matching functions, multi-lobe Gaussian fit (Wyman et al. 2013)."""
    x = 1.056 * _g(wl, 599.8, 37.9, 31.0) + 0.362 * _g(wl, 442.0, 16.0, 26.7) - 0.065 * _g(wl, 501.1, 20.4, 26.2)
    y = 0.821 * _g(wl, 568.8, 46.9, 40.5) + 0.286 * _g(wl, 530.9, 16.3, 31.1)
    z = 1.217 * _g(wl, 437.0, 11.8, 36.0) + 0.681 * _g(wl, 459.0, 26.0, 13.8)
    return x, y, z


def reflectance(wl, layers, n_sub, theta_deg=0.0, pol="s", n0=1.0):
    """Reflectance R(wl) of `layers` = [(n, thickness_nm), ...] (top first) on a semi-infinite substrate."""
    wl = np.atleast_1d(np.asarray(wl, float))
    th0 = np.deg2rad(theta_deg)
    s0 = n0 * np.sin(th0)

    def eta(n):
        cos = np.sqrt(1 - (s0 / n) ** 2 + 0j)
        return n * cos if pol == "s" else n / cos

    B = np.ones_like(wl, dtype=complex)
    C = np.full_like(wl, eta(n_sub), dtype=complex)
    for n, d in reversed(layers):
        cos = np.sqrt(1 - (s0 / n) ** 2 + 0j)
        delta = 2 * np.pi * n * d * cos / wl
        e = eta(n)
        B, C = np.cos(delta) * B + 1j * np.sin(delta) / e * C, 1j * e * np.sin(delta) * B + np.cos(delta) * C
    e0 = eta(n0)
    r = (e0 * B - C) / (e0 * B + C)
    return np.abs(r) ** 2


def reflectance_unpolarised(wl, layers, n_sub, theta_deg=0.0):
    return 0.5 * (reflectance(wl, layers, n_sub, theta_deg, "s") + reflectance(wl, layers, n_sub, theta_deg, "p"))


def xyz(refl, wl=WL):
    """Tristimulus of reflectance under an equal-energy illuminant, scaled so a perfect white has Y = 1."""
    x, y, z = cmf(wl)
    k = 1.0 / np.sum(y)
    return np.array([k * np.sum(refl * x), k * np.sum(refl * y), k * np.sum(refl * z)])


def lab(refl, wl=WL):
    """CIELAB (a*, b*, C*, hue deg) relative to the equal-energy white of the same colour-matching fit."""
    white = xyz(np.ones_like(wl), wl)
    t = xyz(refl, wl) / white

    def f(u):
        return np.where(u > (6 / 29) ** 3, np.cbrt(u), u / (3 * (6 / 29) ** 2) + 4 / 29)

    fx, fy, fz = f(t[0]), f(t[1]), f(t[2])
    L, a, b = 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)
    return float(L), float(a), float(b), float(np.hypot(a, b)), float(np.degrees(np.arctan2(b, a)) % 360)


def delta_e76(c1, c2):
    return float(np.sqrt(sum((p - q) ** 2 for p, q in zip(c1[:3], c2[:3]))))


def quarter_wave_stack(n_hi, n_lo, pairs, lam0):
    """[hi, lo] * pairs quarter-wave layers at design wavelength lam0 (nm), hi layer on top."""
    out = []
    for _ in range(pairs):
        out += [(n_hi, lam0 / (4 * n_hi)), (n_lo, lam0 / (4 * n_lo))]
    return out


def areal_mass_g_m2(layers, densities):
    """Coating mass per unit area: sum density(kg/m3) * thickness. `densities` aligned with layers."""
    return sum(rho * d * 1e-9 for rho, (_, d) in zip(densities, layers)) * 1e3


def peak_wavelength(refl, wl=WL):
    return float(wl[int(np.argmax(refl))])
