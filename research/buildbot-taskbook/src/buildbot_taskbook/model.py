"""Task book of a small wood-frame house: what has to be handled, how often, and how long it takes.

Quantities come from the house-framing takeoff (code), masses from the lumber, sheet and tool figures
buildbot-payload sourced, and robot verdicts from buildbot-payload's results.json. Minutes per unit are
assumptions, swept by a factor, because no primary time-study table could be read (README).
"""
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "house-framing" / "src"))
from house_framing import model as HF  # noqa: E402

PAYLOAD = ROOT / "buildbot-payload" / "experiments" / "results.json"
LB = 0.45359237
SPF_PCF = 0.42 / (1 + 0.265 * 0.5 * 0.42) * 62.4 * 1.15  # same lumber density as buildbot-payload
OSB_KG = (1.4 * 32 * LB, 1.6 * 32 * LB)  # 4x8 sheet of 7/16 in OSB, 45-51 lb (retail listings)
DRYWALL_KG = 1.6 * 32 * LB               # 4x8 sheet of 1/2 in drywall (USG product comparison)
SHEET_FT2 = 32.0
SWEEP = 3.0                              # minutes per unit drawn log-uniformly in [mid/SWEEP, mid*SWEEP]
ROOF_PITCH = 4 / 12                      # my choice
ROOF_OVERHANG_FT = 1.0                   # House Loads default in house-framing
CEILING_Z = 2.44                         # 8 ft ceiling
ROOF_Z = 3.0                             # hand height of a worker on the roof deck, above the floor of the robot's stance
WASTE = 0.10                             # sheet waste, same as the lumber waste in house-framing
NAILS_PER_PIECE = 4                      # two end nails at each end; my reading of the usual schedule, unchecked
SHEATH_NAILS = 62                        # 6 in on edges and 12 in on the 2 interior studs of a 4 ft sheet, per 4x8 (buildbot-fasten's schedule)
DRYWALL_SCREWS = 32                      # about 12 in on the field of a sheet; my assumption
STUD_FACE_MM = 1.5 * 25.4                # a 2x member's face is 1.5 in wide: the target a fastener must hit


def lumber_kg(size, length_in):
    """Mass of one piece of SPF lumber at 28.5 lb/ft3."""
    return HF.T * HF.DEPTH[size] * length_in / 1728 * SPF_PCF * LB


def quantities(house=HF.House(), scheme=HF.CONVENTIONAL_2X6):
    """Counts and sizes the tasks need, all from the framing takeoff and the house geometry."""
    tk = HF.takeoff(house, scheme)
    walls = HF.walls_of(house, scheme)
    members = []
    for w in walls:
        members += HF.frame_wall(w, house, scheme, HF.Loads(width_ft=house.width_ft))
    members = [m for m in members if m[0] not in ("header_area", "hanger")]
    sl = HF.stud_length(house, scheme)
    wall_lf = sum(w.length_in for w in walls) / 12
    openings = sum(len(w.openings) for w in walls)
    kinds = tk["counts"]
    # members of the takeoff that are cut to length on site (the rest are stock studs and plates)
    cut_kinds = ("header", "sill", "cripple", "jack", "plate")
    cuts = sum(kinds.get(k, 0) for k in cut_kinds)
    wall_mass = sum(lumber_kg(s, ln) for k, s, ln, _ in members)
    extra = [("corner", scheme.stud, sl)] * (4 * scheme.corner_extra) + [("tee", scheme.stud, sl)] * (house.tees * scheme.tee_extra)
    wall_mass += sum(lumber_kg(s, ln) for _, s, ln in extra)
    piece_kg = [lumber_kg(s, ln) for k, s, ln, _ in members] + [lumber_kg(s, ln) for _, s, ln in extra]
    # sheathing and drywall areas
    opaque = tk["opaque_ft2"]
    foot_w, foot_l = house.width_ft, house.length_ft
    roof_ft2 = (foot_w + 2 * ROOF_OVERHANG_FT) * (foot_l + 2 * ROOF_OVERHANG_FT) / math.cos(math.atan(ROOF_PITCH))
    perim = 2 * (foot_w + foot_l)
    wall_h = house.plate_height_in / 12
    interior_walls = perim * wall_h - sum(op.width_in * (house.head_in - op.sill_in) for w in walls for op in w.openings) / 144
    ceiling = foot_w * foot_l
    cavity_bays = sum(1 for k, *_ in members if k == "stud") + 1
    return {
        "pieces": tk["pieces"], "counts": kinds, "wall_lf": wall_lf, "openings": openings, "cuts": cuts,
        "stud_len_in": sl, "wall_mass_kg": wall_mass, "walls": len(walls),
        "wall_sheets": math.ceil(opaque * (1 + WASTE) / SHEET_FT2), "opaque_ft2": opaque,
        "roof_sheets": math.ceil(roof_ft2 * (1 + WASTE) / SHEET_FT2), "roof_ft2": roof_ft2,
        "drywall_wall_sheets": math.ceil(interior_walls * (1 + WASTE) / SHEET_FT2),
        "drywall_ceiling_sheets": math.ceil(ceiling * (1 + WASTE) / SHEET_FT2),
        "drywall_ft2": interior_walls + ceiling, "cavity_bays": cavity_bays,
        "avg_piece_kg": wall_mass / tk["pieces"], "max_piece_kg": max(piece_kg), "n_members": len(piece_kg),
        "lumber_lf": sum(ln for k, s, ln, _ in members) / 12 + len(extra) * sl / 12,
    }


