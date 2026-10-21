"""Command line: `floorbots plan | simulate | compare | study | runtime | size-fan | mop-dose`."""

from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from . import airflow, mopping, power, room, sim
from . import coverage as C
from . import variants as V

DISCLAIMER = (
    "No warranty. Provided free and as-is, without warranty of any kind. Not engineering, electrical "
    "or safety advice; you are responsible for verifying every output and for building and operating "
    "any robot safely. Lithium batteries, spinning brushes and mains chargers can cause fire and injury. "
    "Every figure is a simulation or a stated assumption, not a measurement."
)


def _grid(a) -> room.Grid:
    if a.room_json:
        with open(a.room_json) as fh:
            spec = json.load(fh)
        r = room.Room(spec.get("name", "custom"), tuple(map(tuple, spec["floor"])),
                      tuple(map(tuple, spec.get("obstacles", []))), tuple(spec.get("dock", (0.3, 0.3))))
        return room.rasterise(r, a.res)
    return room.rasterise(room.PRESETS[a.room], a.res)


def _plan(grid, variant: V.Variant, overlap: float) -> C.Plan:
    return C.plan(grid, robot_radius=V.CHASSIS_RADIUS, clean_width=variant.lane_width, overlap=overlap)


def summarise(grid: room.Grid, variant: V.Variant, overlap: float = 0.10, battery: power.Battery = power.Battery()) -> dict:
    p = _plan(grid, variant, overlap)
    cov = {}
    for t in variant.tools:
        cov[t.name] = round(C.coverage(grid, C.paint(grid, p.waypoints, p.phases, variant.radii(t))), 4)
    m = power.mission(p, variant, battery)
    area = grid.res ** 2 * grid.free_count()
    out = {
        "room": grid.room.name if grid.room else "ascii",
        "variant": variant.name,
        "floor_m2": round(area, 2),
        "lane_spacing_m": round(p.lane_spacing, 3),
        "cells": p.cells,
        "lanes": p.lanes,
        "path_m": round(p.length(), 1),
        "edge_m": round(p.length(C.EDGE), 1),
        "coverage": cov,
        "clean_time_min": round(power.plan_time_s(p) / 60, 1),
        "power_w": round(variant.clean_power_w(), 1),
        "runtime_min": round(power.runtime_h(variant, battery) * 60),
        "area_per_charge_m2": round(power.area_rate_m2_h(p) * power.runtime_h(variant, battery)),
        "mission_energy_wh": round(m.energy_wh, 1),
        "dock_trips": m.dock_trips,
    }
    if variant.bin_ml:
        out["bin_full_after_m2"] = round(airflow.bin_area_m2(variant.bin_ml))
    if variant.tank_ml:
        mop = next(t for t in variant.tools if t.name == "mop")
        dose = 3.0
        out["tank_lasts_m2_at_3ml_m2"] = round(mopping.tank_area_m2(variant.tank_ml, dose))
        out["pump_duty_for_3ml_m2"] = round(mopping.duty_for(mopping.Pump(), dose, mop.width, V.CRUISE), 2)
    return out


def cmd_plan(a) -> int:
    g = _grid(a)
    v = V.get(a.variant)
    s = summarise(g, v, a.overlap)
    if a.waypoints:
        p = _plan(g, v, a.overlap)
        s["waypoints"] = [[round(x, 3), round(y, 3), ph] for (x, y), ph in zip(p.points(), p.phases)]
    print(json.dumps(s, indent=2))
    return 0


def cmd_simulate(a) -> int:
    g = _grid(a)
    v = V.get(a.variant)
    p = _plan(g, v, a.overlap)
    noise = sim.Noise(a.slip, 0.5, a.pose_sigma, a.heading_sigma, a.tau)
    out = []
    for t in v.tools:
        r = sim.simulate(p, t, noise, seed=a.seed)
        out.append({"tool": t.name, "coverage": round(r.coverage, 4), "nominal_coverage": round(r.nominal_coverage, 4),
                    "time_min": round(r.time_s / 60, 1), "distance_m": round(r.distance_m, 1),
                    "max_offtrack_m": round(r.max_offtrack_m, 3), "bumps": r.bumps})
    print(json.dumps({"room": a.room, "variant": v.name, "noise": noise.__dict__, "seed": a.seed, "tools": out}, indent=2))
    return 0


