"""Battery-blind baseline: solve Solomon RC208 as a plain VRPTW with PyVRP and save the routes.
Needs pyvrp (pip install pyvrp); the saved routes are committed so nothing else needs it.
Coordinates, windows and service times are scaled by 100 and rounded because PyVRP works in integers.
   python experiments/baseline.py [seconds] [seed]"""
import json
import math
import sys
from pathlib import Path

from pyvrp import Model
from pyvrp.stop import MaxRuntime

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_routing.instance import read  # noqa: E402

S = 100


def main(seconds=60, seed=0):
    inst = read(HERE.parent / "data" / "RC208.vrp")
    m = Model()
    m.add_vehicle_type(inst.n, capacity=int(inst.capacity), tw_early=int(inst.ready[0] * S), tw_late=int(inst.due[0] * S))
    locs = [m.add_location(round(x * S), round(y * S)) for x, y in inst.xy]
    m.add_depot(locs[0], tw_early=int(inst.ready[0] * S), tw_late=int(inst.due[0] * S))
    for i in range(1, inst.n + 1):
        m.add_client(locs[i], delivery=int(inst.demand[i]), service_duration=int(inst.service * S),
                     tw_early=int(inst.ready[i] * S), tw_late=int(inst.due[i] * S))
    for i, a in enumerate(locs):
        for j, b in enumerate(locs):
            if i != j:
                d = round(math.dist(inst.xy[i], inst.xy[j]) * S)
                m.add_edge(a, b, distance=d, duration=d)
    res = m.solve(MaxRuntime(seconds), seed=seed, display=False)
    routes = [[a.idx + 1 for a in list(r) if a.is_client()] for r in res.best.routes()]
    out = {"solver": "PyVRP, battery ignored", "seconds": seconds, "seed": seed, "routes": routes}
    (HERE.parent / "data" / "baseline_routes.json").write_text(json.dumps(out, indent=1))
    print(len(routes), "routes; feasible", res.is_feasible())


if __name__ == "__main__":
    main(*[float(a) if i == 0 else int(a) for i, a in enumerate(sys.argv[1:])])
