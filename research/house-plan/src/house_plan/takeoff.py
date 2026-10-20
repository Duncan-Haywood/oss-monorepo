"""Framing takeoff and bill of materials for a Plan.

Members are sized with the open tools of this portfolio: joists, rafters, girders and headers by
`house_spans` (NDS allowable stress), studs by `house_framing.stud_check`. Lengths are inches, areas
sq ft. Net lengths, no waste. Lumber is SPF No. 2. Gable-end triangle framing, rake and fascia boards,
posts and footings, hangers, nails, insulation, drywall and finishes are not counted.
"""
import math
from collections import Counter

from house_framing.model import Loads, stud_check
from house_spans.model import CASES, size_member

NOMINAL = {"2x4": 4, "2x6": 6, "2x8": 8, "2x10": 10, "2x12": 12}
DEPTH = {"2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25}
STUD_LEN = 92.625  # precut stud for an 8 ft ceiling with three 1.5 in plates
PLATE_H = 1.5 + STUD_LEN + 3.0  # bottom of bottom plate to top of top plates
HEAD_IN = 81.0  # top of every rough opening above the bottom plate
SHEET_SF = 32.0  # 4x8 sheet
GIRDER_POST_FT = 8.0
SIZES = ("2x6", "2x8", "2x10", "2x12")


def _bf(size, length_in, n=1):
    return n * 2 * NOMINAL[size] * (length_in / 12.0) / 12.0


def _positions(length_in, oc):
    """Stud positions along a wall: one per on-centre interval, plus the end."""
    return int(length_in // oc) + 1


def size_wall_stud(p):
    """Smallest stud that carries the roof on a bearing wall at p.stud_oc, or None. 2x4 then 2x6."""
    loads = Loads(width_ft=p.width, overhang_ft=p.overhang, dead_psf=15.0, snow_psf=30.0)
    for s in ("2x4", "2x6"):
        if stud_check(s, p.stud_oc, STUD_LEN, loads) <= 1.0:
            return s
    return None


def size_header(opening, bearing, p):
    """(size, plies, jacks_per_side) for an opening, or None if no 2x header up to 2x12 fits.

    A bearing-wall header carries half the roof span plus the overhang, in the roof-snow30 case. A
    non-bearing opening gets a doubled 2x4 laid flat, assumed and not checked.
    """
    if not bearing:
        return ("2x4", 2, 1)
    trib_in = (p.width / 2 + p.overhang) * 12
    for jacks in (1, 2):
        r = size_member(opening.width, CASES["roof-snow30"], spacing_in=trib_in, plies=2,
                        sizes=SIZES, bearing_in=1.5 * jacks)
        if r:
            return (r[0], 2, jacks)
    return None


def takeoff(plan):
    """Return a dict: members (Counter of (size, length_in) -> count), sheets, areas, failures."""
    p = plan.params
    W, D = p.width, p.depth
    members = Counter()
    fails = []
    sheets = {}

    def add(size, length_in, n=1):
        if n > 0 and length_in > 0:
            members[(size, round(length_in, 3))] += n

    stud = size_wall_stud(p)
    if stud is None:
        fails.append("no 2x4 or 2x6 stud carries the roof on a bearing wall at %d in" % p.stud_oc)
        stud = "2x6"
    interior_stud = "2x4"

    for w in plan.walls:
        L_in = w.length * 12
        s = stud if w.bearing or w.exterior else interior_stud
        # exterior walls are 2x4/2x6 per the bearing check on the roof-bearing walls; the gable walls
        # use the same stud so the sheathing and insulation are uniform
        ops = [o for o in plan.openings if o.wall == w.id]
        # plates: one bottom, two top
        add(s, L_in, 3)
        # studs: on-centre positions, outside the openings, plus corner and tee studs
        n = _positions(L_in, p.stud_oc)
        removed = 0
        for o in ops:
            lo, hi = o.offset * 12, (o.offset + o.width) * 12
            removed += sum(1 for k in range(n) if lo < k * p.stud_oc < hi)
        add(s, STUD_LEN, n - removed)
        if w.exterior:
            add(s, STUD_LEN, 2)  # extra studs at the two corners (three-stud corner shares the crossing wall's end)
        for o in ops:
            sized = size_header(o, w.bearing, p)
            if sized is None:
                fails.append(f"no header up to 2x12 spans the {o.width:g} ft opening on wall {w.id}")
                sized = ("2x12", 2, 2)
            hs, plies, jacks = sized
            head_bottom = HEAD_IN
            if o.kind == "door":
                head_bottom = HEAD_IN
            add(s, STUD_LEN, 2)  # two kings
            add(s, head_bottom - 1.5, 2 * jacks)  # jacks run from the bottom plate to the header
            add(hs, o.width * 12, plies)
            cripple = PLATE_H - 3.0 - head_bottom - DEPTH[hs]
            if cripple < 0:
                fails.append(f"header {hs} on wall {w.id} does not fit under the top plates")
            n_open = max(_positions(o.width * 12, p.stud_oc) - 1, 0) + (1 if o.width * 12 % p.stud_oc else 0)
            add(s, cripple, n_open)
            if o.kind == "window":
                add(s, o.width * 12, 1)  # sill
                add(s, o.sill * 12 - 1.5 - 1.5, n_open)  # cripples under the sill

    # floor: joists span D. Try perimeter bearing, then a girder at mid-depth.
    joist_oc = p.joist_oc
    floor = size_member(D, CASES["floor"], spacing_in=joist_oc, sizes=SIZES)
    girder = None
    if floor is not None:
        jsize, span, bays = floor[0], D, 1
    else:
        half = size_member(D / 2, CASES["floor"], spacing_in=joist_oc, sizes=SIZES)
        if half is None:
            fails.append("no 2x joist spans even half the depth")
            jsize, span, bays = "2x12", D / 2, 2
        else:
            jsize, span, bays = half[0], D / 2, 2
            # girder: three plies, tributary width D/2 (half of each bay), spans between posts
            g = size_member(GIRDER_POST_FT, CASES["floor"], spacing_in=D / 2 * 12, plies=3,
                            sizes=SIZES, bearing_in=3.5)
            if g is None:
                fails.append("no 3-ply 2x girder spans 8 ft posts under this floor")
                g = ("2x12", "", 0)
            girder = g[0]
            add(girder, W * 12, 3)
    add(jsize, span * 12, bays * _positions(W * 12, joist_oc))
    add(jsize, W * 12, 2)  # rim joists on the front and back

    # roof: gable, ridge along y. Rafter on the slope, plus overhang along the slope.
    rise_per_ft = p.pitch / 12.0
    run = W / 2
    slope = math.sqrt(1 + rise_per_ft ** 2)
    raft = size_member(run, CASES["roof-snow30"], spacing_in=p.rafter_oc, sizes=SIZES, pitch=p.pitch)
    if raft is None:
        fails.append("no 2x rafter carries the roof")
        rsize = "2x12"
    else:
        rsize = raft[0]
    raft_len = (run + p.overhang) * slope * 12
    n_raft = 2 * _positions(D * 12, p.rafter_oc)
    add(rsize, raft_len, n_raft)
    ridge = "2x12" if NOMINAL[rsize] < 12 else "2x12"
    add(ridge, D * 12, 1)
    # ceiling joists tie the rafters across W; sized as ceiling joists at the rafter spacing
    ceil = size_member(W, CASES["ceiling"], spacing_in=p.rafter_oc, sizes=("2x4",) + SIZES)
    ceil_span, central = W, False
    if ceil is None:
        # lap the ceiling joists over a bearing line at the ridge: two spans of W/2, plus a central wall
        ceil = size_member(W / 2, CASES["ceiling"], spacing_in=p.rafter_oc, sizes=("2x4",) + SIZES)
        ceil_span, central = W / 2, True
    if ceil is None:
        fails.append("no 2x ceiling joist spans half the width")
        csize = "2x12"
    else:
        csize = ceil[0]
    add(csize, ceil_span * 12, (2 if central else 1) * _positions(D * 12, p.rafter_oc))
    if central:
        # a bearing line down the middle: 3 plates and studs at stud_oc (no openings; not placed in the plan)
        add("2x4", D * 12, 3)
        add("2x4", STUD_LEN, _positions(D * 12, p.stud_oc))

    # sheathing, in square feet then 4x8 sheets
    ext_len = 2 * (W + D)
    open_sf = sum(o.width * o.height for o in plan.openings if plan.wall(o.wall).exterior)
    gable_sf = W * (W / 2 * rise_per_ft) / 1.0  # two triangles of base W and height rise
    wall_sf = ext_len * PLATE_H / 12 - open_sf + gable_sf
    roof_sf = 2 * raft_len / 12 * (D + 2 * p.overhang)
    floor_sf = W * D
    for k, sf in (("wall", wall_sf), ("roof", roof_sf), ("subfloor", floor_sf)):
        sheets[k] = (sf, math.ceil(sf / SHEET_SF))

    bf = Counter()
    for (size, length), n in members.items():
        bf[size] += _bf(size, length, n)
    return dict(members=members, sheets=sheets, bf=bf, total_bf=sum(bf.values()), failures=fails,
                central_wall=central, sizes=dict(stud=stud, joist=jsize, girder=girder, rafter=rsize, ceiling=csize, ridge=ridge),
                posts=(math.ceil(W / GIRDER_POST_FT) + 1) if girder else 0, floor_area=W * D)


def bom_lines(t):
    """Human-readable bill of materials: lumber by size and length, then sheets."""
    lines = []
    for (size, length), n in sorted(t["members"].items(), key=lambda kv: (NOMINAL[kv[0][0]], -kv[0][1])):
        lines.append(f"{n:4d} x {size} x {length:8.2f} in  ({_bf(size, length, n):7.1f} bf)")
    for k, (sf, n) in t["sheets"].items():
        lines.append(f"{n:4d} x 4x8 sheet, {k} sheathing  ({sf:.0f} sq ft)")
    if t["posts"]:
        lines.append(f"{t['posts']:4d} x girder post (size not designed)")
    return lines
