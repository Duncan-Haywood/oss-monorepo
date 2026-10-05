"""Build every printed part: STL (mm, for slicing and for the simulator), STEP (for editing
in other CAD tools), printed-mass properties and a bed-fit check.

    PYTHONPATH=src python -m homebot.cad.build            # -> hardware/stl, hardware/step.zip,
                                                          #    hardware/mass_properties.json

Printed mass uses a shell model of a slicer: perimeters and skins of thickness ``wall``
over the part's surface area, ``infill`` of the remaining volume, PLA density. Centre of
mass and inertia are those of the solid scaled to that mass (uniform-density assumption).
"""
from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from pathlib import Path

import cadquery as cq
import numpy as np

from ..params import DEFAULT, Robot
from .geom import MM, to_mesh, transform

PROJECT = Path(__file__).resolve().parents[3]
HW = PROJECT / "hardware"


@dataclass
class PartInfo:
    name: str
    count: int  # how many to print for the full robot (both sides together for arm parts)
    mirrored: bool  # left-side copies are mirror images
    print_rot: tuple  # rotation (3x3 rows) from the part frame to the recommended print orientation
    note: str = ""


def _rx(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return ((1, 0, 0), (0, c, -s), (0, s, c))


def _ry(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return ((c, 0, s), (0, 1, 0), (-s, 0, c))


I3 = ((1, 0, 0), (0, 1, 0), (0, 0, 1))


def catalogue():
    """Part name -> (builder, PartInfo)."""
    from . import base_parts, parts

    cat = {
        "gear42": (parts.gear42, PartInfo("gear42", 4, False, I3, "J1 and J2 output gears, 42T m2")),
        "pinion": (parts.pinion, PartInfo("pinion", 4, False, I3, "14T m2 pinions on the J1/J2 servo horns")),
        "elbow_gear": (parts.elbow_gear, PartInfo("elbow_gear", 2, False, I3, "30T m1.5 elbow gear, on the forearm clevis")),
        "elbow_pinion": (parts.elbow_pinion, PartInfo("elbow_pinion", 2, False, I3, "15T m1.5 pinion on the elbow servo horn")),
        "grip_pinion": (parts.grip_pinion, PartInfo("grip_pinion", 2, False, I3, "18T m1.25 pinion on the gripper servo horn")),
        "shoulder_block": (parts.shoulder_block, PartInfo("shoulder_block", 2, True, _rx(90))),
        "upper_arm_top": (parts.upper_arm_top, PartInfo("upper_arm_top", 2, True, _ry(-90))),
        "upper_arm": (parts.upper_arm, PartInfo("upper_arm", 2, True, _rx(180))),
        "forearm_clevis": (parts.forearm_clevis, PartInfo("forearm_clevis", 2, True, _rx(180))),
        "forearm": (parts.forearm, PartInfo("forearm", 2, True, _rx(180))),
        "wrist_clevis": (parts.wrist_clevis, PartInfo("wrist_clevis", 2, True, _rx(180))),
        "hand": (parts.hand, PartInfo("hand", 2, False, I3, "rod end walls on the bed; support the rails and cradle")),
        "jaw": (parts.jaw, PartInfo("jaw", 4, False, _rx(90), "on the rack's back face; support under the carriage and finger")),
        "pad": (parts.pad, PartInfo("pad", 4, False, _ry(90), "TPU 95A, face down, 100 % infill")),
    }
    for name, (fn, info) in base_parts.PARTS.items():
        cat[name] = (fn, info)
    return cat


def mass_properties(wp: cq.Workplane, robot: Robot) -> dict:
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps

    shape = wp.val() if len(wp.vals()) == 1 else cq.Compound.makeCompound(wp.vals())
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape.wrapped, props)
    V = props.Mass() * 1e-9  # m^3
    c = props.CentreOfMass()
    com = np.array([c.X(), c.Y(), c.Z()]) * 1e-3
    M = props.MatrixOfInertia()
    I = np.array([[M.Value(i, j) for j in (1, 2, 3)] for i in (1, 2, 3)]) * 1e-15  # m^5 at unit density
    A = shape.Area() * 1e-6
    p = robot.printing
    shell = min(V, A * p.wall)
    printed_volume = shell + p.infill * max(0.0, V - shell)
    mass = p.density * printed_volume
    I = I * p.density * printed_volume / V
    return {"mass": float(mass), "solid_volume_cm3": float(V * 1e6), "area_cm2": float(A * 1e4),
            "com": com.tolist(), "inertia": I.tolist()}


def bed_check(wp: cq.Workplane, rot, bed) -> tuple[bool, list[float]]:
    R = np.array(rot, float)
    bb = transform(wp, R).val().BoundingBox()
    size = sorted([bb.xlen, bb.ylen])
    fits = size[1] <= bed[0] * MM - 2 and size[0] <= bed[1] * MM - 2 and bb.zlen <= bed[2] * MM
    return fits, [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)]


def build_all(robot: Robot = DEFAULT, out: Path = HW, step: bool = True, only=None, verbose=True) -> dict:
    stl_dir, step_dir = out / "stl", out / "step"
    stl_dir.mkdir(parents=True, exist_ok=True)
    if step:
        step_dir.mkdir(parents=True, exist_ok=True)
    report = {}
    mp_path = out / "mass_properties.json"
    props = json.loads(mp_path.read_text()) if mp_path.exists() else {}
    for name, (fn, info) in catalogue().items():
        if only and name not in only:
            continue
        t0 = time.time()
        wp = fn(robot)
        mesh = to_mesh(wp, tol=0.03, ang=0.15)
        mesh.export(stl_dir / f"{name}.stl")
        if info.mirrored:
            mm = mesh.copy()
            mm.apply_transform(np.diag([1.0, -1.0, 1.0, 1.0]))
            mm.invert()  # restore outward normals after the reflection
            mm.export(stl_dir / f"{name}_mirror.stl")
        if step:
            cq.exporters.export(wp, str(step_dir / f"{name}.step"))
        mp = mass_properties(wp, robot)
        fits, dims = bed_check(wp, info.print_rot, robot.printing.bed)
        mp.update({"count": info.count, "mirrored": info.mirrored, "fits_bed": fits, "print_dims_mm": dims,
                   "note": info.note, "watertight": bool(mesh.is_watertight)})
        props[name] = mp
        report[name] = mp
        if verbose:
            print(f"{name:18s} x{info.count}  {mp['mass'] * 1000:6.1f} g  print {dims} mm  "
                  f"{'ok' if fits else 'DOES NOT FIT BED'}  {time.time() - t0:.1f}s", flush=True)
    mp_path.write_text(json.dumps(props, indent=1, sort_keys=True))
    if step:  # STEP is verbose text: ship it zipped (hardware/step.zip), keep step/ out of git
        import zipfile

        with zipfile.ZipFile(out / "step.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for f in sorted(step_dir.glob("*.step")):
                z.write(f, f"step/{f.name}")
    return report


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--no-step", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    build_all(step=not args.no_step, only=args.only)
