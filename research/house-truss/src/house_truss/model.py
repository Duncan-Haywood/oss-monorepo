"""W-type roof truss: geometry, a pin-jointed direct-stiffness solver, NDS member checks, and the
stick-built alternative (rafters plus ceiling joists) it is compared with.

Lengths are inches unless a name ends in _ft. Loads are psf on plan; forces lb; stresses psi.
Joints are pins; chord continuity, plate capacity, heel details and lateral bracing are NOT modelled.
"""
import math
from dataclasses import dataclass

from house_framing.model import CF_C, SPF2, column_stability
from house_spans.model import CASES, CF_B, CR, DEPTH, Member, board_feet_per_sf, size_member, worst

T = 1.5
# Tension parallel to grain, SPF No. 2, 2 to 4 in thick. NOT checked against a copy of the NDS Supplement.
FT = 450.0
NOMINAL = {"2x4": 4, "2x6": 6, "2x8": 8}


@dataclass(frozen=True)
class Truss:
    span_ft: float = 24.0  # heel to heel, out to out of the bearing points
    pitch: float = 4.0  # rise per 12 of run
    spacing_in: float = 24.0
    top: str = "2x4"
    bottom: str = "2x4"
    web: str = "2x4"
    overhang_ft: float = 0.0


def geometry(t):
    """Nodes (x, y) and members (i, j, kind). Seven nodes, eleven members, three reactions: determinate."""
    S = t.span_ft * 12.0
    rise = S / 2 * t.pitch / 12.0
    y = lambda x: rise * (1 - abs(2 * x / S - 1))  # height of the top chord at x
    nodes = [(0, 0), (S / 4, y(S / 4)), (S / 2, rise), (3 * S / 4, y(3 * S / 4)), (S, 0), (S / 3, 0), (2 * S / 3, 0)]
    members = [(0, 1, "top"), (1, 2, "top"), (2, 3, "top"), (3, 4, "top"),
               (0, 5, "bottom"), (5, 6, "bottom"), (6, 4, "bottom"),
               (1, 5, "web"), (2, 5, "web"), (2, 6, "web"), (3, 6, "web")]
    return nodes, members


