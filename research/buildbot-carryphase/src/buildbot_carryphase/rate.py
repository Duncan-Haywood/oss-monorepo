"""Carry rate: pieces moved per hour over a haul distance, robot against one labourer.

A trip is: pick up, walk d loaded, put down, walk back empty. The robot carries one piece per trip (a
stock G1 or H1 holds one stud at the carry pose); the labourer carries `n_h` pieces. Walking speeds are
the single-support ceilings of `model.py` for the robot and a sourced adult walking speed for the person.
The pick-up and put-down times are not sourced: they are swept.

Human walking speed: Bohannon and Andrews (2011), Physiotherapy 97:182-189, a meta-analysis of 23,111
adults, gives 1.43 m/s for men aged 40-49 and 1.26 m/s for men aged 70-79 (read from a search summary and a
university handout, not from the paper's table). A load slows people somewhat; the sweep takes 1.0 to 1.4 m/s.
"""

HUMAN_SPEED = (1.0, 1.2, 1.4)     # m/s, loaded
PICKPLACE = (6.0, 12.0, 24.0)     # s for the pick-up and the put-down together (unsourced)
DISTANCES = (10.0, 20.0, 40.0)    # m from stack to wall (unsourced; a 28 x 40 ft house is 8.5 x 12 m)
HUMAN_PIECES = (1, 3)             # pieces per trip: one, or three (3 x 5.8 kg = 17 kg, under the NIOSH constant 23 kg)


def pieces_per_hour(d, v_loaded, v_empty, pickplace, n=1):
    trip = pickplace + d / v_loaded + d / v_empty
    return 3600.0 * n / trip


def best_speed(rows, robot, mass):
    ok = [r for r in rows if r["robot"] == robot and r["mass"] == mass and r["slope"] == 0 and r["rise"] == 0 and r["ok"]]
    return max((r["L"] / r["T"] for r in ok), default=None)


def table(out):
    rows = out["rows"]
    lines = []
    cases = [("g1", 3, "G1 holds 3 kg (a light piece)"), ("h1", 5, "H1 holds 5 kg"), ("h1", 10, "H1 holds 10 kg")]
    for name, mass, label in cases:
        vl, ve = best_speed(rows, name, float(mass)), best_speed(rows, name, 0.0)
        if vl is None or ve is None:
            lines.append(f"  {label}: no feasible loaded step on the grid, no rate")
            continue
        for d in DISTANCES:
            cells = []
            for pp in PICKPLACE:
                r = pieces_per_hour(d, vl, ve, pp, 1)
                h = [pieces_per_hour(d, v, v, pp, n) for v in HUMAN_SPEED for n in HUMAN_PIECES]
                cells.append(f"pp {pp:.0f}s: robot {r:.0f}/h vs person {min(h):.0f}-{max(h):.0f}/h")
            lines.append(f"  {label}, loaded {vl:.2f} / empty {ve:.2f} m/s, {d:.0f} m: " + "; ".join(cells))
    return lines


def breakeven(d, pickplace, v_person, n_person):
    """Loaded and empty walking speed (m/s) at which a one-piece robot trip matches the person's rate."""
    target = pieces_per_hour(d, v_person, v_person, pickplace, n_person)
    trip = 3600.0 / target                      # s per piece the robot must reach
    walk = trip - pickplace
    return 2 * d / walk if walk > 0 else float("inf")


def breakeven_lines():
    lines = []
    for n in HUMAN_PIECES:
        for d in DISTANCES:
            cells = [f"pp {pp:.0f}s: {breakeven(d, pp, 1.2, n):.2f} m/s" for pp in PICKPLACE]
            lines.append(f"  person {n} piece(s) per trip at 1.2 m/s, {d:.0f} m: robot with one piece per trip must walk " + "; ".join(cells))
    return lines
