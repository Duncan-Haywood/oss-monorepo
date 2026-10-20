"""Build the manufacturing package: one command, one folder (and zip) to send to fabricators.

    python -m otr_cad collector --out dist/collector

writes

    laser/*.dxf          flat profiles, true mm, one file per part (qty in laser_parts.csv)
    print/*.stl          printed parts (qty and settings in print_parts.csv)
    step/*.step          every made part as a solid, plus assembly.step
    drawings/*.svg       top, side and front views of the assembly
    cut_list.csv         stock to cut to length
    bom.csv              everything: made parts, stock, bought-in parts, fasteners
    manifest.json        parameters, derived numbers, design-rule and collision results, file hashes
    README.txt           how to order it
    ../collector-package.zip
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

from build123d import Compound, ExportDXF, ExportSVG, LineType, Unit, export_step, export_stl

from . import __version__
from . import collector as C
from .params import Collector

DENSITY = {"aluminium 5052": 2.68, "PETG": 1.27 * 0.55, "spring-steel (music) wire": 7.85,
           "aluminium tube": 2.7 * 0.28}  # g/cm^3; PETG at ~55% effective infill, tube at 1.5 mm wall


def fasteners(p: Collector) -> list[tuple[str, int, str]]:
    clamp_bolts = len(C._clamp_bolts(p))
    cover_bolts = len(C._cover_bolts(p))
    return [
        ("M4 x 50 socket cap screw", 8, "motor clamp caps"),
        ("M4 x 12 socket cap screw", 4 + 4 + 4 + 4, "clamp cradles, pivot blocks, caster adapter, mast socket (from below)"),
        ("M4 heat-set insert, 5.7 mm long", 8 + 4 + 4 + 4 + 4, "all printed parts"),
        ("M4 x 12 button head + nyloc nut", 2 * clamp_bolts, "rod clamp rings"),
        ("M5 x 12 button head", cover_bolts, "fixed drum cover"),
        ("M5 thumb screw, 12 mm", cover_bolts, "hatch drum cover"),
        ("M5 rivet nut (blind insert), aluminium", 2 * cover_bolts, "drum discs, for the covers"),
        ("M8 x 25 shoulder bolt + nyloc nut", 4, "yoke pivots and drum axles"),
        ("M8 washer, 3 mm stack", 4, "spacer between drum cover and arm"),
        ("608 (or F608) bearing, 8 x 22 x 7", 2, "drum hubs"),
        ("M3 x 8 screw", 8, "tray standoffs"),
        ("M2.5 x 6 screw + 6 mm standoff", 4, "Raspberry Pi"),
        ("Ball caster mounting screws", 1, "to suit the caster bought"),
    ]


COTS_EXTRA = [
    ("Raspberry Pi 5 (4 GB) or Pi 4", 1, "vision + planning"),
    ("Wide-angle camera module + 1 m ribbon/USB", 1, "on the mast"),
    ("ESP32 dev board (ESP32-WROOM-32)", 1, "firmware/esp32"),
    ("Dual DC motor driver, 10 A/ch, PWM+DIR", 1, "e.g. Cytron MDD10A class"),
    ("5 V 5 A buck converter", 1, "Pi supply"),
    ("22 mm NC mushroom e-stop + 24 V contactor", 1, "hard power cut"),
    ("Lever microswitch", 2, "yoke-lift bumper sensing"),
    ("BNO085 (or similar) IMU", 1, "yaw"),
    ("25 mm hook-and-loop strap, 600 mm", 1, "battery"),
    ("15 A blade fuse + holder", 1, "battery positive"),
]

README = """Open Tennis Robots: collector manufacturing package (generator v{version})

Generated from parameters in manifest.json. Rebuild after any change:
    python -m otr_cad collector --out dist/collector

ORDER
1. laser/      Upload the DXFs to any laser or waterjet cutting service.
               Material and thickness per part are in laser_parts.csv
               (and in each file name). Units are millimetres.
               No bends or tapped holes. All holes are clearance holes.
2. print/      Print or order the STLs in PETG (settings in print_parts.csv).
3. cut_list.csv  Cut wire, tube and bar to length.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py
               before cutting: the motor, wheel, bearing and caster sizes
               are the ones this package was drawn around.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
{checks}

