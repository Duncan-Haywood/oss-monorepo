"""Reference outputs the browser port (sim.mjs) is tested against: `python -m tennisbots.fixtures`."""

import json
import math
from pathlib import Path

from . import ballistics as bl
from . import launcher

CASES = [
    {"target": [9.0, -2.0], "speed": 22.0, "topspin": 1200.0, "machine_y": 0.0},
    {"target": [6.0, 3.0], "speed": 18.0, "topspin": 0.0, "machine_y": 1.0},
    {"target": [10.5, 0.0], "speed": 30.0, "topspin": 2500.0, "machine_y": -1.5},
    {"target": [4.0, -3.5], "speed": 16.0, "topspin": -800.0, "machine_y": 0.0},
]


def build() -> dict:
    out = []
    for c in CASES:
        shot = launcher.aim(launcher.default_origin(c["machine_y"]), tuple(c["target"]), c["speed"], c["topspin"])
        rt, rb = launcher.WheelLauncher().wheel_rpm(c["speed"], c["topspin"] * bl.RPM)
        out.append({**c, "elevation_deg": shot.elevation_deg, "azimuth_deg": shot.azimuth_deg,
                    "flight_time": shot.flight_time, "net_clearance": shot.net_clearance,
                    "rpm_top": rt, "rpm_bottom": rb})
    v = bl.launch_velocity(20.0, math.radians(12), 0.0)
    f = bl.simulate((-12.4, 0.0, 1.0), v, bl.spin_vector(v, 1500 * bl.RPM), max_bounces=1, net=False)
    return {"aim": out, "flight": {"bounce": list(f.bounces[0].pos), "bounce_t": f.bounces[0].t,
                                   "end": list(f.states[-1].pos), "end_t": f.states[-1].t}}


if __name__ == "__main__":
    path = Path(__file__).resolve().parents[2] / "fixtures" / "reference.json"
    path.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"wrote {path}")