def cmd_compare(a) -> int:
    g = _grid(a)
    rows = [summarise(g, V.VARIANTS[n], a.overlap) for n in V.VARIANTS]
    if a.json:
        print(json.dumps(rows, indent=2))
        return 0
    print(f"room: {rows[0]['room']} ({rows[0]['floor_m2']} m^2 of floor), overlap {a.overlap:.0%}")
    print("variant | vacuum cov | mop cov | time (min) | runtime (min) | m^2 per charge | dock trips")
    for r in rows:
        c = r["coverage"]
        print(f"{r['variant']:7} | {c.get('vacuum', 0):10.1%} | {c.get('mop', 0):7.1%} | {r['clean_time_min']:10.1f} | "
              f"{r['runtime_min']:13d} | {r['area_per_charge_m2']:14d} | {r['dock_trips']:10d}")
    return 0


def cmd_study(a) -> int:
    """Simulated coverage over lane overlap x localisation error, for one room and variant."""
    g = _grid(a)
    v = V.get(a.variant)
    tool = v.tools[-1] if a.tool == "last" else next(t for t in v.tools if t.name == a.tool)
    sigmas = a.pose_sigma or [0.0, 0.02, 0.05]
    overlaps = a.overlap_list or [0.0, 0.10, 0.30]
    print(f"{a.room}, {v.name} ({tool.name} {tool.width * 1000:.0f} mm), seeds {a.seeds}; "
          f"slip sigma {a.slip:.0%}; coverage of the floor, mean over seeds")
    print("overlap | " + " | ".join(f"pose sigma {s * 100:.0f} cm" for s in sigmas) + " | planned time (min)")
    for ov in overlaps:
        p = _plan(g, v, ov)
        cells = []
        for s in sigmas:
            covs = [sim.simulate(p, tool, sim.Noise(a.slip, 0.5, s, s, 5.0), seed=seed).coverage
                    for seed in range(1, a.seeds + 1)]
            cells.append(sum(covs) / len(covs))
        print(f"{ov:7.0%} | " + " | ".join(f"{c:16.1%}" for c in cells) + f" | {power.plan_time_s(p) / 60:18.1f}")
    return 0


def cmd_runtime(a) -> int:
    b = power.Battery(series=a.series, parallel=a.parallel, cell_mah=a.cell_mah)
    out = {"pack": f"{b.series}S{b.parallel}P {b.cell_mah:.0f} mAh cells, {b.nominal_v:.1f} V, {b.rated_wh:.0f} Wh rated, "
                   f"{b.usable_wh:.0f} Wh planned", "cutoff_mv": b.cutoff_mv, "variants": {}}
    for n, v in V.VARIANTS.items():
        out["variants"][n] = {"loads_w": v.loads_w, "total_w": v.clean_power_w(),
                              "runtime_min": round(power.runtime_h(v, b) * 60)}
    print(json.dumps(out, indent=2))
    return 0


def cmd_size_fan(a) -> int:
    fan = airflow.Fan(a.p_max, a.q_max / 1000, a.efficiency)
    sysc = airflow.System(a.inlet_w / 1000, a.gap / 1000, a.k_inlet, a.r_filter)
    op = airflow.operating_point(fan, sysc)
    rows = [{"gap_mm": g * 1000, "flow_l_s": round(o.flow_l_s, 2), "suction_pa": round(o.pressure_pa),
             "inlet_speed_m_s": round(o.inlet_speed_ms, 1), "air_power_w": round(o.air_power_w, 1)}
            for g, o in airflow.sweep_gap(fan, sysc)]
    meets = op.inlet_speed_ms >= a.target_speed
    print(json.dumps({
        "operating_point": {"flow_l_s": round(op.flow_l_s, 2), "suction_pa": round(op.pressure_pa),
                            "inlet_speed_m_s": round(op.inlet_speed_ms, 1), "air_power_w": round(op.air_power_w, 1),
                            "electrical_w": round(op.electrical_w, 1)},
        "target_inlet_speed_m_s": a.target_speed,
        "meets_target": meets,
        "nozzle_gap_sweep": rows,
        "assumptions": "linear fan curve from datasheet end points; lumped inlet loss and laminar filter; "
                       "every default is an assumption to replace with a measurement",
    }, indent=2))
    return 0 if meets else 1