def _solve(a, b):
    """Gaussian elimination with partial pivoting (no numpy: the package has no dependencies)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(c + 1, n):
            f = m[r][c] / m[c][c]
            for k in range(c, n + 1):
                m[r][k] -= f * m[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (m[r][n] - sum(m[r][k] * x[k] for k in range(r + 1, n))) / m[r][r]
    return x


def solve(nodes, members, area, E, loads):
    """Direct stiffness. area[k] in in^2, loads {node: (fx, fy)} in lb. Node 0 is pinned, node 4 a roller.

    Returns (axial forces, tension positive; node displacements as (ux, uy) in inches).
    """
    n = len(nodes)
    K = [[0.0] * (2 * n) for _ in range(2 * n)]
    geo = []
    for k, (i, j, _) in enumerate(members):
        dx, dy = nodes[j][0] - nodes[i][0], nodes[j][1] - nodes[i][1]
        L = math.hypot(dx, dy)
        c, s = dx / L, dy / L
        geo.append((L, c, s))
        kk = E * area[k] / L
        idx = (2 * i, 2 * i + 1, 2 * j, 2 * j + 1)
        v = (c, s, -c, -s)
        for a in range(4):
            for b in range(4):
                K[idx[a]][idx[b]] += kk * v[a] * v[b]
    fixed = {0, 1, 2 * 4 + 1}  # x and y at node 0, y at node 4
    free = [d for d in range(2 * n) if d not in fixed]
    F = [0.0] * (2 * n)
    for node, (fx, fy) in loads.items():
        F[2 * node] += fx
        F[2 * node + 1] += fy
    u = [0.0] * (2 * n)
    sol = _solve([[K[r][c] for c in free] for r in free], [F[r] for r in free])
    for d, val in zip(free, sol):
        u[d] = val
    forces = []
    for k, (i, j, _) in enumerate(members):
        L, c, s = geo[k]
        forces.append(E * area[k] / L * (c * (u[2 * j] - u[2 * i]) + s * (u[2 * j + 1] - u[2 * i + 1])))
    return forces, [(u[2 * i], u[2 * i + 1]) for i in range(n)]


# Load combinations: (name, top psf, bottom psf, load-duration factor CD, deflection limit L/x)
# Top loads act on the plan area (dead 15 psf includes roofing, sheathing and truss weight, as in
# house-spans' roof cases); the ceiling carries 5 psf dead. Snow and attic live do not act together.
def combos(snow_psf):
    return (
        ("D+snow", 15.0 + snow_psf, 5.0, 1.15, 240),
        ("D+ceiling live", 15.0, 5.0 + 10.0, 1.0, 240),
    )


def _node_loads(t, top_psf, bot_psf):
    """Panel-point loads (lb, downward) from loads on plan over the truss spacing."""
    S, sp = t.span_ft * 12.0, t.spacing_in / 12.0  # sp in ft
    nodes, _ = geometry(t)
    loads = {}
    # top chord: nodes at x = 0, S/4, S/2, 3S/4, S share the plan width by tributary length
    for node, x in ((0, 0), (1, S / 4), (2, S / 2), (3, 3 * S / 4), (4, S)):
        trib = S / 8 if node in (0, 4) else S / 4
        loads[node] = [0.0, -top_psf * sp * trib / 12.0]
    for node in (5, 6):  # bottom chord nodes at S/3, 2S/3
        loads[node] = [0.0, -bot_psf * sp * (S / 3) / 12.0]
    loads[0][1] -= bot_psf * sp * (S / 6) / 12.0
    loads[4][1] -= bot_psf * sp * (S / 6) / 12.0
    return {k: tuple(v) for k, v in loads.items()}


def _size_of(t, kind):
    return {"top": t.top, "bottom": t.bottom, "web": t.web}[kind]


def checks(t, snow_psf=30.0):
    """Worst demand/capacity ratio per check over all load combinations (1.0 = at capacity).

    Keys: top chord combined axial compression and bending (NDS 3.9.2), bottom chord tension plus
    bending (3.9.1), web tension and compression (weak-axis buckling, unbraced), and vertical
    deflection at the bottom chord against L/240. Returns (ratios, detail).
    """
    nodes, members = geometry(t)
    area = [T * DEPTH[_size_of(t, k)] for _, _, k in members]
    out = {"top chord": 0.0, "bottom chord": 0.0, "web": 0.0, "deflection": 0.0}
    detail = {}
    S = t.span_ft * 12.0
    cos = 1.0 / math.sqrt(1.0 + (t.pitch / 12.0) ** 2)
    for name, top_psf, bot_psf, CD, lim in combos(snow_psf):
        forces, disp = solve(nodes, members, area, SPF2["E"], _node_loads(t, top_psf, bot_psf))
        detail[name] = forces
        out["deflection"] = max(out["deflection"], max(-disp[i][1] for i in (5, 6)) / (S / lim))
        for k, ((i, j, kind), P) in enumerate(zip(members, forces)):
            size = _size_of(t, kind)
            d = DEPTH[size]
            A, Sx = T * d, T * d * d / 6
            L = math.hypot(nodes[j][0] - nodes[i][0], nodes[j][1] - nodes[i][1])
            if kind == "web":
                r = _axial(P, A, size, CD, L, T)  # bends only about the weak axis: slenderness uses 1.5 in
                out["web"] = max(out["web"], r)
            elif kind == "top":
                # transverse load on the chord between panel points, simple span (conservative)
                w = top_psf * t.spacing_in / 12.0 * cos * cos / 12.0  # lb/in perpendicular to the chord
                fb = w * L * L / 8.0 / Sx
                Fb1 = SPF2["Fb"] * CD * CF_B[size] * CR
                r = _combined_compression(-P, A, size, CD, L, d, fb, Fb1)
                out["top chord"] = max(out["top chord"], r)
            else:
                w = bot_psf * t.spacing_in / 12.0 / 12.0
                fb = w * L * L / 8.0 / Sx
                Fb1 = SPF2["Fb"] * CD * CF_B[size] * CR
                Ft1 = FT * CD * CF_B[size]
                r = max(P, 0.0) / A / Ft1 + fb / Fb1 if P >= 0 else _combined_compression(-P, A, size, CD, L, d, fb, Fb1)
                out["bottom chord"] = max(out["bottom chord"], r)
    return out, detail


def _axial(P, A, size, CD, L, d_buck):
    if P >= 0:
        return P / A / (FT * CD * CF_B[size])
    Fc_star = SPF2["Fc"] * CD * CF_C[size]
    Cp, FcE = column_stability(Fc_star, SPF2["Emin"], L, d_buck)
    fc = -P / A
    return math.inf if fc >= FcE else fc / (Fc_star * Cp)


def _combined_compression(Pc, A, size, CD, L, d, fb, Fb1):
    """NDS 3.9.2 interaction. The weak axis is taken as braced by sheathing or purlins at the
    panel points, so buckling uses the depth d in the plane of the truss."""
    Fc_star = SPF2["Fc"] * CD * CF_C[size]
    Cp, FcE = column_stability(Fc_star, SPF2["Emin"], L, d)
    fc = Pc / A
    if fc >= FcE:
        return math.inf
    return (fc / (Fc_star * Cp)) ** 2 + fb / (Fb1 * (1 - fc / FcE))


def passes(t, snow_psf=30.0):
    r, _ = checks(t, snow_psf)
    return max(r.values()) <= 1.0


def board_feet(t):
    """Nominal-size lumber in one truss, board feet (no waste, no plates)."""
    nodes, members = geometry(t)
    bf = 0.0
    for i, j, kind in members:
        L_ft = math.hypot(nodes[j][0] - nodes[i][0], nodes[j][1] - nodes[i][1]) / 12.0
        bf += 2 * NOMINAL[_size_of(t, kind)] / 12.0 * L_ft
    return bf


def lightest(span_ft, pitch=4.0, spacing_in=24.0, sizes=("2x4", "2x6", "2x8"), snow_psf=30.0):
    """The passing truss with the least lumber, searching top, bottom and web sizes. None if none passes."""
    best = None
    for top in sizes:
        for bottom in sizes:
            for web in sizes[:2]:
                t = Truss(span_ft, pitch, spacing_in, top, bottom, web)
                if passes(t, snow_psf):
                    bf = board_feet(t)
                    if best is None or bf < best[1]:
                        best = (t, bf)
    return best


def bf_per_sf(t):
    """Truss lumber per square foot of plan (span x spacing)."""
    return board_feet(t) / (t.span_ft * t.spacing_in / 12.0)


def stick_frame(span_ft, pitch=4.0, rafter_spacing=16.0, joist_spacing=16.0, case="roof-snow30"):
    """Rafters plus ceiling joists for the same span: smallest passing 2x sizes and lumber per sq ft of plan.

    Rafters span half the span horizontally from wall to ridge board (the ceiling joists tie the heels,
    and the thrust and ridge are not checked); joists span the full width with no interior bearing wall.
    """
    cos = 1.0 / math.sqrt(1.0 + (pitch / 12.0) ** 2)
    rafter = size_member(span_ft / 2 + 0.0, CASES[case], "SPF", rafter_spacing, 1, ("2x6", "2x8", "2x10", "2x12"), pitch)
    joist = size_member(span_ft, CASES["ceiling"], "SPF", joist_spacing, 1, ("2x4", "2x6", "2x8", "2x10", "2x12"))
    if rafter is None or joist is None:
        return None
    # house-spans measures rafter span on plan; the slope length (and the lumber) is longer by 1/cos
    bf_r = board_feet_per_sf(Member(rafter[0], 1, "SPF", rafter_spacing)) / cos
    bf_j = board_feet_per_sf(Member(joist[0], 1, "SPF", joist_spacing))
    return {"rafter": rafter[0], "joist": joist[0], "bf_per_sf": bf_r + bf_j}