def tasks(q=None):
    """The task book. Each row: id, trade, verb, what, unit, n (cycles), kg (mass handled, low and high),
    z and x (hand height and reach from the feet, m), minutes per unit (mid), tolerance (mm) and its basis,
    payload (the buildbot-payload case: 'solo' or 'shared' mass share), and a note."""
    q = q or quantities()
    pc = q["pieces"]  # the takeoff's pieces already include the corner and tee studs
    s = (q["avg_piece_kg"], q["max_piece_kg"])
    sheets = q["wall_sheets"]
    T = []

    def add(id, trade, verb, what, unit, n, kg, z, x, minutes, tol=None, tol_basis="", share="solo", note=""):
        T.append(dict(id=id, trade=trade, verb=verb, what=what, unit=unit, n=n, kg=kg, z=z, x=x,
                      minutes=minutes, tol_mm=tol, tol_basis=tol_basis, share=share, note=note))

    add("F1", "framing", "lay out", "mark plates and openings with chalk and pencil", "ft of wall", q["wall_lf"], (0.1, 0.1), 0.8, 0.4,
        1.0, 3.0, "assumed 1/8 in on a 16 in module", note="tool mass 0.1 kg is a pencil, assumed")
    add("F2", "framing", "carry", "move a stud, plate, header ply or cripple from the stack to its wall", "piece", pc,
        s, 0.6, 0.3, 0.3, note="mass runs from the mean piece to the heaviest (a 2x12 header ply)")
    add("F3", "framing", "cut", "cut headers, sills, cripples, jacks and plates to length", "cut", q["cuts"],
        (s[0], s[0]), 0.9, 0.4, 1.0, 1.6, "assumed 1/16 in", note="saw mass not modelled")
    add("F4", "framing", "place", "hold a piece in position against the layout", "piece", pc, s, 0.9, 0.4, 0.4,
        STUD_FACE_MM, "face width of a 2x member")
    add("F5", "framing", "fasten", "drive end nails with a framing nailer", "nail", pc * NAILS_PER_PIECE, (3.4, 3.4), 1.0, 0.4, 0.1,
        STUD_FACE_MM / 2, "half the face width, so the nail stays in the member", note="nailer 7.5 lb (Metabo HPT NR90AES1)")
    add("F6", "framing", "raise", "tilt a framed wall up and brace it", "wall", q["walls"], (q["wall_mass_kg"] / q["walls"],) * 2, 1.2, 0.4, 40.0,
        12.0, "assumed 1/2 in over a wall, plumb", share="shared", note="person-minutes; the lifting is by crew, crane or telehandler")
    add("S1", "sheathing", "carry", "move a 4x8 OSB sheet from the stack to the wall", "sheet", sheets, OSB_KG, 0.6, 0.3, 0.8)
    add("S2", "sheathing", "place", "hold and square a sheet on the frame", "sheet", sheets, OSB_KG, 1.2, 0.3, 1.5,
        STUD_FACE_MM / 2, "sheet edge must land on a 1.5 in stud face", share="shared")
    add("S3", "sheathing", "cut", "cut out the window and door openings", "opening", q["openings"], (3.4, 3.4), 1.0, 0.4, 3.0, 6.0,
        "assumed 1/4 in", note="router or saw, tool mass assumed like the nailer")
    add("S4", "sheathing", "fasten", "nail sheathing, 6 in edge and 12 in field", "nail", sheets * SHEATH_NAILS, (3.4, 3.4), 1.0, 0.4, 0.1,
        STUD_FACE_MM / 2, "half the face width")
    add("R1", "roof", "carry", "bring OSB sheets up to the roof", "sheet", q["roof_sheets"], OSB_KG, ROOF_Z, 0.3, 1.5,
        note="hand height is above the stock robots' reach envelope, so no payload cell applies")
    add("R2", "roof", "place", "lay and square a roof sheet", "sheet", q["roof_sheets"], OSB_KG, ROOF_Z, 0.3, 1.5,
        STUD_FACE_MM / 2, "sheet edge on a 1.5 in truss face")
    add("R3", "roof", "fasten", "nail roof sheathing", "nail", q["roof_sheets"] * SHEATH_NAILS, (3.4, 3.4), ROOF_Z, 0.4, 0.12, STUD_FACE_MM / 2,
        "half the face width")
    add("I1", "insulation", "place", "cut and fit a batt in a wall cavity", "bay", q["cavity_bays"], (0.5, 0.5), 1.0, 0.3, 1.0, 12.0,
        "assumed 1/2 in fit", note="batt mass 0.5 kg is assumed, not sourced; far below any payload limit")
    add("D1", "drywall", "carry", "carry a 4x8 drywall sheet", "sheet", q["drywall_wall_sheets"] + q["drywall_ceiling_sheets"], (DRYWALL_KG, DRYWALL_KG), 0.6, 0.3, 1.0)
    add("D2", "drywall", "hold", "hold a wall sheet while it is screwed", "sheet", q["drywall_wall_sheets"], (DRYWALL_KG, DRYWALL_KG), 1.2, 0.3, 2.0,
        STUD_FACE_MM / 2, "screw must land on a 1.5 in stud face", share="shared")
    add("D3", "drywall", "hold", "hold a ceiling sheet while it is screwed", "sheet", q["drywall_ceiling_sheets"], (DRYWALL_KG, DRYWALL_KG), CEILING_Z, 0.3, 3.0,
        STUD_FACE_MM / 2, "screw must land on a 1.5 in joist face", share="shared")
    add("D4", "drywall", "cut", "score and snap or cut around openings", "sheet", q["drywall_wall_sheets"] + q["drywall_ceiling_sheets"], (1.0, 1.0), 1.0, 0.3, 2.0,
        3.0, "assumed 1/8 in")
    add("D5", "drywall", "fasten", "drive drywall screws", "screw", (q["drywall_wall_sheets"] + q["drywall_ceiling_sheets"]) * DRYWALL_SCREWS, (1.5, 1.5), 1.2, 0.3, 0.08,
        STUD_FACE_MM / 2, "half the face width", note="screw gun mass 1.5 kg is assumed")
    add("D6", "drywall", "finish", "tape, mud and sand joints, three coats", "ft2 of board", q["drywall_ft2"], (2.0, 2.0), 1.2, 0.4, 0.35,
        1.0, "assumed 1 mm flatness", note="tool mass 2 kg is assumed; heights 0 to 2.44 m")
    return T


