"""Build the manufacturing package: one command, one folder (and zip) to send to fabricators.

    python -m orm_cad mower --out dist/mower
    python -m orm_cad dock --out dist/dock

writes

    laser/*.dxf          flat profiles, true mm, one file per part (qty in laser_parts.csv)
    print/*.stl          printed parts (qty and settings in print_parts.csv)
    step/*.step          every made part as a solid, plus assembly.step
    drawings/*.svg       top, side and front views of the assembly
    cut_list.csv         stock to cut to length
    bom.csv              everything: made parts, stock, bought-in parts, fasteners
    manifest.json        parameters, derived numbers, check results, file hashes
    README.txt           how to order it
    ../mower-package.zip

The file normalisation and deterministic zip are the same as Open Tennis
Robots' generator (ventures/open-tennis-robots/cad/otr_cad/package.py), so
CI can rebuild the package and prove the committed copy is current.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import zipfile
from dataclasses import asdict
from itertools import combinations
from pathlib import Path

from build123d import Compound, ExportDXF, ExportSVG, LineType, Location, Unit, export_step, export_stl

from . import __version__
from . import dock as D
from . import mower as M
from .params import Dock, Mower, fits_bed

DENSITY = {"aluminium 5052": 2.68, "ASA": 1.07 * 0.5, "steel threaded rod": 7.9 * 0.8,
           "aluminium tube": 2.7 * 0.35}  # g/cm^3; ASA at ~50% effective infill, tube at 1.5 mm wall

# Bought-in masses for the centre-of-mass estimate (grams; typical, check yours).
COTS_MASS_G = {"gearmotor": 350, "wheel": 450, "caster_wheel": 90, "battery": 1400, "electronics": 450,
               "gnss_antenna": 150, "blade_motor": 300, "stop_button": 60, "standoff": 5, "rubber_mount": 15,
               "rain_sensor": 10, "blade_sweep": 9}


def clashes(named: list[tuple[str, object]], tol_mm3: float = 1.0, against: list[tuple[str, object]] | None = None) -> list[str]:
    """Pairs of solids that overlap by more than tol_mm3. With `against`, only pairs across the two lists."""
    def boxed(items):
        return [(n, s, s.bounding_box()) for n, s in items]
    pairs = combinations(boxed(named), 2) if against is None else (
        (a, b) for a in boxed(named) for b in boxed(against))
    out = []
    for (na, a, ba), (nb, b, bb) in pairs:
        if (ba.max.X <= bb.min.X or bb.max.X <= ba.min.X or ba.max.Y <= bb.min.Y or bb.max.Y <= ba.min.Y
                or ba.max.Z <= bb.min.Z or bb.max.Z <= ba.min.Z):
            continue
        v = (a & b).volume
        if v > tol_mm3:
            out.append(f"{na} x {nb}: {v:.0f} mm^3")
    return out


def _named(parts, groups=None):
    return [(f"{part.name}[{i}]", s) for part in parts if groups is None or part.group in groups
            for i, s in enumerate(part.placed())]


def collisions(parts) -> list[str]:
    """Every pair that overlaps, except pairs that both spin with the blade (they turn as one)."""
    spinning = [x for x in parts if x.group == "rotating"]
    rest = [x for x in parts if x.group != "rotating"]
    return clashes(_named(rest)) + (clashes(_named(spinning), against=_named(rest)) if spinning else [])


def height_sweep(p: Mower) -> list[str]:
    """Clashes at every cut-height setting between the parts that move with it and everything else."""
    out = []
    for h in p.cut_steps:
        parts = M.all_parts(p, h)
        moving = [x for x in parts if x.name in ("height_plate",) or x.group == "rotating"]
        fixed = [x for x in parts if x not in moving]
        out += [f"at {h:g} mm: {c}" for c in clashes(_named(moving), against=_named(fixed))]
    return out


def shell_travel(p: Mower, parts) -> list[str]:
    """Push the shell (and what rides on it) by its bump travel each way: it must touch nothing."""
    shell = [x for x in parts if x.group == "shell"]
    fixed = [x for x in parts if x.group not in ("shell", "flex")]
    out = []
    t = p.shell_travel
    for dx, dy, dz in ((t, 0, 0), (-t, 0, 0), (0, t, 0), (0, -t, 0), (0, 0, t)):
        moved = [(n, s.moved(Location((dx, dy, dz)))) for n, s in _named(shell)]
        out += [f"shell moved ({dx:+g}, {dy:+g}, {dz:+g}): {c}" for c in clashes(moved, against=_named(fixed))]
    return out


def ground_contacts(parts, want) -> dict[str, float]:
    out = {}
    for part in parts:
        if part.name in want:
            out[part.name] = min(s.bounding_box().min.Z for s in part.placed())
    return out


def ground_clearance(parts, wheels) -> float:
    return min(s.bounding_box().min.Z for part in parts if part.name not in wheels for s in part.placed())


def centre_of_mass(parts) -> tuple[float, float, float, float]:
    """(mass kg, x, y, z mm): made parts from their volume, bought-in parts from COTS_MASS_G."""
    m = mx = my = mz = 0.0
    for part in parts:
        for s in part.placed():
            if part.material in DENSITY:
                g = DENSITY[part.material] * s.volume / 1000
            else:
                g = COTS_MASS_G.get(part.name, 0.0)
            c = s.center()
            m += g
            mx += g * c.X
            my += g * c.Y
            mz += g * c.Z
    return m / 1000, mx / m, my / m, mz / m


_FIXED_GUID = "{00000000-0000-0000-0000-000000000000}"


def normalise(path: Path) -> None:
    """Strip build timestamps and random GUIDs so the same parameters give byte-identical files."""
    text = path.read_text(errors="surrogateescape")
    if path.suffix == ".step":
        text = re.sub(r"(FILE_NAME\('[^']*',')[^']*'", r"\g<1>2000-01-01T00:00:00'", text)
        counter = iter(range(1, 10 ** 9))
        text = re.sub(r"NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'",
                      lambda _m: f"NEXT_ASSEMBLY_USAGE_OCCURRENCE('{next(counter)}'", text)
        text = re.sub(r"\r?\n[ \t]+", "", text)
    elif path.suffix == ".dxf":
        text = re.sub(r"(\$TDU?(?:CREATE|UPDATE)\r?\n\s*40\r?\n)[0-9.]+", r"\g<1>2451544.5", text)
        text = re.sub(r"\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}", _FIXED_GUID, text)
        text = re.sub(r"(\d+\.\d+\.\d+) @ \d{4}-\d\d-\d\dT[0-9:.+]+", r"\1 @ 2000-01-01T00:00:00+00:00", text)
        text = _sort_dxf_classes(text)
    path.write_text(text, errors="surrogateescape")


def _sort_dxf_classes(text: str) -> str:
    m = re.search(r"(  0\r?\nSECTION\r?\n  2\r?\nCLASSES\r?\n)(.*?)(  0\r?\nENDSEC)", text, re.S)
    if not m:
        return text
    blocks = re.split(r"(?=  0\r?\nCLASS\r?\n)", m.group(2))
    blocks = sorted(b for b in blocks if b)
    return text[:m.start(2)] + "".join(blocks) + text[m.end(2):]


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _cut_length(face) -> float:
    return sum(e.length for e in face.edges())


README = """Open Robot Mower: {robot} manufacturing package (generator v{version})

