"""The heavy cantilever elastica: the exact reference for Peirce's bending-length test.

A strip of bending rigidity B (N m) and weight w (N/m^2) per unit width, clamped horizontally at
s = 0 and free at s = l, sags under its own weight. With theta(s) the angle below the horizontal,
the moment of the overhang beyond s gives B theta' = w int_s^l (x(t) - x(s)) dt, so

    theta'' = -(L - s) cos(theta),   theta(0) = 0,  theta'(L) = 0,

in units of the bending length c = (B / w)^(1/3) (Peirce 1930; the cantilever test of ASTM D1388
and BS 3356 reads c from the overhang length at which the chord from the clamp edge to the tip
falls at 41.5 degrees, taking that overhang as 2c). Solved here by shooting on theta'(0) with RK4,
stdlib only.
"""
import math


def _shoot(p, L, n):
    h = L / n
    th, om, x, z = 0.0, p, 0.0, 0.0

    def f(s, th, om):
        return om, -(L - s) * math.cos(th)

    s = 0.0
    for _ in range(n):
        k1 = f(s, th, om)
        k2 = f(s + h / 2, th + h / 2 * k1[0], om + h / 2 * k1[1])
        k3 = f(s + h / 2, th + h / 2 * k2[0], om + h / 2 * k2[1])
        k4 = f(s + h, th + h * k3[0], om + h * k3[1])
        th_n = th + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        om_n = om + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        # trapezoid on the position (theta is smooth, n is large)
        x += h / 2 * (math.cos(th) + math.cos(th_n))
        z += h / 2 * (math.sin(th) + math.sin(th_n))
        th, om, s = th_n, om_n, s + h
    return om, th, x, z


def cantilever(L, n=4000):
    """Tip of a heavy cantilever of length L bending lengths: dict with the tip drop z/L, the tip's
    horizontal reach x/L, the tip slope (deg) and the chord angle atan(z/x) (deg)."""
    lo, hi = 0.0, L * L / 2 + 1.0          # theta'(0) <= L^2/2 (linear-beam root moment)
    for _ in range(80):
        p = (lo + hi) / 2
        om, th, x, z = _shoot(p, L, n)
        if om > 0:          # still curving at the tip: too much root curvature
            hi = p
        else:
            lo = p
    om, th, x, z = _shoot((lo + hi) / 2, L, n)
    return dict(drop=z / L, reach=x / L, tip_deg=math.degrees(th),
                chord_deg=math.degrees(math.atan2(z, x)), root_curv=(lo + hi) / 2)


def overhang_at_chord(deg=41.5):
    """L (in bending lengths) at which the chord angle equals `deg`."""
    lo, hi = 1.0, 4.0           # chord angle rises from 7 to 77 deg over this range
    for _ in range(60):
        m = (lo + hi) / 2
        if cantilever(m, 2000)["chord_deg"] < deg:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def peirce_c_over_l(deg):
    """Peirce's closed-form approximation c / l = (cos(theta/2) / (8 tan theta))^(1/3)."""
    t = math.radians(deg)
    return (math.cos(t / 2) / (8 * math.tan(t))) ** (1 / 3)


if __name__ == "__main__":
    for L in (1, 2, 3, 4):
        print(L, cantilever(L))
    print("L at 41.5 deg chord:", overhang_at_chord(), "Peirce l/c:", 1 / peirce_c_over_l(41.5))
