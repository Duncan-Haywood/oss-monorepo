"""Mean added resistance in irregular head waves: ITTC STAWAVE-2 (milestone 7y).

Source: ITTC Recommended Procedures and Guidelines 7.5-04-01-01.1, "Preparation, Conduct and
Analysis of Speed/Power Trials", 2021, revision 06, Annex G.2 (STAWAVE-2, Boom et al. 2013) and
section on the wave spectrum (ITTC 1978 modified Pierson-Moskowitz).

Per unit wave amplitude squared, in regular head waves of circular frequency omega:

    R_wave / zeta_A^2 = 4 rho g B^2 / L * r_aw(omega)           (motion-induced, G-3)
                      + 0.5 rho g B * alpha1(omega)              (reflection, G-9)

    r_aw = omega_bar^b1 exp(b1/d1 (1 - omega_bar^d1)) a1 Fr^1.5 exp(-3.5 Fr)          (G-4)
    omega_bar = sqrt(L/g) kyy^(1/3) / (1.17 Fr^-0.143) * omega                         (G-5)
    a1 = 60.3 CB^1.34; b1 = 11 (omega_bar < 1) else -8.5;
    d1 = 14 (omega_bar < 1) else -566 (L/B)^-2.66                                      (G-6..G-8)
    alpha1 = pi^2 I1^2(1.5 k T) / (pi^2 I1^2(1.5 k T) + K1^2(1.5 k T)) * f1            (G-10)
    f1 = 0.692 (V / sqrt(T g))^0.769 + 1.81 CB^6.95                                    (G-11)

and in irregular seas R_AWL = 2 int R_wave/zeta_A^2 S(omega) d omega (G-12) with
S(omega) = A / omega^5 exp(-B / omega^4), A = 173 Hs^2 / T01^4, B = 691 / T01^4.

The procedure's stated range is L 50-400 m, L/B 4-9, B/T 2.2-9, Fr 0.10-0.30 and waves within
+/-45 deg of the bow; the small hulls of this programme lie outside it, so results are extrapolations.
Bessel functions: Abramowitz & Stegun (1964) 9.8.3, 9.8.4, 9.8.7, 9.8.8 (|error| < 1e-7 relative order).
"""
import math

G = 9.81
RHO = 1025.0


def _i1_poly(x):
    """(I1(x), scale) with I1 = value * exp(scale): A&S 9.8.3 / 9.8.4."""
    ax = abs(x)
    if ax <= 3.75:
        t = (x / 3.75) ** 2
        v = ax * (0.5 + t * (0.87890594 + t * (0.51498869 + t * (0.15084934 + t * (
            0.02658733 + t * (0.00301532 + t * 0.00032411))))))
        return v, 0.0
    t = 3.75 / ax
    v = (0.39894228 + t * (-0.03988024 + t * (-0.00362018 + t * (0.00163801 + t * (
        -0.01031555 + t * (0.02282967 + t * (-0.02895312 + t * (0.01787654 - t * 0.00420059))))))))
    return v / math.sqrt(ax), ax


def bessel_i1(x):
    v, s = _i1_poly(x)
    return v * math.exp(s)


def _k1_poly(x):
    """(K1(x), scale) with K1 = value * exp(scale): A&S 9.8.7 / 9.8.8, x > 0."""
    if x <= 2.0:
        y = (x / 2.0) ** 2
        v = (x * math.log(x / 2.0) * bessel_i1(x) + 1.0 + y * (0.15443144 + y * (-0.67278579 + y * (
            -0.18156897 + y * (-0.01919402 + y * (-0.00110404 - y * 0.00004686)))))) / x
        return v, 0.0
    t = 2.0 / x
    v = (1.25331414 + t * (0.23498619 + t * (-0.03655620 + t * (0.01504268 + t * (
        -0.00780353 + t * (0.00325614 - t * 0.00068245)))))) / math.sqrt(x)
    return v, -x


def bessel_k1(x):
    v, s = _k1_poly(x)
    return v * math.exp(s)


def reflection_ratio(x):
    """pi^2 I1^2 / (pi^2 I1^2 + K1^2) at x, computed without overflow."""
    iv, isc = _i1_poly(x)
    kv, ksc = _k1_poly(x)
    r = (kv / (math.pi * iv)) ** 2 * math.exp(2.0 * (ksc - isc))
    return 1.0 / (1.0 + r)


def froude(u, length):
    return u / math.sqrt(G * length)


def raw_motion(omega, u, length, beam, cb, kyy=0.25):
    """r_aw(omega), G-4 to G-8 (dimensionless)."""
    fr = froude(u, length)
    if fr <= 0.0:
        return 0.0
    wb = math.sqrt(length / G) * kyy ** (1.0 / 3.0) / (1.17 * fr ** -0.143) * omega
    if wb < 1.0:
        b1, d1 = 11.0, 14.0
    else:
        b1, d1 = -8.5, -566.0 * (length / beam) ** -2.66
    a1 = 60.3 * cb ** 1.34
    return wb ** b1 * math.exp(b1 / d1 * (1.0 - wb ** d1)) * a1 * fr ** 1.5 * math.exp(-3.5 * fr)


def rao_parts(omega, u, length, beam, draft, cb, kyy=0.25, rho=RHO):
    """(motion, reflection) mean added resistance per zeta_A^2 in regular head waves, N/m2."""
    ml = 4.0 * rho * G * beam ** 2 / length * raw_motion(omega, u, length, beam, cb, kyy)
    k = omega * omega / G
    f1 = 0.692 * (u / math.sqrt(draft * G)) ** 0.769 + 1.81 * cb ** 6.95
    rl = 0.5 * rho * G * beam * reflection_ratio(1.5 * k * draft) * f1
    return ml, rl


def ittc_spectrum(omega, hs, t01):
    a = 173.0 * hs * hs / t01 ** 4
    b = 691.0 / t01 ** 4
    return a / omega ** 5 * math.exp(-b / omega ** 4)


OMEGAS = [0.1 + 0.02 * i for i in range(0, 746)]     # 0.1 to 15 rad/s


def trap(ys, xs):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def spectral_parts(u, t01, length, beam, draft, cb, kyy=0.25, hs=1.0, omegas=OMEGAS):
    """(motion, reflection) mean added resistance in long-crested irregular head seas (G-12), N."""
    s = [ittc_spectrum(w, hs, t01) for w in omegas]
    parts = [rao_parts(w, u, length, beam, draft, cb, kyy) for w in omegas]
    ml = 2.0 * trap([p[0] * x for p, x in zip(parts, s)], omegas)
    rl = 2.0 * trap([p[1] * x for p, x in zip(parts, s)], omegas)
    return ml, rl
