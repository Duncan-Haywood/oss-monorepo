"""Layout rules written as checks. Each returns a list of failure strings; empty means it passes.

Paraphrased from the International Residential Code (IRC 2021) as the author recalls it; the code
text is copyrighted and was not consulted for this run, so check each number against the edition your
jurisdiction adopted before relying on it:
  R304.1  at least one habitable room of 120 sq ft; other habitable rooms 70 sq ft
  R304.3  habitable rooms at least 7 ft in every horizontal dimension (kitchens excepted)
  R303.1  natural light: glazing at least 8% of the floor area of each habitable room
  R305.1  ceiling height at least 7 ft (this plan is 8 ft)
  R310.2  each sleeping room has an egress window with a net clear opening of at least 5.7 sq ft,
          at least 24 in high and 20 in wide, with the sill at most 44 in above the floor
Window net opening is assumed to be 80% of the frame area (a casement or sliding sash).
"""
NET_OPENING = 0.8
SILL_MAX_FT = 3.667


def check_geometry(plan):
    """Openings must lie within their wall and not overlap each other (0.5 ft clear between neighbours)."""
    fails = []
    by_wall = {}
    for o in plan.openings:
        by_wall.setdefault(o.wall, []).append(o)
    for wid, ops in by_wall.items():
        L = plan.wall(wid).length
        ops = sorted(ops, key=lambda o: o.offset)
        for o in ops:
            if o.offset < -1e-9 or o.offset + o.width > L + 1e-9:
                fails.append(f"geometry: {o.kind} in {o.room} does not fit wall {wid}")
        for a, b in zip(ops, ops[1:]):
            if b.offset - (a.offset + a.width) < 0.5 - 1e-9:
                fails.append(f"geometry: openings in {a.room} and {b.room} are closer than 0.5 ft on wall {wid}")
    return fails


def check_layout(plan):
    fails = check_geometry(plan)
    rooms = plan.rooms
    if not any(r.kind in ("living", "bedroom") and r.area >= 120 for r in rooms):
        fails.append("R304.1: no habitable room of at least 120 sq ft")
    for r in rooms:
        wins = [o for o in plan.openings if o.room == r.name and o.kind == "window"]
        if r.kind == "bedroom":
            if r.area < 70:
                fails.append(f"R304.1: {r.name} is {r.area:.0f} sq ft, under 70")
            if min(r.w, r.d) < 7:
                fails.append(f"R304.3: {r.name} is {min(r.w, r.d):.1f} ft in its short dimension, under 7")
        if r.kind in ("living", "bedroom"):
            glaze = sum(o.width * o.height for o in wins)
            if glaze < 0.08 * r.area:
                fails.append(f"R303.1: {r.name} glazing {glaze:.1f} sq ft is under 8% of {r.area:.0f}")
        if r.kind == "bedroom":
            ok = any(o.width * o.height * NET_OPENING >= 5.7 and o.sill <= SILL_MAX_FT
                     and o.height * 12 * NET_OPENING >= 24 and o.width * 12 >= 20 for o in wins)
            if not ok:
                fails.append(f"R310.2: {r.name} has no egress window")
    return fails
