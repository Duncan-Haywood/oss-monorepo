"""Build the plan set for the 480 sq ft accessory dwelling unit: drawings, bill of materials, checks, report, IFC."""
import csv
import json
from pathlib import Path

from house_plan.plan import Params, make_plan
from house_plan.rules import check_layout
from house_plan.takeoff import bom_lines, takeoff

from .analysis import PACKAGES, annual_energy, cost_index, envelope, lateral, roof_option
from .drawings import floor_plan_svg, south_elevation_svg

# One bedroom, 24 x 20 ft, 4:12 roof, 24 in studs and rafters, 16 in joists: chosen by hand from the house-plan
# search's finding that 24 in studs and a 4:12 roof use the least lumber, then checked, not searched.
ADU = Params(width=24.0, depth=20.0, n_bed=1, bed_depth=10.0, pitch=4, stud_oc=24, joist_oc=16, rafter_oc=24)
CLIMATE_SET = ("Houston (2A)", "Baltimore (4A)", "Chicago (5A)", "Minneapolis (6A)")
SYSTEM_SET = ("heat pump", "gas furnace + AC")


def facts(params=ADU):
    plan = make_plan(params)
    t = takeoff(plan)
    env = {k: envelope(plan, v) for k, v in PACKAGES.items()}
    energy = {(c, s, k): annual_energy(env[k], c, s) for c in CLIMATE_SET for s in SYSTEM_SET for k in PACKAGES}
    return {"plan": plan, "takeoff": t, "problems": t["failures"] + check_layout(plan), "lateral": lateral(plan),
            "env": env, "energy": energy, "cost": cost_index(plan),
            "roof": roof_option(plan, t)}


def bom_rows(t):
    rows = [["item", "size", "length_in", "count", "board_feet"]]
    from house_plan.takeoff import NOMINAL, _bf
    for (size, length), n in sorted(t["members"].items(), key=lambda kv: (NOMINAL[kv[0][0]], -kv[0][1])):
        rows.append(["lumber", size, f"{length:.2f}", n, f"{_bf(size, length, n):.1f}"])
    for k, (sf, n) in t["sheets"].items():
        rows.append([f"{k} sheathing", "4x8 sheet", "", n, ""])
    rows.append(["girder post", "not designed", "", t["posts"], ""])
    return rows


