"""Reference outputs the browser port (sim.mjs) is tested against: `python -m mowerbot.fixtures`."""

import json
from pathlib import Path

from . import coverage, lawns, planner, power

CASES = [
    {"lawn": "backyard", "angle": None},
    {"lawn": "backyard", "angle": 0.0},
    {"lawn": "front", "angle": 37.5},
    {"lawn": "curved", "angle": None},
    {"lawn": "curved", "angle": 90.0, "perimeter_passes": 1, "overlap": 0.05},
]


def build() -> dict:
    out = []
    for c in CASES:
        lawn = lawns.ALL[c["lawn"]]
        s = planner.Settings(perimeter_passes=c.get("perimeter_passes", 2), overlap=c.get("overlap", 0.03))
        p = planner.plan(lawn, s, c["angle"])
        cov = coverage.of_path(lawn, p.path, s.cut_width)
        sch = power.schedule(lawn, p, power.PowerSpec(battery_wh=25.0))
        out.append({**c, "angle_deg": p.angle_deg, "stripes": p.stripes, "points": len(p.path),
                    "head": [list(q) for q in p.path[:6]], "length": p.length, "turning": p.turning,
                    "time_s": p.time_s, "lawn_area": lawn.area, "coverage": cov.fraction,
                    "cut_area": cov.cut_area, "missed_area": cov.missed_area,
                    "sessions": [[x.mow_s, x.mow_m, x.return_m, x.charge_s] for x in sch.sessions],
                    "schedule_total_s": sch.total_s})
    b = power.budget(power.PowerSpec(), 0.35, 0.232, 5.0)
    f = power.budget(power.PowerSpec(), 0.35, 0.232)
    return {"plans": out, "budget_5deg": [b.drive_w, b.blade_w, b.electronics_w],
            "budget_flat": [f.drive_w, f.blade_w, f.electronics_w],
            "runtime_h": power.runtime_h(power.PowerSpec(), 0.35, 0.232)}


if __name__ == "__main__":
    path = Path(__file__).resolve().parents[2] / "fixtures" / "reference.json"
    path.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"wrote {path}")
