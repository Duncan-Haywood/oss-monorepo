"""Factory against site for the exterior-wall shell of the `house-framing` house.

Four pieces, each small enough to test:
  panelise          split each wall into panels no longer than a handling limit, breaking between openings
  sheathing_pieces  the OSB rectangles a wall needs, cut on a 4 ft module starting at a given point
  pack_sheets       guillotine packing of those rectangles onto stock sheets (site habits or CNC nesting)
  plan_trips        panels onto flatbed trailers
and a Monte Carlo of the framing crew's calendar days with weather (simulate_shell).
Every rate in `Process` is an assumption of this project, not a measured or sourced value.
"""
import math
import random
from dataclasses import dataclass, replace

from house_framing.model import ADVANCED_2X6, House, Loads, takeoff, walls_of

SHEET = (48.0, 108.0)  # 4 x 9 ft OSB, wall sheathed with full-height sheets
EDGE = 5.5  # in, the zone either side of an opening that a panel break must avoid (king, jack, sill)


def panelise(wall, max_len_in):
    """Break points (inches from the wall start) giving the fewest equal-ish panels <= max_len_in.

    Each ideal break moves to the nearest position that is not within EDGE of an opening, so no
    panel cuts through an opening's framing. Returns the list of (start, end) panels.
    """
    return panelise_n(wall, max(1, math.ceil(wall.length_in / max_len_in)), max_len_in)


def panelise_n(wall, n, max_len_in):
    if n > 4 * math.ceil(wall.length_in / max_len_in):
        raise ValueError("cannot panelise: openings leave no break point")
    zones = [(op.pos_in - EDGE, op.pos_in + op.width_in + EDGE) for op in wall.openings]
    cuts = []
    for k in range(1, n):
        ideal = wall.length_in * k / n
        cands = sorted([ideal] + [z for ab in zones for z in ab], key=lambda x: abs(x - ideal))
        cuts.append(next(x for x in cands if all(not (a < x < b) for a, b in zones)))
    edges = [0.0] + sorted(cuts) + [wall.length_in]
    panels = list(zip(edges[:-1], edges[1:]))
    if any(b - a > max_len_in + 1e-9 for a, b in panels):
        return panelise_n(wall, n + 1, max_len_in)
    return panels


def sheathing_pieces(wall, house, start, end, module=48.0):
    """Rectangles (w, h) of OSB for the part of `wall` between start and end (inches).

    Columns of `module` width run from `start`; the last is trimmed at `end`. A column crossing an
    opening yields full-height pieces beside it, a piece over it, and one under it if it has a sill.
    """
    H = house.plate_height_in
    out = []
    x = start
    while x < end - 1e-9:
        x1 = min(x + module, end)
        cuts = sorted({x, x1} | {p for op in wall.openings for p in (op.pos_in, op.pos_in + op.width_in)
                                 if x < p < x1})
        for a, b in zip(cuts[:-1], cuts[1:]):
            op = next((o for o in wall.openings if o.pos_in <= a + 1e-9 and b <= o.pos_in + o.width_in + 1e-9), None)
            if op is None:
                out.append((b - a, H))
            else:
                if H - house.head_in > 1e-9:
                    out.append((b - a, H - house.head_in))
                if op.sill_in > 1e-9:
                    out.append((b - a, op.sill_in))
        x = x1
    return out


