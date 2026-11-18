"""Two-piece hanger: a bolted half-lap joint at the hub, so each half prints on a 220 mm bed.

Geometry (mm, the frame of `geom`: x right, y up, hook at the origin, z front to back, 0..depth):

- The joint zone J is the hub disc (radius r). Outside J the hanger is cut at x = 0.
- Half A (the loop half) is everything at x >= 0 outside J, the post and loop whole, and the
  back half of J (z from 0 to depth/2).
- Half B (the plain half) is everything at x < 0 outside J and the front half of J (z from
  depth/2 to depth), with a notch round the post (NOTCH_CLEAR each side) so the post registers it.
- Two bolt holes of diameter BOLT_HOLE pass through J at (+-BOLT_X, BOLT_Y), clear of the post.

Both halves are written so they print flat with the lap on the bed: B is turned over (180 degrees
about the y axis) for printing and turned back for assembly. The solids are built with the
manifold3d boolean kernel (the one recent OpenSCAD uses), so each half is one closed manifold.

`joint_check` is a hand calculation of the joint with the same assumed constants as `strength`.
"""
import math

from . import geom, strength as S

BOLT_D = 4.0          # mm, M4 bolt
BOLT_HOLE = 4.4       # mm, clearance hole
BOLT_X = 17.0         # mm, bolts at x = +-17 ...
BOLT_Y = -10.0        # mm, ... and y = -10, below the post and inside the hub disc
NOTCH_CLEAR = 0.2     # mm, gap between the post and B's notch
SPLIT_DEPTH = 8.0     # mm, so each lap is 4 mm thick
SEG = 96


def _cs(poly, hole=None):
    import manifold3d as m
    loops = [poly] + ([hole] if hole else [])
    return m.CrossSection(loops, m.FillRule.EvenOdd)


def _prism(poly, depth, hole=None):
    return _cs(poly, hole).extrude(depth)


def _box(x0, x1, y0, y1, z0, z1):
    import manifold3d as m
    return m.Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def halves(d):
    """(A, B) as manifold3d.Manifold in the assembled frame (B not yet turned over)."""
    import manifold3d as m
    D = d.depth
    r = d.r * 10.0
    big = 2000.0
    sh = {s["name"]: s for s in geom.shells(d)}
    arms = _prism(sh["arm_right"]["outline"], D) + _prism(sh["arm_left"]["outline"], D)
    hub = m.Manifold.cylinder(D, r, r, SEG)
    post = _prism(sh["post"]["outline"], D)
    loop = _prism(sh["loop"]["outline"], D, sh["loop"]["hole"])
    # the hole must stay open after the union with the post and hub
    hole = _prism(sh["loop"]["hole"], D + 2.0).translate((0, 0, -1.0))
    body = arms + hub
    right = _box(0, big, -big, big, -1, D + 1)
    left = _box(-big, 0, -big, big, -1, D + 1)
    # The joint cutter is the hub polygon circumscribed and turned half a segment, so its vertices
    # never coincide with the hub's: identical polygons left solids touching along an edge, which
    # the 4-decimal STL merged into a non-manifold edge (rack_w19_A).
    rj = r / math.cos(math.pi / SEG)
    jz = m.Manifold.cylinder(D + 2.0, rj, rj, SEG).rotate((0, 0, 180.0 / SEG)).translate((0, 0, -1.0))
    back = _box(-big, big, -big, big, 0, D / 2.0)
    front = _box(-big, big, -big, big, D / 2.0, D)
    notch = _box(-geom.POST_W / 2 - NOTCH_CLEAR, geom.POST_W / 2 + NOTCH_CLEAR, -NOTCH_CLEAR, big, -1, D + 1)
    bolts = None
    for sx in (-1.0, 1.0):
        c = m.Manifold.cylinder(D + 2.0, BOLT_HOLE / 2.0, BOLT_HOLE / 2.0, 32).translate(
            (sx * BOLT_X, BOLT_Y, -1.0))
        bolts = c if bolts is None else bolts + c
    a = ((body ^ right) - jz) + (body ^ jz ^ back) + post + loop
    a = a - hole - bolts
    b = ((body ^ left) - jz) + (body ^ jz ^ front)
    b = b - notch - loop - hole - bolts
    return a, b


def for_print(b, depth):
    """Turn B over about the y axis so its lap lies on the bed (z from 0)."""
    return b.rotate((0.0, 180.0, 0.0)).translate((0.0, 0.0, depth))


def to_mesh(man):
    """(verts, faces) as Python lists, for `mesh.stl` and the stdlib checks."""
    mm = man.to_mesh()
    v = [tuple(float(c) for c in row[:3]) for row in mm.vert_properties]
    f = [tuple(int(i) for i in t) for t in mm.tri_verts]
    return v, f


def min_square(points, step=1):
    """(side, angle): the smallest square bed side over turns about z in `step`-degree steps."""
    best = None
    for a in range(0, 90, step):
        c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
        xs = [c * x - s_ * y for x, y, *_ in points]
        ys = [s_ * x + c * y for x, y, *_ in points]
        side = max(max(xs) - min(xs), max(ys) - min(ys))
        if best is None or side < best[0]:
            best = (side, a)
    return best


def joint_check(d, mass_kg=S.MASS_KG):
    """Hand calculation of the half-lap joint, B's load passing to A through the two bolts.

    B's arm carries F = half the garment weight times the dynamic factor at its tip. About the
    bolt group's centre (0, BOLT_Y) that is a moment M = F * lever, which the two bolts, 2 * BOLT_X
    apart, resist as a couple of vertical forces M / (2 BOLT_X), plus F / 2 each of direct shear.
    Checks: bolt bearing on a 4 mm PLA lap; the lap's net section at the outer bolt (B alone,
    half depth, the hub chord less the hole, with the stress concentration); B's section at x = 0
    where the post notch leaves it only the lower half of the chord; and the bolt's shear stress. Friction from the bolt preload is ignored, which is conservative."""
    F = S.arm_load_N(mass_kg)
    lever = S.lever_mm(d)                       # tip to the hook axis, horizontally
    M = F * lever
    per_bolt = math.hypot(M / (2.0 * BOLT_X), F / 2.0)
    t = d.depth / 2.0
    bearing = per_bolt / (BOLT_D * t)
    r = d.r * 10.0
    chord = 2.0 * math.sqrt(max(r * r - BOLT_X * BOLT_X, 0.0))
    net = chord - BOLT_HOLE
    m_sec = F * (lever - BOLT_X)
    sec = S.KT * m_sec / (t * net * net / 6.0)
    shear = per_bolt / (math.pi * BOLT_D ** 2 / 4.0)
    # Between the bolts B still carries M less the outer bolt's couple force times BOLT_X; at
    # x = 0 its lap is notched by the post, leaving y from -r to -NOTCH_CLEAR at half depth.
    m_notch = M - (M / (2.0 * BOLT_X)) * BOLT_X
    h_notch = r - NOTCH_CLEAR
    notch = S.KT * m_notch / (t * h_notch * h_notch / 6.0)
    return {
        "F_N": F, "M_Nmm": M, "bolt_force_N": per_bolt,
        "bearing_MPa": bearing, "bearing_sf": S.SIGMA_MPA / bearing,
        "lap_section_MPa": sec, "lap_sf": S.SIGMA_MPA / sec,
        "notch_section_MPa": notch, "notch_sf": S.SIGMA_MPA / notch,
        "bolt_shear_MPa": shear,
    }
