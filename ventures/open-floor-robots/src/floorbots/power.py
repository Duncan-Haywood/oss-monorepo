"""Battery, runtime, and when to go home to charge.

The pack is 4S2P 18650 Li-ion with a BMS (hardware/electronics.md). Every
figure below is a planning assumption: the cell capacity is a typical
datasheet value, the loads come from `variants.py`, and the usable fraction
leaves headroom above the BMS cut-off. Measure your own pack and loads.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass

from . import variants as V
from .coverage import EDGE, LANE, Plan


@dataclass(frozen=True)
class Battery:
    series: int = 4
    parallel: int = 2
    cell_mah: float = 2600.0
    cell_v: float = 3.6
    usable: float = 0.80          # fraction of rated energy we plan to use
    converter_eff: float = 0.90   # regulators and drivers
    charge_w: float = 30.0        # dock charging power into the pack
    cutoff_cell_v: float = 3.2    # firmware low-battery stop (BMS cuts lower)

    @property
    def nominal_v(self) -> float:
        return self.series * self.cell_v

    @property
    def rated_wh(self) -> float:
        return self.series * self.parallel * self.cell_mah / 1000 * self.cell_v

    @property
    def usable_wh(self) -> float:
        return self.rated_wh * self.usable * self.converter_eff

    @property
    def cutoff_mv(self) -> int:
        return int(round(self.series * self.cutoff_cell_v * 1000))


def runtime_h(variant: V.Variant, battery: Battery = Battery()) -> float:
    return battery.usable_wh / variant.clean_power_w()


def area_rate_m2_h(plan: Plan, cruise: float = V.CRUISE, transit: float = V.TRANSIT,
                   turn_rate: float = V.TURN_RATE) -> float:
    """Floor area per hour for this room and plan (includes edges, links and turns)."""
    return plan.grid.res ** 2 * plan.grid.free_count() / (plan_time_s(plan, cruise, transit, turn_rate) / 3600)


def plan_time_s(plan: Plan, cruise: float = V.CRUISE, transit: float = V.TRANSIT,
                turn_rate: float = V.TURN_RATE) -> float:
    clean = plan.length(EDGE) + plan.length(LANE)
    return clean / cruise + (plan.length() - clean) / transit + plan.turning() / turn_rate


def distance_field(plan: Plan, home) -> list[float]:
    """4-connected path distance (m) from every region cell to `home` (cell); inf outside."""
    g = plan.grid
    w = g.w
    dist = [math.inf] * (g.w * g.h)
    dist[home[1] * w + home[0]] = 0.0
    q = deque([home])
    while q:
        i, j = q.popleft()
        d = dist[j * w + i]
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < w and 0 <= jj < g.h:
                k = jj * w + ii
                if plan.reach[k] and dist[k] == math.inf:
                    dist[k] = d + g.res
                    q.append((ii, jj))
    return dist


@dataclass
class Mission:
    clean_time_s: float
    dock_trips: int
    charge_time_s: float
    total_time_s: float
    energy_wh: float
    recharge_points: list


def mission(plan: Plan, variant: V.Variant, battery: Battery = Battery(), reserve: float = 1.5,
            cruise: float = V.CRUISE, transit: float = V.TRANSIT, turn_rate: float = V.TURN_RATE) -> Mission:
    """Walk the plan with a battery; go home when the energy left only just covers the trip back.

    The trip home is the grid path distance times `reserve` (detours, a
    missed dock), driven at transit speed with only the drive and
    electronics on. After charging to full the robot drives back and
    resumes where it stopped.
    """
    g = plan.grid
    home = plan.waypoints[0]
    dist = distance_field(plan, home)
    p_clean = variant.clean_power_w()
    p_move = variant.transit_power_w()
    full = battery.usable_wh * 3600   # joules
    left = full
    t_clean = t_charge = 0.0
    trips = 0
    used = 0.0
    points = []
    prev_h = None

    def home_cost(c):
        return dist[c[1] * g.w + c[0]] * reserve / transit * p_move

    for k in range(1, len(plan.waypoints)):
        a, b = plan.waypoints[k - 1], plan.waypoints[k]
        seg = math.dist(a, b) * g.res
        cleaning = plan.phases[k] in (EDGE, LANE)
        speed = cruise if cleaning else transit
        h = math.atan2(b[1] - a[1], b[0] - a[0])
        turn = 0.0
        if prev_h is not None:
            turn = abs(h - prev_h)
            if turn > math.pi:
                turn = 2 * math.pi - turn
        prev_h = h
        dt = seg / speed + turn / turn_rate
        e = dt * (p_clean if cleaning else p_move)
        if left - e < home_cost(b):
            # Go home from a, charge, come back.
            leg_t = dist[a[1] * g.w + a[0]] / transit
            left -= leg_t * p_move
            t_charge += (full - left) / battery.charge_w
            t_clean += 2 * leg_t
            used += 2 * leg_t * p_move
            left = full - leg_t * p_move
            trips += 1
            points.append(g.centre(*a))
            if left - e < home_cost(b):
                raise ValueError("battery too small to clean even one segment and return")
        left -= e
        used += e
        t_clean += dt
    return Mission(t_clean, trips, t_charge, t_clean + t_charge, used / 3600, points)