STATUS
Design v0.2, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. You are responsible
for building and operating this safely.
"""


def collisions(parts: list[C.Part], tol_mm3: float = 1.0) -> list[str]:
    placed = []
    for part in parts:
        for i, s in enumerate(part.placed()):
            placed.append((f"{part.name}[{i}]", s, s.bounding_box()))
    out = []
    for (na, a, ba), (nb, b, bb) in combinations(placed, 2):
        if (ba.max.X <= bb.min.X or bb.max.X <= ba.min.X or ba.max.Y <= bb.min.Y or bb.max.Y <= ba.min.Y
                or ba.max.Z <= bb.min.Z or bb.max.Z <= ba.min.Z):
            continue
        v = (a & b).volume
        if v > tol_mm3:
            out.append(f"{na} x {nb}: {v:.0f} mm^3")
    return out


def ground_contacts(parts: list[C.Part]) -> dict[str, float]:
    """Lowest z of each part that should touch the ground."""
    want = {"wheel", "ball_caster", "drum_disc"}
    out = {}
    for part in parts:
        if part.name in want:
            out[part.name] = min(s.bounding_box().min.Z for s in part.placed())
    return out


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


def build(out: Path, p: Collector = Collector(), *, drawings: bool = True, zip_it: bool = True) -> dict:
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    for d in ("laser", "print", "step", "drawings"):
        (out / d).mkdir(parents=True)
    rules = p.check()
    parts = C.all_parts(p)
    clashes = collisions(parts)
    contacts = ground_contacts(parts)
    ground_ok = all(abs(z) < 0.05 for z in contacts.values())

    laser_rows, print_rows, cut_rows, bom_rows = [], [], [], []
    mass_g = 0.0
    for part in parts:
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
            print_rows.append({"file": fname, "part": part.name, "qty": part.qty, "material": part.material,
                               "volume_cm3": round(part.shape.volume / 1000, 1),
                               "size_mm": f"{bb.size.X:.0f} x {bb.size.Y:.0f} x {bb.size.Z:.0f}",
                               "settings": "0.2 mm layers, 4 walls, 40% gyroid", "notes": part.notes})
        elif part.kind == "stock":
            cut_rows.append({"part": part.name, "qty": part.qty, "stock": part.spec, "notes": part.notes})
        if part.material in DENSITY:
            mass_g += DENSITY[part.material] * part.shape.volume / 1000 * part.qty
        bom_rows.append({"item": part.name, "kind": part.kind, "qty": part.qty,
                         "what": part.spec or f"{part.material}" + (f" {part.thickness:g} mm" if part.thickness else ""),
                         "notes": part.notes})
    for name, qty, note in fasteners(p) + COTS_EXTRA:
        bom_rows.append({"item": name, "kind": "cots", "qty": qty, "what": name, "notes": note})

    def write_csv(name, rows):
        with open(out / name, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)

    write_csv("laser_parts.csv", laser_rows)
    write_csv("print_parts.csv", print_rows)
    write_csv("cut_list.csv", cut_rows)
    write_csv("bom.csv", bom_rows)

    assembly = Compound(children=[s for part in parts for s in part.placed()])
    export_step(assembly, str(out / "step" / "assembly.step"))
    if drawings:
        _drawings(assembly, out / "drawings")

    length, width = p.overall
    checks = [
        f"design rules: {'pass' if not rules else '; '.join(rules)}",
        f"collisions between parts: {'none' if not clashes else '; '.join(clashes)}",
        f"ground contact (wheels, caster, drum at z=0): {'pass' if ground_ok else contacts}",
        f"rods: {p.n_rods} x {p.rod_d:g} mm, clear gap {p.rod_gap:.1f} mm for a {p.ball_d:g} mm ball",
        f"drum capacity (loose packing): ~{p.drum_capacity()} balls",
        f"overall: {length:.0f} mm long x {width:.0f} mm wide, track {p.track:.0f} mm",
        f"made-part mass (estimate, excludes bought-in parts): {mass_g / 1000:.1f} kg",
    ]
    (out / "README.txt").write_text(README.format(version=__version__, checks="\n".join("- " + c for c in checks)))
    manifest = {
        "generator": f"otr_cad {__version__}",
        "robot": "collector",
        "params": {k: v for k, v in asdict(p).items() if k != "notes"},
        "derived": {"n_rods": p.n_rods, "rod_gap_mm": round(p.rod_gap, 2), "rod_len_mm": p.rod_len,
                    "track_mm": p.track, "overall_mm": [round(length), round(width)],
                    "drum_capacity_balls": p.drum_capacity(), "made_part_mass_kg": round(mass_g / 1000, 2)},
        "design_rules": rules,
        "collisions": clashes,
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
