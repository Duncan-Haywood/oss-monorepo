"""Evaluate one route: given the order of its customers, choose where to recharge.

Model (Schneider, Stenger and Goeke 2014, simplified): the vehicle leaves the depot full, uses one
unit of range per unit of distance, may recharge at a station or the depot, and a recharge always
fills the battery (time g per unit restored; the paper allows partial charging, this does not).
Time windows allow waiting. At most one station between two consecutive stops.

route_cost(inst, customers) is exact for those rules: a label-setting search over
(distance, time, range left) with dominance, so the cheapest legal charging plan is found, or None.
"""
import math

EPS = 1e-9


def _dominated(lab, others):
    for o in others:
        if o[0] <= lab[0] + EPS and o[1] <= lab[1] + EPS and o[2] >= lab[2] - EPS:
            return True
    return False


def route_cost(inst, customers):
    """Return (distance, charge_time, stops) for the cheapest feasible plan, or None.
    stops lists the station index used before each next stop (-1 none, 0 depot, k station k)."""
    if sum(inst.demand[c] for c in customers) > inst.capacity + EPS:
        return None
    pts = [0] + list(customers) + [0]
    cps = inst.charge_points()
    Q, g = inst.Q, inst.g
    # labels: (dist, time_departing, range_left, charge_time, plan)
    front = [(0.0, inst.ready[0], Q, 0.0, ())]
    for k in range(len(pts) - 1):
        a, b = inst.xy[pts[k]], inst.xy[pts[k + 1]]
        nb = pts[k + 1]
        e, l = inst.ready[nb], inst.due[nb]
        svc = inst.service if nb != 0 else 0.0
        direct = math.dist(a, b)
        legs = [(-1, direct, None)]
        if Q < math.inf:
            for si, s in enumerate(cps):
                legs.append((si, math.dist(a, s), math.dist(s, b)))
        new = []
        for dist, t, r, ct, plan in front:
            for si, d1, d2 in legs:
                if si < 0:
                    if d1 > r + EPS:
                        continue
                    arr, left, add_ct, add_d = t + d1, r - d1, 0.0, d1
                else:
                    if d1 > r + EPS or d2 > Q + EPS:
                        continue
                    wait = g * (Q - (r - d1))
                    arr, left, add_ct, add_d = t + d1 + wait + d2, Q - d2, wait, d1 + d2
                    if si == 0 and k == 0:
                        continue          # recharging at the depot you just left is pointless
                start = max(arr, e)
                if start > l + EPS:
                    continue
                lab = (dist + add_d, start + svc, left, ct + add_ct, plan + (si,))
                new.append(lab)
        front = _prune(new)
        if not front:
            return None
    best = min(front, key=lambda x: (x[0], x[1]))
    return best[0], best[3], best[4]


def _prune(labs):
    """Dominance on (dist, time, range left); keeps the first of equal labels."""
    out = []
    for lab in sorted(labs, key=lambda x: (x[0], x[1], -x[2])):
        if not _dominated(lab, out):
            out.append(lab)
    return out
