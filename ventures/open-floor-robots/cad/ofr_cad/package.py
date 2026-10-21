"""Build the manufacturing package: one command, one folder (and zip) per variant.

    python -m ofr_cad vacuum --out dist/vacuum

writes

    laser/*.dxf          flat profiles, true mm, one file per part (qty in laser_parts.csv)
    print/*.stl          printed parts (qty and settings in print_parts.csv)
    step/*.step          every made part as a solid, plus assembly.step
    drawings/*.svg       top, side and front views of the assembly
    cut_list.csv         stock to cut to length
    bom.csv              everything: made parts, stock, bought-in parts, fasteners
    manifest.json        parameters, derived numbers, check results, file hashes
    README.txt           how to order it
    ../<variant>-package.zip

The STEP/DXF normalisation, deterministic zip and drawing views are the
Open Tennis Robots generator's (ventures/open-tennis-robots/cad), reused.
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
from . import platform as M
from .params import Robot

# g/cm^3; PETG at ~55% effective infill.
DENSITY = {"aluminium 5052": 2.68, "cast acrylic": 1.19, "PETG": 1.27 * 0.55, "stainless rod": 7.9}


def fasteners(p: Robot) -> list[tuple[str, int, str]]:
    n_tabs = 2 * (len(p.bumper_tabs_deg) + len(p.skirt_tabs_deg))
    casters = 2 if p.has_rear_caster else 1
    rows = [
        ("M3 heat-set insert, 5.7 mm long", 4 * 2 + 4 + 2 * casters + 2 * len(p.cliff_points()) + 8
         + 2 * len(p.skirt_tabs_deg) + (6 if p.has_vacuum else 0) + (4 if p.has_mop else 0), "all printed parts"),
        ("M3 x 8 socket cap screw", 4 + 2 * len(p.cliff_points()) + 4 + 2 * casters
         + (6 if p.has_vacuum else 0) + (4 if p.has_mop else 0), "from under the base into printed parts"),
        ("M3 x 20 socket cap screw", 8, "wheel pod caps"),
        ("M3 x 8 button head", 4 + 2 * len(p.skirt_tabs_deg), "deck to posts; skirt tabs"),
        ("M3 x 12 shoulder screw (4 mm shoulder) + nyloc nut", 2 * len(p.bumper_tabs_deg), "bumper slots"),
        ("M3 x 3 mm nylon spacer", n_tabs, "between base and every tab"),
        ("Compression spring, 5 mm OD x 10 mm, light", 2 * len(p.bumper_tabs_deg), "pushes the bumper out"),
        ("M3 x 10 screw", 4, "electronics carrier on standoffs"),
        ("M2.5 x 8 screw", 4, "lidar to deck"),
    ]
    return rows


COTS_EXTRA = [
    ("Raspberry Pi Zero 2 W + 16 GB microSD", 1, "planner, lidar localisation"),
    ("ESP32-S3-DevKitC-1 (N8, no PSRAM)", 1, "firmware/esp32: motors and safety"),
    ("DRV8871 motor driver breakout", 2, "one per wheel"),
    ("PCA9685 16-channel PWM board", 1, "fan, brushes, pump, vibration; OE pin = hard enable"),
    ("Logic-level N-MOSFET module (IRLZ44N class) + flyback diode", 4, "brush, side brush, pump, vibration"),
    ("5 V 3 A buck converter", 1, "Pi and lidar"),
    ("4S BMS, 10 A, with balance leads", 1, "if the pack has none"),
    ("Blade fuse 7.5 A + inline holder", 1, "battery positive, before the switch"),
    ("Rocker switch, 10 A DC", 1, "main power"),
    ("16 mm momentary panel button, NC", 1, "stop button on the deck"),
    ("Microswitch with roller lever", 4, "two per bumper side behind the bumper, plus two as wheel-drop / lift switches"),
    ("10k NTC thermistor", 1, "taped to the battery pack"),
    ("BNO085 (or similar) IMU", 1, "yaw for odometry"),
    ("Charging contacts (spring pogo pair) + 16.8 V 2 A Li-ion charger", 1, "dock; charger must be a certified unit"),
    ("Silicone wire 18 AWG / 24 AWG, JST-XH connectors", 1, "wiring"),
]
VACUUM_COTS = [("Filter pad 55 x 95 mm (cut from a replacement HEPA sheet)", 2, "under the bin lid"),
               ("Reed switch + 6 mm magnet", 1, "bin present"),
               ("GT2 belt, 6 mm, and two pulleys", 1, "brush motor to roller"),
               ("Foam gasket strip 5 mm", 1, "duct to bin")]
MOP_COTS = [("Silicone tube 2 x 4 mm, 300 mm", 1, "tank to pump to pad"),
            ("Float switch, small", 1, "tank empty"),
            ("Shaft collar, 6 mm", 2, "servo horn lifts the rod by these")]

README = """Open Floor Robots: {title} manufacturing package (generator v{version})

