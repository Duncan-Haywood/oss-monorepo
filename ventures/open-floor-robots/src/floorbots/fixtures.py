"""Reference outputs the browser port (sim.mjs) is tested against: `python -m floorbots.fixtures`."""

import json
from pathlib import Path

from . import power, room
from . import coverage as C
from . import variants as V


def build() -> dict:
    out = []
    for rname in sorted(room.PRESETS):
        g = room.rasterise(room.PRESETS[rname])
        for vname in sorted(V.VARIANTS):
            v = V.VARIANTS[vname]
            p = C.plan(g, robot_radius=V.CHASSIS_RADIUS, clean_width=v.lane_width, overlap=0.10)
            out.append({
                "room": rname, "variant": vname, "free": g.free_count(), "w": g.w, "h": g.h,
                "cells": p.cells, "lanes": p.lanes, "lane_spacing": p.lane_spacing,
                "waypoints": [list(c) for c in p.waypoints], "phases": p.phases,
                "length": p.length(), "edge_length": p.length(C.EDGE), "turning": p.turning(),
                "time_s": power.plan_time_s(p), "runtime_h": power.runtime_h(v),
                "coverage": {t.name: C.coverage(g, C.paint(g, p.waypoints, p.phases, v.radii(t))) for t in v.tools},
            })
    return {"plans": out}


if __name__ == "__main__":
    path = Path(__file__).resolve().parents[2] / "fixtures" / "reference.json"
    path.write_text(json.dumps(build(), separators=(",", ":")) + "\n")
    print(f"wrote {path}")