def pack_sheets(pieces, sheet=SHEET, order="given", fit="first", min_keep=12.0, rotate=False):
    """Guillotine packing. Returns a list of sheets, each a list of (x, y, w, h) placements.

    order "given" keeps the list order (a crew cutting as it goes); "area" sorts largest first.
    fit "first" takes the first free rectangle that holds the piece; "best" the tightest one.
    Free rectangles with a side under `min_keep` are thrown away (too small to use).
    """
    items = list(pieces)
    if order == "area":
        items.sort(key=lambda p: -p[0] * p[1])
    sheets, free = [], []
    for w, h in items:
        opts = [(w, h)] + ([(h, w)] if rotate and w != h else [])
        best = None
        for si, fr in enumerate(free):
            for ri, (fx, fy, fw, fh) in enumerate(fr):
                for pw, ph in opts:
                    if pw <= fw + 1e-9 and ph <= fh + 1e-9:
                        score = fw * fh - pw * ph
                        if best is None or (fit == "best" and score < best[0]):
                            best = (score, si, ri, pw, ph)
                        if fit == "first":
                            break
                else:
                    continue
                if fit == "first":
                    break
            if fit == "first" and best:
                break
        if best is None:
            if w > sheet[0] + 1e-9 or h > sheet[1] + 1e-9:
                if not (rotate and w <= sheet[1] and h <= sheet[0]):
                    raise ValueError(f"piece {w:.1f} x {h:.1f} does not fit a sheet")
            sheets.append([])
            free.append([(0.0, 0.0, sheet[0], sheet[1])])
            si, ri = len(sheets) - 1, 0
            pw, ph = (w, h) if (w <= sheet[0] + 1e-9 and h <= sheet[1] + 1e-9) else (h, w)
        else:
            _, si, ri, pw, ph = best
        fx, fy, fw, fh = free[si].pop(ri)
        sheets[si].append((fx, fy, pw, ph))
        # split along the axis that leaves the larger single remainder
        right = (fx + pw, fy, fw - pw, fh)  # beside, full height
        top = (fx, fy + ph, pw, fh - ph)  # above, piece width
        right2 = (fx + pw, fy, fw - pw, ph)  # beside, piece height
        top2 = (fx, fy + ph, fw, fh - ph)  # above, full width
        a = max(right[2] * right[3], top[2] * top[3])
        b = max(right2[2] * right2[3], top2[2] * top2[3])
        for r in (right, top) if a >= b else (right2, top2):
            if r[2] >= min_keep and r[3] >= min_keep:
                free[si].append(r)
    return sheets


def shell_quantities(house=House(), scheme=ADVANCED_2X6, max_panel_ft=24.0, loads=None):
    """Panels, sheathing pieces and framing members for the exterior walls, site and factory layouts."""
    loads = loads or Loads(width_ft=house.width_ft)
    tk = takeoff(house, scheme, loads)
    walls = walls_of(house, scheme)
    panels, site_pieces, fac_pieces = [], [], []
    for wi, w in enumerate(walls):
        site_pieces += sheathing_pieces(w, house, 0.0, w.length_in)
        for a, b in panelise(w, max_panel_ft * 12):
            panels.append({"wall": wi, "start": a, "end": b, "len_in": b - a})
            fac_pieces += sheathing_pieces(w, house, a, b)
    total_len = sum(w.length_in for w in walls)
    for p in panels:  # share the members in proportion to length (corners and tees stay in the lump)
        p["pieces"] = tk["pieces"] * p["len_in"] / total_len
    area = lambda ps: sum(w * h for w, h in ps)
    return {"takeoff": tk, "panels": panels, "site_pieces": site_pieces, "fac_pieces": fac_pieces,
            "sheathing_area_ft2": area(site_pieces) / 144, "joints": len(panels) - len(walls),
            "lower_bound_sheets": math.ceil(area(site_pieces) / (SHEET[0] * SHEET[1]))}


def plan_trips(panels, trailer_ft=48.0, stack_max=6):
    """Flat stacks of up to `stack_max` panels of similar length, stacks packed along the trailer (FFD).

    Returns the list of trips, each a list of stack lengths in feet. One stack per 8.5 ft of width,
    so stacks sit end to end.
    """
    lens = sorted((p["len_in"] / 12 for p in panels), reverse=True)
    stacks = [max(lens[i:i + stack_max]) for i in range(0, len(lens), stack_max)]
    trips = []
    for s in sorted(stacks, reverse=True):
        if s > trailer_ft:
            raise ValueError("panel longer than the trailer")
        for t in trips:
            if sum(t) + s <= trailer_ft + 1e-9:
                t.append(s)
                break
        else:
            trips.append([s])
    return trips


@dataclass(frozen=True)
class Process:
    """Assumed rates. None is sourced; the experiments sweep the ones that matter."""
    crew: int = 4
    hours_per_day: float = 8.0
    site_min_per_piece: float = 12.0  # framing members, all-in (layout, cut, nail), on site
    site_min_per_sheet: float = 15.0  # hanging and cutting one sheet on the wall
    wall_raise_hours: float = 3.0  # labour-hours to raise, plumb, line and brace one wall on site (flat on a table: none)
    factory_ratio: float = 0.60  # factory labour per member and sheet, as a share of site
    factory_crew: int = 4
    weather_loss: float = 0.15  # chance an exterior day is lost
    weather_ratio: float = 1.0  # share of that loss that also hits panels craned in (set 0.3: only lifting days)
    trip_days: float = 1.0  # calendar days from loading to unloading
    set_min_per_panel: float = 45.0  # crane set, plumb and brace, per panel
    joint_min: float = 45.0  # tying a panel joint (top plate lap, sheathing seam, air seal)
    crane_days_min: float = 1.0
    foundation_days: float = 12.0  # panels are built while the foundation is poured and cured
    # money, only for the break-even test
    site_rate: float = 55.0  # $/h loaded
    factory_rate: float = 45.0
    plant_overhead: float = 0.25  # on factory labour
    sheet_price: float = 24.0
    trip_cost: float = 900.0
    crane_day_cost: float = 1500.0