Generated from parameters in manifest.json. Rebuild after any change:
    python -m ofr_cad {variant} --out dist/{variant}

ORDER
1. laser/      Upload the DXFs to any laser cutting service. The base is
               aluminium 5052, the deck cast acrylic (laser_parts.csv has
               material and thickness per part). Units are millimetres.
               No bends or tapped holes. All holes are clearance holes.
2. print/      Print the STLs in PETG (settings in print_parts.csv).
               Every part fits a 220 x 220 mm bed.
3. cut_list.csv  Cut rod to length.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py
               before cutting: the motor, wheel, caster, fan, pump and
               lidar are the sizes this package was drawn around.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
{checks}

STATUS
Design v0.1, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. Lithium packs can
burn: use a pack with a BMS, the fuse, and a certified charger.
"""


def collisions(parts, tol_mm3: float = 1.0) -> list[str]:
    return clashes([(f"{part.name}[{i}]", s) for part in parts for i, s in enumerate(part.placed())], tol_mm3)


def clashes(named, tol_mm3: float = 1.0, only=None) -> list[str]:
    """Pairs that intersect by more than tol_mm3; with `only`, just pairs involving those names."""
    placed = [(n, s, s.bounding_box()) for n, s in named]
    out = []
    for (na, a, ba), (nb, b, bb) in combinations(placed, 2):
        if only is not None and na not in only and nb not in only:
            continue
        if (ba.max.X <= bb.min.X or bb.max.X <= ba.min.X or ba.max.Y <= bb.min.Y or bb.max.Y <= ba.min.Y
                or ba.max.Z <= bb.min.Z or bb.max.Z <= ba.min.Z):
            continue
        v = (a & b).volume
        if v > tol_mm3:
            out.append(f"{na} x {nb}: {v:.0f} mm^3")
    return out


def lift_sweep(p: Robot, parts) -> list[str]:
    """With the pad lifted, the moving parts must still clear everything."""
    if not p.has_mop:
        return []
    named, moving = [], set()
    for part in parts:
        for i, s in enumerate(part.placed()):
            n = f"{part.name}[{i}]"
            if part.lifts:
                s = s.moved(Location((0, 0, p.lift)))
                moving.add(n)
            named.append((n, s))
    return [f"pad lifted {p.lift:g} mm: {c}" for c in clashes(named, only=moving)]


def bumper_sweep(p: Robot, parts) -> list[str]:
    """Pressed in by its full travel, head-on and from 45 degrees, the bumper must hit nothing inside."""
    out = []
    for name, sign in (("bumper_left", 1), ("bumper_right", -1)):
        part = next(x for x in parts if x.name == name)
        t = p.bumper_travel
        for label, d in (("head-on", (-t, 0)), ("45 deg", (-t * 0.7071, -sign * t * 0.7071))):
            moved = part.shape.moved(Location((d[0], d[1], 0)))
            named = [(f"{name} pressed {label}", moved)] + [
                (f"{x.name}[{i}]", s) for x in parts if x.name != name for i, s in enumerate(x.placed())]
            out += clashes(named, only={f"{name} pressed {label}"})
    return out


def ground_contacts(parts, want=("wheel", "ball_caster", "mop_pad")) -> dict[str, float]:
    out = {}
    for part in parts:
        if part.name in want:
            out[part.name] = min(s.bounding_box().min.Z for s in part.placed())
    return out


def balance(p: Robot, parts) -> tuple[tuple[float, float], float, list[str]]:
    """Centre of mass (tank full, pad lifted) and whether the robot rests on its casters, not its tail."""
    made = []
    for part in parts:
        if part.material in DENSITY:
            for s in part.placed():
                c = s.center()
                made.append((DENSITY[part.material] * s.volume / 1000, c.X, c.Y))
    com = p.centre_of_mass(made)
    total = sum(m for m, _, _ in made) + sum(m for _, m, _, _ in p.bought_masses())
    bad = []
    lo = p.rear_caster_x + 10 if p.has_rear_caster else 10.0
    if not lo < com[0] < p.caster_x - 10:
        where = "between the casters" if p.has_rear_caster else "ahead of the axle"
        bad.append(f"centre of mass at x = {com[0]:.0f} mm is not {where}: the robot would tip")
    if abs(com[1]) > 20:
        bad.append(f"centre of mass is {com[1]:.0f} mm off the centre line")
    return com, total, bad


_FIXED_GUID = "{00000000-0000-0000-0000-000000000000}"


def normalise(path: Path) -> None:
    """Strip build timestamps and random GUIDs so the same parameters give byte-identical files.

    That lets CI rebuild the package and prove the committed copy is current.
    """
    text = path.read_text(errors="surrogateescape")
    if path.suffix == ".step":
        text = re.sub(r"(FILE_NAME\('[^']*',')[^']*'", r"\g<1>2000-01-01T00:00:00'", text)
        # OpenCascade numbers assembly occurrences with a per-process counter.
        counter = iter(range(1, 10 ** 9))
        text = re.sub(r"NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'",
                      lambda _m: f"NEXT_ASSEMBLY_USAGE_OCCURRENCE('{next(counter)}'", text)
        text = re.sub(r"\r?\n[ \t]+", "", text)  # unwrap: line breaks depend on id widths
    elif path.suffix == ".dxf":
        text = re.sub(r"(\$TDU?(?:CREATE|UPDATE)\r?\n\s*40\r?\n)[0-9.]+", r"\g<1>2451544.5", text)
        text = re.sub(r"\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}", _FIXED_GUID, text)
        text = re.sub(r"(\d+\.\d+\.\d+) @ \d{4}-\d\d-\d\dT[0-9:.+]+", r"\1 @ 2000-01-01T00:00:00+00:00", text)
        text = _sort_dxf_classes(text)
    path.write_text(text, errors="surrogateescape")


def _sort_dxf_classes(text: str) -> str:
    """ezdxf writes the CLASSES section in set order, which varies with Python's hash seed."""
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