Generated from parameters in manifest.json. Rebuild after any change:
    python -m orm_cad {robot} --out dist/{robot}

ORDER
1. laser/      Upload the DXFs to any laser or waterjet cutting service.
               Material and thickness per part are in laser_parts.csv
               (and in each file name). Units are millimetres.
               No bends or tapped holes. All holes are clearance holes.
2. print/      Print or order the STLs in ASA (settings in print_parts.csv).
               Every part fits a 256 x 256 x 256 mm bed.
3. cut_list.csv  Cut rod and tube to length.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py
               before cutting: the parts were drawn around those sizes.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
{checks}

STATUS
Design v0.1, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. A mower blade can cause
serious injury: never power the blade motor with the guard off, and
bench-test with the blade disc removed.
"""


def build(out: Path, p: Mower | Dock = Mower(), *, drawings: bool = True, zip_it: bool = True) -> dict:
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    for d in ("laser", "print", "step", "drawings"):
        (out / d).mkdir(parents=True)
    is_dock = isinstance(p, Dock)
    rules = p.check()
    if is_dock:
        parts, extra = D.all_parts(p), []
        fasteners_, cots = D.fasteners(p), D.COTS_EXTRA
        clash = collisions(parts)
        # Dock the default mower and check it fits: nothing it carries may hit the dock.
        clash += clashes(D.docked_mower(p), against=_named([x for x in parts if x.name != "contact_strip"]))
        if D.contact_overlap(p) < 6:
            rules = rules + [f"contact strips overlap the mower's contacts by only {D.contact_overlap(p):.1f} mm"]
        contacts = ground_contacts(parts, ("base_plate",))
    else:
        parts, extra = M.all_parts(p), M.made_only(p)
        fasteners_, cots = M.fasteners(p), M.COTS_EXTRA
        clash = collisions(parts) + height_sweep(p) + shell_travel(p, parts)
        contacts = ground_contacts(parts, ("wheel", "caster_wheel"))
    ground_ok = all(abs(z) < 0.05 for z in contacts.values())

    laser_rows, print_rows, cut_rows, bom_rows = [], [], [], []
    bed_bad = []
    for part in parts + extra:
        if part.kind in ("laser", "print"):
            export_step(part.shape, str(out / "step" / f"{part.name}.step"))
        if part.kind == "laser":
            fname = f"{part.name}__{part.material.split()[0]}_{part.thickness:g}mm.dxf"
            dxf = ExportDXF(unit=Unit.MM)
            dxf.add_shape(part.flat)
            dxf.write(str(out / "laser" / fname))
            bb = part.flat.bounding_box()
            holes = len(part.flat.faces()[0].inner_wires()) if part.flat.faces() else 0
            laser_rows.append({"file": fname, "part": part.name, "qty": part.qty, "material": part.material,
                               "thickness_mm": part.thickness, "width_mm": round(bb.size.X, 1),
                               "height_mm": round(bb.size.Y, 1), "area_cm2": round(part.flat.area / 100, 1),
                               "cut_length_mm": round(_cut_length(part.flat)), "holes_and_cutouts": holes,
                               "notes": part.notes})
        elif part.kind == "print":
            fname = f"{part.name}.stl"
            export_stl(part.shape, str(out / "print" / fname))
            bb = part.shape.bounding_box()
            size = (bb.size.X, bb.size.Y, bb.size.Z)
            if not fits_bed(size, p.bed, p.bed_margin):
                bed_bad.append(f"{part.name} {bb.size.X:.0f} x {bb.size.Y:.0f} x {bb.size.Z:.0f} mm")
            print_rows.append({"file": fname, "part": part.name, "qty": part.qty, "material": part.material,
                               "volume_cm3": round(part.shape.volume / 1000, 1),
                               "size_mm": f"{bb.size.X:.0f} x {bb.size.Y:.0f} x {bb.size.Z:.0f}",
                               "settings": "0.2 mm layers, 4 walls, 40% gyroid" if part.group != "shell" else
                               "0.24 mm layers, 3 walls, 15% gyroid",
                               "notes": part.notes})
        elif part.kind == "stock":
            cut_rows.append({"part": part.name, "qty": part.qty, "stock": part.spec, "notes": part.notes})
        bom_rows.append({"item": part.name, "kind": part.kind, "qty": part.qty,
                         "what": part.spec or f"{part.material}" + (f" {part.thickness:g} mm" if part.thickness else ""),
                         "notes": part.notes})
    if bed_bad:
        rules = rules + [f"does not fit the printer bed: {b}" for b in bed_bad]
    for name, qty, note in fasteners_ + cots:
        bom_rows.append({"item": name, "kind": "cots", "qty": qty, "what": name, "notes": note})

    def write_csv(name, rows):
        with open(out / name, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)

    write_csv("laser_parts.csv", laser_rows)
    write_csv("print_parts.csv", print_rows)
    if cut_rows:
        write_csv("cut_list.csv", cut_rows)
    write_csv("bom.csv", bom_rows)

    assembly = Compound(children=[s for part in parts for s in part.placed()])
    export_step(assembly, str(out / "step" / "assembly.step"))
    if drawings:
        _drawings(assembly, out / "drawings")

    mass, cx, cy, cz = centre_of_mass(parts)
    if is_dock:
        robot = "dock"
        checks = [
            f"design rules: {'pass' if not rules else '; '.join(rules)}",
            f"collisions between parts: {'none' if not clash else '; '.join(clash)}",
            f"base plate on the ground: {'pass' if ground_ok else contacts}",
            f"default mower docked (contacts touching): no part of it hits the dock: {'pass' if not clash else 'see collisions'}",
            f"contact strips {2 * p.contact_half_y:g} mm apart, overlapping the mower's contact pockets by {D.contact_overlap(p):.0f} mm",
            f"made-part mass (estimate): {mass:.1f} kg",
        ]
        derived = {"contact_z_mm": p.contact_z, "contact_spacing_mm": 2 * p.contact_half_y,
                   "made_part_mass_kg": round(mass, 2)}
    else:
        robot = "mower"
        L, W, H = p.overall
        clear = ground_clearance(parts, ("wheel", "caster_wheel", "caster_fork", "blade_sweep", "blade_disc"))
        checks = [
            f"design rules: {'pass' if not rules else '; '.join(rules)}",
            "collisions between parts (rotating parts with "
            f"{p.rotating_clearance:g} mm running clearance), at every cut height {p.cut_min:g}-{p.cut_max:g} mm, "
            f"and with the shell pushed {p.shell_travel:g} mm each way: {'none' if not clash else '; '.join(clash)}",
            f"ground contact (rear wheels, casters at z=0): {'pass' if ground_ok else contacts}",
            f"every printed part fits a {p.bed[0]:g} mm bed: {'pass' if not bed_bad else '; '.join(bed_bad)}",
            f"cut width {p.cut_width:g} mm; cut height {p.cut_min:g}-{p.cut_max:g} mm in 5 mm steps",
            f"blade tips to guard wall: {p.guard_r_in - p.blade_tip_r:g} mm; guard bottom {p.guard_bottom:g} mm "
            f"off the ground, {p.cut_min - p.guard_bottom:g} mm below the blade at the lowest cut",
            f"shell edge to blade-tip circle: {p.edge_to_blade():g} mm (design rule: at least 100)",
            f"lowest fixed part above the ground (guard): {clear:.0f} mm",
            f"overall: {L:.0f} x {W:.0f} mm, {H:.0f} mm to the antenna top; track {p.track:g} mm, wheelbase {p.wheelbase:g} mm",
            f"mass estimate (made parts by volume, bought-in parts typical): {mass:.1f} kg; "
            f"centre of mass x={cx:.0f} y={cy:.0f} z={cz:.0f} mm",
        ]
        derived = {"cut_width_mm": p.cut_width, "cut_heights_mm": p.cut_steps, "track_mm": p.track,
                   "wheelbase_mm": p.wheelbase, "overall_mm": [round(L), round(W), round(H)],
                   "guard_clearance_mm": p.guard_r_in - p.blade_tip_r, "edge_to_blade_mm": p.edge_to_blade(),
                   "ground_clearance_mm": round(clear, 1), "mass_estimate_kg": round(mass, 2),
                   "centre_of_mass_mm": [round(cx), round(cy), round(cz)]}
    (out / "README.txt").write_text(README.format(robot=robot, version=__version__,
                                                  checks="\n".join("- " + c for c in checks)))
    manifest = {
        "generator": f"orm_cad {__version__}",
        "robot": robot,
        "params": {k: v for k, v in asdict(p).items() if k != "notes"},
        "derived": derived,
        "design_rules": rules,
        "collisions": clash,
        "ground_contacts_z_mm": {k: round(v, 3) for k, v in contacts.items()},
        "files": {},
    }
    for f in sorted(out.rglob("*")):
        if f.suffix in (".step", ".dxf"):
            normalise(f)
    for f in sorted(out.rglob("*")):
        if f.is_file() and f.name != "manifest.json":
            manifest["files"][str(f.relative_to(out))] = _sha(f)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if zip_it:
        write_zip(out, out.parent / f"{out.name}-package.zip")
    return manifest


def write_zip(folder: Path, dest: Path) -> None:
    """Deterministic zip: sorted names, fixed timestamps, fixed permissions."""
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(folder.rglob("*")):
            if f.is_file():
                info = zipfile.ZipInfo(f"{folder.name}/{f.relative_to(folder).as_posix()}", (2000, 1, 1, 0, 0, 0))
                info.external_attr = 0o644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, f.read_bytes())


def _drawings(assembly, folder: Path) -> None:
    views = {"top": ((0, 0, 2000), (0, 1, 0)), "side": ((0, -2000, 0), (0, 0, 1)), "front": ((2000, 0, 0), (0, 0, 1))}
    for name, (origin, up) in views.items():
        visible, hidden = assembly.project_to_viewport(origin, up)
        size = max(*(abs(v) for v in assembly.bounding_box().size))
        svg = ExportSVG(scale=600 / size)
        svg.add_layer("visible", line_weight=0.4)
        svg.add_layer("hidden", line_color=(160, 160, 160), line_type=LineType.ISO_DOT, line_weight=0.2)
        svg.add_shape(visible, layer="visible")
        svg.add_shape(hidden, layer="hidden")
        svg.write(str(folder / f"assembly_{name}.svg"))