def hours(task, minutes=None, framing_scale=1.0):
    scale = framing_scale if task["trade"] == "framing" else 1.0
    return task["n"] * (task["minutes"] if minutes is None else minutes) * scale / 60.0


# One cited rate to check the framing minutes against: Methvin's wall-framing norm, 0.12 man-hours per metre of
# 75 x 50 mm (2x3-class) stud, read as a search-result snippet on 2026-10-21 (page not fetchable from this session).
METHVIN_MHR_PER_FT = 0.12 * 0.3048


def methvin_hours(q):
    """Hours for every linear foot of lumber in the takeoff at the Methvin norm (an upper-end reading: it is a 2x3 rate)."""
    return q["lumber_lf"] * METHVIN_MHR_PER_FT


def framing_scale_to_norm(T, q):
    """Factor that scales the F-rows (layout to raising) so their total equals the Methvin-norm hours."""
    mine = sum(hours(t) for t in T if t["trade"] == "framing")
    return methvin_hours(q) / mine


# ---- robot verdicts from buildbot-payload's envelope --------------------------------------------------

def load_envelope(path=PAYLOAD):
    env = json.loads(Path(path).read_text())["envelope"]
    return {k: {(r["z"], r["x"]): r["kg"] for r in rows} for k, rows in env.items()}