def labour_hours(q, p, sheets_site, sheets_fac):
    n_members = q["takeoff"]["pieces"]
    site_h = ((n_members * p.site_min_per_piece + sheets_site * p.site_min_per_sheet) / 60
              + p.wall_raise_hours * len({pn['wall'] for pn in q['panels']}))
    fac_h = p.factory_ratio * (n_members * p.site_min_per_piece + sheets_fac * p.site_min_per_sheet) / 60
    return site_h, fac_h


def simulate_shell(q, p, sheets_site, sheets_fac, trips, seed, n=1):
    """Calendar days of the wall shell, after the foundation starts, site-built and panelised.

    Site: crew-hours / (crew * hours_per_day) working days, each lost to weather with probability
    weather_loss. Panelised: the factory builds while the foundation is made (no weather), so the
    shell step on the critical path is whatever factory time exceeds the foundation, then delivery,
    the crane day(s), the set, and joints, with weather hitting those exterior days.
    Returns (site_days, offsite_days) averaged over n draws.
    """
    rng = random.Random(seed)
    site_h, fac_h = labour_hours(q, p, sheets_site, sheets_fac)
    site_work = site_h / (p.crew * p.hours_per_day)
    fac_work = fac_h / (p.factory_crew * p.hours_per_day)
    ext_h = (len(q["panels"]) * p.set_min_per_panel + q["joints"] * p.joint_min) / 60
    ext_work = max(p.crane_days_min, ext_h / (p.crew * p.hours_per_day))
    tot_s = tot_o = 0.0
    for _ in range(n):
        tot_s += _with_weather(rng, site_work, p.weather_loss)
        wait = max(0.0, fac_work - p.foundation_days)
        tot_o += wait + p.trip_days * len(trips) + _with_weather(rng, ext_work, p.weather_loss * p.weather_ratio)
    return tot_s / n, tot_o / n


def _with_weather(rng, work_days, loss):
    """Whole working days of work (last one fractional); each calendar day is lost with prob `loss`."""
    done, days = 0.0, 0.0
    while done < work_days - 1e-12:
        days += 1
        if rng.random() >= loss:
            done += 1
    # the last working day may be partial: refund the unused part
    return days - (done - work_days)


def costs(q, p, sheets_site, sheets_fac, trips):
    site_h, fac_h = labour_hours(q, p, sheets_site, sheets_fac)
    ext_h = (len(q["panels"]) * p.set_min_per_panel + q["joints"] * p.joint_min) / 60
    site = site_h * p.site_rate + sheets_site * p.sheet_price
    off = (fac_h * p.factory_rate * (1 + p.plant_overhead) + sheets_fac * p.sheet_price
           + ext_h * p.site_rate + len(trips) * p.trip_cost + p.crane_days_min * p.crane_day_cost)
    return site, off


def compare(p=Process(), house=House(), scheme=ADVANCED_2X6, max_panel_ft=24.0, draws=4000, seed=0,
            site_policy=("given", "first", 12.0), fac_policy=("area", "best", 4.0)):
    q = shell_quantities(house, scheme, max_panel_ft)
    s_sheets = len(pack_sheets(q["site_pieces"], order=site_policy[0], fit=site_policy[1], min_keep=site_policy[2]))
    f_sheets = len(pack_sheets(q["fac_pieces"], order=fac_policy[0], fit=fac_policy[1], min_keep=fac_policy[2]))
    trips = plan_trips(q["panels"])
    sd, od = simulate_shell(q, p, s_sheets, f_sheets, trips, seed, draws)
    sc, oc = costs(q, p, s_sheets, f_sheets, trips)
    return {"q": q, "site_sheets": s_sheets, "fac_sheets": f_sheets, "trips": trips, "site_days": sd,
            "off_days": od, "site_cost": sc, "off_cost": oc}
