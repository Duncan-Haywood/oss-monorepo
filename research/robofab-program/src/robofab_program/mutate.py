"""Deterministic single-site mutations of a robot program (seeded bug injection).

These are NOT model-written bugs: they stand in for common slips (wrong
coordinate, low lift, too fast, missing wait, deleted step) so the twin's
catch rate can be measured on more than a handful of programs.
"""
from .twin import parse_program

XY_SHIFTS = [("x+3mm", 0.003, 0), ("x+7mm", 0.007, 0), ("y-7mm", 0, -0.007),
             ("x+15mm", 0.015, 0), ("x+100mm", 0.1, 0)]
LIFTS = [0.02, 0.04, 0.07]
SPEEDS = [0.25, 0.5, 2.5]
WAITS = [None, 0.05, 0.12, 0.14, 0.16, 0.25]


def _fmt(op, a):
    if op == "MOVE":
        return "MOVE %.4f %.4f %.4f %.3f" % a
    if op == "WAIT":
        return "WAIT %.3f" % a[0]
    return op


def mutants(text):
    ops = [(o, a) for o, a, _ in parse_program(text)]
    out = {}

    def add(kind, label, new_ops):
        out[(kind, label)] = "\n".join(_fmt(o, a) for o, a in new_ops)

    for i, (o, a) in enumerate(ops):
        if o == "MOVE" and a[2] <= 0.02:
            for lab, dx, dy in XY_SHIFTS:
                new = list(ops); new[i] = ("MOVE", (a[0] + dx, a[1] + dy, a[2], a[3]))
                add("xy_shift", f"{i}:{lab}", new)
        if o == "MOVE" and a[2] > 0.03:
            for z in LIFTS:
                new = list(ops); new[i] = ("MOVE", (a[0], a[1], z, a[3]))
                add("low_lift", f"{i}:z={z}", new)
        if o == "MOVE":
            for k in SPEEDS:
                new = list(ops); new[i] = ("MOVE", (a[0], a[1], a[2], a[3] * k))
                add("speed", f"{i}:x{k}", new)
        if o in ("GRIP", "RELEASE", "MOVE"):
            add("delete_step", f"{i}:{o}", ops[:i] + ops[i + 1:])
    gi = next(i for i, (o, _) in enumerate(ops) if o == "GRIP")
    base = [x for j, x in enumerate(ops) if not (j == gi + 1 and x[0] == "WAIT")]
    for w in WAITS:
        new = list(base)
        if w is not None:
            new.insert(gi + 1, ("WAIT", (w,)))
        add("grip_wait", f"wait={w}", new)
    return out