def capacity(env, case, z, x):
    """Conservative capacity at (z, x): the smallest value among the grid cells around it; None if any is out of reach
    or (z, x) lies outside the grid."""
    cells = env[case]
    zs = sorted({k[0] for k in cells})
    xs = sorted({k[1] for k in cells})
    if z < zs[0] or z > zs[-1] or x < xs[0] or x > xs[-1]:
        return None

    def around(v, g):
        lo = max(i for i, a in enumerate(g) if a <= v + 1e-9)
        return {g[lo], g[min(lo + 1, len(g) - 1)]}

    vals = [cells[(a, b)] for a in around(z, zs) for b in around(x, xs)]
    return None if any(v is None for v in vals) else min(vals)


def verdict(task, env, case="h1-palm"):
    """'yes' if the robot holds the task's high mass (half of it when shared), 'no' if not, 'out of reach' if no cell covers it."""
    cap = capacity(env, case, task["z"], task["x"])
    if cap is None:
        return "out of reach", None
    need = max(task["kg"]) * (0.5 if task["share"] == "shared" else 1.0)
    return ("yes" if need <= cap else "no"), cap


def load_ratio(task, env, case="h1-palm"):
    cap = capacity(env, case, task["z"], task["x"])
    if not cap:
        return None
    return max(task["kg"]) * (0.5 if task["share"] == "shared" else 1.0) / cap


# ---- sweep ----------------------------------------------------------------------------------------------

def sweep(T, env, draws=4000, seed=1, cases=("g1-palm", "h1-palm"), framing_scale=1.0):
    """Draw every task's minutes per unit log-uniformly in [mid/SWEEP, mid*SWEEP]. For each draw record each
    task's hours, its rank by hours, and the share of hours a robot case can do (verdict 'yes')."""
    rng = random.Random(seed)
    yes = {c: [verdict(t, env, c)[0] == "yes" for t in T] for c in cases}
    out = {"hours": [[] for _ in T], "rank": [[] for _ in T], "share": {c: [] for c in cases}, "total": []}
    for _ in range(draws):
        hs = []
        for t in T:
            f = math.exp(rng.uniform(-math.log(SWEEP), math.log(SWEEP)))
            hs.append(hours(t, t["minutes"] * f, framing_scale))
        order = sorted(range(len(T)), key=lambda i: -hs[i])
        tot = sum(hs)
        out["total"].append(tot)
        for i, h in enumerate(hs):
            out["hours"][i].append(h)
        for r, i in enumerate(order):
            out["rank"][i].append(r + 1)
        for c in cases:
            out["share"][c].append(sum(h for h, y in zip(hs, yes[c]) if y) / tot)
    return out


def pct(xs, p):
    xs = sorted(xs)
    k = (len(xs) - 1) * p
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)
