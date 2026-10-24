"""Command line: `mowerbot plan | simulate | schedule | runtime | blade-stop | slope`."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict

from . import __version__
from . import blade, coverage, lawns, planner, power, simulate, slope

DISCLAIMER = (
    "No warranty. Provided free and as-is, without warranty of any kind. Not engineering, "
    "electrical or safety advice; you are responsible for verifying every output and for "
    "building and operating any machine safely. Spinning mower blades can cause serious injury."
)


def _lawn(a) -> planner.Lawn:
    if a.lawn:
        with open(a.lawn) as fh:
            return planner.Lawn.from_dict(json.load(fh))
    return lawns.ALL[a.example]


def _settings(a) -> planner.Settings:
    return planner.Settings(cut_width=a.cut_width, overlap=a.overlap, perimeter_passes=a.perimeter_passes,
                            speed=a.speed)


def _plan(a):
    lawn = _lawn(a)
    return lawn, planner.plan(lawn, _settings(a), a.angle)


def _r(x, n=2):
    return round(x, n)


def cmd_plan(a) -> int:
    lawn, p = _plan(a)
    c = coverage.of_path(lawn, p.path, p.settings.cut_width)
    out = {
        "lawn": lawn.name, "lawn_area_m2": _r(lawn.area, 1), "stripe_angle_deg": p.angle_deg,
        "stripes": p.stripes, "perimeter_loops": p.perimeter_loops, "obstacle_loops": p.obstacle_loops,
        "path_m": _r(p.length, 1), "time_min": _r(p.time_s / 60, 1),
        "planned_coverage_percent": _r(100 * c.fraction), "missed_m2": _r(c.missed_area),
        "over_no_go_m2": _r(c.intrusion_area), "outside_boundary_m2": _r(c.outside_area),
        "skipped": p.skipped,
    }
    if a.path_out:
        with open(a.path_out, "w") as fh:
            json.dump({"lawn": lawn.name, "path": [[_r(x, 3), _r(y, 3)] for x, y in p.path]}, fh)
        out["path_file"] = a.path_out
    print(json.dumps(out, indent=2))
    return 0


def cmd_simulate(a) -> int:
    lawn, p = _plan(a)
    noise = simulate.Noise(gnss_sigma=a.gnss_sigma, fix_losses_per_hour=a.fix_losses)
    rows = []
    for seed in range(1, a.runs + 1):
        r = simulate.run(lawn, p, noise, seed=seed)
        rows.append({"seed": seed, "coverage_percent": _r(100 * r.coverage.fraction), "missed_m2": _r(r.coverage.missed_area),
                     "over_no_go_m2": _r(r.coverage.intrusion_area), "time_min": _r(r.time_s / 60, 1),
                     "fix_losses": r.fix_losses, "waiting_min": _r(r.waiting_s / 60, 1),
                     "max_cross_track_m": _r(r.max_cross_track_m, 3), "finished": r.finished})
    print(json.dumps({"lawn": lawn.name, "planned_time_min": _r(p.time_s / 60, 1), "noise": asdict(noise),
                      "runs": rows}, indent=2))
    return 0


def cmd_schedule(a) -> int:
    lawn, p = _plan(a)
    spec = power.PowerSpec(battery_wh=a.battery_wh)
    s = power.schedule(lawn, p, spec)
    print(json.dumps({
        "lawn": lawn.name, "battery_wh": a.battery_wh, "sessions": [
            {"mow_min": _r(x.mow_s / 60, 1), "mow_m": _r(x.mow_m, 1), "trip_home_m": _r(x.return_m, 1),
             "charge_min": _r(x.charge_s / 60)} for x in s.sessions],
        "mowing_min": _r(s.mowing_s / 60, 1), "start_to_finish_h": _r(s.total_s / 3600),
    }, indent=2))
    return 0


def cmd_runtime(a) -> int:
    spec = power.PowerSpec(mass_kg=a.mass, battery_wh=a.battery_wh, crr=a.crr, cut_j_per_m2=a.cut_energy)
    b = power.budget(spec, a.speed, a.cut_width, a.slope)
    h = power.runtime_h(spec, a.speed, a.cut_width, a.slope)
    print(json.dumps({"drive_w": _r(b.drive_w, 1), "blade_w": _r(b.blade_w, 1), "electronics_w": _r(b.electronics_w, 1),
                      "total_w": _r(b.total_w, 1), "runtime_h": _r(h), "area_per_charge_m2_upper_bound":
                      round(h * 3600 * a.speed * (a.cut_width - 0.03)),
                      "assumptions": asdict(spec)}, indent=2))
    return 0


def cmd_blade(a) -> int:
    spec = blade.BladeSpec(rpm=a.rpm, kv=a.kv, phase_r=a.phase_r, friction_nm=a.friction)
    r = blade.report(spec)
    print(json.dumps({"rpm": a.rpm, "tip_speed_mps": _r(r.tip_speed_mps, 1), "stored_energy_j": _r(r.stored_energy_j, 1),
                      "one_blade_energy_j": _r(r.blade_energy_j), "inertia_kg_m2": f"{spec.inertia:.3e}",
                      "stop_s_short_brake": _r(r.stop_s_brake), "stop_s_coasting": _r(r.stop_s_coast, 1),
                      "design_target_s": blade.TARGET_STOP_S, "meets_target": r.meets_target}, indent=2))
    return 0 if r.meets_target else 1


def cmd_slope(a) -> int:
    c = slope.Chassis(cg_x=a.cg_x, cg_h=a.cg_h, mu=a.mu)
    out = {}
    for label, wet in (("dry", False), ("wet", True)):
        r = slope.analyse(c, wet)
        out[label] = {"climb_deg": _r(r.climb_deg, 1), "descend_deg": _r(r.descend_deg, 1), "slide_deg": _r(r.slide_deg, 1),
                      "tip_sideways_deg": _r(r.tip_side_deg, 1), "tip_backwards_deg": _r(r.tip_back_deg, 1),
                      "limit_deg": _r(r.limit_deg, 1), "limit_percent": round(r.limit_percent), "limited_by": r.limiting}
    print(json.dumps(out, indent=2))
    return 0


def _lawn_args(sp):
    sp.add_argument("--lawn", help="lawn JSON: {\"outer\": [[x,y],...], \"holes\": [[[x,y],...]], \"dock\": [x,y]}")
    sp.add_argument("--example", default="backyard", choices=sorted(lawns.ALL))
    sp.add_argument("--angle", type=float, default=None, help="stripe angle, degrees (default: quickest)")
    sp.add_argument("--cut-width", type=float, default=0.232)
    sp.add_argument("--overlap", type=float, default=0.03)
    sp.add_argument("--perimeter-passes", type=int, default=2)
    sp.add_argument("--speed", type=float, default=0.35)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="mowerbot", description="Open Robot Mower planning and design tools. " + DISCLAIMER)
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("plan", help="plan a lawn: stripes, loops, time, planned coverage")
    _lawn_args(sp)
    sp.add_argument("--path-out", help="write the path as JSON")
    sp.set_defaults(fn=cmd_plan)
    sp = sub.add_parser("simulate", help="drive the plan in simulation with RTK noise and fix losses")
    _lawn_args(sp)
    sp.add_argument("--runs", type=int, default=3)
    sp.add_argument("--gnss-sigma", type=float, default=0.015)
    sp.add_argument("--fix-losses", type=float, default=2.0, help="per hour")
    sp.set_defaults(fn=cmd_simulate)
    sp = sub.add_parser("schedule", help="split the plan into battery sessions with trips to the dock")
    _lawn_args(sp)
    sp.add_argument("--battery-wh", type=float, default=126.0)
    sp.set_defaults(fn=cmd_schedule)
    sp = sub.add_parser("runtime", help="power budget and runtime per charge")
    sp.add_argument("--speed", type=float, default=0.35)
    sp.add_argument("--cut-width", type=float, default=0.232)
    sp.add_argument("--slope", type=float, default=0.0, help="degrees, climbing")
    sp.add_argument("--mass", type=float, default=9.5)
    sp.add_argument("--battery-wh", type=float, default=126.0)
    sp.add_argument("--crr", type=float, default=0.12)
    sp.add_argument("--cut-energy", type=float, default=60.0, help="J per m^2 cut (assumption)")
    sp.set_defaults(fn=cmd_runtime)
    sp = sub.add_parser("blade-stop", help="blade tip speed, stored energy and stop time")
    sp.add_argument("--rpm", type=float, default=2800.0)
    sp.add_argument("--kv", type=float, default=140.0)
    sp.add_argument("--phase-r", type=float, default=0.45)
    sp.add_argument("--friction", type=float, default=0.02)
    sp.set_defaults(fn=cmd_blade)
    sp = sub.add_parser("slope", help="steepest workable slope: traction and tip-over")
    sp.add_argument("--cg-x", type=float, default=0.133)
    sp.add_argument("--cg-h", type=float, default=0.123)
    sp.add_argument("--mu", type=float, default=0.55)
    sp.set_defaults(fn=cmd_slope)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
