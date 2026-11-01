"""Holtrop and Mennen (1982) bare-hull resistance, written for milestone 3 (H3) of marine-hull.

Components kept: frictional resistance times (1 + k1), wave resistance (Fn < 0.4 branch and the
blend to Fn = 0.55), model-ship correlation allowance. Bulb, transom immersion and appendages
are left out (set to zero), which is right for a bare Wigley hull and is stated, not hidden.

Coefficients are those of Holtrop and Mennen, Int. Shipbuilding Progress 29(335), 1982. The
paper was not opened in this session (host unreachable); the constants were typed from memory
and checked line by line against an MIT-licensed public implementation
(github.com/Albert-Gil/ship-propulsion-power-simulator, read, not copied). That is an
agreement of two transcriptions, not a check against the paper: see experiments/results_holtrop.txt.
Validity range stated by the authors: roughly L/B 3.9 to 14.9, Cp 0.55 to 0.85, Fn up to 0.45
for full forms; ships of tens to hundreds of metres. Small-boat use is exactly what H3 tests.
"""
import math

from .hull import G, cf_ittc57


def hm_resistance(v, length, beam, draft, volume, cm, cwp, lcb_pct=0.0, c_stern=0.0, rho=1025.0, nu=1.1892e-6,
                  s=None, wave_scale=1.0):
    """Return a dict of components in newtons for one speed (m/s).

    `s` overrides the wetted area (the HM regression is used if None). lcb_pct is the longitudinal
    centre of buoyancy forward of midships as a percentage of L. Bulb, transom, appendages = 0.
    """
    cb = volume / (length * beam * draft)
    cp = cb / cm
    if s is None:
        s = length * (2 * draft + beam) * math.sqrt(cm) * (
            0.453 + 0.4425 * cb - 0.2862 * cm - 0.003467 * beam / draft + 0.3696 * cwp)
    re = v * length / nu
    fn = v / math.sqrt(G * length)
    lr = length * (1 - cp + 0.06 * cp * lcb_pct / (4 * cp - 1))
    q = 0.5 * rho * v * v
    rf = q * s * cf_ittc57(re)
    k1p1 = (0.93 + 0.487118 * (1 + 0.011 * c_stern) * (beam / length) ** 1.06806 * (draft / length) ** 0.46106
            * (length / lr) ** 0.121563 * (length ** 3 / volume) ** 0.36486 * (1 - cp) ** -0.604247)
    # half angle of entrance
    ie = 1 + 89 * math.exp(-((length / beam) ** 0.80856) * (1 - cwp) ** 0.30484 * (1 - cp - 0.0225 * lcb_pct) ** 0.6367
                           * (lr / beam) ** 0.34574 * (100 * volume / length ** 3) ** 0.16302)
    bl = beam / length
    c7 = 0.229577 * bl ** (1 / 3) if bl <= 0.11 else (bl if bl <= 0.25 else 0.5 - 0.0625 / bl)
    c1 = 2223105 * c7 ** 3.78613 * (draft / beam) ** 1.07961 * (90 - ie) ** -1.37565
    c2 = 1.0   # no bulb
    c5 = 1.0   # no transom
    lam = 1.446 * cp - (0.03 * length / beam if length / beam >= 12 else 0.36)
    c16 = 8.07981 * cp - 13.8673 * cp ** 2 + 6.984388 * cp ** 3 if cp <= 0.8 else 1.73014 - 0.7067 * cp
    m1 = 0.0140407 * length / draft - 1.75254 * volume ** (1 / 3) / length - 4.79323 * beam / length - c16
    m4 = -1.69385 * 0.4 * math.exp(-0.034 / fn ** 3.29)
    w = volume * rho * G
    rw04 = c1 * c2 * c5 * w * math.exp(m1 * fn ** -0.9 + m4 * math.cos(lam / fn ** 2))
    if fn >= 0.4:
        c17 = 6919.3 * cm ** -1.3346 * (volume / length ** 3) ** 2.00977 * (length / beam - 2) ** 1.40692
        m3 = -7.2035 * bl ** 0.326869 * (draft / beam) ** 0.605375
        rw055 = c17 * c2 * c5 * w * math.exp(m3 * fn ** -0.9 + m4 * math.cos(lam / fn ** 2))
        rw = rw055 if fn > 0.55 else rw04 + (10 * fn - 4) * (rw055 - rw04) / 1.5
    else:
        rw = rw04
    rw *= wave_scale
    c4 = min(draft / length, 0.04)
    ca = 0.006 * (length + 100) ** -0.16 - 0.00205 + 0.003 * math.sqrt(length / 7.5) * cb ** 4 * c2 * (0.04 - c4)
    ra = q * s * ca
    return {"S": s, "Fn": fn, "Re": re, "1+k1": k1p1, "RF": rf, "RW": rw, "RA": ra, "CA": ca,
            "RT": rf * k1p1 + rw + ra, "q": q}
