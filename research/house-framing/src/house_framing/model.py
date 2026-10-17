"""Light-frame exterior wall takeoff and checks: conventional versus advanced (OVE) framing.

Lengths are in inches unless a name ends in _ft. Loads are lb, psf and plf; stresses psi.
Everything is US practice: dimension lumber, the NDS (ASD) and ASCE 7 load combinations.
"""
from dataclasses import dataclass, replace
import math

T = 1.5  # actual thickness of any 2x member
DEPTH = {"2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25}
NOMINAL_W = {"2x4": 4, "2x6": 6, "2x8": 8, "2x10": 10, "2x12": 12}
HEADER_SIZES = ("2x6", "2x8", "2x10", "2x12")
PLATE_STOCK_IN = 192.0

# Spruce-pine-fir No. 2, NDS Supplement Table 4A base values (psi). Fb, Fv, Fc_perp, Fc and E as
# reprinted by NELMA; Emin from NDS Appendix D: E(1 - 1.645*0.25)*1.03/1.66 = 511,600 -> 510,000.
SPF2 = {"Fb": 875.0, "Fv": 135.0, "Fc_perp": 425.0, "Fc": 1150.0, "E": 1.4e6, "Emin": 510e3}
CF_B = {"2x4": 1.5, "2x6": 1.3, "2x8": 1.2, "2x10": 1.1, "2x12": 1.0}  # size factor, bending
CF_C = {"2x4": 1.15, "2x6": 1.1, "2x8": 1.05, "2x10": 1.0, "2x12": 1.0}  # size factor, compression
CR = 1.15  # repetitive-member factor (studs at <= 24 in, sheathed)

# Thermal (h ft2 F / Btu). Typical handbook values, not measured: softwood about R-1.25 per inch.
R_WOOD_PER_IN = 1.25
R_FOAM_PER_IN = 5.0  # XPS between header plies
R_FILMS_AND_SKINS = 0.68 + 0.45 + 0.62 + 0.17  # inside film, 1/2" gypsum, 7/16" OSB, outside film
R_CAVITY = {"2x4": 13.0, "2x6": 20.0}  # batt rating in the cavity


@dataclass(frozen=True)
class Opening:
    pos_in: float  # left edge of the rough opening, from the start of the wall
    width_in: float
    sill_in: float = 0.0  # rough sill height above the bottom plate; 0 means a door


@dataclass(frozen=True)
class Wall:
    length_in: float
    bearing: bool
    openings: tuple = ()


@dataclass(frozen=True)
class Scheme:
    name: str
    stud: str = "2x6"
    spacing: float = 16.0
    top_plates: int = 2
    corner_extra: int = 2  # studs per corner beyond the two wall-end studs
    tee_extra: int = 2  # studs per partition intersection
    tee_blocks: int = 0  # flat ladder blocks per intersection instead
    jacks_per_side: int = 1  # 0 means header hangers
    header: str = "2x12"  # a size used everywhere, or "sized": smallest 2-ply that passes
    nonbearing_header: bool = True  # False: one flat 2x over openings in non-bearing walls
    insulated_header: bool = False  # plies at the faces, foam between
    align: bool = False  # put each opening's left king stud on the stud layout


CONVENTIONAL_2X4 = Scheme("conventional 2x4 @16", stud="2x4")
CONVENTIONAL_2X6 = Scheme("conventional 2x6 @16")
ADVANCED_2X6 = Scheme("advanced 2x6 @24", spacing=24.0, top_plates=1, corner_extra=0, tee_extra=0,
                      tee_blocks=3, jacks_per_side=0, header="sized", nonbearing_header=False,
                      insulated_header=True, align=True)
# The single measures that turn CONVENTIONAL_2X6 into ADVANCED_2X6, for ablation.
OVE_MEASURES = {
    "24 in spacing": {"spacing": 24.0},
    "single top plate": {"top_plates": 1},
    "2-stud corners": {"corner_extra": 0},
    "ladder tees": {"tee_extra": 0, "tee_blocks": 3},
    "header hangers": {"jacks_per_side": 0},
    "sized headers": {"header": "sized"},
    "no header in non-bearing": {"nonbearing_header": False},
    "insulated headers": {"insulated_header": True},
    "openings on layout": {"align": True},
}


@dataclass(frozen=True)
class Loads:
    width_ft: float = 28.0  # truss span; trusses bear on the two long walls
    overhang_ft: float = 1.0
    dead_psf: float = 15.0  # roof plus ceiling, on plan
    snow_psf: float = 30.0  # roof snow, on plan
    wind_psf: float = 0.0  # strength-level wind pressure on the wall face

    def roof_plf(self):
        trib = self.width_ft / 2 + self.overhang_ft
        return self.dead_psf * trib, self.snow_psf * trib


@dataclass(frozen=True)
class House:
    width_ft: float = 28.0
    length_ft: float = 40.0
    plate_height_in: float = 97.125  # bottom of bottom plate to top of top plate (8 ft wall)
    head_in: float = 81.0  # top of every rough opening above the bottom plate
    tees: int = 6  # partition intersections with the exterior walls
    windows_long: int = 3  # per long wall
    windows_gable: int = 1  # per gable wall
    window_w: float = 36.0
    window_h: float = 48.0
    door_w: float = 38.0
    slider_w: float = 74.0


def stud_length(house, scheme):
    return house.plate_height_in - (1 + scheme.top_plates) * T


def walls_of(house, scheme):
    """Two bearing long walls (front door, rear slider) and two non-bearing gable walls."""
    d = DEPTH[scheme.stud]
    sill = house.head_in - house.window_h

    def place(length, widths_sills):
        n = len(widths_sills)
        ops = []
        for k, (w, s) in enumerate(widths_sills):
            centre = length * (k + 0.5) / n
            ops.append(Opening(centre - w / 2, w, s))
        return tuple(ops)

    L, W = house.length_ft * 12, house.width_ft * 12 - 2 * d
    win = [(house.window_w, sill)]
    front = win * (house.windows_long // 2) + [(house.door_w, 0.0)] + win * (house.windows_long - house.windows_long // 2)
    rear = win * (house.windows_long // 2) + [(house.slider_w, 0.0)] + win * (house.windows_long - house.windows_long // 2)
    gable = win * house.windows_gable
    return [Wall(L, True, place(L, front)), Wall(L, True, place(L, rear)),
            Wall(W, False, place(W, gable)), Wall(W, False, place(W, gable))]


def _aligned(op, scheme):
    """Shift an opening so its left king stud sits on a layout stud (nearest layout position)."""
    nj = scheme.jacks_per_side
    king = op.pos_in - (nj + 1) * T
    k = max(1, round(king / scheme.spacing))
    return replace(op, pos_in=k * scheme.spacing + (nj + 1) * T)


# --- structural checks (NDS ASD) -------------------------------------------------------------

def column_stability(Fc_star, Emin, le, d, c=0.8):
    """NDS 3.7.1 column stability factor Cp (sawn lumber, c = 0.8)."""
    FcE = 0.822 * Emin / (le / d) ** 2
    a = FcE / Fc_star
    b = (1 + a) / (2 * c)
    return b - math.sqrt(b * b - a / c), FcE


def stud_check(stud, spacing, length_in, loads):
    """Worst ratio over D+S, D+0.75(0.6W)+0.75S and D+0.6W for one stud (1.0 = at capacity).

    Strong-axis buckling only (sheathing braces the weak axis); bending from wind on the face.
    """
    d = DEPTH[stud]
    A, S = T * d, T * d * d / 6
    wD, wS = loads.roof_plf()
    p = loads.wind_psf
    worst = 0.0
    for kD, kS, kW, CD in ((1, 1, 0, 1.15), (1, 0.75, 0.75 * 0.6, 1.6), (1, 0, 0.6, 1.6)):
        P = (kD * wD + kS * wS) * spacing / 12
        fc = P / A
        Fc_star = SPF2["Fc"] * CD * CF_C[stud]
        Cp, FcE = column_stability(Fc_star, SPF2["Emin"], length_in, d)
        Fc1 = Fc_star * Cp
        w_lat = kW * p * spacing / 144  # lb per inch of stud
        fb = w_lat * length_in ** 2 / 8 / S
        Fb1 = SPF2["Fb"] * CD * CF_B[stud] * CR
        if fc >= FcE:
            return math.inf
        ratio = (fc / Fc1) ** 2 + fb / (Fb1 * (1 - fc / FcE))
        bearing = P / (T * d) / SPF2["Fc_perp"]
        worst = max(worst, ratio, bearing)
    return worst


def header_check(size, span_in, w_plf, plies=2, jacks_per_side=1, stud="2x6"):
    """Worst ratio of bending, shear, total-load deflection (L/240) and bearing for a built-up header."""
    d = DEPTH[size]
    b = plies * T
    w = w_plf / 12  # lb/in
    M, V = w * span_in ** 2 / 8, w * span_in / 2
    CD = 1.15
    fb = M / (b * d * d / 6)
    fv = 1.5 * V / (b * d)
    defl = 5 * w * span_in ** 4 / (384 * SPF2["E"] * b * d ** 3 / 12)
    ratios = [fb / (SPF2["Fb"] * CD * CF_B[size]), fv / (SPF2["Fv"] * CD), defl / (span_in / 240)]
    if jacks_per_side:
        # The header bears on the jack only across its own width (plies * T); the rest of the
        # stud depth carries nothing unless a filler ply is added.
        ratios.append(V / (jacks_per_side * T * min(b, DEPTH[stud]) * SPF2["Fc_perp"]))
    return max(ratios)


def size_header(span_in, w_plf, scheme, jacks_per_side=None):
    j = scheme.jacks_per_side if jacks_per_side is None else jacks_per_side
    for s in HEADER_SIZES:
        if header_check(s, span_in, w_plf, jacks_per_side=j, stud=scheme.stud) <= 1.0:
            return s
    return None


# --- takeoff -----------------------------------------------------------------------------------

def frame_wall(wall, house, scheme, loads):
    """Members of one wall as a list of (kind, size, length_in, elevation_area_in2)."""
    sl = stud_length(house, scheme)
    d = DEPTH[scheme.stud]
    nj = scheme.jacks_per_side
    n = math.ceil(wall.length_in / PLATE_STOCK_IN)  # each course is cut from 16 ft stock
    out = [("plate", scheme.stud, wall.length_in / n, T * wall.length_in / n)] * (n * (1 + scheme.top_plates))
    layout = [x * scheme.spacing for x in range(int((wall.length_in - T) // scheme.spacing) + 1)]
    if wall.length_in - T - layout[-1] > 1e-6:
        layout.append(wall.length_in - T)
    keep = [True] * len(layout)
    wD, wS = loads.roof_plf()
    for op in wall.openings:
        if scheme.align:
            op = _aligned(op, scheme)
        a, b = op.pos_in, op.pos_in + op.width_in
        if a < 2 * T or b > wall.length_in - 2 * T:
            raise ValueError("opening runs into the wall end")
        flat = not wall.bearing and not scheme.nonbearing_header
        j = 0 if flat else nj
        if j and wall.bearing:
            # a wide opening needs more jacks per side to carry the header's end reaction
            size = scheme.header if scheme.header != "sized" else HEADER_SIZES[-1]
            while j < 4 and header_check(size, op.width_in + 2 * j * T, wD + wS, jacks_per_side=j,
                                         stud=scheme.stud) > 1.0:
                j += 1
        span = op.width_in + 2 * j * T
        if flat:
            hsize, hdepth = scheme.stud, T
            out.append(("header", scheme.stud, op.width_in, T * op.width_in))
        else:
            if scheme.header == "sized":
                w = (wD + wS) if wall.bearing else 0.0
                hsize = size_header(span, w, scheme, j) if wall.bearing else HEADER_SIZES[0]
                if hsize is None:
                    raise ValueError(f"no 2-ply header passes over {span:.0f} in")
            else:
                hsize = scheme.header
            hdepth = DEPTH[hsize]
            out += [("header", hsize, span, 0.0)] * 2
            out.append(("header_area", hsize, 0.0, hdepth * span))
        kings = (a - (j + 1) * T, b + j * T)
        out += [("king", scheme.stud, sl, T * sl)] * 2
        out += [("jack", scheme.stud, house.head_in, T * house.head_in)] * (2 * j)
        if op.sill_in:
            out.append(("sill", scheme.stud, op.width_in, T * op.width_in))
        gap = sl - house.head_in - hdepth
        for i, x in enumerate(layout):
            if not keep[i]:
                continue
            # a layout stud inside the opening's framing goes; one under a king is replaced by it
            if x + T > kings[0] and x < kings[1] + T:
                keep[i] = False
                if a <= x and x + T <= b:
                    if op.sill_in:
                        out.append(("cripple", scheme.stud, op.sill_in - T, T * (op.sill_in - T)))
                    if gap >= 3:
                        out.append(("cripple", scheme.stud, gap, T * gap))
        if j == 0 and not flat:
            out += [("hanger", "-", 0, 0)] * 2  # one metal hanger each end of the header
    out += [("stud", scheme.stud, sl, T * sl)] * sum(keep)
    return out


def takeoff(house=House(), scheme=CONVENTIONAL_2X6, loads=None, waste=0.10):
    loads = loads or Loads(width_ft=house.width_ft)
    members = []
    walls = walls_of(house, scheme)
    for w in walls:
        members += frame_wall(w, house, scheme, loads)
    sl = stud_length(house, scheme)
    members += [("corner", scheme.stud, sl, T * sl)] * (4 * scheme.corner_extra)
    members += [("tee", scheme.stud, sl, T * sl)] * (house.tees * scheme.tee_extra)
    members += [("block", scheme.stud, 12.0, 0.0)] * (house.tees * scheme.tee_blocks)

    lumber = [m for m in members if m[0] not in ("header_area", "hanger")]
    bf = sum(2 * NOMINAL_W[s] * ln / 144 for _, s, ln, _ in lumber)
    pieces = len(lumber)
    gross = sum(w.length_in for w in walls) * house.plate_height_in
    holes = sum(op.width_in * (house.head_in - op.sill_in) for w in walls for op in w.openings)
    opaque = gross - holes
    hdr = sum(m[3] for m in members if m[0] == "header_area")
    wood = sum(m[3] for m in members if m[0] not in ("header_area",)) + hdr
    # elevation area of the deep headers counts once, in hdr; flat headers are already in wood
    ff = wood / opaque
    d = DEPTH[scheme.stud]
    r_cav = R_FILMS_AND_SKINS + R_CAVITY[scheme.stud]
    r_wood = R_FILMS_AND_SKINS + R_WOOD_PER_IN * d
    if scheme.insulated_header:
        r_hdr = R_FILMS_AND_SKINS + R_WOOD_PER_IN * 2 * T + R_FOAM_PER_IN * max(0.0, d - 2 * T)
    else:
        r_hdr = r_wood
    f_hdr = hdr / opaque
    f_wood = ff - f_hdr
    u = (1 - ff) / r_cav + f_wood / r_wood + f_hdr / r_hdr
    return {
        "scheme": scheme.name,
        "pieces": pieces,
        "board_feet": bf * (1 + waste),
        "framing_factor": ff,
        "r_effective": 1 / u,
        "ua_walls": u * opaque / 144,  # Btu/h F, opaque wall only
        "opaque_ft2": opaque / 144,
        "hangers": sum(1 for m in members if m[0] == "hanger"),
        "headers": sorted({m[1] for m in members if m[0] == "header"}),
        "stud_ratio": stud_check(scheme.stud, scheme.spacing, sl, loads),
        "counts": _counts(members),
    }


def _counts(members):
    c = {}
    for kind, *_ in members:
        if kind in ("header_area",):
            continue
        c[kind] = c.get(kind, 0) + 1
    return c


def apply(scheme, measures, name=None):
    kw = {}
    for m in measures:
        kw.update(OVE_MEASURES[m])
    return replace(scheme, name=name or scheme.name, **kw)
