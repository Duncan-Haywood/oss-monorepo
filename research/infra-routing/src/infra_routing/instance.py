"""Solomon VRPTW instance (TSPLIB-style CVRPTW file) plus the electric-vehicle additions.

The file gives coordinates, demands, time windows, service time and capacity. Node 0 is the depot.
Battery, recharge rate and charging stations are NOT in the file: they are this project's additions
(see README, "Inputs"). Energy use is 1 unit per unit of distance, so the battery size Q is a range.
"""
import math
from dataclasses import dataclass, field


@dataclass
class Instance:
    name: str
    xy: list            # [(x, y)], node 0 = depot
    demand: list
    ready: list
    due: list
    service: float
    capacity: float
    stations: list = field(default_factory=list)   # [(x, y)]; the depot is also a charging point
    Q: float = math.inf      # battery range, distance units
    g: float = 0.0           # recharge time per unit of range restored

    @property
    def n(self):
        return len(self.xy) - 1

    def d(self, a, b):
        return math.dist(a, b)

    def charge_points(self):
        return [self.xy[0]] + list(self.stations)


def read(path):
    sec, name, cap, svc = None, "", 0.0, 0.0
    xy, dem, tw = {}, {}, {}
    for raw in open(path):
        line = raw.strip()
        if not line or line == "EOF":
            continue
        if ":" in line:
            k, v = [s.strip() for s in line.split(":", 1)]
            if k == "NAME":
                name = v
            elif k == "CAPACITY":
                cap = float(v)
            elif k == "SERVICE_TIME":
                svc = float(v)
            continue
        if line.endswith("_SECTION"):
            sec = line
            continue
        p = line.split()
        if sec == "NODE_COORD_SECTION":
            xy[int(p[0])] = (float(p[1]), float(p[2]))
        elif sec == "DEMAND_SECTION":
            dem[int(p[0])] = float(p[1])
        elif sec == "TIME_WINDOW_SECTION":
            tw[int(p[0])] = (float(p[1]), float(p[2]))
    ids = sorted(xy)
    return Instance(name, [xy[i] for i in ids], [dem[i] for i in ids],
                    [tw[i][0] for i in ids], [tw[i][1] for i in ids], svc, cap)


def kmeans_stations(inst, k, iters=50):
    """k charging stations at the centres of a deterministic k-means of the customers
    (farthest-point start), so they sit where the demand is."""
    pts = inst.xy[1:]
    cs = [pts[0]]
    while len(cs) < k:
        cs.append(max(pts, key=lambda p: min(math.dist(p, c) for c in cs)))
    for _ in range(iters):
        groups = [[] for _ in cs]
        for p in pts:
            groups[min(range(len(cs)), key=lambda i: math.dist(p, cs[i]))].append(p)
        cs = [(sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)) if g else c
              for g, c in zip(groups, cs)]
    return [(round(x, 2), round(y, 2)) for x, y in cs]


def with_ev(inst, Q, g, stations):
    return Instance(inst.name, inst.xy, inst.demand, inst.ready, inst.due, inst.service,
                    inst.capacity, list(stations), Q, g)