def build(out: Path, p: Robot = Robot(), *, drawings: bool = True, zip_it: bool = True) -> dict:
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    for d in ("laser", "print", "step", "drawings"):
        (out / d).mkdir(parents=True)
    parts = M.all_parts(p)
    com, mass_g, balance_rules = balance(p, parts)
    rules = p.check() + balance_rules
    clash = collisions(parts) + lift_sweep(p, parts) + bumper_sweep(p, parts)
    contacts = ground_contacts(parts)
    ground_ok = all(abs(z) < 0.05 for z in contacts.values())

    laser_rows, print_rows, cut_rows, bom_rows = [], [], [], []
    for part in parts:
        if part.kind in ("laser", "print"):
            export_step(part.shape, str(out / "step" / f"{part.name}.step"))
        if part.kind == "laser":
            fname = f"{part.name}__{part.material.replace('cast ', '').split()[0]}_{part.thickness:g}mm.dxf"
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
            export_stl(part.shape, str(out / "print" / fname), tolerance=0.05, angular_tolerance=0.2)
            bb = part.shape.bounding_box()
            print_rows.append({"file": fname, "part": part.name, "qty": part.qty, "material": part.material,
                               "volume_cm3": round(part.shape.volume / 1000, 1),
                               "size_mm": f"{bb.size.X:.0f} x {bb.size.Y:.0f} x {bb.size.Z:.0f}",
                               "settings": "0.2 mm layers, 4 walls, 40% gyroid", "notes": part.notes})
        elif part.kind == "stock":
            cut_rows.append({"part": part.name, "qty": part.qty, "stock": part.spec, "notes": part.notes})
        bom_rows.append({"item": part.name, "kind": part.kind, "qty": part.qty,
                         "what": part.spec or f"{part.material}" + (f" {part.thickness:g} mm" if part.thickness else ""),
                         "notes": part.notes})
    extra = COTS_EXTRA + (VACUUM_COTS if p.has_vacuum else []) + (MOP_COTS if p.has_mop else [])
    for name, qty, note in fasteners(p) + extra:
        bom_rows.append({"item": name, "kind": "cots", "qty": qty, "what": name, "notes": note})

    def write_csv(name, rows, fields):
        with open(out / name, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

    write_csv("laser_parts.csv", laser_rows, list(laser_rows[0].keys()))
    write_csv("print_parts.csv", print_rows, list(print_rows[0].keys()))
    write_csv("cut_list.csv", cut_rows, ["part", "qty", "stock", "notes"])
    write_csv("bom.csv", bom_rows, list(bom_rows[0].keys()))

    assembly = Compound(children=[s for part in parts for s in part.placed()])
    export_step(assembly, str(out / "step" / "assembly.step"))
    if drawings:
        _drawings(assembly, out / "drawings")

    dia, height = p.overall
    checks = [
        f"design rules: {'pass' if not rules else '; '.join(rules)}",
        f"collisions between parts: {'none' if not clash else '; '.join(clash)}",
        f"ground contact ({', '.join(sorted(contacts))} at z=0): {'pass' if ground_ok else contacts}",
        f"centre of mass (tank full, pad up): x = {com[0]:.0f} mm, y = {com[1]:.0f} mm",
        f"overall: {dia:.0f} mm across, {height:.0f} mm tall with lidar ({p.deck_top:.0f} mm without), track {p.track:.0f} mm",
        f"cliff sensors lead the wheels by {p.cliff_lead:.0f} mm",
    ]
    if p.has_vacuum:
        checks.append(f"bin: {p.bin_ml():.0f} ml inside; side brush reaches {p.side_brush_reach:.0f} mm from the centre")
    if p.has_mop:
        checks.append(f"tank: {p.tank_ml():.0f} ml inside; pad {p.mop_x1 - p.mop_x0:.0f} x {2 * p.mop_half_y:.0f} mm, lift {p.lift:g} mm")
    checks.append(f"estimated mass: {mass_g / 1000:.2f} kg (made parts from volume, bought-in parts typical)")
    derived = {"track_mm": p.track, "overall_mm": [round(dia), round(height)], "cliff_lead_mm": round(p.cliff_lead, 1),
               "bin_ml": round(p.bin_ml()), "tank_ml": round(p.tank_ml()),
               "side_brush_reach_mm": round(p.side_brush_reach, 1) if p.has_vacuum else None,
               "centre_of_mass_mm": [round(com[0], 1), round(com[1], 1)], "mass_kg": round(mass_g / 1000, 2)}
    titles = {"vacuum": "robot vacuum", "mop": "robot mop", "combo": "robot vacuum-mop combo"}
    (out / "README.txt").write_text(README.format(title=titles[p.variant], version=__version__, variant=p.variant,
                                                  checks="\n".join("- " + c for c in checks)))
    manifest = {
        "generator": f"ofr_cad {__version__}",
        "variant": p.variant,
        "params": {k: v for k, v in asdict(p).items()},
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