def cmd_mop_dose(a) -> int:
    v = V.get(a.variant)
    mop = next((t for t in v.tools if t.name == "mop"), None)
    if mop is None:
        print(f"{v.name} has no mop", file=sys.stderr)
        return 2
    pump = mopping.Pump(a.flow)
    duty = mopping.duty_for(pump, a.target, mop.width, a.speed)
    print(json.dumps({
        "variant": v.name, "pad_width_m": mop.width, "speed_m_s": a.speed, "pump_ml_min_at_full": a.flow,
        "target_ml_m2": a.target, "pump_duty": round(duty, 3),
        "tank_ml": v.tank_ml, "tank_lasts_m2": round(mopping.tank_area_m2(v.tank_ml, a.target)),
        "table": [{"duty": r.duty, "ml_m2": round(r.dose_ml_m2, 2), "tank_m2": round(r.tank_m2)}
                  for r in mopping.table(pump, mop.width, a.speed, v.tank_ml)],
        "note": "the target dose is a setting to tune on your floor, not a tested figure",
    }, indent=2))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="floorbots", description="Open Floor Robots: coverage planning, simulation "
                                 "and sizing for an open-source robot vacuum, robot mop and vacuum-mop combo. "
                                 + DISCLAIMER)
    ap.add_argument("--version", action="version", version=f"floorbots {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def roomargs(p):
        p.add_argument("--room", choices=sorted(room.PRESETS), default="living")
        p.add_argument("--room-json", help='your own room: {"floor": [[x0, y0, x1, y1], ...], '
                       '"obstacles": [[...], ...], "dock": [x, y]} in metres')
        p.add_argument("--variant", choices=sorted(V.VARIANTS), default="vacuum")
        p.add_argument("--res", type=float, default=0.05, help="grid cell size, m")

    p = sub.add_parser("plan", help="coverage plan for a preset room")
    roomargs(p)
    p.add_argument("--overlap", type=float, default=0.10)
    p.add_argument("--waypoints", action="store_true")
    p.set_defaults(fn=cmd_plan)

    p = sub.add_parser("simulate", help="drive the plan with wheel slip and localisation noise")
    roomargs(p)
    p.add_argument("--overlap", type=float, default=0.10)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--slip", type=float, default=0.03)
    p.add_argument("--pose-sigma", type=float, default=0.02)
    p.add_argument("--heading-sigma", type=float, default=0.02)
    p.add_argument("--tau", type=float, default=5.0, help="localisation error time constant, s")
    p.set_defaults(fn=cmd_simulate)

    p = sub.add_parser("compare", help="vacuum vs mop vs combo in one room")
    roomargs(p)
    p.add_argument("--overlap", type=float, default=0.10)
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_compare)

    p = sub.add_parser("study", help="coverage vs lane overlap and localisation error")
    roomargs(p)
    p.add_argument("--tool", default="last")
    p.add_argument("--seeds", type=int, default=3)
    p.add_argument("--slip", type=float, default=0.03)
    p.add_argument("--pose-sigma", type=float, action="append")
    p.add_argument("--overlap", dest="overlap_list", type=float, action="append")
    p.set_defaults(fn=cmd_study)

    p = sub.add_parser("runtime", help="battery runtime per variant")
    p.add_argument("--series", type=int, default=4)
    p.add_argument("--parallel", type=int, default=2)
    p.add_argument("--cell-mah", type=float, default=2600.0)
    p.set_defaults(fn=cmd_runtime)

    p = sub.add_parser("size-fan", help="fan vs system curve operating point")
    p.add_argument("--p-max", type=float, default=2500.0, help="fan shut-off pressure, Pa")
    p.add_argument("--q-max", type=float, default=12.0, help="fan free-air flow, L/s")
    p.add_argument("--efficiency", type=float, default=0.30)
    p.add_argument("--inlet-w", type=float, default=160.0, help="nozzle slot length, mm")
    p.add_argument("--gap", type=float, default=4.0, help="nozzle lip to floor, mm")
    p.add_argument("--k-inlet", type=float, default=2.5)
    p.add_argument("--r-filter", type=float, default=60000.0, help="filter, Pa per m^3/s")
    p.add_argument("--target-speed", type=float, default=10.0, help="inlet air speed you want, m/s (your assumption)")
    p.set_defaults(fn=cmd_size_fan)

    p = sub.add_parser("mop-dose", help="pump duty for a target water dose, and tank range")
    p.add_argument("--variant", choices=["mop", "combo"], default="mop")
    p.add_argument("--target", type=float, default=3.0, help="ml per m^2")
    p.add_argument("--speed", type=float, default=V.CRUISE)
    p.add_argument("--flow", type=float, default=20.0, help="pump ml/min at full duty")
    p.set_defaults(fn=cmd_mop_dose)

    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