def report(f):
    p, t, plan = f["plan"].params, f["takeoff"], f["plan"]
    L = ["# ADU plan set: generated report", "",
         "**Research output, not a design for construction.** Nothing here was reviewed by a licensed architect or engineer or "
         "checked against a building code. A real build needs both, plus a permit.", "",
         f"## Plan\n{p.width:g} x {p.depth:g} ft, {p.width * p.depth:.0f} sq ft, {p.n_bed} bedroom, {p.pitch}:12 roof, "
         f"studs at {p.stud_oc} in, joists at {p.joist_oc} in, rafters at {p.rafter_oc} in.", ""]
    L += [f"- {r.name}: {r.w:g} x {r.d:g} ft, {r.area:.0f} sq ft" for r in plan.rooms]
    L += ["", "Layout and member checks: " + ("all pass" if not f["problems"] else "FAIL: " + "; ".join(f["problems"])), "",
          "## Framing members (from `house-spans` and `house-framing`)", ""]
    L += [f"- {k}: {v}" for k, v in t["sizes"].items()]
    L += [f"- central bearing wall under the ceiling joists: {'yes' if t['central_wall'] else 'no'}",
          f"- {t['total_bf']:.0f} board feet of framing lumber, {t['total_bf'] / t['floor_area']:.2f} per sq ft of floor", "",
          "## Bill of materials", "", "```"] + bom_lines(t) + ["```", "",
          "## Lateral check (`house-structure` coefficients, exterior walls only)", "",
          "Loads: 115 mph wind and Sds = 0.5, as house-structure defaults, not for any site. Nailing is the loosest panel-edge "
          "spacing (inches) of 15/32 sheathing that carries the demand on every wall line of the pair.", "",
          "| direction | load | walls | demand per line, lb | edge nailing | solid wall, ft | max wind, mph |", "|---|---|---|---|---|---|---|"]
    for (d, k), r in f["lateral"].items():
        mv = f"{r['max_v_mph']:.0f}" if r["max_v_mph"] else ""
        L.append(f"| {d} | {k} | {'+'.join(r['walls'])} | {r['need_lb']:.0f} | "
                 f"{r['edge_in'] if r['edge_in'] else 'none carries it'} | {r['solid_ft']:.1f} of {r['wall_ft']:.0f} | {mv} |")
    L += ["", "## Envelope energy (`house-energy` degree-day model; assumed packages and prices)", ""]
    for k, e in f["env"].items():
        parts = ", ".join(f"{n} {v:.1f}" for n, v in e["ua"].items())
        L.append(f"- **{k}**: UA {e['ua_total']:.1f} Btu/h F ({parts}); walls {e['wall_ft2']:.0f} sq ft, windows {e['window_ft2']:.0f}")
    L += ["", "Annual heating and cooling cost, USD (assumed prices of $1.30 per therm and $0.16 per kWh):", "",
          "| climate (stand-in) | system | baseline | tight | saving |", "|---|---|---|---|---|"]
    for c in CLIMATE_SET:
        for s in SYSTEM_SET:
            b, g = f["energy"][(c, s, "baseline")]["annual_cost"], f["energy"][(c, s, "tight")]["annual_cost"]
            L.append(f"| {c} | {s} | {b:.0f} | {g:.0f} | {b - g:.0f} |")
    L += ["", "## Cost index (`house-cost`; no dollar figure)", ""]
    for k, c in f["cost"].items():
        L.append(f"- {k}: price index {c['price_index']:.1f} (construction {c['construction_index']:.1f}), "
                 f"{c['per_sqft_vs_reference']:.0f} per sq ft against 100 for the 2,000 sq ft two-storey reference")
    r = f["roof"]
    L += ["", "## Roof option: trusses against rafters and ceiling joists (`house-truss`)", ""]
    if r["truss"] is None:
        L.append("No 2x4 to 2x8 W truss passes at this span; the stick roof stays.")
    else:
        t = r["truss"]
        L += [f"- stick roof (rafters, {f['takeoff']['sizes']['ceiling']} ceiling joists spanning the full width, ridge): "
              f"{r['stick_bf']:.0f} board feet",
              f"- {r['n_trusses']} W trusses at {p.rafter_oc} in, top {t.top}, bottom {t.bottom}, web {t.web}: "
              f"{r['truss_bf_each']:.1f} bf each, {r['truss_bf']:.0f} board feet",
              f"- trusses use {100 * (1 - r['truss_bf'] / r['stick_bf']):.0f}% less roof lumber "
              f"({r['stick_bf'] - r['truss_bf']:.0f} bf), before connector plates, bracing, waste and a heel detail",
              "- the truss check assumes 30 psf ground-snow roof load on plan (the plan states no site load); a truss is an "
              "engineered, sealed component, so this is a lumber comparison, not a roof design"]
    L += ["", "The index extrapolates a model fitted to a 2,000 sq ft average house to a 480 sq ft one through assumed fixed/area splits; "
          "treat it as a lever, not a price.", ""]
    return "\n".join(L)


def write(outdir, params=ADU, ifc=True):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    f = facts(params)
    (out / "floor-plan.svg").write_text(floor_plan_svg(f["plan"]))
    (out / "south-elevation.svg").write_text(south_elevation_svg(f["plan"]))
    with open(out / "bom.csv", "w", newline="") as fh:
        csv.writer(fh, lineterminator="\n").writerows(bom_rows(f["takeoff"]))
    (out / "report.md").write_text(report(f))
    wrote = ["floor-plan.svg", "south-elevation.svg", "bom.csv", "report.md"]
    if ifc:
        try:
            from house_plan.ifc import export
            export(f["plan"], f["takeoff"], str(out / "adu.ifc"))
            wrote.append("adu.ifc")
        except ImportError:
            pass
    summary = {"area_sqft": params.width * params.depth, "framing_bf": round(f["takeoff"]["total_bf"], 1),
               "roof": {"stick_bf": round(f["roof"]["stick_bf"], 1), "truss_bf": round(f["roof"].get("truss_bf", 0), 1)},
               "problems": f["problems"], "wrote": wrote}
    (out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    return f, summary
