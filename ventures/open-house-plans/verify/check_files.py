"""Read a generated plan set back with independent libraries.

    python3 verify/check_files.py <bundle-dir> [<bundle-dir> ...]

IFC: IfcOpenShell parses the file, its schema validator runs, every product's
geometry is triangulated by IfcOpenShell's geometry kernel, and spaces,
windows and doors are counted against design.json. DXF: ezdxf reads and audits
it. OBJ: vertices and faces are counted and every face index checked. Prints
one line per bundle and exits 1 on any problem. Needs ifcopenshell and ezdxf
(python3 platform/ci/pyenv.py ifcopenshell ezdxf).
"""
import json
import sys
from pathlib import Path


def check_ifc(path, design):
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.validate

    f = ifcopenshell.open(str(path))
    problems = []
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, logger)
    errors = [s for s in logger.statements if s.get("level", "").lower() in ("error",)]
    if errors:
        problems.append(f"{len(errors)} schema errors, first: {errors[0].get('message')}")
    settings = ifcopenshell.geom.settings()
    shapes = failed = 0
    for p in f.by_type("IfcProduct"):
        if not p.Representation:
            continue
        try:
            ifcopenshell.geom.create_shape(settings, p)
            shapes += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            if failed <= 3:
                problems.append(f"no geometry for {p.is_a()} {p.Name}: {e}")
    rooms = design["geometry"]["rooms"]
    spaces = f.by_type("IfcSpace")
    if len(spaces) != len(rooms):
        problems.append(f"{len(spaces)} spaces for {len(rooms)} rooms")
    names = sorted(s.Name for s in spaces)
    if names != sorted(r["name"] for r in rooms):
        problems.append("space names differ from the rooms")
    ops = design["geometry"]["openings"]
    on_outside = [o for o in ops if o["kind"] in ("window", "entry", "slider", "garage") or (o["kind"] == "door" and len(o["rooms"]) == 1)]
    windows = len(f.by_type("IfcWindow"))
    doors = len(f.by_type("IfcDoor"))
    if windows + doors != len(on_outside):
        problems.append(f"{windows} windows + {doors} doors for {len(on_outside)} outside openings")
    if len(f.by_type("IfcRelVoidsElement")) != len(on_outside):
        problems.append("an opening does not void a wall")
    summary = f"IFC {f.schema}: {len(f.by_type('IfcWall'))} walls, {len(spaces)} spaces, {windows} windows, {doors} doors, {len(f.by_type('IfcRoof'))} roof, {shapes} shapes built, {failed} failed, {len(errors)} schema errors"
    return summary, problems


def check_dxf(path):
    import ezdxf

    doc = ezdxf.readfile(str(path))
    auditor = doc.audit()
    msp = doc.modelspace()
    kinds = {}
    for e in msp:
        kinds[e.dxftype()] = kinds.get(e.dxftype(), 0) + 1
    problems = [f"DXF audit: {len(auditor.errors)} errors"] if auditor.has_errors else []
    return f"DXF {doc.dxfversion}: {sum(kinds.values())} entities ({', '.join(f'{k} {v}' for k, v in sorted(kinds.items()))}), layers {len(doc.layers)}", problems


def check_obj(path):
    v = f = 0
    problems = []
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            v += 1
        elif line.startswith("f "):
            f += 1
            for tok in line.split()[1:]:
                i = int(tok.split("/")[0])
                if not 1 <= i <= v:
                    problems.append(f"face index {i} out of range")
                    break
    return f"OBJ: {v} vertices, {f} faces", problems[:3]


def main(dirs):
    bad = 0
    for d in map(Path, dirs):
        design = json.loads((d / "design.json").read_text())
        out, problems = [], []
        for fn, path in ((lambda p: check_ifc(p, design)), d / "model.ifc"), (check_dxf, d / "plan.dxf"), (check_obj, d / "model.obj"):
            s, p = fn(path)
            out.append(s)
            problems += p
        print(f"{d.name}: " + " | ".join(out))
        for p in problems:
            print(f"  PROBLEM: {p}")
        bad += bool(problems)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
