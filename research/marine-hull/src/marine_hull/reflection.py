"""Short-wave (reflection) added resistance from the waterline shape: Faltinsen et al. (1980) (milestone 7zh).

Faltinsen, Minsaas, Liapis and Skjordal (1980), "Prediction of resistance and propulsion of a ship in a seaway",
Proc. 13th Symposium on Naval Hydrodynamics, Tokyo, give the mean added resistance of a wall-sided hull in short
head waves as

    R / zeta_A^2 = 0.5 rho g (1 + 2 omega0 U / g) int_L1 sin^2(theta) n1 dl

where L1 is the illuminated part of the waterline, theta the angle between the waterline and the x axis, n1 the
x-component of the normal and omega0 the wave (not encounter) frequency. For a waterline y = +-b(x) the integral
is 2 int_{b' < 0} sin^2(theta) |b'| dx over the bow half with sin^2(theta) = b'^2 / (1 + b'^2); a transverse wall
gives the beam B. The finite-draft factor is the Fujii-Takahashi one, alpha_T = pi^2 I1^2(x) / (pi^2 I1^2(x) +
K1^2(x)), the same function that STAWAVE-2 uses in G-10 (`waves.reflection_ratio`); its argument is k T in the
main variant and 1.5 k T (as STAWAVE-2 writes it) as a sensitivity.
"""
from . import waves as wv

G = 9.81


def waterline_integral(slope, length, n=4000):
    """int_L1 sin^2(theta) n1 dl over both sides, from the waterline slope db/dx(x) on x in (0, L/2] (bow at L/2)."""
    s = 0.0
    dx = 0.5 * length / n
    for i in range(n):
        bp = slope((i + 0.5) * dx)
        if bp < 0.0:
            s += bp * bp / (1.0 + bp * bp) * -bp * dx
    return 2.0 * s


def wigley_slope(length, beam):
    """Parabolic Wigley waterline b = B/2 (1 - xi^2), xi = 2 x / L."""
    return lambda x: -4.0 * beam * x / length ** 2


def modified_wigley_slope(length, beam):
    """Kashiwagi's modified Wigley waterline b = B/2 (1 - xi^2)(1 + 0.2 xi^2)."""
    def f(x):
        xi = 2.0 * x / length
        return 0.5 * beam * (-2.0 * xi * (1.0 + 0.2 * xi * xi) + 0.4 * xi * (1.0 - xi * xi)) * 2.0 / length
    return f


def rao(omega, u, integral, draft, rho=wv.RHO, draft_arg=1.0, speed=True):
    """Mean reflection added resistance per zeta_A^2 in regular head waves, N/m2."""
    k = omega * omega / G
    a = wv.reflection_ratio(draft_arg * k * draft)
    f = 1.0 + 2.0 * omega * u / G if speed else 1.0
    return 0.5 * rho * G * integral * a * f


def nmri_cu(bf):
    """NMRI speed coefficient C_U = max(10, 68 - 310 B_f) (Tsujimoto et al. 2008; ISO 15016:2015; ITTC 7.5-04-01-01.1).

    Not opened at source in milestone 7zj (egress proxy refused the hosts): coefficients as those documents are quoted.
    """
    return max(10.0, 68.0 - 310.0 * bf)


def nmri_rao(omega, u, integral, beam, draft, length, rho=wv.RHO, draft_arg=1.5, cu=None, speed=True):
    """NMRI reflection added resistance per zeta_A^2 in regular head waves, N/m2 (milestone 7zj).

    R / zeta^2 = 0.5 rho g B B_f alpha_T (1 + C_U Fn). In head waves B B_f is the same waterline integral as
    Faltinsen's I (int sin^3 of the waterline angle over the illuminated side), so `integral` is passed directly
    and B_f = integral / beam. `cu` overrides C_U (e.g. its floor 10).
    """
    k = omega * omega / G
    a = wv.reflection_ratio(draft_arg * k * draft)
    c = nmri_cu(integral / beam) if cu is None else cu
    f = 1.0 + c * u / (G * length) ** 0.5 if speed else 1.0
    return 0.5 * rho * G * integral * a * f
